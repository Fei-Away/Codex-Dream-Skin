use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::ffi::{OsStr, OsString};
use std::fs::{self, OpenOptions};
use std::io::{Cursor, Read, Write};
use std::net::{Ipv4Addr, SocketAddrV4, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
#[cfg(target_os = "windows")]
use std::sync::atomic::AtomicBool;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

#[cfg(target_os = "windows")]
const WINDOWS_WINDOW_SHAPE_DEBOUNCE: Duration = Duration::from_millis(120);
#[cfg(target_os = "windows")]
static WINDOWS_WINDOW_SHAPE_REVISION: AtomicU64 = AtomicU64::new(0);
#[cfg(target_os = "windows")]
static WINDOWS_WINDOW_SHAPE_WORKER_ACTIVE: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "windows")]
fn apply_windows_native_shape(
    hwnd: windows_sys::Win32::Foundation::HWND,
    maximized: bool,
    scale: f64,
) {
    use std::ffi::c_void;
    use windows_sys::Win32::Foundation::RECT;
    use windows_sys::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE,
        DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
    };
    use windows_sys::Win32::Graphics::Gdi::{CreateRoundRectRgn, DeleteObject, SetWindowRgn};
    use windows_sys::Win32::UI::WindowsAndMessaging::GetWindowRect;

    unsafe {
        let preference = DWMWCP_ROUND;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE as u32,
            &preference as *const _ as *const c_void,
            std::mem::size_of_val(&preference) as u32,
        );
        let border_color = DWMWA_COLOR_NONE;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR as u32,
            &border_color as *const _ as *const c_void,
            std::mem::size_of_val(&border_color) as u32,
        );

        if maximized {
            let _ = SetWindowRgn(hwnd, std::ptr::null_mut(), 1);
            return;
        }

        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect) == 0 {
            return;
        }
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width <= 0 || height <= 0 {
            return;
        }
        let corner_diameter = (36.0 * scale).round().clamp(20.0, 72.0) as i32;
        let region = CreateRoundRectRgn(
            0,
            0,
            width + 1,
            height + 1,
            corner_diameter,
            corner_diameter,
        );
        if region.is_null() {
            return;
        }
        if SetWindowRgn(hwnd, region, 1) == 0 {
            let _ = DeleteObject(region as _);
        }
    }
}

#[cfg(target_os = "windows")]
fn apply_windows_window_shape(window: &tauri::Window) {
    let Ok(native) = window.hwnd() else {
        return;
    };
    apply_windows_native_shape(
        native.0 as windows_sys::Win32::Foundation::HWND,
        window.is_maximized().unwrap_or(false),
        window.scale_factor().unwrap_or(1.0),
    );
}

#[cfg(target_os = "windows")]
fn clear_windows_window_shape(window: &tauri::Window) {
    let Ok(native) = window.hwnd() else {
        return;
    };
    unsafe {
        let _ = windows_sys::Win32::Graphics::Gdi::SetWindowRgn(
            native.0 as windows_sys::Win32::Foundation::HWND,
            std::ptr::null_mut(),
            0,
        );
    }
}

#[cfg(target_os = "windows")]
fn schedule_windows_window_shape(window: tauri::Window) {
    let first_revision = WINDOWS_WINDOW_SHAPE_REVISION.fetch_add(1, Ordering::AcqRel) + 1;
    if WINDOWS_WINDOW_SHAPE_WORKER_ACTIVE.swap(true, Ordering::AcqRel) {
        return;
    }

    // Avoid stretching the old rounded region throughout an interactive resize.
    clear_windows_window_shape(&window);

    let worker_window = window.clone();
    let worker = move || {
        let mut observed_revision = first_revision;
        loop {
            std::thread::sleep(WINDOWS_WINDOW_SHAPE_DEBOUNCE);
            let latest_revision = WINDOWS_WINDOW_SHAPE_REVISION.load(Ordering::Acquire);
            if latest_revision != observed_revision {
                observed_revision = latest_revision;
                continue;
            }

            let shape_window = worker_window.clone();
            let _ = worker_window.run_on_main_thread(move || {
                if WINDOWS_WINDOW_SHAPE_REVISION.load(Ordering::Acquire) == latest_revision {
                    apply_windows_window_shape(&shape_window);
                }
            });

            WINDOWS_WINDOW_SHAPE_WORKER_ACTIVE.store(false, Ordering::Release);
            let revision_after_release = WINDOWS_WINDOW_SHAPE_REVISION.load(Ordering::Acquire);
            if revision_after_release == latest_revision {
                break;
            }
            if WINDOWS_WINDOW_SHAPE_WORKER_ACTIVE
                .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
                .is_err()
            {
                break;
            }
            observed_revision = revision_after_release;
        }
    };

    if std::thread::Builder::new()
        .name("dream-skin-window-shape".into())
        .spawn(worker)
        .is_err()
    {
        WINDOWS_WINDOW_SHAPE_WORKER_ACTIVE.store(false, Ordering::Release);
        apply_windows_window_shape(&window);
    }
}

#[cfg(target_os = "windows")]
fn apply_windows_webview_shape(window: &tauri::WebviewWindow) {
    let Ok(native) = window.hwnd() else {
        return;
    };
    apply_windows_native_shape(
        native.0 as windows_sys::Win32::Foundation::HWND,
        window.is_maximized().unwrap_or(false),
        window.scale_factor().unwrap_or(1.0),
    );
}
const SCHEMA_VERSION: u32 = 1;
const MAX_FILE_SIZE: u64 = 16 * 1024 * 1024;
const MAX_BUNDLE_SIZE: u64 = 32 * 1024 * 1024;
const MAX_JSON_SIZE: u64 = 1024 * 1024;
const MAX_ZIP_ENTRIES: usize = 3;
const MAX_IMAGE_EDGE: u32 = 16_384;
const MAX_IMAGE_PIXELS: u64 = 50_000_000;
const MAX_EDITOR_PREVIEW_FILES: usize = 4;
const MAX_EDITOR_PREVIEW_BYTES: u64 = 32 * 1024 * 1024;

static UNIQUE_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThemeColors {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub panel: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub panel_alt: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accent: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accent_alt: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secondary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub highlight: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub muted: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line: Option<String>,
}

impl ThemeColors {
    fn is_empty(&self) -> bool {
        self.background.is_none()
            && self.panel.is_none()
            && self.panel_alt.is_none()
            && self.accent.is_none()
            && self.accent_alt.is_none()
            && self.secondary.is_none()
            && self.highlight.is_none()
            && self.text.is_none()
            && self.muted.is_none()
            && self.line.is_none()
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ThemeAppearance {
    Auto,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ThemeSafeArea {
    Auto,
    Left,
    Right,
    Center,
    None,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ThemeTaskMode {
    Auto,
    Ambient,
    Banner,
    Off,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThemeArt {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub focus_x: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub focus_y: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub safe_area: Option<ThemeSafeArea>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task_mode: Option<ThemeTaskMode>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThemePalette {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accent: Option<String>,
}

impl ThemeArt {
    fn is_empty(&self) -> bool {
        self.focus_x.is_none()
            && self.focus_y.is_none()
            && self.safe_area.is_none()
            && self.task_mode.is_none()
    }
}

impl ThemePalette {
    fn is_empty(&self) -> bool {
        self.accent.is_none()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThemeConfig {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    #[serde(default = "default_brand_subtitle")]
    pub brand_subtitle: String,
    #[serde(default = "default_tagline")]
    pub tagline: String,
    #[serde(default = "default_project_prefix")]
    pub project_prefix: String,
    #[serde(default = "default_project_label")]
    pub project_label: String,
    #[serde(default = "default_status_text")]
    pub status_text: String,
    #[serde(default = "default_quote")]
    pub quote: String,
    pub image: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub colors: Option<ThemeColors>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub appearance: Option<ThemeAppearance>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub art: Option<ThemeArt>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub palette: Option<ThemePalette>,
    #[serde(default)]
    pub promo_title: String,
    #[serde(default)]
    pub promo_sub: String,
    #[serde(default)]
    pub promo_url: String,
}

fn normalize_theme_config(theme: &mut ThemeConfig) {
    if theme.colors.as_ref().is_some_and(ThemeColors::is_empty) {
        theme.colors = None;
    }
    if theme.art.as_ref().is_some_and(ThemeArt::is_empty) {
        theme.art = None;
    }
    if theme.palette.as_ref().is_some_and(ThemePalette::is_empty) {
        theme.palette = None;
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThemeDraft {
    pub name: String,
    pub brand_subtitle: String,
    pub tagline: String,
    pub project_prefix: String,
    pub project_label: String,
    pub status_text: String,
    pub quote: String,
    pub promo_title: String,
    pub promo_sub: String,
    pub promo_url: String,
    #[serde(default)]
    pub colors: Option<ThemeColors>,
    #[serde(default)]
    pub appearance: Option<ThemeAppearance>,
    #[serde(default)]
    pub art: Option<ThemeArt>,
    #[serde(default)]
    pub palette: Option<ThemePalette>,
    #[serde(default)]
    pub replacement_image_path: Option<String>,
}

fn default_schema_version() -> u32 {
    SCHEMA_VERSION
}

fn default_brand_subtitle() -> String {
    "CODEX DREAM SKIN".into()
}

fn default_tagline() -> String {
    "Make something wonderful.".into()
}

fn default_project_prefix() -> String {
    "Choose project · ".into()
}

fn default_project_label() -> String {
    "Choose a project".into()
}

fn default_status_text() -> String {
    "DREAM SKIN ONLINE".into()
}

fn default_quote() -> String {
    "Make something wonderful".into()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeThemeFeatures {
    #[serde(default)]
    pub appearance: bool,
    #[serde(default)]
    pub art: bool,
    #[serde(default)]
    pub partial_colors: bool,
    #[serde(default)]
    pub rgba: bool,
    #[serde(default)]
    pub alpha_hex: bool,
    #[serde(default)]
    pub palette_accent: bool,
    #[serde(default)]
    pub hot_reload: bool,
    #[serde(default)]
    pub auxiliary_window_guard: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RuntimePaths {
    active_theme: String,
    theme_store: String,
    state: String,
    #[serde(default)]
    logs: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum RestartSemantics {
    RequiresCodexClosed,
    OptionalExplicit,
    None,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RuntimeCommandContract {
    script: String,
    #[serde(default)]
    args: Vec<String>,
    #[serde(default)]
    restart_args: Vec<String>,
    #[serde(default)]
    base_theme_args: Vec<String>,
    restart_semantics: RestartSemantics,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RuntimeCommands {
    install: RuntimeCommandContract,
    start: RuntimeCommandContract,
    restore: RuntimeCommandContract,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeCapabilities {
    manifest_version: u32,
    platform: String,
    runtime_version: String,
    minimum_node_major: u32,
    theme_schema_version: u32,
    #[serde(default)]
    theme_features: RuntimeThemeFeatures,
    paths: RuntimePaths,
    commands: RuntimeCommands,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatus {
    pub platform: String,
    pub codex_installed: bool,
    /// Backward-compatible alias for `engine_configured`.
    pub engine_installed: bool,
    pub engine_available: bool,
    pub engine_configured: bool,
    /// A saved skin session exists, even if its watcher has stopped.
    pub skin_active: bool,
    /// The recorded watcher process is alive and observes the active theme.
    pub session_running: bool,
    /// The watcher and Codex loopback endpoint are both verified.
    pub hot_switch_ready: bool,
    pub node_ready: bool,
    pub active_theme_id: Option<String>,
    pub state_message: String,
    pub runtime_manifest_version: Option<u32>,
    pub runtime_version: Option<String>,
    pub theme_features: RuntimeThemeFeatures,
    pub runtime_compatibility_message: Option<String>,
    pub logs_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ThemeSummary {
    pub id: String,
    pub selection_key: String,
    pub name: String,
    pub brand_subtitle: String,
    pub tagline: String,
    pub project_prefix: String,
    pub project_label: String,
    pub status_text: String,
    pub quote: String,
    pub promo_title: String,
    pub promo_sub: String,
    pub promo_url: String,
    pub image_path: String,
    pub preview_path: Option<String>,
    pub colors: Option<ThemeColors>,
    pub derived_colors: ThemeColors,
    pub compatible: bool,
    pub unsupported_features: Vec<String>,
    pub appearance: Option<ThemeAppearance>,
    pub art: Option<ThemeArt>,
    pub palette: Option<ThemePalette>,
    pub source: ThemeSource,
    pub read_only: bool,
    pub image_metadata: ThemeImageMetadata,
    pub builtin: bool,
    pub active: bool,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ThemeSource {
    Builtin,
    Manager,
    Platform,
}

impl ThemeSource {
    fn label(self) -> &'static str {
        match self {
            Self::Builtin => "builtin",
            Self::Manager => "manager",
            Self::Platform => "platform",
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ThemeImageMetadata {
    pub width: u32,
    pub height: u32,
    pub aspect_ratio: f64,
    pub wide: bool,
    pub suggested_focus_x: f64,
    pub suggested_focus_y: f64,
    pub suggested_safe_area: ThemeSafeArea,
    pub suggested_task_mode: ThemeTaskMode,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ThemeImageInspection {
    pub preview_path: String,
    pub colors: ThemeColors,
    pub image_metadata: ThemeImageMetadata,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommandResult {
    pub ok: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancelled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub restart_required: Option<bool>,
}

#[derive(Debug, Clone)]
struct ThemePackage {
    config: ThemeConfig,
    image_name: String,
    image: Vec<u8>,
    preview: Option<(String, Vec<u8>)>,
}

fn unique_suffix() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let count = UNIQUE_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{}-{nanos}-{count}", std::process::id())
}

fn path_string(path: &Path) -> String {
    normalize_platform_path(path.to_path_buf())
        .to_string_lossy()
        .into_owned()
}

fn normalize_platform_path(path: PathBuf) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let text = path.to_string_lossy();
        if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{rest}"));
        }
        if let Some(rest) = text.strip_prefix(r"\\?\") {
            return PathBuf::from(rest);
        }
    }
    path
}

fn canonicalize_platform_path(path: &Path, label: &str) -> Result<PathBuf, String> {
    path.canonicalize()
        .map(normalize_platform_path)
        .map_err(|error| format!("Cannot resolve {label}: {error}"))
}

fn ensure_absolute_file(path: &Path, label: &str) -> Result<(), String> {
    if !path.is_absolute() {
        return Err(format!("{label} must be an absolute path."));
    }
    let metadata = fs::metadata(path).map_err(|error| format!("Cannot read {label}: {error}"))?;
    if !metadata.is_file() {
        return Err(format!("{label} is not a regular file."));
    }
    Ok(())
}

fn read_bounded_file(path: &Path, limit: u64, label: &str) -> Result<Vec<u8>, String> {
    let metadata =
        fs::metadata(path).map_err(|error| format!("Cannot inspect {label}: {error}"))?;
    if !metadata.is_file() {
        return Err(format!("{label} is not a regular file."));
    }
    if metadata.len() == 0 {
        return Err(format!("{label} is empty."));
    }
    if metadata.len() > limit {
        return Err(format!(
            "{label} exceeds the {} MB limit.",
            limit / 1024 / 1024
        ));
    }
    let data = fs::read(path).map_err(|error| format!("Cannot read {label}: {error}"))?;
    if data.len() as u64 > limit {
        return Err(format!("{label} changed while it was being read."));
    }
    Ok(data)
}

fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 64 {
        return Err("Theme id must contain 1 to 64 ASCII characters.".into());
    }
    let bytes = id.as_bytes();
    if !bytes[0].is_ascii_lowercase() && !bytes[0].is_ascii_digit() {
        return Err("Theme id must start with a lowercase letter or number.".into());
    }
    if !bytes[bytes.len() - 1].is_ascii_lowercase() && !bytes[bytes.len() - 1].is_ascii_digit() {
        return Err("Theme id must end with a lowercase letter or number.".into());
    }
    if !bytes
        .iter()
        .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || *byte == b'-')
    {
        return Err("Theme id may only contain lowercase letters, numbers, and hyphens.".into());
    }
    if is_windows_reserved_name(id) {
        return Err("Theme id is reserved by Windows.".into());
    }
    Ok(())
}

fn is_windows_reserved_name(value: &str) -> bool {
    let stem = value
        .split('.')
        .next()
        .unwrap_or(value)
        .to_ascii_lowercase();
    matches!(stem.as_str(), "con" | "prn" | "aux" | "nul")
        || (stem.len() == 4
            && (stem.starts_with("com") || stem.starts_with("lpt"))
            && matches!(stem.as_bytes()[3], b'1'..=b'9'))
}

fn validate_text(
    label: &str,
    value: &str,
    max_chars: usize,
    allow_empty: bool,
) -> Result<(), String> {
    let count = value.chars().count();
    if (!allow_empty && value.trim().is_empty()) || count > max_chars {
        return Err(format!(
            "{label} must contain {} to {max_chars} characters.",
            if allow_empty { 0 } else { 1 }
        ));
    }
    if value.chars().any(char::is_control) {
        return Err(format!("{label} contains a control character."));
    }
    Ok(())
}

fn validate_color(label: &str, value: &str) -> Result<(), String> {
    if let Some(hex) = value.strip_prefix('#') {
        if matches!(hex.len(), 3 | 4 | 6 | 8) && hex.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Ok(());
        }
        return Err(format!(
            "{label} must be a safe hexadecimal or rgb/rgba color."
        ));
    }

    let (inner, alpha_expected) =
        if let Some(inner) = value.strip_prefix("rgb(").and_then(|v| v.strip_suffix(')')) {
            (inner, false)
        } else if let Some(inner) = value
            .strip_prefix("rgba(")
            .and_then(|v| v.strip_suffix(')'))
        {
            (inner, true)
        } else {
            return Err(format!(
                "{label} must be a safe hexadecimal or rgb/rgba color."
            ));
        };

    let parts: Vec<&str> = inner.split(',').map(str::trim).collect();
    let expected = if alpha_expected { 4 } else { 3 };
    if parts.len() != expected {
        return Err(format!("{label} has the wrong number of color components."));
    }
    for component in &parts[..3] {
        if component.is_empty() || !component.bytes().all(|byte| byte.is_ascii_digit()) {
            return Err(format!("{label} has an invalid rgb component."));
        }
        let number: u16 = component
            .parse()
            .map_err(|_| format!("{label} has an invalid rgb component."))?;
        if number > 255 {
            return Err(format!("{label} has an rgb component above 255."));
        }
    }
    if alpha_expected {
        let alpha = parts[3];
        if alpha.is_empty()
            || !alpha
                .bytes()
                .all(|byte| byte.is_ascii_digit() || byte == b'.')
        {
            return Err(format!("{label} has an invalid alpha component."));
        }
        let number: f32 = alpha
            .parse()
            .map_err(|_| format!("{label} has an invalid alpha component."))?;
        if !number.is_finite() || !(0.0..=1.0).contains(&number) {
            return Err(format!("{label} alpha must be between 0 and 1."));
        }
    }
    Ok(())
}

fn validate_palette_color(label: &str, value: &str) -> Result<(), String> {
    if validate_color(label, value).is_ok() {
        return Ok(());
    }
    let lower = value.to_ascii_lowercase();
    let safe_function = ["hsl(", "oklch(", "oklab("]
        .iter()
        .any(|prefix| lower.starts_with(prefix))
        && value.ends_with(')')
        && value.len() <= 96
        && value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric()
                || matches!(
                    byte,
                    b' ' | b'.' | b',' | b'%' | b'/' | b'+' | b'-' | b'(' | b')'
                )
        });
    if safe_function {
        Ok(())
    } else {
        Err(format!("{label} is not a supported safe CSS color."))
    }
}

#[derive(Clone, Copy)]
struct ParsedThemeColor {
    rgb: [f64; 3],
    alpha: f64,
}

fn parse_theme_color(value: &str) -> Option<ParsedThemeColor> {
    if let Some(hex) = value.strip_prefix('#') {
        let expanded = match hex.len() {
            3 | 4 => hex
                .bytes()
                .flat_map(|byte| [byte, byte])
                .collect::<Vec<_>>(),
            6 | 8 => hex.as_bytes().to_vec(),
            _ => return None,
        };
        return Some(ParsedThemeColor {
            rgb: [
                u8::from_str_radix(std::str::from_utf8(&expanded[0..2]).ok()?, 16).ok()? as f64,
                u8::from_str_radix(std::str::from_utf8(&expanded[2..4]).ok()?, 16).ok()? as f64,
                u8::from_str_radix(std::str::from_utf8(&expanded[4..6]).ok()?, 16).ok()? as f64,
            ],
            alpha: if expanded.len() == 8 {
                u8::from_str_radix(std::str::from_utf8(&expanded[6..8]).ok()?, 16).ok()? as f64
                    / 255.0
            } else {
                1.0
            },
        });
    }
    let (inner, has_alpha) = if let Some(inner) = value
        .strip_prefix("rgba(")
        .and_then(|value| value.strip_suffix(')'))
    {
        (inner, true)
    } else {
        (
            value
                .strip_prefix("rgb(")
                .and_then(|value| value.strip_suffix(')'))?,
            false,
        )
    };
    let parts: Vec<&str> = inner.split(',').map(str::trim).collect();
    if parts.len() != if has_alpha { 4 } else { 3 } {
        return None;
    }
    Some(ParsedThemeColor {
        rgb: [
            parts[0].parse().ok()?,
            parts[1].parse().ok()?,
            parts[2].parse().ok()?,
        ],
        alpha: if has_alpha {
            parts[3].parse().ok()?
        } else {
            1.0
        },
    })
}

fn composite_color(foreground: ParsedThemeColor, background: [f64; 3]) -> [f64; 3] {
    std::array::from_fn(|index| {
        foreground.rgb[index] * foreground.alpha + background[index] * (1.0 - foreground.alpha)
    })
}

fn relative_luminance(rgb: [f64; 3]) -> f64 {
    let linear = rgb.map(|component| {
        let component = component / 255.0;
        if component <= 0.04045 {
            component / 12.92
        } else {
            ((component + 0.055) / 1.055).powf(2.4)
        }
    });
    linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}

fn contrast_ratio(left: [f64; 3], right: [f64; 3]) -> f64 {
    let left = relative_luminance(left);
    let right = relative_luminance(right);
    (left.max(right) + 0.05) / (left.min(right) + 0.05)
}

fn validate_theme_contrast(colors: &ThemeColors) -> Result<(), String> {
    let Some(background_value) = colors.background.as_deref() else {
        return Ok(());
    };
    let Some(panel_value) = colors.panel.as_deref() else {
        return Ok(());
    };
    let Some(panel_alt_value) = colors.panel_alt.as_deref() else {
        return Ok(());
    };
    let Some(text) = colors.text.as_deref() else {
        return Ok(());
    };
    let Some(muted) = colors.muted.as_deref() else {
        return Ok(());
    };
    let Some(accent) = colors.accent.as_deref() else {
        return Ok(());
    };
    let Some(accent_alt) = colors.accent_alt.as_deref() else {
        return Ok(());
    };
    let background = parse_theme_color(background_value)
        .map(|color| composite_color(color, [255.0; 3]))
        .ok_or("background could not be evaluated for contrast.")?;
    let panel = parse_theme_color(panel_value)
        .map(|color| composite_color(color, background))
        .ok_or("panel could not be evaluated for contrast.")?;
    let panel_alt = parse_theme_color(panel_alt_value)
        .map(|color| composite_color(color, background))
        .ok_or("panelAlt could not be evaluated for contrast.")?;
    for (label, value, minimum) in [
        ("text", text, 4.5),
        ("muted", muted, 4.5),
        ("accent", accent, 3.0),
        ("accentAlt", accent_alt, 3.0),
    ] {
        let parsed = parse_theme_color(value)
            .ok_or_else(|| format!("{label} could not be evaluated for contrast."))?;
        let on_background = composite_color(parsed, background);
        let on_panel = composite_color(parsed, panel);
        let on_panel_alt = composite_color(parsed, panel_alt);
        if contrast_ratio(on_background, background) < minimum
            || contrast_ratio(on_panel, panel) < minimum
            || contrast_ratio(on_panel_alt, panel_alt) < minimum
        {
            return Err(format!(
                "{label} must have at least {minimum}:1 contrast against background, panel, and panelAlt."
            ));
        }
    }
    Ok(())
}

fn mix_rgb(left: [f64; 3], right: [f64; 3], right_weight: f64) -> [f64; 3] {
    std::array::from_fn(|index| left[index] * (1.0 - right_weight) + right[index] * right_weight)
}

fn rgb_hex(rgb: [f64; 3]) -> String {
    format!(
        "#{:02X}{:02X}{:02X}",
        rgb[0].round().clamp(0.0, 255.0) as u8,
        rgb[1].round().clamp(0.0, 255.0) as u8,
        rgb[2].round().clamp(0.0, 255.0) as u8
    )
}

fn adjust_accent_contrast(mut accent: [f64; 3], surface: [f64; 3], dark: bool) -> [f64; 3] {
    let target = if dark { [255.0; 3] } else { [0.0; 3] };
    for _ in 0..12 {
        if contrast_ratio(accent, surface) >= 3.0 {
            break;
        }
        accent = mix_rgb(accent, target, 0.14);
    }
    accent
}

fn image_adaptive_colors(image: &image::DynamicImage) -> Option<ThemeColors> {
    let image = image.thumbnail(96, 96).to_rgba8();
    let mut total = [0.0; 3];
    let mut weight = 0.0;
    let mut accent = [62.0, 177.0, 190.0];
    let mut accent_score = 0.0;
    for pixel in image.pixels() {
        let alpha = f64::from(pixel[3]) / 255.0;
        if alpha < 0.15 {
            continue;
        }
        let rgb = [
            f64::from(pixel[0]),
            f64::from(pixel[1]),
            f64::from(pixel[2]),
        ];
        for index in 0..3 {
            total[index] += rgb[index] * alpha;
        }
        weight += alpha;
        let max = rgb.iter().copied().fold(0.0_f64, f64::max);
        let min = rgb.iter().copied().fold(255.0_f64, f64::min);
        let saturation = if max <= 0.0 { 0.0 } else { (max - min) / max };
        let luminance = relative_luminance(rgb);
        let score = saturation * alpha * (1.15 - (luminance - 0.48).abs());
        if score > accent_score && luminance > 0.035 && luminance < 0.92 {
            accent = rgb;
            accent_score = score;
        }
    }
    if weight <= 0.0 {
        return None;
    }
    let average = total.map(|component| component / weight);
    let dark = relative_luminance(average) < 0.48;
    let (background, panel, panel_alt, text, muted) = if dark {
        (
            mix_rgb(average, [4.0, 8.0, 12.0], 0.84),
            mix_rgb(average, [10.0, 16.0, 22.0], 0.76),
            mix_rgb(average, [15.0, 26.0, 32.0], 0.68),
            [239.0, 247.0, 248.0],
            [164.0, 183.0, 188.0],
        )
    } else {
        (
            mix_rgb(average, [248.0, 249.0, 250.0], 0.92),
            mix_rgb(average, [255.0, 255.0, 255.0], 0.97),
            mix_rgb(accent, [246.0, 248.0, 249.0], 0.91),
            [27.0, 34.0, 39.0],
            [78.0, 88.0, 96.0],
        )
    };
    accent = adjust_accent_contrast(accent, panel, dark);
    let accent_alt = adjust_accent_contrast(
        mix_rgb(accent, if dark { [255.0; 3] } else { [0.0; 3] }, 0.25),
        panel,
        dark,
    );
    let secondary = mix_rgb(accent, average, 0.32);
    let highlight = adjust_accent_contrast(
        mix_rgb(
            accent,
            if dark {
                [224.0, 98.0, 72.0]
            } else {
                [154.0, 54.0, 40.0]
            },
            0.48,
        ),
        panel,
        dark,
    );
    Some(ThemeColors {
        background: Some(rgb_hex(background)),
        panel: Some(rgb_hex(panel)),
        panel_alt: Some(rgb_hex(panel_alt)),
        accent: Some(rgb_hex(accent)),
        accent_alt: Some(rgb_hex(accent_alt)),
        secondary: Some(rgb_hex(secondary)),
        highlight: Some(rgb_hex(highlight)),
        text: Some(rgb_hex(text)),
        muted: Some(rgb_hex(muted)),
        line: Some(format!(
            "rgba({}, {}, {}, 0.28)",
            accent_alt[0].round() as u8,
            accent_alt[1].round() as u8,
            accent_alt[2].round() as u8
        )),
    })
}

fn image_kind_from_extension(name: &str) -> Result<&'static str, String> {
    let path = Path::new(name);
    if path.components().count() != 1
        || name.starts_with('.')
        || name.len() > 128
        || !name
            .as_bytes()
            .first()
            .is_some_and(|byte| byte.is_ascii_alphanumeric())
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_'))
    {
        return Err("Image filename must be a simple ASCII filename.".into());
    }
    if path
        .file_stem()
        .and_then(OsStr::to_str)
        .is_some_and(is_windows_reserved_name)
    {
        return Err("Image filename is reserved by Windows.".into());
    }
    match path
        .extension()
        .and_then(OsStr::to_str)
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("png") => Ok("png"),
        Some("jpg") | Some("jpeg") => Ok("jpeg"),
        Some("webp") => Ok("webp"),
        _ => Err("Theme images must be PNG, JPG, JPEG, or WebP.".into()),
    }
}

fn validate_image_header(name: &str, bytes: &[u8]) -> Result<(), String> {
    if bytes.is_empty() || bytes.len() as u64 > MAX_FILE_SIZE {
        return Err("Theme image must be between 1 byte and 16 MB.".into());
    }
    let kind = image_kind_from_extension(name)?;
    let valid = match kind {
        "png" => bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]),
        "jpeg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "webp" => bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP",
        _ => false,
    };
    if !valid {
        return Err(format!(
            "{} content does not match its image extension.",
            name
        ));
    }
    let (width, height) = image_dimensions(kind, bytes)?;
    if width == 0
        || height == 0
        || width > MAX_IMAGE_EDGE
        || height > MAX_IMAGE_EDGE
        || u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS
    {
        return Err(format!(
            "{name} dimensions {width}x{height} exceed the 16384px / 50MP safety limit."
        ));
    }
    Ok(())
}

fn decode_image_bytes(name: &str, bytes: &[u8]) -> Result<image::DynamicImage, String> {
    validate_image_header(name, bytes)?;
    let mut reader = image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|error| format!("Cannot identify {name}: {error}"))?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(MAX_IMAGE_EDGE);
    limits.max_image_height = Some(MAX_IMAGE_EDGE);
    limits.max_alloc = Some(256 * 1024 * 1024);
    reader.limits(limits);
    reader
        .decode()
        .map_err(|error| format!("{name} is not a complete decodable image: {error}"))
}

fn validate_image_bytes(name: &str, bytes: &[u8]) -> Result<(), String> {
    decode_image_bytes(name, bytes).map(drop)
}

fn image_dimensions(kind: &str, bytes: &[u8]) -> Result<(u32, u32), String> {
    match kind {
        "png" => {
            if bytes.len() < 24 || &bytes[12..16] != b"IHDR" {
                return Err("PNG is missing a valid IHDR header.".into());
            }
            Ok((
                u32::from_be_bytes(bytes[16..20].try_into().expect("PNG width slice")),
                u32::from_be_bytes(bytes[20..24].try_into().expect("PNG height slice")),
            ))
        }
        "jpeg" => jpeg_dimensions(bytes),
        "webp" => webp_dimensions(bytes),
        _ => Err("Unsupported image format.".into()),
    }
}

fn jpeg_dimensions(bytes: &[u8]) -> Result<(u32, u32), String> {
    let mut offset = 2_usize;
    while offset + 1 < bytes.len() {
        if bytes[offset] != 0xff {
            offset += 1;
            continue;
        }
        while offset < bytes.len() && bytes[offset] == 0xff {
            offset += 1;
        }
        if offset >= bytes.len() {
            break;
        }
        let marker = bytes[offset];
        offset += 1;
        if marker == 0xd9 || marker == 0xda {
            break;
        }
        if marker == 0x01 || (0xd0..=0xd8).contains(&marker) {
            continue;
        }
        if offset + 2 > bytes.len() {
            break;
        }
        let length = usize::from(u16::from_be_bytes([bytes[offset], bytes[offset + 1]]));
        if length < 2 || offset + length > bytes.len() {
            return Err("JPEG contains an invalid marker length.".into());
        }
        if matches!(
            marker,
            0xc0 | 0xc1
                | 0xc2
                | 0xc3
                | 0xc5
                | 0xc6
                | 0xc7
                | 0xc9
                | 0xca
                | 0xcb
                | 0xcd
                | 0xce
                | 0xcf
        ) {
            if length < 7 {
                return Err("JPEG frame header is truncated.".into());
            }
            let height = u32::from(u16::from_be_bytes([bytes[offset + 3], bytes[offset + 4]]));
            let width = u32::from(u16::from_be_bytes([bytes[offset + 5], bytes[offset + 6]]));
            return Ok((width, height));
        }
        offset += length;
    }
    Err("JPEG dimensions were not found in the first 1 MB.".into())
}

fn webp_dimensions(bytes: &[u8]) -> Result<(u32, u32), String> {
    if bytes.len() < 25 {
        return Err("WebP header is truncated.".into());
    }
    match &bytes[12..16] {
        b"VP8X" => {
            if bytes.len() < 30 {
                return Err("WebP VP8X header is truncated.".into());
            }
            let width = 1
                + u32::from(bytes[24])
                + (u32::from(bytes[25]) << 8)
                + (u32::from(bytes[26]) << 16);
            let height = 1
                + u32::from(bytes[27])
                + (u32::from(bytes[28]) << 8)
                + (u32::from(bytes[29]) << 16);
            Ok((width, height))
        }
        b"VP8L" => {
            if bytes[20] != 0x2f {
                return Err("WebP VP8L signature is invalid.".into());
            }
            let width = 1 + u32::from(bytes[21]) + ((u32::from(bytes[22]) & 0x3f) << 8);
            let height = 1
                + (u32::from(bytes[22]) >> 6)
                + (u32::from(bytes[23]) << 2)
                + ((u32::from(bytes[24]) & 0x0f) << 10);
            Ok((width, height))
        }
        b"VP8 " => {
            if bytes.len() < 30 || &bytes[23..26] != b"\x9d\x01\x2a" {
                return Err("WebP VP8 frame header is invalid.".into());
            }
            let width = u32::from(u16::from_le_bytes([bytes[26], bytes[27]]) & 0x3fff);
            let height = u32::from(u16::from_le_bytes([bytes[28], bytes[29]]) & 0x3fff);
            Ok((width, height))
        }
        _ => Err("Unsupported WebP frame header.".into()),
    }
}

fn theme_color_values(colors: &ThemeColors) -> [Option<&str>; 10] {
    [
        colors.background.as_deref(),
        colors.panel.as_deref(),
        colors.panel_alt.as_deref(),
        colors.accent.as_deref(),
        colors.accent_alt.as_deref(),
        colors.secondary.as_deref(),
        colors.highlight.as_deref(),
        colors.text.as_deref(),
        colors.muted.as_deref(),
        colors.line.as_deref(),
    ]
}

fn theme_unsupported_features(theme: &ThemeConfig, features: &RuntimeThemeFeatures) -> Vec<String> {
    let mut unsupported = Vec::new();
    if theme.appearance.is_some() && !features.appearance {
        unsupported.push("appearance".into());
    }
    if theme.art.is_some() && !features.art {
        unsupported.push("art".into());
    }
    let color_values = theme.colors.as_ref().map(theme_color_values);
    if let Some(values) = &color_values {
        let populated = values.iter().filter(|value| value.is_some()).count();
        if populated > 0 && populated < values.len() && !features.partial_colors {
            unsupported.push("partialColors".into());
        }
    }
    let palette_accent = theme
        .palette
        .as_ref()
        .and_then(|palette| palette.accent.as_deref());
    let uses_rgba = color_values
        .iter()
        .flat_map(|values| values.iter().flatten().copied())
        .chain(palette_accent)
        .any(|value| value.to_ascii_lowercase().starts_with("rgba("));
    if uses_rgba && !features.rgba {
        unsupported.push("rgba".into());
    }
    let uses_alpha_hex = color_values
        .iter()
        .flat_map(|values| values.iter().flatten().copied())
        .chain(palette_accent)
        .any(|value| {
            value
                .strip_prefix('#')
                .is_some_and(|hex| matches!(hex.len(), 4 | 8))
        });
    if uses_alpha_hex && !features.alpha_hex {
        unsupported.push("alphaHex".into());
    }
    if palette_accent.is_some() && !features.palette_accent {
        unsupported.push("paletteAccent".into());
    }
    unsupported
}
fn validate_theme_for_runtime(
    theme: &ThemeConfig,
    features: &RuntimeThemeFeatures,
) -> Result<(), String> {
    let unsupported = theme_unsupported_features(theme, features);
    if unsupported.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "This runtime does not support theme features: {}. Repair or update the engine before applying this theme.",
            unsupported.join(", ")
        ))
    }
}
fn image_metadata(width: u32, height: u32) -> ThemeImageMetadata {
    let aspect_ratio = f64::from(width) / f64::from(height);
    let wide = aspect_ratio >= 1.45;
    let portrait = aspect_ratio <= 0.85;
    ThemeImageMetadata {
        width,
        height,
        aspect_ratio,
        wide,
        suggested_focus_x: 0.5,
        suggested_focus_y: if portrait { 0.42 } else { 0.5 },
        suggested_safe_area: if wide {
            ThemeSafeArea::Left
        } else {
            ThemeSafeArea::Auto
        },
        suggested_task_mode: if aspect_ratio >= 2.25 {
            ThemeTaskMode::Banner
        } else {
            ThemeTaskMode::Ambient
        },
    }
}

fn validate_theme(theme: &ThemeConfig) -> Result<(), String> {
    if theme.schema_version != SCHEMA_VERSION {
        return Err(format!(
            "Unsupported theme schema version {}.",
            theme.schema_version
        ));
    }
    validate_id(&theme.id)?;
    validate_text("Theme name", &theme.name, 80, false)?;
    validate_text("Brand subtitle", &theme.brand_subtitle, 80, false)?;
    validate_text("Tagline", &theme.tagline, 160, false)?;
    validate_text("Project prefix", &theme.project_prefix, 80, false)?;
    validate_text("Project label", &theme.project_label, 80, false)?;
    validate_text("Status text", &theme.status_text, 80, false)?;
    validate_text("Quote", &theme.quote, 80, false)?;
    validate_text("Promo title", &theme.promo_title, 120, true)?;
    validate_text("Promo subtitle", &theme.promo_sub, 120, true)?;
    image_kind_from_extension(&theme.image)?;
    if theme.image.to_ascii_lowercase().starts_with("preview.") || theme.image == "theme.json" {
        return Err("The primary image must not use a reserved filename.".into());
    }

    if let Some(colors) = &theme.colors {
        for (label, color) in [
            ("background", colors.background.as_deref()),
            ("panel", colors.panel.as_deref()),
            ("panelAlt", colors.panel_alt.as_deref()),
            ("accent", colors.accent.as_deref()),
            ("accentAlt", colors.accent_alt.as_deref()),
            ("secondary", colors.secondary.as_deref()),
            ("highlight", colors.highlight.as_deref()),
            ("text", colors.text.as_deref()),
            ("muted", colors.muted.as_deref()),
            ("line", colors.line.as_deref()),
        ] {
            if let Some(color) = color {
                validate_color(label, color)?;
            }
        }
        validate_theme_contrast(colors)?;
    }

    if let Some(art) = &theme.art {
        for (label, value) in [("art.focusX", art.focus_x), ("art.focusY", art.focus_y)] {
            if value.is_some_and(|number| !number.is_finite() || !(0.0..=1.0).contains(&number)) {
                return Err(format!("{label} must be a finite number between 0 and 1."));
            }
        }
    }
    if let Some(accent) = theme
        .palette
        .as_ref()
        .and_then(|palette| palette.accent.as_deref())
    {
        validate_palette_color("palette.accent", accent)?;
    }

    if !theme.promo_url.is_empty() {
        validate_text("Promo URL", &theme.promo_url, 500, false)?;
        let parsed = url::Url::parse(&theme.promo_url)
            .map_err(|_| "Promo URL must be a valid HTTPS URL.".to_owned())?;
        if parsed.scheme() != "https"
            || parsed.host_str().is_none()
            || !parsed.username().is_empty()
            || parsed.password().is_some()
            || theme.promo_url.chars().any(|character| {
                character.is_whitespace()
                    || character.is_control()
                    || matches!(character, '"' | '\'' | '<' | '>' | '`' | '\\')
            })
        {
            return Err("Promo URL must be a safe HTTPS URL.".into());
        }
    }
    Ok(())
}

fn validate_package(package: &ThemePackage) -> Result<(), String> {
    validate_theme(&package.config)?;
    if package.image_name != package.config.image {
        return Err("theme.json image does not match the bundled primary image.".into());
    }
    validate_image_bytes(&package.image_name, &package.image)?;
    if let Some((name, bytes)) = &package.preview {
        let lower = name.to_ascii_lowercase();
        if !lower.starts_with("preview.") {
            return Err("Optional preview image must be named preview.<extension>.".into());
        }
        validate_image_bytes(name, bytes)?;
    }
    let total = package.image.len()
        + package.preview.as_ref().map_or(0, |(_, bytes)| bytes.len())
        + serde_json::to_vec(&package.config)
            .map_err(|error| error.to_string())?
            .len();
    if total as u64 > MAX_BUNDLE_SIZE {
        return Err("Theme package exceeds the 32 MB uncompressed limit.".into());
    }
    Ok(())
}

fn parse_theme_json_with_policy(
    bytes: &[u8],
    allow_missing_schema_version: bool,
) -> Result<ThemeConfig, String> {
    if bytes.is_empty() || bytes.len() as u64 > MAX_JSON_SIZE {
        return Err("theme.json must be between 1 byte and 1 MB.".into());
    }
    if !allow_missing_schema_version {
        let value: serde_json::Value = serde_json::from_slice(bytes)
            .map_err(|error| format!("Invalid theme.json: {error}"))?;
        if !value
            .as_object()
            .is_some_and(|object| object.contains_key("schemaVersion"))
        {
            return Err("theme.json is missing required field schemaVersion.".into());
        }
    }
    let mut theme: ThemeConfig = serde_json::from_slice(bytes).map_err(|error| {
        let message = format!("Invalid theme.json: {error}");
        if message.contains("unknown field") {
            format!("{message} The theme may require a newer Manager.")
        } else {
            message
        }
    })?;
    normalize_theme_config(&mut theme);
    validate_theme(&theme)?;
    Ok(theme)
}

fn parse_theme_json(bytes: &[u8]) -> Result<ThemeConfig, String> {
    parse_theme_json_with_policy(bytes, false)
}

fn parse_platform_theme_json(bytes: &[u8]) -> Result<ThemeConfig, String> {
    parse_theme_json_with_policy(bytes, true)
}

fn load_theme_dir_with_policy(
    directory: &Path,
    allow_missing_schema_version: bool,
) -> Result<ThemePackage, String> {
    let metadata = fs::symlink_metadata(directory)
        .map_err(|error| format!("Cannot inspect theme directory: {error}"))?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("Theme directory must be a real directory, not a symlink.".into());
    }
    let json = read_bounded_file(&directory.join("theme.json"), MAX_JSON_SIZE, "theme.json")?;
    let config = if allow_missing_schema_version {
        parse_platform_theme_json(&json)?
    } else {
        parse_theme_json(&json)?
    };
    let image_path = directory.join(&config.image);
    let image_meta = fs::symlink_metadata(&image_path)
        .map_err(|error| format!("Cannot inspect theme image: {error}"))?;
    if !image_meta.is_file() || image_meta.file_type().is_symlink() {
        return Err("Theme image must be a regular file, not a symlink.".into());
    }
    let image = read_bounded_file(&image_path, MAX_FILE_SIZE, "theme image")?;

    let mut preview = None;
    for entry in
        fs::read_dir(directory).map_err(|error| format!("Cannot list theme directory: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Cannot list theme directory: {error}"))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.to_ascii_lowercase().starts_with("preview.") {
            if preview.is_some() {
                return Err("Theme contains more than one preview image.".into());
            }
            let metadata = fs::symlink_metadata(entry.path())
                .map_err(|error| format!("Cannot inspect preview image: {error}"))?;
            if !metadata.is_file() || metadata.file_type().is_symlink() {
                return Err("Preview image must be a regular file, not a symlink.".into());
            }
            let bytes = read_bounded_file(&entry.path(), MAX_FILE_SIZE, "preview image")?;
            preview = Some((name, bytes));
        }
    }

    let package = ThemePackage {
        image_name: config.image.clone(),
        config,
        image,
        preview,
    };
    validate_package(&package)?;
    Ok(package)
}

fn load_theme_dir(directory: &Path) -> Result<ThemePackage, String> {
    load_theme_dir_with_policy(directory, false)
}

fn load_platform_theme_dir(directory: &Path) -> Result<ThemePackage, String> {
    load_theme_dir_with_policy(directory, true)
}

fn parse_bundle_bytes(bytes: &[u8]) -> Result<ThemePackage, String> {
    if bytes.is_empty() || bytes.len() as u64 > MAX_BUNDLE_SIZE {
        return Err(".codexskin file must be between 1 byte and 32 MB.".into());
    }
    let mut archive = ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| format!("Invalid .codexskin ZIP: {error}"))?;
    if !(2..=MAX_ZIP_ENTRIES).contains(&archive.len()) {
        return Err(
            ".codexskin must contain theme.json, one image, and at most one preview.".into(),
        );
    }

    let mut entries = HashMap::<String, Vec<u8>>::new();
    let mut names = HashSet::<String>::new();
    let mut total = 0_u64;
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("Cannot read ZIP entry: {error}"))?;
        let name = file.name().to_owned();
        if file.is_dir()
            || name.is_empty()
            || name.contains('/')
            || name.contains('\\')
            || name.contains(':')
            || name == "."
            || name == ".."
            || Path::new(&name).components().count() != 1
        {
            return Err(format!("Unsafe or nested ZIP entry rejected: {name}"));
        }
        if name.len() > 128 {
            return Err("ZIP entry name is too long.".into());
        }
        let folded = name.to_ascii_lowercase();
        if !names.insert(folded) {
            return Err("ZIP contains duplicate filenames.".into());
        }
        if file.size() > MAX_FILE_SIZE {
            return Err(format!("ZIP entry {name} exceeds the 16 MB file limit."));
        }
        total = total.checked_add(file.size()).ok_or("ZIP size overflow.")?;
        if total > MAX_BUNDLE_SIZE {
            return Err("ZIP exceeds the 32 MB uncompressed limit.".into());
        }
        let mut data = Vec::with_capacity(file.size() as usize);
        file.by_ref()
            .take(MAX_FILE_SIZE + 1)
            .read_to_end(&mut data)
            .map_err(|error| format!("Cannot decompress ZIP entry {name}: {error}"))?;
        if data.len() as u64 > MAX_FILE_SIZE {
            return Err(format!("ZIP entry {name} exceeds the 16 MB file limit."));
        }
        entries.insert(name, data);
    }

    let json = entries
        .remove("theme.json")
        .ok_or(".codexskin is missing theme.json.")?;
    let config = parse_theme_json(&json)?;
    let image_name = config.image.clone();
    let image = entries
        .remove(&image_name)
        .ok_or("The primary image named by theme.json is missing.")?;
    let preview = match entries.len() {
        0 => None,
        1 => {
            let (name, data) = entries.into_iter().next().expect("length checked");
            if !name.to_ascii_lowercase().starts_with("preview.") {
                return Err("The only optional ZIP entry is preview.<png|jpg|jpeg|webp>.".into());
            }
            Some((name, data))
        }
        _ => return Err(".codexskin contains unexpected files.".into()),
    };
    let package = ThemePackage {
        config,
        image_name,
        image,
        preview,
    };
    validate_package(&package)?;
    Ok(package)
}

fn parse_bundle_path(path: &Path) -> Result<ThemePackage, String> {
    ensure_absolute_file(path, ".codexskin file")?;
    if path
        .extension()
        .and_then(OsStr::to_str)
        .map(str::to_ascii_lowercase)
        .as_deref()
        != Some("codexskin")
    {
        return Err("Theme bundle must use the .codexskin extension.".into());
    }
    let bytes = read_bounded_file(path, MAX_BUNDLE_SIZE, ".codexskin file")?;
    parse_bundle_bytes(&bytes)
}

fn package_json(package: &ThemePackage) -> Result<Vec<u8>, String> {
    let mut config = package.config.clone();
    normalize_theme_config(&mut config);
    let mut bytes = serde_json::to_vec_pretty(&config)
        .map_err(|error| format!("Cannot encode theme.json: {error}"))?;
    bytes.push(b'\n');
    Ok(bytes)
}

fn write_new_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| format!("Cannot create {}: {error}", path.display()))?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("Cannot write {}: {error}", path.display()))
}

fn replace_directory(staging: &Path, destination: &Path) -> Result<(), String> {
    if let Ok(metadata) = fs::symlink_metadata(destination) {
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(format!(
                "Refusing to replace unsafe destination {}.",
                destination.display()
            ));
        }
        let backup = destination.with_file_name(format!(
            ".{}-backup-{}",
            destination
                .file_name()
                .and_then(OsStr::to_str)
                .unwrap_or("theme"),
            unique_suffix()
        ));
        fs::rename(destination, &backup)
            .map_err(|error| format!("Cannot stage previous theme for replacement: {error}"))?;
        if let Err(error) = fs::rename(staging, destination) {
            let _ = fs::rename(&backup, destination);
            return Err(format!("Cannot activate replacement theme: {error}"));
        }
        fs::remove_dir_all(&backup).map_err(|error| {
            format!("Theme was replaced, but old data could not be removed: {error}")
        })?;
    } else {
        fs::rename(staging, destination)
            .map_err(|error| format!("Cannot activate theme directory: {error}"))?;
    }
    Ok(())
}

fn write_theme_dir_atomic(destination: &Path, package: &ThemePackage) -> Result<(), String> {
    validate_package(package)?;
    let parent = destination
        .parent()
        .ok_or("Theme destination has no parent directory.")?;
    fs::create_dir_all(parent).map_err(|error| format!("Cannot create theme storage: {error}"))?;
    let staging = parent.join(format!(".codexskin-stage-{}", unique_suffix()));
    fs::create_dir(&staging)
        .map_err(|error| format!("Cannot create theme staging directory: {error}"))?;
    let result = (|| {
        write_new_file(&staging.join("theme.json"), &package_json(package)?)?;
        write_new_file(&staging.join(&package.image_name), &package.image)?;
        if let Some((name, bytes)) = &package.preview {
            write_new_file(&staging.join(name), bytes)?;
        }
        replace_directory(&staging, destination)
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    result
}

fn rollback_active_theme(
    destination: &Path,
    previous: Option<&ThemePackage>,
) -> Result<(), String> {
    if let Some(package) = previous {
        return write_theme_dir_atomic(destination, package);
    }
    match fs::symlink_metadata(destination) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {
            fs::remove_dir_all(destination)
                .map_err(|error| format!("Cannot remove failed active theme: {error}"))
        }
        Ok(_) => Err("Refusing to remove an unsafe active-theme path.".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Cannot inspect failed active theme: {error}")),
    }
}

fn replace_file_atomic(destination: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = destination
        .parent()
        .ok_or("Destination has no parent directory.")?;
    if !parent.is_dir() {
        return Err("Destination directory does not exist.".into());
    }
    let name = destination
        .file_name()
        .and_then(OsStr::to_str)
        .ok_or("Invalid destination filename.")?;
    let staging = parent.join(format!(".{name}.tmp-{}", unique_suffix()));
    write_new_file(&staging, bytes)?;

    let result = if let Ok(metadata) = fs::symlink_metadata(destination) {
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            Err("Refusing to replace a symlink or non-file destination.".into())
        } else {
            let backup = parent.join(format!(".{name}.backup-{}", unique_suffix()));
            fs::rename(destination, &backup)
                .map_err(|error| format!("Cannot stage destination for replacement: {error}"))?;
            if let Err(error) = fs::rename(&staging, destination) {
                let _ = fs::rename(&backup, destination);
                Err(format!("Cannot replace destination: {error}"))
            } else {
                fs::remove_file(&backup).map_err(|error| {
                    format!("File was replaced, but backup cleanup failed: {error}")
                })?;
                Ok(())
            }
        }
    } else {
        fs::rename(&staging, destination)
            .map_err(|error| format!("Cannot save destination: {error}"))
    };
    if result.is_err() {
        let _ = fs::remove_file(&staging);
    }
    result
}

fn encode_bundle(package: &ThemePackage) -> Result<Vec<u8>, String> {
    validate_package(package)?;
    let cursor = Cursor::new(Vec::new());
    let mut writer = ZipWriter::new(cursor);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o600);
    for (name, bytes) in [
        ("theme.json", package_json(package)?),
        (&package.image_name, package.image.clone()),
    ] {
        writer
            .start_file(name, options)
            .map_err(|error| format!("Cannot create ZIP entry: {error}"))?;
        writer
            .write_all(&bytes)
            .map_err(|error| format!("Cannot write ZIP entry: {error}"))?;
    }
    if let Some((name, bytes)) = &package.preview {
        writer
            .start_file(name, options)
            .map_err(|error| format!("Cannot create preview entry: {error}"))?;
        writer
            .write_all(bytes)
            .map_err(|error| format!("Cannot write preview entry: {error}"))?;
    }
    let bytes = writer
        .finish()
        .map_err(|error| format!("Cannot finish .codexskin ZIP: {error}"))?
        .into_inner();
    if bytes.len() as u64 > MAX_BUNDLE_SIZE {
        return Err("Exported .codexskin exceeds the 32 MB limit.".into());
    }
    Ok(bytes)
}

fn app_data_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("Cannot resolve app data directory: {error}"))
}

fn themes_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_root(app)?.join("themes"))
}

fn imported_theme_id(root: &Path, requested: &str) -> String {
    if !root.join(requested).exists() {
        return requested.to_owned();
    }

    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let sequence = UNIQUE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let suffix = format!("-import-{millis}-{sequence}");
    let keep = 64_usize.saturating_sub(suffix.len());
    let mut base: String = requested.chars().take(keep).collect();
    while base.ends_with('-') {
        base.pop();
    }
    if base.is_empty() {
        base.push_str("theme");
    }
    format!("{base}{suffix}")
}

#[cfg(target_os = "windows")]
fn platform_state_root() -> Result<PathBuf, String> {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .map(|path| path.join("CodexDreamSkin"))
        .ok_or("LOCALAPPDATA is unavailable.".into())
}

#[cfg(target_os = "macos")]
fn platform_state_root() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .map(|path| path.join("Library/Application Support/CodexDreamSkinStudio"))
        .ok_or("HOME is unavailable.".into())
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn platform_state_root() -> Result<PathBuf, String> {
    Err("Codex Dream Skin Manager supports Windows and macOS only.".into())
}

fn expected_runtime_platform() -> &'static str {
    #[cfg(target_os = "windows")]
    return "windows";
    #[cfg(target_os = "macos")]
    return "macos";
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    "unsupported"
}

fn platform_runtime_root(root: &Path) -> PathBuf {
    if root.join("runtime-capabilities.json").is_file() || root.join("scripts").is_dir() {
        root.to_path_buf()
    } else {
        root.join(expected_runtime_platform())
    }
}

fn validate_relative_contract_path(value: &str, label: &str, simple: bool) -> Result<(), String> {
    let path = Path::new(value);
    if value.is_empty()
        || value.len() > 240
        || path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, std::path::Component::Normal(_)))
        || (simple && path.components().count() != 1)
    {
        return Err(format!("{label} must be a safe relative path."));
    }
    Ok(())
}

fn validate_contract_argument(argument: &str) -> bool {
    #[cfg(target_os = "windows")]
    const ALLOWED: &[&str] = &[
        "-NoShortcuts",
        "-RestartExisting",
        "-PromptRestart",
        "-RestoreBaseTheme",
        "-ForceRestart",
        "-NoRelaunch",
    ];
    #[cfg(target_os = "macos")]
    const ALLOWED: &[&str] = &[
        "--no-launchers",
        "--no-launch",
        "--restart-existing",
        "--prompt-restart",
        "--restore-base-theme",
        "--restart-codex",
    ];
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    const ALLOWED: &[&str] = &[];
    ALLOWED.contains(&argument)
}

fn fallback_runtime_capabilities() -> RuntimeCapabilities {
    #[cfg(target_os = "windows")]
    let (minimum_node_major, active_theme, install, start, restore) = (
        22,
        "active-theme",
        "scripts/install-dream-skin.ps1",
        "scripts/start-dream-skin.ps1",
        "scripts/restore-dream-skin.ps1",
    );
    #[cfg(target_os = "macos")]
    let (minimum_node_major, active_theme, install, start, restore) = (
        20,
        "theme",
        "scripts/install-dream-skin-macos.sh",
        "scripts/start-dream-skin-macos.sh",
        "scripts/restore-dream-skin-macos.sh",
    );
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let (minimum_node_major, active_theme, install, start, restore) = (
        u32::MAX,
        "__unsupported__",
        "__invalid__",
        "__invalid__",
        "__invalid__",
    );

    let command =
        |script: &str, args: &[&str], restart_args: &[&str], semantics| RuntimeCommandContract {
            script: script.into(),
            args: args.iter().map(|value| (*value).into()).collect(),
            restart_args: restart_args.iter().map(|value| (*value).into()).collect(),
            base_theme_args: Vec::new(),
            restart_semantics: semantics,
        };
    #[cfg(target_os = "windows")]
    let mut commands = RuntimeCommands {
        install: command(
            install,
            &["-NoShortcuts"],
            &[],
            RestartSemantics::RequiresCodexClosed,
        ),
        start: command(
            start,
            &[],
            &["-RestartExisting"],
            RestartSemantics::OptionalExplicit,
        ),
        restore: command(
            restore,
            &[],
            &["-ForceRestart"],
            RestartSemantics::OptionalExplicit,
        ),
    };
    #[cfg(target_os = "macos")]
    let mut commands = RuntimeCommands {
        install: command(
            install,
            &["--no-launchers", "--no-launch"],
            &[],
            RestartSemantics::RequiresCodexClosed,
        ),
        start: command(
            start,
            &[],
            &["--restart-existing"],
            RestartSemantics::OptionalExplicit,
        ),
        restore: command(
            restore,
            &[],
            &["--restart-codex"],
            RestartSemantics::OptionalExplicit,
        ),
    };
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let mut commands = RuntimeCommands {
        install: command(install, &[], &[], RestartSemantics::None),
        start: command(start, &[], &[], RestartSemantics::None),
        restore: command(restore, &[], &[], RestartSemantics::None),
    };
    #[cfg(target_os = "windows")]
    commands
        .restore
        .base_theme_args
        .push("-RestoreBaseTheme".into());
    #[cfg(target_os = "macos")]
    commands
        .restore
        .base_theme_args
        .push("--restore-base-theme".into());
    RuntimeCapabilities {
        manifest_version: 1,
        platform: expected_runtime_platform().into(),
        runtime_version: "legacy".into(),
        minimum_node_major,
        theme_schema_version: SCHEMA_VERSION,
        theme_features: RuntimeThemeFeatures::default(),
        paths: RuntimePaths {
            active_theme: active_theme.into(),
            theme_store: "themes".into(),
            state: "state.json".into(),
            logs: vec!["injector.log".into(), "injector-error.log".into()],
        },
        commands,
    }
}

fn resolve_runtime_script(
    platform_root: &Path,
    relative: &str,
    label: &str,
) -> Result<PathBuf, String> {
    let root_metadata = fs::symlink_metadata(platform_root)
        .map_err(|error| format!("Cannot inspect runtime root: {error}"))?;
    if !root_metadata.is_dir() || root_metadata.file_type().is_symlink() {
        return Err("Runtime root must be a real directory.".into());
    }
    let script = platform_root.join(relative);
    let metadata = fs::symlink_metadata(&script)
        .map_err(|error| format!("{label} capability script is missing: {error}"))?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(format!("{label} capability script must be a real file."));
    }
    let canonical_root = canonicalize_platform_path(platform_root, "runtime root")?;
    let canonical_script = canonicalize_platform_path(&script, &format!("{label} script"))?;
    if !canonical_script.starts_with(&canonical_root) {
        return Err(format!(
            "{label} capability script escapes the runtime root."
        ));
    }
    Ok(canonical_script)
}

fn runtime_payload_files(platform_root: &Path) -> Result<Vec<PathBuf>, String> {
    const MAX_FILES: usize = 1024;
    let mut files = Vec::new();
    let manifest = platform_root.join("runtime-capabilities.json");
    if manifest.exists() {
        files.push(manifest);
    }
    for directory_name in ["assets", "scripts", "presets"] {
        let directory = platform_root.join(directory_name);
        if !directory.exists() {
            continue;
        }
        let metadata = fs::symlink_metadata(&directory)
            .map_err(|error| format!("Cannot inspect runtime payload: {error}"))?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err(format!(
                "Runtime {directory_name} must be a real directory."
            ));
        }
        let mut pending = vec![directory];
        while let Some(current) = pending.pop() {
            for entry in fs::read_dir(&current)
                .map_err(|error| format!("Cannot list runtime payload: {error}"))?
            {
                let entry =
                    entry.map_err(|error| format!("Cannot list runtime payload entry: {error}"))?;
                let path = entry.path();
                let metadata = fs::symlink_metadata(&path)
                    .map_err(|error| format!("Cannot inspect runtime payload entry: {error}"))?;
                if metadata.file_type().is_symlink() {
                    return Err("Runtime payload must not contain symbolic links.".into());
                }
                if metadata.is_dir() {
                    pending.push(path);
                } else if metadata.is_file() {
                    files.push(path);
                    if files.len() > MAX_FILES {
                        return Err("Runtime payload contains too many files.".into());
                    }
                }
            }
        }
    }
    files.sort_by_key(|path| path_string(path));
    Ok(files)
}

fn runtime_payload_fingerprint(root: &Path) -> Result<String, String> {
    const MAX_BYTES: u64 = 128 * 1024 * 1024;
    let (platform_root, capabilities, _) = runtime_contract(root)?;
    let canonical_root = canonicalize_platform_path(&platform_root, "runtime root")?;
    let files = runtime_payload_files(&platform_root)?;
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    let mut total = 0_u64;
    let mut update = |bytes: &[u8]| {
        for byte in bytes {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
        }
    };
    update(capabilities.runtime_version.as_bytes());
    for file in files {
        let canonical_file = canonicalize_platform_path(&file, "runtime payload file")?;
        if !canonical_file.starts_with(&canonical_root) {
            return Err("Runtime payload file escapes the runtime root.".into());
        }
        let relative = canonical_file
            .strip_prefix(&canonical_root)
            .map_err(|_| "Cannot derive runtime payload path.".to_owned())?;
        let metadata = fs::metadata(&canonical_file)
            .map_err(|error| format!("Cannot inspect runtime payload file: {error}"))?;
        total = total
            .checked_add(metadata.len())
            .ok_or("Runtime payload size overflowed.")?;
        if total > MAX_BYTES {
            return Err("Runtime payload exceeds the 128 MB compatibility limit.".into());
        }
        update(path_string(relative).replace('\\', "/").as_bytes());
        update(&metadata.len().to_le_bytes());
        let bytes = fs::read(&canonical_file)
            .map_err(|error| format!("Cannot read runtime payload file: {error}"))?;
        update(&bytes);
    }
    Ok(format!("{hash:016x}"))
}
fn validate_runtime_capabilities(
    platform_root: &Path,
    manifest: &RuntimeCapabilities,
) -> Result<(), String> {
    if manifest.manifest_version != 1 {
        return Err(format!(
            "Unsupported runtime capability manifest version {}.",
            manifest.manifest_version
        ));
    }
    if manifest.platform != expected_runtime_platform()
        || manifest.theme_schema_version != SCHEMA_VERSION
        || !(1..=100).contains(&manifest.minimum_node_major)
    {
        return Err(
            "Runtime capability manifest targets an incompatible platform or schema.".into(),
        );
    }
    validate_text("Runtime version", &manifest.runtime_version, 64, false)?;
    validate_relative_contract_path(&manifest.paths.active_theme, "activeTheme", true)?;
    validate_relative_contract_path(&manifest.paths.theme_store, "themeStore", true)?;
    validate_relative_contract_path(&manifest.paths.state, "state", true)?;
    for log in &manifest.paths.logs {
        validate_relative_contract_path(log, "runtime log", true)?;
    }
    let expected_scripts = [
        ("install", &manifest.commands.install, "install-dream-skin"),
        ("start", &manifest.commands.start, "start-dream-skin"),
        ("restore", &manifest.commands.restore, "restore-dream-skin"),
    ];
    for (label, command, expected_name) in expected_scripts {
        validate_relative_contract_path(&command.script, &format!("{label} script"), false)?;
        let filename = Path::new(&command.script)
            .file_stem()
            .and_then(OsStr::to_str)
            .unwrap_or_default();
        if !filename.starts_with(expected_name) {
            return Err(format!(
                "{label} capability points to an unexpected script."
            ));
        }
        if command
            .args
            .iter()
            .chain(&command.restart_args)
            .chain(&command.base_theme_args)
            .any(|argument| !validate_contract_argument(argument))
        {
            return Err(format!(
                "{label} capability contains an unsupported argument."
            ));
        }
        resolve_runtime_script(platform_root, &command.script, label)?;
    }
    Ok(())
}

fn runtime_contract(root: &Path) -> Result<(PathBuf, RuntimeCapabilities, Option<String>), String> {
    let platform_root = platform_runtime_root(root);
    let manifest_path = platform_root.join("runtime-capabilities.json");
    let manifest_metadata = match fs::symlink_metadata(&manifest_path) {
        Ok(metadata) => Some(metadata),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => {
            return Err(format!(
                "Cannot inspect runtime capability manifest: {error}"
            ))
        }
    };
    if manifest_metadata.is_none() {
        let fallback = fallback_runtime_capabilities();
        validate_runtime_capabilities(&platform_root, &fallback)?;
        return Ok((
            platform_root,
            fallback,
            Some(
                "Runtime has no capability manifest; conservative legacy defaults are active."
                    .into(),
            ),
        ));
    }
    let manifest_metadata = manifest_metadata.expect("manifest metadata is present");
    if !manifest_metadata.is_file() || manifest_metadata.file_type().is_symlink() {
        return Err("Runtime capability manifest must be a real file.".into());
    }
    let bytes = read_bounded_file(&manifest_path, MAX_JSON_SIZE, "runtime-capabilities.json")?;
    let manifest: RuntimeCapabilities = serde_json::from_slice(&bytes)
        .map_err(|error| format!("Invalid runtime capability manifest: {error}"))?;
    validate_runtime_capabilities(&platform_root, &manifest)?;
    Ok((platform_root, manifest, None))
}

fn is_engine_root(root: &Path) -> bool {
    runtime_contract(root).is_ok()
}

fn managed_engine_root() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        platform_state_root().ok().map(|root| root.join("engine"))
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME")
            .map(PathBuf::from)
            .map(|home| home.join(".codex/codex-dream-skin-studio"))
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    None
}

fn resolve_source_engine_root(app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
    {
        let development = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        if is_engine_root(&development) {
            return canonicalize_platform_path(&development, "development engine");
        }
    }
    let resources = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Cannot resolve resource directory: {error}"))?;
    for candidate in [
        resources.join("engine"),
        resources.clone(),
        resources.join("_up_/_up_"),
        resources.join("resources"),
    ] {
        if is_engine_root(&candidate) {
            return canonicalize_platform_path(&candidate, "bundled engine");
        }
    }
    Err("Bundled Dream Skin engine is missing or incompatible.".into())
}

fn resolve_active_engine_root(app: &AppHandle) -> Result<(PathBuf, Option<String>), String> {
    let source = resolve_source_engine_root(app);
    let managed_path = managed_engine_root();
    let managed = managed_path
        .as_ref()
        .filter(|root| is_engine_root(root))
        .map(|root| canonicalize_platform_path(root, "managed engine"))
        .transpose()?;
    match (source, managed) {
        (Ok(source), Some(managed)) => {
            if runtime_payload_fingerprint(&source)? == runtime_payload_fingerprint(&managed)? {
                Ok((managed, None))
            } else {
                Ok((
                    source,
                    Some(
                        "The installed runtime differs from this Manager build; repair the engine before relying on installed launchers."
                            .into(),
                    ),
                ))
            }
        }
        (Ok(source), None) => {
            let message = managed_path.filter(|path| path.exists()).map(|_| {
                "The installed runtime is invalid; repair the engine before relying on installed launchers."
                    .into()
            });
            Ok((source, message))
        }
        (Err(_source_error), Some(managed)) => Ok((
            managed,
            Some(
                "Bundled runtime source is unavailable; using the validated installed runtime."
                    .into(),
            ),
        )),
        (Err(source_error), None) => Err(source_error),
    }
}

fn source_runtime(
    app: &AppHandle,
) -> Result<(PathBuf, PathBuf, RuntimeCapabilities, Option<String>), String> {
    let root = resolve_source_engine_root(app)?;
    let (platform_root, capabilities, compatibility_message) = runtime_contract(&root)?;
    Ok((root, platform_root, capabilities, compatibility_message))
}

fn resolved_runtime(
    app: &AppHandle,
) -> Result<(PathBuf, PathBuf, RuntimeCapabilities, Option<String>), String> {
    let (root, resolver_message) = resolve_active_engine_root(app)?;
    let (platform_root, capabilities, contract_message) = runtime_contract(&root)?;
    let compatibility_message = match (resolver_message, contract_message) {
        (Some(left), Some(right)) => Some(format!("{left} {right}")),
        (Some(message), None) | (None, Some(message)) => Some(message),
        (None, None) => None,
    };
    Ok((root, platform_root, capabilities, compatibility_message))
}

fn migrate_legacy_active_theme(state_root: &Path, active_name: &str) -> Result<(), String> {
    if active_name != "active-theme" {
        return Ok(());
    }
    let active = state_root.join(active_name);
    if active.exists() {
        return Ok(());
    }
    let legacy = state_root.join("theme");
    if !legacy.exists() {
        return Ok(());
    }
    let state_metadata = fs::symlink_metadata(state_root)
        .map_err(|error| format!("Cannot inspect Dream Skin state root: {error}"))?;
    if !state_metadata.is_dir() || state_metadata.file_type().is_symlink() {
        return Err("Dream Skin state root must be a real directory.".into());
    }
    let legacy_metadata = fs::symlink_metadata(&legacy)
        .map_err(|error| format!("Cannot inspect legacy active theme: {error}"))?;
    if !legacy_metadata.is_dir() || legacy_metadata.file_type().is_symlink() {
        return Err("Legacy active theme must be a real directory.".into());
    }
    let package = load_theme_dir(&legacy)
        .map_err(|error| format!("Legacy active theme is invalid and was not migrated: {error}"))?;
    write_theme_dir_atomic(&active, &package)?;
    let migrated = load_theme_dir(&active)
        .map_err(|error| format!("Migrated active theme failed verification: {error}"))?;
    if migrated.config != package.config || migrated.image != package.image {
        return Err("Migrated active theme does not match its legacy source.".into());
    }
    Ok(())
}

fn active_theme_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let (_, _, capabilities, _) = resolved_runtime(app)?;
    let state_root = platform_state_root()?;
    migrate_legacy_active_theme(&state_root, &capabilities.paths.active_theme)?;
    Ok(state_root.join(capabilities.paths.active_theme))
}

fn platform_theme_store(app: &AppHandle) -> Result<PathBuf, String> {
    let (_, _, capabilities, _) = resolved_runtime(app)?;
    Ok(platform_state_root()?.join(capabilities.paths.theme_store))
}

fn runtime_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let (_, _, capabilities, _) = resolved_runtime(app)?;
    Ok(platform_state_root()?.join(capabilities.paths.state))
}

fn active_theme_id(app: &AppHandle) -> Option<String> {
    active_theme_selection(app).ok().flatten()
}

fn runtime_command(
    app: &AppHandle,
    action: &str,
    restart: bool,
    base_theme: bool,
) -> Result<(PathBuf, Vec<OsString>, RestartSemantics), String> {
    let (_, platform_root, capabilities, _) = if action == "install" {
        source_runtime(app)?
    } else {
        resolved_runtime(app)?
    };
    let command = match action {
        "install" => &capabilities.commands.install,
        "start" => &capabilities.commands.start,
        "restore" => &capabilities.commands.restore,
        _ => return Err("Unsupported runtime command.".into()),
    };
    let mut args = command.args.iter().map(OsString::from).collect::<Vec<_>>();
    if base_theme {
        args.extend(command.base_theme_args.iter().map(OsString::from));
    }
    if restart {
        args.extend(command.restart_args.iter().map(OsString::from));
    }
    Ok((
        resolve_runtime_script(&platform_root, &command.script, action)?,
        args,
        command.restart_semantics.clone(),
    ))
}

fn package_fingerprint(package: &ThemePackage) -> Result<String, String> {
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    let mut update = |bytes: &[u8]| {
        for byte in bytes {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
        }
    };
    update(&package_json(package)?);
    update(&package.image);
    if let Some((name, bytes)) = &package.preview {
        update(name.as_bytes());
        update(bytes);
    }
    Ok(format!("{hash:016x}"))
}

fn prune_theme_cache_versions(root: &Path, keep: &Path) -> Result<(), String> {
    const KEEP_VERSIONS: usize = 2;
    if !root.exists() {
        return Ok(());
    }
    let canonical_root = canonicalize_platform_path(root, "theme cache root")?;
    let canonical_keep = canonicalize_platform_path(keep, "current theme cache")?;
    if canonical_keep.parent() != Some(canonical_root.as_path()) {
        return Err("Current theme cache is outside its expected root.".into());
    }
    let mut versions = Vec::new();
    for entry in fs::read_dir(root).map_err(|error| format!("Cannot list theme cache: {error}"))? {
        let entry = entry.map_err(|error| format!("Cannot list theme cache entry: {error}"))?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("Cannot inspect theme cache entry: {error}"))?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            continue;
        }
        let canonical = canonicalize_platform_path(&path, "theme cache entry")?;
        if canonical.parent() != Some(canonical_root.as_path()) {
            return Err("Theme cache entry escapes its expected root.".into());
        }
        let modified = metadata.modified().unwrap_or(UNIX_EPOCH);
        versions.push((canonical == canonical_keep, modified, canonical));
    }
    versions.sort_by(|left, right| right.0.cmp(&left.0).then_with(|| right.1.cmp(&left.1)));
    for (_, _, stale) in versions.into_iter().skip(KEEP_VERSIONS) {
        fs::remove_dir_all(&stale)
            .map_err(|error| format!("Cannot prune stale theme cache: {error}"))?;
    }
    Ok(())
}

fn cache_read_only_theme(
    app: &AppHandle,
    namespace: &str,
    package: &ThemePackage,
) -> Result<PathBuf, String> {
    if !matches!(namespace, "builtin" | "platform-cache") {
        return Err("Unsupported theme cache namespace.".into());
    }
    validate_package(package)?;
    let fingerprint = package_fingerprint(package)?;
    let root = app_data_root(app)?.join(namespace).join(&package.config.id);
    let cached = root.join(&fingerprint);
    let cached_matches = load_platform_theme_dir(&cached)
        .ok()
        .and_then(|candidate| package_fingerprint(&candidate).ok())
        .as_deref()
        == Some(fingerprint.as_str());
    if !cached_matches {
        write_theme_dir_atomic(&cached, package)
            .map_err(|error| format!("Cannot prepare {namespace} theme preview: {error}"))?;
    }
    prune_theme_cache_versions(&root, &cached)?;
    Ok(cached)
}

fn bundled_theme_sources(app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    let source_root = resolve_source_engine_root(app)?;
    let platform_root = platform_runtime_root(&source_root);
    let mut candidates = Vec::new();
    for preset_root in [
        source_root.join("macos/presets"),
        source_root.join("presets"),
        platform_root.join("presets"),
    ] {
        candidates.extend(real_theme_directories(&preset_root)?);
    }
    candidates.extend([
        source_root.join("windows/assets"),
        source_root.join("macos/assets"),
        source_root.join("assets"),
        platform_root.join("assets"),
    ]);

    let mut seen_paths = HashSet::new();
    let mut sources = Vec::new();
    for candidate in candidates {
        if !candidate.join("theme.json").is_file() {
            continue;
        }
        let canonical = canonicalize_platform_path(&candidate, "bundled theme")?;
        if seen_paths.insert(path_string(&canonical)) {
            sources.push(canonical);
        }
    }
    if sources.is_empty() {
        return Err("Bundled theme assets are missing.".into());
    }
    Ok(sources)
}

fn builtin_themes(app: &AppHandle) -> Result<Vec<(PathBuf, ThemePackage)>, String> {
    let mut ids = HashSet::new();
    let mut themes = Vec::new();
    for source in bundled_theme_sources(app)? {
        let Ok(package) = load_platform_theme_dir(&source) else {
            continue;
        };
        if !ids.insert(package.config.id.clone()) {
            continue;
        }
        let cached = cache_read_only_theme(app, "builtin", &package)?;
        themes.push((cached, package));
    }
    if themes.is_empty() {
        return Err("No valid bundled themes are available.".into());
    }
    Ok(themes)
}

fn package_summary(
    directory: &Path,
    package: &ThemePackage,
    source: ThemeSource,
    features: &RuntimeThemeFeatures,
) -> Result<ThemeSummary, String> {
    let config = &package.config;
    let image_path = directory
        .join(&config.image)
        .canonicalize()
        .map_err(|error| format!("Cannot resolve theme image: {error}"))?;
    let preview_path = package
        .preview
        .as_ref()
        .map(|(name, _)| directory.join(name).canonicalize())
        .transpose()
        .map_err(|error| format!("Cannot resolve preview image: {error}"))?;
    let decoded = decode_image_bytes(&package.image_name, &package.image)?;
    let derived_colors = image_adaptive_colors(&decoded).unwrap_or_else(default_theme_colors);
    let unsupported_features = theme_unsupported_features(config, features);
    Ok(ThemeSummary {
        id: config.id.clone(),
        selection_key: format!("{}:{}", source.label(), config.id),
        name: config.name.clone(),
        brand_subtitle: config.brand_subtitle.clone(),
        tagline: config.tagline.clone(),
        project_prefix: config.project_prefix.clone(),
        project_label: config.project_label.clone(),
        status_text: config.status_text.clone(),
        quote: config.quote.clone(),
        promo_title: config.promo_title.clone(),
        promo_sub: config.promo_sub.clone(),
        promo_url: config.promo_url.clone(),
        image_path: path_string(&image_path),
        preview_path: preview_path.as_deref().map(path_string),
        colors: config.colors.clone(),
        derived_colors,
        compatible: unsupported_features.is_empty(),
        unsupported_features,
        appearance: config.appearance,
        art: config.art.clone(),
        palette: config.palette.clone(),
        source,
        read_only: source != ThemeSource::Manager,
        image_metadata: image_metadata(decoded.width(), decoded.height()),
        builtin: source == ThemeSource::Builtin,
        active: false,
    })
}
fn parse_theme_selection(value: &str) -> Result<(Option<ThemeSource>, &str), String> {
    let (source, id) = match value.split_once(':') {
        Some(("builtin", id)) => (Some(ThemeSource::Builtin), id),
        Some(("manager", id)) => (Some(ThemeSource::Manager), id),
        Some(("platform", id)) => (Some(ThemeSource::Platform), id),
        Some(_) => return Err("Theme selection has an unknown source.".into()),
        None => (None, value),
    };
    validate_id(id)?;
    Ok((source, id))
}

fn real_theme_directories(root: &Path) -> Result<Vec<PathBuf>, String> {
    if !root.exists() {
        return Ok(Vec::new());
    }
    let metadata = fs::symlink_metadata(root)
        .map_err(|error| format!("Cannot inspect theme library: {error}"))?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("Theme library must be a real directory.".into());
    }
    let mut directories = Vec::new();
    for entry in
        fs::read_dir(root).map_err(|error| format!("Cannot list theme library: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Cannot list theme library: {error}"))?;
        let metadata = fs::symlink_metadata(entry.path())
            .map_err(|error| format!("Cannot inspect theme entry: {error}"))?;
        if metadata.is_dir() && !metadata.file_type().is_symlink() {
            directories.push(entry.path());
        }
    }
    directories.sort();
    Ok(directories)
}

fn find_theme_in_source(
    app: &AppHandle,
    source: ThemeSource,
    theme_id: &str,
) -> Result<Option<(PathBuf, ThemePackage, ThemeSource)>, String> {
    let mut matches = Vec::new();
    match source {
        ThemeSource::Builtin => {
            for (directory, package) in builtin_themes(app)? {
                if package.config.id == theme_id {
                    matches.push((directory, package, source));
                }
            }
        }
        ThemeSource::Manager => {
            let directory = themes_root(app)?.join(theme_id);
            if directory.exists() {
                let package = load_theme_dir(&directory)
                    .map_err(|error| format!("Manager theme {theme_id} is invalid: {error}"))?;
                if package.config.id != theme_id {
                    return Err("Manager theme directory id does not match theme.json.".into());
                }
                matches.push((directory, package, source));
            }
        }
        ThemeSource::Platform => {
            for directory in real_theme_directories(&platform_theme_store(app)?)? {
                let Ok(package) = load_platform_theme_dir(&directory) else {
                    continue;
                };
                if package.config.id == theme_id {
                    matches.push((directory, package, source));
                }
            }
        }
    }
    match matches.len() {
        0 => Ok(None),
        1 => Ok(matches.pop()),
        _ => Err(format!(
            "Theme {theme_id} is duplicated within the {} library.",
            source.label()
        )),
    }
}

fn find_theme(
    app: &AppHandle,
    selection: &str,
) -> Result<(PathBuf, ThemePackage, ThemeSource), String> {
    let (requested_source, theme_id) = parse_theme_selection(selection)?;
    if let Some(source) = requested_source {
        return find_theme_in_source(app, source, theme_id)?.ok_or_else(|| {
            format!(
                "Theme selection {}:{theme_id} is unavailable.",
                source.label()
            )
        });
    }
    let mut matches = Vec::new();
    for source in [
        ThemeSource::Builtin,
        ThemeSource::Platform,
        ThemeSource::Manager,
    ] {
        if let Some(found) = find_theme_in_source(app, source, theme_id)? {
            matches.push(found);
        }
    }
    match matches.len() {
        0 => Err(format!("Theme {theme_id} is unavailable.")),
        1 => Ok(matches.pop().expect("one theme match")),
        _ => Err(format!(
            "Theme id {theme_id} exists in multiple libraries; use a source-qualified selection key."
        )),
    }
}

fn builtin_ids(app: &AppHandle) -> HashSet<String> {
    builtin_themes(app)
        .unwrap_or_default()
        .into_iter()
        .map(|(_, package)| package.config.id)
        .collect()
}

fn select_active_theme_key(
    theme_id: &str,
    active_fingerprint: &str,
    candidates: &[(ThemeSource, String)],
) -> Option<String> {
    if let Some((source, _)) = candidates
        .iter()
        .find(|(_, fingerprint)| fingerprint == active_fingerprint)
    {
        return Some(format!("{}:{theme_id}", source.label()));
    }
    (candidates.len() == 1).then(|| format!("{}:{theme_id}", candidates[0].0.label()))
}

fn active_theme_selection(app: &AppHandle) -> Result<Option<String>, String> {
    let active_directory = active_theme_dir(app)?;
    if !active_directory.join("theme.json").is_file() {
        return Ok(None);
    }
    let active = load_platform_theme_dir(&active_directory)
        .map_err(|error| format!("Active theme is invalid: {error}"))?;
    let active_fingerprint = package_fingerprint(&active)?;
    let mut candidates = Vec::new();
    for source in [
        ThemeSource::Platform,
        ThemeSource::Manager,
        ThemeSource::Builtin,
    ] {
        if let Some((_, package, _)) = find_theme_in_source(app, source, &active.config.id)? {
            let fingerprint = package_fingerprint(&package)?;
            candidates.push((source, fingerprint));
        }
    }
    Ok(select_active_theme_key(
        &active.config.id,
        &active_fingerprint,
        &candidates,
    ))
}

fn slugify(name: &str) -> String {
    let mut slug = String::new();
    let mut last_hyphen = false;
    for character in name.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            last_hyphen = false;
        } else if !last_hyphen && !slug.is_empty() {
            slug.push('-');
            last_hyphen = true;
        }
        if slug.len() >= 36 {
            break;
        }
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    if slug.is_empty() {
        slug.push_str("theme");
    }
    slug
}

fn load_theme_image(source: &Path) -> Result<(String, Vec<u8>, image::DynamicImage), String> {
    ensure_absolute_file(source, "image")?;
    let extension = source
        .extension()
        .and_then(OsStr::to_str)
        .map(str::to_ascii_lowercase)
        .ok_or("Image has no supported extension.")?;
    let image_name = match extension.as_str() {
        "png" | "jpg" | "jpeg" | "webp" => format!("background.{extension}"),
        _ => return Err("Theme images must be PNG, JPG, JPEG, or WebP.".into()),
    };
    let image = read_bounded_file(source, MAX_FILE_SIZE, "image")?;
    let decoded = decode_image_bytes(&image_name, &image)?;
    Ok((image_name, image, decoded))
}

fn default_theme_colors() -> ThemeColors {
    ThemeColors {
        background: Some("#080C10".into()),
        panel: Some("#10171D".into()),
        panel_alt: Some("#18242B".into()),
        accent: Some("#3EB1BE".into()),
        accent_alt: Some("#85E3EB".into()),
        secondary: Some("#397986".into()),
        highlight: Some("#D66A52".into()),
        text: Some("#EFF7F8".into()),
        muted: Some("#A4B7BC".into()),
        line: Some("rgba(133, 227, 235, 0.28)".into()),
    }
}

fn default_theme(id: String, name: String, image: String) -> ThemeConfig {
    ThemeConfig {
        schema_version: SCHEMA_VERSION,
        id,
        name,
        brand_subtitle: "PERSONAL THEME".into(),
        tagline: "Make your Codex workspace feel like your own.".into(),
        project_prefix: "Project · ".into(),
        project_label: "◉  Select project".into(),
        status_text: "THEME ONLINE".into(),
        quote: "Make something wonderful".into(),
        image,
        colors: None,
        appearance: None,
        art: None,
        palette: None,
        promo_title: String::new(),
        promo_sub: String::new(),
        promo_url: String::new(),
    }
}

fn package_with_theme_draft(
    package: &ThemePackage,
    draft: ThemeDraft,
    theme_id: String,
) -> Result<ThemePackage, String> {
    let mut updated = package.clone();
    let mut draft = draft;
    if draft.colors.as_ref().is_some_and(ThemeColors::is_empty) {
        draft.colors = None;
    }
    if draft.art.as_ref().is_some_and(ThemeArt::is_empty) {
        draft.art = None;
    }
    if draft.palette.as_ref().is_some_and(ThemePalette::is_empty) {
        draft.palette = None;
    }
    let name = draft.name.clone();
    let brand_subtitle = draft.brand_subtitle.clone();
    let tagline = draft.tagline.clone();
    let project_prefix = draft.project_prefix.clone();
    let project_label = draft.project_label.clone();
    let status_text = draft.status_text.clone();
    let quote = draft.quote.clone();
    let promo_title = draft.promo_title.clone();
    let promo_sub = draft.promo_sub.clone();
    let promo_url = draft.promo_url.clone();
    let visual_changed = package.config.name != name
        || package.config.brand_subtitle != brand_subtitle
        || package.config.tagline != tagline
        || package.config.project_prefix != project_prefix
        || package.config.project_label != project_label
        || package.config.status_text != status_text
        || package.config.quote != quote
        || package.config.promo_title != promo_title
        || package.config.promo_sub != promo_sub
        || package.config.promo_url != promo_url
        || package.config.colors != draft.colors
        || package.config.appearance != draft.appearance
        || package.config.art != draft.art
        || package.config.palette != draft.palette
        || draft.replacement_image_path.is_some();
    updated.config.id = theme_id;
    updated.config.name = name;
    updated.config.brand_subtitle = brand_subtitle;
    updated.config.tagline = tagline;
    updated.config.project_prefix = project_prefix;
    updated.config.project_label = project_label;
    updated.config.status_text = status_text;
    updated.config.quote = quote;
    updated.config.promo_title = promo_title;
    updated.config.promo_sub = promo_sub;
    updated.config.promo_url = promo_url;
    updated.config.colors = draft.colors;
    updated.config.appearance = draft.appearance;
    updated.config.art = draft.art;
    updated.config.palette = draft.palette;
    if let Some(path) = draft.replacement_image_path {
        let (image_name, image, _) = load_theme_image(Path::new(&path))?;
        updated.config.image = image_name.clone();
        updated.image_name = image_name;
        updated.image = image;
    }
    if visual_changed {
        updated.preview = None;
    }
    validate_package(&updated)?;
    Ok(updated)
}

#[cfg(target_os = "windows")]
fn hide_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    command.creation_flags(0x0800_0000);
}

#[cfg(not(target_os = "windows"))]
fn hide_window(_command: &mut Command) {}

fn command_output(mut command: Command) -> Result<Output, String> {
    hide_window(&mut command);
    command
        .output()
        .map_err(|error| format!("Cannot start fixed engine command: {error}"))
}

fn concise_output(output: &Output) -> String {
    let raw = if output.status.success() || output.stderr.is_empty() {
        &output.stdout
    } else {
        &output.stderr
    };
    let text = String::from_utf8_lossy(raw).trim().to_owned();
    if text.is_empty() {
        return format!("Engine exited with status {}.", output.status);
    }
    let mut summary = String::new();
    for line in text.lines().map(str::trim).filter(|line| !line.is_empty()) {
        if line.starts_with("At ")
            || line.starts_with('+')
            || line.starts_with("CategoryInfo")
            || line.starts_with("FullyQualifiedErrorId")
        {
            break;
        }
        if !summary.is_empty() {
            summary.push(' ');
        }
        summary.push_str(line);
        if summary.chars().count() >= 600 {
            break;
        }
    }
    if summary.is_empty() {
        summary = text;
    }
    let shortened: String = summary.chars().take(600).collect();
    if summary.chars().count() > 600 {
        format!("{shortened}…")
    } else {
        shortened
    }
}

#[cfg(target_os = "windows")]
fn powershell_path() -> PathBuf {
    std::env::var_os("WINDIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\Windows"))
        .join("System32/WindowsPowerShell/v1.0/powershell.exe")
}

fn run_engine_script(script: &Path, args: &[OsString]) -> Result<CommandResult, String> {
    if !script.is_file() {
        return Err("Fixed engine script is missing.".into());
    }
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new(powershell_path());
        command.args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
        ]);
        command.arg(script);
        command
    };
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("/bin/bash");
        command.arg(script);
        command
    };
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    return Err("Codex Dream Skin Manager supports Windows and macOS only.".into());

    #[cfg(any(target_os = "windows", target_os = "macos"))]
    {
        command.args(args);
        let output = command_output(command)?;
        let cancelled = output.status.code() == Some(20);
        Ok(CommandResult {
            ok: output.status.success(),
            message: concise_output(&output),
            cancelled: cancelled.then_some(true),
            restart_required: Some(!output.status.success()),
        })
    }
}

#[cfg(target_os = "windows")]
fn codex_installed() -> bool {
    let mut command = Command::new(powershell_path());
    command.args([
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "[bool](Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction SilentlyContinue)",
    ]);
    command_output(command).ok().is_some_and(|output| {
        output.status.success()
            && String::from_utf8_lossy(&output.stdout)
                .trim()
                .eq_ignore_ascii_case("true")
    })
}

#[cfg(target_os = "macos")]
fn macos_codex_bundle(path: &Path) -> bool {
    if !path.is_dir() {
        return false;
    }
    let mut command = Command::new("/usr/bin/defaults");
    command.args(["read"]);
    command.arg(path.join("Contents/Info"));
    command.arg("CFBundleIdentifier");
    command_output(command).ok().is_some_and(|output| {
        output.status.success()
            && String::from_utf8_lossy(&output.stdout).trim() == "com.openai.codex"
    })
}

#[cfg(target_os = "macos")]
fn codex_installed() -> bool {
    let mut candidates = vec![
        PathBuf::from("/Applications/Codex.app"),
        PathBuf::from("/Applications/ChatGPT.app"),
    ];
    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        candidates.push(home.join("Applications/Codex.app"));
        candidates.push(home.join("Applications/ChatGPT.app"));
    }
    candidates.iter().any(|path| macos_codex_bundle(path))
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn codex_installed() -> bool {
    false
}

fn node_major(version: &str) -> Option<u32> {
    version
        .trim()
        .trim_start_matches('v')
        .split('.')
        .next()?
        .parse()
        .ok()
}

fn node_version_ready(program: &Path, minimum_major: u32) -> bool {
    let mut command = Command::new(program);
    command.args(["-p", "process.versions.node"]);
    command_output(command).ok().is_some_and(|output| {
        output.status.success()
            && node_major(&String::from_utf8_lossy(&output.stdout))
                .is_some_and(|major| major >= minimum_major)
    })
}

fn node_ready(state_path: &Path, minimum_major: u32) -> bool {
    if let Ok(bytes) = read_bounded_file(state_path, MAX_JSON_SIZE, "state.json") {
        if let Ok(state) = serde_json::from_slice::<serde_json::Value>(&bytes) {
            let recorded_version_ready = state
                .get("nodeVersion")
                .and_then(serde_json::Value::as_str)
                .and_then(node_major)
                .is_some_and(|major| major >= minimum_major);
            let recorded_node = state
                .get("nodePath")
                .and_then(serde_json::Value::as_str)
                .map(Path::new);
            if recorded_version_ready
                && recorded_node.is_some_and(|path| {
                    path.is_absolute() && path.is_file() && node_version_ready(path, minimum_major)
                })
            {
                return true;
            }
        }
    }
    #[cfg(target_os = "windows")]
    {
        node_version_ready(Path::new("node.exe"), minimum_major)
    }
    #[cfg(target_os = "macos")]
    {
        let mut candidates = vec![
            PathBuf::from("/Applications/Codex.app/Contents/Resources/cua_node/bin/node"),
            PathBuf::from("/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node"),
        ];
        if let Some(home) = std::env::var_os("HOME") {
            candidates.push(
                PathBuf::from(home)
                    .join("Applications/Codex.app/Contents/Resources/cua_node/bin/node"),
            );
            candidates.push(
                PathBuf::from(home)
                    .join("Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node"),
            );
        }
        candidates
            .iter()
            .any(|candidate| candidate.is_file() && node_version_ready(candidate, minimum_major))
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    false
}

fn engine_configured(state_root: &Path) -> bool {
    // These files are configuration rollback markers, not installed binaries.
    // Restoring the official appearance intentionally archives the marker while
    // the Manager's bundled engine remains available.
    #[cfg(target_os = "windows")]
    let marker = state_root.join("config.before-dream-skin.toml");
    #[cfg(target_os = "macos")]
    let marker = state_root.join("theme-backup.json");
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let marker = state_root.join("__unsupported__");
    marker.is_file()
}

fn read_runtime_state(state_path: &Path) -> Option<serde_json::Value> {
    let metadata = fs::metadata(state_path).ok()?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_JSON_SIZE {
        return None;
    }
    let bytes = fs::read(state_path).ok()?;
    let state = serde_json::from_slice::<serde_json::Value>(&bytes).ok()?;
    state.is_object().then_some(state)
}

fn runtime_state_targets_active_theme(state: &serde_json::Value, manager_theme_dir: &Path) -> bool {
    let Some(live_theme_dir) = state.get("themeDir").and_then(serde_json::Value::as_str) else {
        return false;
    };
    let (Ok(live_theme_dir), Ok(manager_theme_dir)) = (
        fs::canonicalize(live_theme_dir),
        fs::canonicalize(manager_theme_dir),
    ) else {
        return false;
    };
    // A one-shot injection is only durable while the existing watcher observes
    // the same canonical directory. Otherwise it could reapply an older payload
    // after navigation.
    live_theme_dir == manager_theme_dir
}

#[derive(Debug, Clone)]
struct RuntimeProcessSnapshot {
    started_at: String,
    executable_path: String,
    command_line: String,
}

#[derive(Debug, Clone)]
struct RuntimeExpectedIdentity {
    process_id: u32,
    started_at: String,
    node_path: PathBuf,
    injector_path: PathBuf,
    port: u16,
    browser_id: String,
    theme_dir: PathBuf,
}

fn valid_browser_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

fn runtime_expected_identity(
    state: &serde_json::Value,
    active_theme: &Path,
    expected_schema: u64,
    expected_platform: &str,
    require_active_session: bool,
) -> Option<RuntimeExpectedIdentity> {
    if state.get("schemaVersion")?.as_u64()? != expected_schema {
        return None;
    }
    let platform = state.get("platform")?.as_str()?;
    if platform != expected_platform && !platform.starts_with(&format!("{expected_platform}-")) {
        return None;
    }
    if require_active_session && state.get("session")?.as_str()? != "active" {
        return None;
    }
    if !runtime_state_targets_active_theme(state, active_theme) {
        return None;
    }
    let process_id = state
        .get("injectorPid")?
        .as_u64()
        .and_then(|value| u32::try_from(value).ok())
        .filter(|value| *value > 0)?;
    let port = state
        .get("port")?
        .as_u64()
        .and_then(|value| u16::try_from(value).ok())
        .filter(|value| *value >= 1024)?;
    let started_at = state.get("injectorStartedAt")?.as_str()?.to_owned();
    let node_path = PathBuf::from(state.get("nodePath")?.as_str()?);
    let injector_path = PathBuf::from(state.get("injectorPath")?.as_str()?);
    let browser_id = state.get("browserId")?.as_str()?.to_owned();
    if started_at.is_empty()
        || started_at.len() > 128
        || !node_path.is_absolute()
        || !node_path.is_file()
        || !injector_path.is_absolute()
        || !injector_path.is_file()
        || !valid_browser_id(&browser_id)
    {
        return None;
    }
    Some(RuntimeExpectedIdentity {
        process_id,
        started_at,
        node_path,
        injector_path,
        port,
        browser_id,
        theme_dir: active_theme.to_path_buf(),
    })
}

fn command_line_tokens(command_line: &str) -> Option<Vec<String>> {
    let chars: Vec<_> = command_line.chars().collect();
    let mut tokens = Vec::new();
    let mut token = String::new();
    let mut index = 0;
    let mut quoted = false;
    while index < chars.len() {
        let character = chars[index];
        if character == '\\' {
            let start = index;
            while index < chars.len() && chars[index] == '\\' {
                index += 1;
            }
            let count = index - start;
            if index < chars.len() && chars[index] == '"' {
                token.extend(std::iter::repeat_n('\\', count / 2));
                if count % 2 == 0 {
                    quoted = !quoted;
                } else {
                    token.push('"');
                }
                index += 1;
                continue;
            }
            token.extend(std::iter::repeat_n('\\', count));
            continue;
        }
        if character == '"' {
            quoted = !quoted;
            index += 1;
            continue;
        }
        if character.is_whitespace() && !quoted {
            if !token.is_empty() {
                tokens.push(std::mem::take(&mut token));
            }
            index += 1;
            continue;
        }
        token.push(character);
        index += 1;
    }
    if quoted {
        return None;
    }
    if !token.is_empty() {
        tokens.push(token);
    }
    (!tokens.is_empty()).then_some(tokens)
}

fn runtime_paths_equal(left: &Path, right: &Path) -> bool {
    let (Ok(left), Ok(right)) = (
        canonicalize_platform_path(left, "runtime identity path"),
        canonicalize_platform_path(right, "runtime identity path"),
    ) else {
        return false;
    };
    #[cfg(target_os = "windows")]
    {
        path_string(&left).eq_ignore_ascii_case(&path_string(&right))
    }
    #[cfg(not(target_os = "windows"))]
    {
        left == right
    }
}

fn command_option_value<'a>(tokens: &'a [String], option: &str) -> Option<&'a str> {
    for (index, token) in tokens.iter().enumerate() {
        if token.eq_ignore_ascii_case(option) {
            return tokens.get(index + 1).map(String::as_str);
        }
        if let Some((name, value)) = token.split_once('=') {
            if name.eq_ignore_ascii_case(option) {
                return Some(value);
            }
        }
    }
    None
}

fn runtime_identity_matches_snapshot(
    expected: &RuntimeExpectedIdentity,
    snapshot: &RuntimeProcessSnapshot,
) -> bool {
    if snapshot.started_at != expected.started_at
        || !runtime_paths_equal(Path::new(&snapshot.executable_path), &expected.node_path)
    {
        return false;
    }
    let Some(tokens) = command_line_tokens(&snapshot.command_line) else {
        return false;
    };
    if tokens.len() < 2
        || !runtime_paths_equal(Path::new(&tokens[0]), &expected.node_path)
        || !runtime_paths_equal(Path::new(&tokens[1]), &expected.injector_path)
        || !tokens.iter().any(|token| token == "--watch")
        || command_option_value(&tokens, "--port") != Some(expected.port.to_string().as_str())
        || command_option_value(&tokens, "--browser-id") != Some(expected.browser_id.as_str())
    {
        return false;
    }
    let Some(theme_dir) = command_option_value(&tokens, "--theme-dir") else {
        return false;
    };
    runtime_paths_equal(Path::new(theme_dir), &expected.theme_dir)
}

#[cfg(target_os = "windows")]
fn runtime_process_snapshot(process_id: u32) -> Option<RuntimeProcessSnapshot> {
    let script = format!(
        "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new(); \
         $p=Get-CimInstance Win32_Process -Filter 'ProcessId = {process_id}'; \
         if($null -eq $p){{exit 3}}; $g=Get-Process -Id {process_id}; \
         [pscustomobject]@{{startedAt=$g.StartTime.ToUniversalTime().ToString('o'); \
         executablePath=$p.ExecutablePath; commandLine=$p.CommandLine}} | ConvertTo-Json -Compress"
    );
    let mut command = Command::new(powershell_path());
    command.args(["-NoProfile", "-NonInteractive", "-Command", &script]);
    let output = command_output(command).ok()?;
    if !output.status.success() {
        return None;
    }
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).ok()?;
    Some(RuntimeProcessSnapshot {
        started_at: value.get("startedAt")?.as_str()?.to_owned(),
        executable_path: value.get("executablePath")?.as_str()?.to_owned(),
        command_line: value.get("commandLine")?.as_str()?.to_owned(),
    })
}

#[cfg(target_os = "macos")]
fn runtime_process_snapshot(process_id: u32) -> Option<RuntimeProcessSnapshot> {
    let output = Command::new("/bin/ps")
        .args([
            "-p",
            &process_id.to_string(),
            "-o",
            "lstart=",
            "-o",
            "command=",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let line = String::from_utf8(output.stdout).ok()?;
    let line = line.trim();
    let mut parts = line.split_whitespace();
    let started_at = (0..5)
        .map(|_| parts.next())
        .collect::<Option<Vec<_>>>()?
        .join(" ");
    let command_line = parts.collect::<Vec<_>>().join(" ");
    let executable_path = command_line_tokens(&command_line)?.first()?.clone();
    Some(RuntimeProcessSnapshot {
        started_at,
        executable_path,
        command_line,
    })
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn runtime_process_snapshot(_process_id: u32) -> Option<RuntimeProcessSnapshot> {
    None
}

fn runtime_session_running_from_state(state: &serde_json::Value, active_theme: &Path) -> bool {
    #[cfg(target_os = "windows")]
    let expected = runtime_expected_identity(state, active_theme, 3, "windows", false);
    #[cfg(target_os = "macos")]
    let expected = runtime_expected_identity(state, active_theme, 4, "darwin", true);
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let expected = None;
    let Some(expected) = expected else {
        return false;
    };
    runtime_process_snapshot(expected.process_id)
        .as_ref()
        .is_some_and(|snapshot| runtime_identity_matches_snapshot(&expected, snapshot))
}

fn runtime_session_running(state_path: &Path, active_theme: &Path) -> bool {
    read_runtime_state(state_path)
        .as_ref()
        .is_some_and(|state| runtime_session_running_from_state(state, active_theme))
}
fn runtime_cdp_identity_matches(port: u16, browser_id: &str) -> bool {
    let address = SocketAddrV4::new(Ipv4Addr::LOCALHOST, port);
    let Ok(mut stream) = TcpStream::connect_timeout(&address.into(), Duration::from_millis(450))
    else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(650)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(450)));
    let request = format!(
        "GET /json/version HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    let mut response = Vec::with_capacity(4096);
    let mut buffer = [0u8; 4096];
    loop {
        match stream.read(&mut buffer) {
            Ok(0) => break,
            Ok(size) => {
                if response.len() + size > 128 * 1024 {
                    return false;
                }
                response.extend_from_slice(&buffer[..size]);
            }
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) =>
            {
                break;
            }
            Err(_) => return false,
        }
    }
    let Some(header_end) = response.windows(4).position(|window| window == b"\r\n\r\n") else {
        return false;
    };
    let Ok(header) = std::str::from_utf8(&response[..header_end]) else {
        return false;
    };
    if header
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        != Some("200")
    {
        return false;
    }
    let Ok(version) = serde_json::from_slice::<serde_json::Value>(&response[header_end + 4..])
    else {
        return false;
    };
    let Some(websocket_url) = version
        .get("webSocketDebuggerUrl")
        .and_then(serde_json::Value::as_str)
    else {
        return false;
    };
    let Ok(parsed) = url::Url::parse(websocket_url) else {
        return false;
    };
    let loopback_host = matches!(parsed.host_str(), Some("127.0.0.1" | "localhost" | "::1"));
    parsed.scheme() == "ws"
        && loopback_host
        && parsed.port() == Some(port)
        && parsed.username().is_empty()
        && parsed.password().is_none()
        && parsed.query().is_none()
        && parsed.fragment().is_none()
        && parsed.path() == format!("/devtools/browser/{browser_id}")
}

fn runtime_session_hot_switch_ready(state_path: &Path, active_theme: &Path) -> bool {
    let Some(state) = read_runtime_state(state_path) else {
        return false;
    };
    if !runtime_session_running_from_state(&state, active_theme) {
        return false;
    }
    let Some(port) = state
        .get("port")
        .and_then(serde_json::Value::as_u64)
        .and_then(|value| u16::try_from(value).ok())
        .filter(|value| *value >= 1024)
    else {
        return false;
    };
    let Some(browser_id) = state.get("browserId").and_then(serde_json::Value::as_str) else {
        return false;
    };
    if browser_id.is_empty()
        || browser_id.len() > 200
        || !browser_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        return false;
    }

    for attempt in 0..2 {
        if runtime_cdp_identity_matches(port, browser_id) {
            return true;
        }
        if attempt == 0 {
            std::thread::sleep(Duration::from_millis(80));
        }
    }
    false
}
fn get_app_status_blocking(app: AppHandle) -> Result<AppStatus, String> {
    let state_root = platform_state_root()?;
    let runtime = resolved_runtime(&app).ok();
    let state_path = runtime
        .as_ref()
        .map(|(_, _, capabilities, _)| state_root.join(&capabilities.paths.state))
        .unwrap_or_else(|| state_root.join("state.json"));
    let active_theme = runtime
        .as_ref()
        .map(|(_, _, capabilities, _)| state_root.join(&capabilities.paths.active_theme))
        .unwrap_or_else(|| state_root.join("active-theme"));
    let skin_active = state_path.is_file();
    let session_running = runtime_session_running(&state_path, &active_theme);
    let hot_switch_ready =
        session_running && runtime_session_hot_switch_ready(&state_path, &active_theme);
    let configured = engine_configured(&state_root);
    let codex = codex_installed();
    let node = runtime.as_ref().is_some_and(|(_, _, capabilities, _)| {
        node_ready(&state_path, capabilities.minimum_node_major)
    });
    let engine_available = runtime.is_some();
    let compatibility_message = runtime
        .as_ref()
        .and_then(|(_, _, _, message)| message.clone());
    let state_message = if !engine_available {
        "Bundled skin engine is unavailable or incompatible.".into()
    } else if !codex {
        "Install the official Codex desktop app first.".into()
    } else if hot_switch_ready {
        "Dream Skin is running; theme changes apply instantly.".into()
    } else if session_running {
        "The skin watcher is running; waiting for the verified Codex loopback endpoint.".into()
    } else if skin_active {
        "A saved skin session exists, but its watcher is not running. Apply a theme to reconnect or restore the official appearance.".into()
    } else if configured {
        "The skin environment is configured. Choose a theme to start it.".into()
    } else {
        "The official Codex appearance is active. Dream Skin is available but not configured."
            .into()
    };
    Ok(AppStatus {
        platform: std::env::consts::OS.into(),
        codex_installed: codex,
        engine_installed: configured,
        engine_available,
        engine_configured: configured,
        skin_active,
        session_running,
        hot_switch_ready,
        node_ready: node,
        active_theme_id: skin_active.then(|| active_theme_id(&app)).flatten(),
        state_message,
        runtime_manifest_version: runtime
            .as_ref()
            .map(|(_, _, capabilities, _)| capabilities.manifest_version),
        runtime_version: runtime
            .as_ref()
            .map(|(_, _, capabilities, _)| capabilities.runtime_version.clone()),
        theme_features: runtime
            .as_ref()
            .map(|(_, _, capabilities, _)| capabilities.theme_features.clone())
            .unwrap_or_default(),
        runtime_compatibility_message: compatibility_message,
        logs_path: state_root.is_dir().then(|| path_string(&state_root)),
    })
}

#[tauri::command]
async fn get_app_status(app: AppHandle) -> Result<AppStatus, String> {
    tauri::async_runtime::spawn_blocking(move || get_app_status_blocking(app))
        .await
        .map_err(|error| format!("Status worker failed: {error}"))?
}

fn list_themes_blocking(app: AppHandle) -> Result<Vec<ThemeSummary>, String> {
    let (_, _, capabilities, _) = resolved_runtime(&app)?;
    let state_path = platform_state_root()?.join(&capabilities.paths.state);
    let features = &capabilities.theme_features;
    let mut themes = Vec::new();
    let mut keys = HashSet::new();

    for (directory, package) in builtin_themes(&app).unwrap_or_default() {
        let key = format!("builtin:{}", package.config.id);
        if keys.insert(key) {
            themes.push(package_summary(
                &directory,
                &package,
                ThemeSource::Builtin,
                features,
            )?);
        }
    }

    if let Ok(platform_root) = platform_theme_store(&app) {
        for directory in real_theme_directories(&platform_root)? {
            let Ok(package) = load_platform_theme_dir(&directory) else {
                continue;
            };
            let key = format!("platform:{}", package.config.id);
            if !keys.insert(key) {
                continue;
            }
            let Ok(cached) = cache_read_only_theme(&app, "platform-cache", &package) else {
                continue;
            };
            themes.push(package_summary(
                &cached,
                &package,
                ThemeSource::Platform,
                features,
            )?);
        }
    }

    let root = themes_root(&app)?;
    fs::create_dir_all(&root).map_err(|error| format!("Cannot create theme library: {error}"))?;
    for directory in real_theme_directories(&root)? {
        let Ok(package) = load_theme_dir(&directory) else {
            continue;
        };
        if directory.file_name().and_then(OsStr::to_str) != Some(package.config.id.as_str()) {
            continue;
        }
        let key = format!("manager:{}", package.config.id);
        if !keys.insert(key) {
            continue;
        }
        themes.push(package_summary(
            &directory,
            &package,
            ThemeSource::Manager,
            features,
        )?);
    }

    // Selection and connectivity are separate: a brief CDP probe failure must
    // not make the currently applied card lose its active state. Fingerprint
    // matching inside active_theme_id prevents duplicate ids from marking more
    // than one card active.
    let active = state_path
        .is_file()
        .then(|| active_theme_id(&app))
        .flatten();
    for theme in &mut themes {
        theme.active = active.as_deref() == Some(theme.selection_key.as_str());
    }
    Ok(themes)
}
#[tauri::command]
async fn list_themes(app: AppHandle) -> Result<Vec<ThemeSummary>, String> {
    tauri::async_runtime::spawn_blocking(move || list_themes_blocking(app))
        .await
        .map_err(|error| format!("Theme-list worker failed: {error}"))?
}

fn editor_preview_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_root(app)?.join("editor-preview"))
}

fn is_editor_preview_name(name: &str) -> bool {
    if !name.starts_with("preview-") {
        return false;
    }
    Path::new(name)
        .extension()
        .and_then(OsStr::to_str)
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "png" | "jpg" | "jpeg" | "webp"
            )
        })
}

fn prepare_editor_preview_root(root: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(root)
        .map_err(|error| format!("Cannot create editor preview directory: {error}"))?;
    let metadata = fs::symlink_metadata(root)
        .map_err(|error| format!("Cannot inspect editor preview directory: {error}"))?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("Editor preview directory must be a real directory, not a symlink.".into());
    }
    canonicalize_platform_path(root, "editor preview directory")
}

fn prune_editor_preview_cache_with_limits(
    root: &Path,
    keep: &Path,
    max_files: usize,
    max_bytes: u64,
) -> Result<(), String> {
    let root_metadata = fs::symlink_metadata(root)
        .map_err(|error| format!("Cannot inspect editor preview cache: {error}"))?;
    if !root_metadata.is_dir() || root_metadata.file_type().is_symlink() {
        return Err("Editor preview cache must be a real directory, not a symlink.".into());
    }
    let canonical_root = canonicalize_platform_path(root, "editor preview cache")?;

    let keep_metadata = fs::symlink_metadata(keep)
        .map_err(|error| format!("Cannot inspect current editor preview: {error}"))?;
    if !keep_metadata.is_file() || keep_metadata.file_type().is_symlink() {
        return Err("Current editor preview must be a regular file, not a symlink.".into());
    }
    let canonical_keep = canonicalize_platform_path(keep, "current editor preview")?;
    if canonical_keep.parent() != Some(canonical_root.as_path()) {
        return Err("Current editor preview is outside its expected cache root.".into());
    }
    let keep_name = canonical_keep
        .file_name()
        .and_then(OsStr::to_str)
        .ok_or("Current editor preview has an invalid filename.")?;
    if !is_editor_preview_name(keep_name) {
        return Err("Current editor preview has an unexpected filename.".into());
    }

    struct PreviewEntry {
        current: bool,
        modified: SystemTime,
        name: String,
        path: PathBuf,
        bytes: u64,
    }

    let mut previews = Vec::new();
    for entry in fs::read_dir(&canonical_root)
        .map_err(|error| format!("Cannot list editor preview cache: {error}"))?
    {
        let entry =
            entry.map_err(|error| format!("Cannot list editor preview cache entry: {error}"))?;
        let name = match entry.file_name().to_str() {
            Some(name) if is_editor_preview_name(name) => name.to_owned(),
            _ => continue,
        };
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("Cannot inspect editor preview cache entry: {error}"))?;
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            continue;
        }
        let canonical = canonicalize_platform_path(&path, "editor preview cache entry")?;
        if canonical.parent() != Some(canonical_root.as_path()) {
            return Err("Editor preview cache entry escapes its expected root.".into());
        }
        previews.push(PreviewEntry {
            current: canonical == canonical_keep,
            modified: metadata.modified().unwrap_or(UNIX_EPOCH),
            name,
            path: canonical,
            bytes: metadata.len(),
        });
    }
    if !previews.iter().any(|entry| entry.current) {
        return Err("Current editor preview disappeared during cache cleanup.".into());
    }

    previews.sort_by(|left, right| {
        right
            .current
            .cmp(&left.current)
            .then_with(|| right.modified.cmp(&left.modified))
            .then_with(|| right.name.cmp(&left.name))
    });

    let mut retained_files = 0_usize;
    let mut retained_bytes = 0_u64;
    for preview in previews {
        let next_bytes = retained_bytes.checked_add(preview.bytes);
        let retain = preview.current
            || (retained_files < max_files && next_bytes.is_some_and(|bytes| bytes <= max_bytes));
        if retain {
            retained_files = retained_files.saturating_add(1);
            retained_bytes = retained_bytes.saturating_add(preview.bytes);
            continue;
        }

        let metadata = match fs::symlink_metadata(&preview.path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => {
                return Err(format!(
                    "Cannot re-inspect stale editor preview before cleanup: {error}"
                ));
            }
        };
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            continue;
        }
        let canonical = canonicalize_platform_path(&preview.path, "stale editor preview")?;
        if canonical.parent() != Some(canonical_root.as_path()) {
            return Err("Stale editor preview escapes its expected cache root.".into());
        }
        if canonical == canonical_keep {
            continue;
        }
        match fs::remove_file(&canonical) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("Cannot prune stale editor preview: {error}")),
        }
    }
    Ok(())
}

fn prune_editor_preview_cache(root: &Path, keep: &Path) -> Result<(), String> {
    prune_editor_preview_cache_with_limits(
        root,
        keep,
        MAX_EDITOR_PREVIEW_FILES,
        MAX_EDITOR_PREVIEW_BYTES,
    )
}

fn inspect_theme_image_blocking(
    app: AppHandle,
    image_path: String,
) -> Result<ThemeImageInspection, String> {
    let source = PathBuf::from(image_path);
    let (image_name, image, decoded) = load_theme_image(&source)?;
    let metadata = image_metadata(decoded.width(), decoded.height());
    let root = editor_preview_root(&app)?;
    let root = prepare_editor_preview_root(&root)?;
    let extension = Path::new(&image_name)
        .extension()
        .and_then(OsStr::to_str)
        .ok_or("Preview image has no supported extension.")?;
    let file_name = format!("preview-{}.{}", unique_suffix(), extension);
    let destination = root.join(file_name);
    replace_file_atomic(&destination, &image)?;
    let preview_path = destination
        .canonicalize()
        .map_err(|error| format!("Cannot resolve editor preview image: {error}"))?;
    prune_editor_preview_cache(&root, &preview_path)?;
    let colors = image_adaptive_colors(&decoded).unwrap_or_else(default_theme_colors);
    Ok(ThemeImageInspection {
        preview_path: path_string(&preview_path),
        colors,
        image_metadata: metadata,
    })
}

#[tauri::command]
async fn inspect_theme_image(
    app: AppHandle,
    image_path: String,
) -> Result<ThemeImageInspection, String> {
    tauri::async_runtime::spawn_blocking(move || inspect_theme_image_blocking(app, image_path))
        .await
        .map_err(|error| format!("Image-preview worker failed: {error}"))?
}
fn add_theme_from_image_blocking(
    app: AppHandle,
    image_path: String,
    name: String,
) -> Result<CommandResult, String> {
    validate_text("Theme name", &name, 80, false)?;
    let source = PathBuf::from(image_path);
    let (image_name, image, _) = load_theme_image(&source)?;
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let sequence = UNIQUE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let id = format!("{}-{millis}-{sequence}", slugify(&name));
    validate_id(&id)?;
    let config = default_theme(id.clone(), name, image_name.clone());
    validate_theme(&config)?;
    let package = ThemePackage {
        config,
        image_name,
        image,
        preview: None,
    };
    let destination = themes_root(&app)?.join(&id);
    write_theme_dir_atomic(&destination, &package)?;
    Ok(CommandResult {
        ok: true,
        message: format!("Added {} to the theme library.", package.config.name),
        cancelled: None,
        restart_required: None,
    })
}

#[tauri::command]
async fn add_theme_from_image(
    app: AppHandle,
    image_path: String,
    name: String,
) -> Result<CommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        add_theme_from_image_blocking(app, image_path, name)
    })
    .await
    .map_err(|error| format!("Image-import worker failed: {error}"))?
}

fn import_theme_bundle_blocking(app: AppHandle, path: String) -> Result<CommandResult, String> {
    let mut package = parse_bundle_path(&PathBuf::from(path))?;
    if builtin_ids(&app).contains(&package.config.id) {
        return Err("Imported theme id is reserved by the built-in theme.".into());
    }
    let root = themes_root(&app)?;
    fs::create_dir_all(&root).map_err(|error| format!("Cannot create theme library: {error}"))?;
    let imported_id = imported_theme_id(&root, &package.config.id);
    package.config.id = imported_id.clone();
    let destination = root.join(&imported_id);
    write_theme_dir_atomic(&destination, &package)?;
    Ok(CommandResult {
        ok: true,
        message: format!("Imported {} into the theme library.", package.config.name),
        cancelled: None,
        restart_required: None,
    })
}

fn save_theme_draft_blocking(
    app: AppHandle,
    theme_id: String,
    draft: ThemeDraft,
    create_copy: bool,
) -> Result<CommandResult, String> {
    let (source_directory, package, source) = find_theme(&app, &theme_id)?;
    let manager_selection = format!("manager:{}", package.config.id);
    let active = active_theme_id(&app).as_deref() == Some(manager_selection.as_str());
    if source != ThemeSource::Manager && !create_copy {
        return Err(
            "Built-in and platform themes are read-only; save an editable copy instead.".into(),
        );
    }
    if active && !create_copy {
        return Err(
            "The active theme is read-only while running; save an editable copy instead.".into(),
        );
    }

    let root = themes_root(&app)?;
    fs::create_dir_all(&root).map_err(|error| format!("Cannot create theme library: {error}"))?;
    let (destination, target_id, copied) = if create_copy {
        let requested = slugify(draft.name.trim());
        let reserved = builtin_ids(&app);
        let requested = if reserved.contains(&requested) {
            format!("{requested}-copy")
        } else {
            requested
        };
        let id = imported_theme_id(&root, &requested);
        validate_id(&id)?;
        (root.join(&id), id, true)
    } else {
        (source_directory, package.config.id.clone(), false)
    };

    let updated = package_with_theme_draft(&package, draft, target_id)?;
    if let Ok((_, _, capabilities, _)) = resolved_runtime(&app) {
        let existing: HashSet<_> =
            theme_unsupported_features(&package.config, &capabilities.theme_features)
                .into_iter()
                .collect();
        let introduced: Vec<_> =
            theme_unsupported_features(&updated.config, &capabilities.theme_features)
                .into_iter()
                .filter(|feature| !existing.contains(feature))
                .collect();
        if !introduced.is_empty() {
            return Err(format!(
                "This runtime cannot save newly added theme features: {}.",
                introduced.join(", ")
            ));
        }
    }
    write_theme_dir_atomic(&destination, &updated)?;
    Ok(CommandResult {
        ok: true,
        message: if copied {
            format!("Saved {} as an editable theme copy.", updated.config.name)
        } else {
            format!("Saved changes to {}.", updated.config.name)
        },
        cancelled: None,
        restart_required: None,
    })
}

#[tauri::command]
async fn save_theme_draft(
    app: AppHandle,
    theme_id: String,
    draft: ThemeDraft,
    create_copy: bool,
) -> Result<CommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        save_theme_draft_blocking(app, theme_id, draft, create_copy)
    })
    .await
    .map_err(|error| format!("Theme-editor worker failed: {error}"))?
}

#[tauri::command]
async fn import_theme_bundle(app: AppHandle, path: String) -> Result<CommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || import_theme_bundle_blocking(app, path))
        .await
        .map_err(|error| format!("Theme-import worker failed: {error}"))?
}

#[tauri::command]
fn export_theme_bundle(
    app: AppHandle,
    theme_id: String,
    destination: String,
) -> Result<CommandResult, String> {
    let destination = PathBuf::from(destination);
    if !destination.is_absolute() {
        return Err("Export destination must be an absolute path.".into());
    }
    if destination
        .extension()
        .and_then(OsStr::to_str)
        .map(str::to_ascii_lowercase)
        .as_deref()
        != Some("codexskin")
    {
        return Err("Export destination must end in .codexskin.".into());
    }
    let (_, package, _) = find_theme(&app, &theme_id)?;
    let bytes = encode_bundle(&package)?;
    replace_file_atomic(&destination, &bytes)?;
    Ok(CommandResult {
        ok: true,
        message: format!("Exported {}.", destination.display()),
        cancelled: None,
        restart_required: None,
    })
}

fn apply_theme_blocking(
    app: AppHandle,
    theme_id: String,
    restart_existing: bool,
) -> Result<CommandResult, String> {
    let (_, package, _) = find_theme(&app, &theme_id)?;
    let (_, _, capabilities, _) = resolved_runtime(&app)?;
    validate_theme_for_runtime(&package.config, &capabilities.theme_features)?;
    let active = active_theme_dir(&app)?;
    let previous = match fs::symlink_metadata(&active) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {
            Some(load_platform_theme_dir(&active).map_err(|error| {
                format!("The current active theme is invalid; restore it before replacing: {error}")
            })?)
        }
        Ok(_) => return Err("The active-theme path is unsafe and will not be replaced.".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(format!("Cannot inspect the active theme: {error}")),
    };
    let state_path = runtime_state_path(&app)?;
    let state_existed = state_path.is_file();
    let live_session_ready = runtime_session_hot_switch_ready(&state_path, &active);
    write_theme_dir_atomic(&active, &package)?;

    if live_session_ready {
        return Ok(CommandResult {
            ok: true,
            message: format!("Applied {} without restarting Codex.", package.config.name),
            cancelled: None,
            restart_required: Some(false),
        });
    }

    let (script, args, _) = runtime_command(&app, "start", restart_existing, false)?;
    let mut result = match run_engine_script(&script, &args) {
        Ok(result) => result,
        Err(error) => {
            rollback_active_theme(&active, previous.as_ref()).map_err(|rollback| {
                format!("{error}; active-theme rollback also failed: {rollback}")
            })?;
            return Err(error);
        }
    };
    if result.ok && !state_existed && !state_path.is_file() {
        result.ok = false;
        result.message =
            "Theme application was cancelled; Codex and unsaved input were left unchanged.".into();
        result.restart_required = Some(true);
    }
    if !result.ok {
        if let Err(error) = rollback_active_theme(&active, previous.as_ref()) {
            result.message = format!("{} Active-theme rollback failed: {error}", result.message);
        }
    } else {
        result.message = format!("Applied {}. {}", package.config.name, result.message);
        result.restart_required = Some(false);
    }
    Ok(result)
}

#[tauri::command]
async fn apply_theme(
    app: AppHandle,
    theme_id: String,
    restart_existing: bool,
) -> Result<CommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        apply_theme_blocking(app, theme_id, restart_existing)
    })
    .await
    .map_err(|error| format!("Theme worker failed: {error}"))?
}
fn restore_official_blocking(app: AppHandle) -> Result<CommandResult, String> {
    let (script, args, _) = runtime_command(&app, "restore", true, true)?;
    let mut result = run_engine_script(&script, &args)?;
    if result.ok {
        result.restart_required = Some(false);
    }
    Ok(result)
}

#[tauri::command]
async fn restore_official(app: AppHandle) -> Result<CommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || restore_official_blocking(app))
        .await
        .map_err(|error| format!("Restore worker failed: {error}"))?
}

fn install_engine_blocking(app: AppHandle) -> Result<CommandResult, String> {
    if runtime_state_path(&app)?.is_file() {
        return Ok(CommandResult {
            ok: false,
            message: "Dream Skin is currently active. Restore the official appearance before repairing the engine.".into(),
            cancelled: None,
            restart_required: Some(false),
        });
    }
    let (script, args, _) = runtime_command(&app, "install", false, false)?;
    let mut result = run_engine_script(&script, &args)?;
    if result.ok {
        result.restart_required = Some(false);
    }
    Ok(result)
}

#[tauri::command]
async fn install_engine(app: AppHandle) -> Result<CommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || install_engine_blocking(app))
        .await
        .map_err(|error| format!("Install worker failed: {error}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(target_os = "windows")]
            if let Some(window) = app.get_webview_window("main") {
                apply_windows_webview_shape(&window);
            }
            #[cfg(not(target_os = "windows"))]
            let _ = app;
            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(target_os = "windows")]
            if window.label() == "main" {
                match event {
                    tauri::WindowEvent::Resized(_) => {
                        schedule_windows_window_shape(window.clone());
                    }
                    tauri::WindowEvent::ScaleFactorChanged { .. } => {
                        apply_windows_window_shape(window);
                    }
                    _ => {}
                }
            }
            #[cfg(not(target_os = "windows"))]
            let _ = (window, event);
        })
        .invoke_handler(tauri::generate_handler![
            get_app_status,
            list_themes,
            inspect_theme_image,
            add_theme_from_image,
            save_theme_draft,
            import_theme_bundle,
            export_theme_bundle,
            apply_theme,
            restore_official,
            install_engine
        ])
        .run(tauri::generate_context!())
        .expect("error while running Codex Dream Skin Manager");
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestDir(PathBuf);

    impl TestDir {
        fn new() -> Self {
            let path =
                std::env::temp_dir().join(format!("codex-dream-skin-test-{}", unique_suffix()));
            fs::create_dir(&path).expect("create test directory");
            Self(path)
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn png() -> Vec<u8> {
        let mut bytes = Cursor::new(Vec::new());
        image::DynamicImage::new_rgba8(1, 1)
            .write_to(&mut bytes, image::ImageFormat::Png)
            .unwrap();
        bytes.into_inner()
    }

    fn package() -> ThemePackage {
        let image_name = "background.png".to_owned();
        let mut config =
            default_theme("safe-theme".into(), "Safe Theme".into(), image_name.clone());
        config.colors = Some(default_theme_colors());
        ThemePackage {
            config,
            image_name,
            image: png(),
            preview: Some(("preview.png".into(), png())),
        }
    }

    fn zip_with(entries: &[(&str, Vec<u8>)]) -> Vec<u8> {
        let cursor = Cursor::new(Vec::new());
        let mut writer = ZipWriter::new(cursor);
        for (name, bytes) in entries {
            writer
                .start_file(*name, SimpleFileOptions::default())
                .unwrap();
            writer.write_all(bytes).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    #[test]
    fn theme_schema_serializes_camel_case() {
        let value = serde_json::to_value(&package().config).unwrap();
        assert_eq!(value["schemaVersion"], 1);
        assert!(value.get("schema_version").is_none());
        assert_eq!(value["colors"]["panelAlt"], "#18242B");
    }

    #[test]
    fn validation_rejects_path_and_css_injection() {
        let mut candidate = package();
        candidate.config.id = "../escape".into();
        assert!(validate_package(&candidate)
            .unwrap_err()
            .contains("Theme id"));

        let mut candidate = package();
        candidate.config.colors.as_mut().unwrap().line =
            Some("red; background:url(https://bad.invalid)".into());
        assert!(validate_package(&candidate).unwrap_err().contains("line"));
    }

    #[test]
    fn contrast_validation_rejects_unreadable_theme_text() {
        let mut candidate = package();
        candidate.config.colors.as_mut().unwrap().text = Some("#10171D".into());
        assert!(validate_package(&candidate)
            .unwrap_err()
            .contains("4.5:1 contrast"));

        let mut candidate = package();
        let panel = candidate.config.colors.as_ref().unwrap().panel.clone();
        candidate.config.colors.as_mut().unwrap().accent = panel;
        assert!(validate_package(&candidate)
            .unwrap_err()
            .contains("3:1 contrast"));

        let mut candidate = package();
        candidate.config.colors.as_mut().unwrap().panel_alt =
            Some("rgba(255, 255, 255, 0.92)".into());
        let error = validate_package(&candidate).unwrap_err();
        assert!(error.contains("text must have at least 4.5:1 contrast"));
        assert!(error.contains("panelAlt"));
    }

    #[test]
    fn image_palette_generation_produces_a_valid_readable_theme() {
        let pixels = image::RgbaImage::from_pixel(4, 4, image::Rgba([8, 72, 84, 255]));
        let image = image::DynamicImage::ImageRgba8(pixels);
        let colors = image_adaptive_colors(&image).expect("palette");
        let mut config = package().config;
        config.colors = Some(colors);
        validate_theme(&config).unwrap();
        assert!(
            contrast_ratio(
                parse_theme_color(config.colors.as_ref().unwrap().text.as_deref().unwrap())
                    .unwrap()
                    .rgb,
                parse_theme_color(config.colors.as_ref().unwrap().panel.as_deref().unwrap())
                    .unwrap()
                    .rgb,
            ) >= 4.5
        );
    }
    #[test]
    fn validation_rejects_pixel_bombs_and_windows_device_names() {
        let mut giant = png();
        giant[16..20].copy_from_slice(&8192_u32.to_be_bytes());
        giant[20..24].copy_from_slice(&8192_u32.to_be_bytes());
        assert!(validate_image_bytes("background.png", &giant)
            .unwrap_err()
            .contains("50MP"));
        let mut truncated = png();
        truncated.truncate(24);
        assert!(validate_image_bytes("background.png", &truncated)
            .unwrap_err()
            .contains("complete decodable image"));
        assert!(validate_id("con").unwrap_err().contains("Windows"));
        assert!(image_kind_from_extension("nul.png")
            .unwrap_err()
            .contains("Windows"));
        assert!(image_kind_from_extension("-background.png")
            .unwrap_err()
            .contains("simple ASCII"));
        assert!(image_kind_from_extension("_background.png")
            .unwrap_err()
            .contains("simple ASCII"));
    }

    #[test]
    fn bundle_round_trip_preserves_valid_theme() {
        let original = package();
        let encoded = encode_bundle(&original).unwrap();
        let decoded = parse_bundle_bytes(&encoded).unwrap();
        assert_eq!(decoded.config, original.config);
        assert_eq!(decoded.image, original.image);
        assert_eq!(decoded.preview, original.preview);
    }

    #[test]
    fn bundle_rejects_zip_slip() {
        let config = package_json(&package()).unwrap();
        let malicious = zip_with(&[("theme.json", config), ("../background.png", png())]);
        let error = parse_bundle_bytes(&malicious).unwrap_err();
        assert!(error.contains("Unsafe or nested ZIP entry"));
    }

    #[test]
    fn bundle_rejects_unexpected_and_mismatched_images() {
        let config = package_json(&package()).unwrap();
        let unexpected = zip_with(&[
            ("theme.json", config),
            ("background.png", png()),
            ("extra.png", png()),
        ]);
        assert!(parse_bundle_bytes(&unexpected)
            .unwrap_err()
            .contains("optional ZIP entry"));

        let mut wrong_magic = png();
        wrong_magic[0] = 0;
        let encoded = zip_with(&[
            ("theme.json", package_json(&package()).unwrap()),
            ("background.png", wrong_magic),
        ]);
        assert!(parse_bundle_bytes(&encoded)
            .unwrap_err()
            .contains("does not match"));
    }

    #[test]
    fn atomic_directory_replace_never_merges_old_files() {
        let root = TestDir::new();
        let destination = root.0.join("safe-theme");
        fs::create_dir(&destination).unwrap();
        fs::write(destination.join("stale.txt"), b"stale").unwrap();
        let theme = package();
        write_theme_dir_atomic(&destination, &theme).unwrap();
        assert!(!destination.join("stale.txt").exists());
        assert!(destination.join("theme.json").is_file());
        assert!(destination.join("background.png").is_file());
        assert!(destination.join("preview.png").is_file());
    }

    #[test]
    fn imported_theme_json_rejects_unknown_fields() {
        let mut value = serde_json::to_value(&package().config).unwrap();
        value["shellCommand"] = serde_json::Value::String("calc.exe".into());
        let bytes = serde_json::to_vec(&value).unwrap();
        let error = parse_theme_json(&bytes).unwrap_err();
        assert!(error.contains("unknown field"));
        assert!(error.contains("The theme may require a newer Manager."));
    }

    #[test]
    fn optional_theme_text_uses_cross_platform_defaults() {
        let value = serde_json::json!({
            "schemaVersion": 1,
            "id": "minimal-theme",
            "name": "Minimal Theme",
            "image": "background.png",
            "colors": package().config.colors,
        });
        let parsed = parse_theme_json(&serde_json::to_vec(&value).unwrap()).unwrap();
        assert_eq!(parsed.brand_subtitle, "CODEX DREAM SKIN");
        assert_eq!(parsed.project_label, "Choose a project");
        assert!(parsed.promo_url.is_empty());
    }

    #[test]
    fn theme_editor_updates_every_field_and_replaces_the_primary_image() {
        let root = TestDir::new();
        let replacement_path = root.0.join("replacement.png");
        let mut replacement = Cursor::new(Vec::new());
        image::DynamicImage::new_rgba8(2, 1)
            .write_to(&mut replacement, image::ImageFormat::Png)
            .unwrap();
        fs::write(&replacement_path, replacement.into_inner()).unwrap();

        let original = package();
        let mut colors = original.config.colors.clone().unwrap();
        colors.accent = Some("#5BC7D4".into());
        colors.line = Some("#85E3EB48".into());
        let edited = package_with_theme_draft(
            &original,
            ThemeDraft {
                name: "  Edited Theme  ".into(),
                brand_subtitle: "  EDITED BRAND  ".into(),
                tagline: "  A quieter workspace.  ".into(),
                project_prefix: "  Workspace ·  ".into(),
                project_label: "  Open project  ".into(),
                status_text: "  EDITOR ONLINE  ".into(),
                quote: "  Keep making.  ".into(),
                promo_title: "  Theme author  ".into(),
                promo_sub: "  Independent creator  ".into(),
                promo_url: "https://example.com/theme".into(),
                colors: Some(colors.clone()),
                appearance: Some(ThemeAppearance::Dark),
                art: Some(ThemeArt {
                    focus_x: Some(0.72),
                    focus_y: Some(0.4),
                    safe_area: Some(ThemeSafeArea::Left),
                    task_mode: Some(ThemeTaskMode::Banner),
                }),
                palette: Some(ThemePalette {
                    accent: Some("oklch(72% 0.12 205)".into()),
                }),
                replacement_image_path: Some(path_string(&replacement_path)),
            },
            "edited-theme".into(),
        )
        .unwrap();

        assert_eq!(edited.config.id, "edited-theme");
        assert_eq!(edited.config.name, "  Edited Theme  ");
        assert_eq!(edited.config.brand_subtitle, "  EDITED BRAND  ");
        assert_eq!(edited.config.tagline, "  A quieter workspace.  ");
        assert_eq!(edited.config.project_prefix, "  Workspace ·  ");
        assert_eq!(edited.config.project_label, "  Open project  ");
        assert_eq!(edited.config.status_text, "  EDITOR ONLINE  ");
        assert_eq!(edited.config.quote, "  Keep making.  ");
        assert_eq!(edited.config.promo_title, "  Theme author  ");
        assert_eq!(edited.config.promo_sub, "  Independent creator  ");
        assert_eq!(edited.config.promo_url, "https://example.com/theme");
        assert_eq!(edited.config.colors, Some(colors));
        assert_eq!(edited.config.appearance, Some(ThemeAppearance::Dark));
        assert_ne!(edited.image, original.image);
        assert_eq!(edited.image_name, "background.png");
        assert!(
            edited.preview.is_none(),
            "visual edits must invalidate stale real previews"
        );
    }

    #[test]
    fn rgba_palette_supports_alpha_hex_and_composited_contrast() {
        let mut theme = package().config;
        theme.colors.as_mut().unwrap().line = Some("#85E3EB48".into());
        theme.colors.as_mut().unwrap().highlight = Some("#D65A".into());
        theme.colors.as_mut().unwrap().panel_alt = Some("rgba(24, 36, 43, 0.85)".into());
        validate_theme(&theme).unwrap();

        theme.colors.as_mut().unwrap().text = Some("#FFFFFF20".into());
        let error = validate_theme(&theme).unwrap_err();
        assert!(error.contains("text must have at least 4.5:1 contrast"));
    }

    #[test]
    fn theme_editor_rejects_unreadable_colors_and_unknown_fields() {
        let original = package();
        let mut colors = original.config.colors.clone().unwrap();
        colors.text = colors.panel.clone();
        let error = package_with_theme_draft(
            &original,
            ThemeDraft {
                name: "Unreadable".into(),
                brand_subtitle: original.config.brand_subtitle.clone(),
                tagline: "This must not be saved.".into(),
                project_prefix: original.config.project_prefix.clone(),
                project_label: original.config.project_label.clone(),
                status_text: original.config.status_text.clone(),
                quote: original.config.quote.clone(),
                promo_title: original.config.promo_title.clone(),
                promo_sub: original.config.promo_sub.clone(),
                promo_url: original.config.promo_url.clone(),
                colors: Some(colors),
                appearance: original.config.appearance,
                art: original.config.art.clone(),
                palette: original.config.palette.clone(),
                replacement_image_path: None,
            },
            "unreadable".into(),
        )
        .unwrap_err();
        assert!(error.contains("4.5:1 contrast"));

        let value = serde_json::json!({
            "name": "Unsafe",
            "tagline": "No executable editor fields",
            "colors": original.config.colors,
            "shellCommand": "calc.exe"
        });
        assert!(serde_json::from_value::<ThemeDraft>(value)
            .unwrap_err()
            .to_string()
            .contains("unknown field"));
    }

    #[test]
    fn empty_optional_theme_objects_normalize_to_missing_fields() {
        let value = serde_json::json!({
            "schemaVersion": 1,
            "id": "adaptive-theme",
            "name": "Adaptive Theme",
            "image": "background.png",
            "colors": {},
            "art": {},
            "palette": {},
        });
        let parsed = parse_theme_json(&serde_json::to_vec(&value).unwrap()).unwrap();
        assert!(parsed.colors.is_none());
        assert!(parsed.art.is_none());
        assert!(parsed.palette.is_none());

        let mut adaptive = package();
        adaptive.config = parsed;
        let encoded: serde_json::Value =
            serde_json::from_slice(&package_json(&adaptive).unwrap()).unwrap();
        assert!(encoded.get("colors").is_none());
        assert!(encoded.get("art").is_none());
        assert!(encoded.get("palette").is_none());
    }

    #[test]
    fn partial_rgba_colors_round_trip_without_inventing_fields() {
        let value = serde_json::json!({
            "schemaVersion": 1,
            "id": "partial-theme",
            "name": "Partial Theme",
            "image": "background.png",
            "colors": {
                "accent": "rgba(91, 199, 212, 0.72)",
                "line": "#85E3EB48"
            },
            "art": { "focusX": 0.72 },
            "palette": { "accent": "oklch(72% 0.12 205)" }
        });
        let parsed = parse_theme_json(&serde_json::to_vec(&value).unwrap()).unwrap();
        let mut partial = package();
        partial.config = parsed.clone();
        let encoded = package_json(&partial).unwrap();
        let encoded_value: serde_json::Value = serde_json::from_slice(&encoded).unwrap();
        assert_eq!(encoded_value["colors"].as_object().unwrap().len(), 2);
        assert!(encoded_value["colors"].get("background").is_none());
        assert_eq!(parse_theme_json(&encoded).unwrap(), parsed);
    }
    #[test]
    fn image_metadata_matches_runtime_task_mode_thresholds() {
        assert_eq!(
            image_metadata(224, 100).suggested_task_mode,
            ThemeTaskMode::Ambient
        );
        assert_eq!(
            image_metadata(225, 100).suggested_task_mode,
            ThemeTaskMode::Banner
        );
        let portrait = image_metadata(900, 1600);
        assert_eq!(portrait.suggested_task_mode, ThemeTaskMode::Ambient);
        assert_eq!(portrait.suggested_focus_y, 0.42);
    }

    #[test]
    fn runtime_capabilities_report_and_reject_only_features_in_use() {
        let mut theme = package().config;
        theme.appearance = Some(ThemeAppearance::Dark);
        theme.art = Some(ThemeArt {
            focus_x: Some(0.7),
            ..ThemeArt::default()
        });
        theme.colors = Some(ThemeColors {
            accent: Some("rgba(91, 199, 212, 0.72)".into()),
            line: Some("#85E3EB48".into()),
            ..ThemeColors::default()
        });
        theme.palette = Some(ThemePalette {
            accent: Some("oklch(72% 0.12 205)".into()),
        });
        validate_theme(&theme).unwrap();

        let unsupported = theme_unsupported_features(&theme, &RuntimeThemeFeatures::default());
        assert_eq!(
            unsupported,
            vec![
                "appearance",
                "art",
                "partialColors",
                "rgba",
                "alphaHex",
                "paletteAccent"
            ]
        );
        assert!(
            validate_theme_for_runtime(&theme, &RuntimeThemeFeatures::default())
                .unwrap_err()
                .contains("partialColors")
        );

        let supported = RuntimeThemeFeatures {
            appearance: true,
            art: true,
            partial_colors: true,
            rgba: true,
            alpha_hex: true,
            palette_accent: true,
            hot_reload: true,
            auxiliary_window_guard: true,
        };
        validate_theme_for_runtime(&theme, &supported).unwrap();
    }

    #[test]
    fn ordinary_rgb_does_not_require_rgba_capability() {
        let mut theme = package().config;
        theme.appearance = None;
        theme.art = None;
        theme.colors = Some(ThemeColors {
            accent: Some("rgb(12, 34, 56)".into()),
            ..ThemeColors::default()
        });
        theme.palette = None;
        validate_theme(&theme).unwrap();

        assert_eq!(
            theme_unsupported_features(&theme, &RuntimeThemeFeatures::default()),
            vec!["partialColors"]
        );
    }

    #[test]
    fn palette_color_capabilities_are_reported_independently() {
        let mut theme = package().config;
        theme.appearance = None;
        theme.art = None;
        theme.colors = None;
        theme.palette = Some(ThemePalette {
            accent: Some("rgba(91, 199, 212, 0.72)".into()),
        });
        validate_theme(&theme).unwrap();
        assert_eq!(
            theme_unsupported_features(&theme, &RuntimeThemeFeatures::default()),
            vec!["rgba", "paletteAccent"]
        );

        theme.palette = Some(ThemePalette {
            accent: Some("#85E3EB48".into()),
        });
        validate_theme(&theme).unwrap();
        assert_eq!(
            theme_unsupported_features(&theme, &RuntimeThemeFeatures::default()),
            vec!["alphaHex", "paletteAccent"]
        );

        theme.palette = Some(ThemePalette {
            accent: Some("oklch(72% 0.12 205)".into()),
        });
        validate_theme(&theme).unwrap();
        assert_eq!(
            theme_unsupported_features(&theme, &RuntimeThemeFeatures::default()),
            vec!["paletteAccent"]
        );
    }

    #[test]
    fn active_selection_is_fingerprint_authoritative_and_source_qualified() {
        let candidates = vec![
            (ThemeSource::Platform, "same".into()),
            (ThemeSource::Manager, "same".into()),
            (ThemeSource::Builtin, "same".into()),
        ];
        assert_eq!(
            select_active_theme_key("duplicate", "same", &candidates).as_deref(),
            Some("platform:duplicate")
        );
        assert_eq!(
            select_active_theme_key("duplicate", "different", &candidates),
            None
        );
        assert_eq!(
            select_active_theme_key(
                "legacy",
                "old-format",
                &[(ThemeSource::Manager, "current".into())]
            )
            .as_deref(),
            Some("manager:legacy")
        );
    }

    #[test]
    fn draft_round_trip_preserves_trailing_prefix_and_adaptive_omissions() {
        let mut original = package();
        original.config.project_prefix = "Choose project · ".into();
        original.config.colors = None;
        original.config.appearance = None;
        original.config.art = None;
        original.config.palette = None;
        let edited = package_with_theme_draft(
            &original,
            ThemeDraft {
                name: original.config.name.clone(),
                brand_subtitle: original.config.brand_subtitle.clone(),
                tagline: original.config.tagline.clone(),
                project_prefix: original.config.project_prefix.clone(),
                project_label: original.config.project_label.clone(),
                status_text: original.config.status_text.clone(),
                quote: original.config.quote.clone(),
                promo_title: original.config.promo_title.clone(),
                promo_sub: original.config.promo_sub.clone(),
                promo_url: original.config.promo_url.clone(),
                colors: None,
                appearance: None,
                art: None,
                palette: None,
                replacement_image_path: None,
            },
            original.config.id.clone(),
        )
        .unwrap();
        assert_eq!(edited.config, original.config);
        assert!(
            edited.preview.is_some(),
            "a no-op edit keeps a valid preview"
        );
        let json: serde_json::Value =
            serde_json::from_slice(&package_json(&edited).unwrap()).unwrap();
        assert_eq!(json["projectPrefix"], "Choose project · ");
        assert!(json.get("colors").is_none());
    }

    #[test]
    fn editor_preview_cache_pruning_is_bounded_and_preserves_unmanaged_entries() {
        let root = TestDir::new();
        let cache = root.0.join("editor-preview");
        fs::create_dir(&cache).unwrap();
        let current = cache.join("preview-current.png");
        fs::write(&current, b"keep").unwrap();
        for index in 0..6 {
            fs::write(cache.join(format!("preview-{index}.png")), b"data").unwrap();
        }
        let unrelated = cache.join("notes.txt");
        let unsupported = cache.join("preview-ignored.gif");
        let directory = cache.join("preview-directory.png");
        fs::write(&unrelated, b"user data").unwrap();
        fs::write(&unsupported, b"not managed").unwrap();
        fs::create_dir(&directory).unwrap();

        prune_editor_preview_cache_with_limits(&cache, &current, 3, 9).unwrap();

        let previews = fs::read_dir(&cache)
            .unwrap()
            .filter_map(Result::ok)
            .filter_map(|entry| {
                let name = entry.file_name().to_str()?.to_owned();
                let metadata = fs::symlink_metadata(entry.path()).ok()?;
                (metadata.is_file()
                    && !metadata.file_type().is_symlink()
                    && is_editor_preview_name(&name))
                .then_some(metadata.len())
            })
            .collect::<Vec<_>>();
        assert!(current.is_file());
        assert!(previews.len() <= 3);
        assert!(previews.iter().sum::<u64>() <= 9);
        assert_eq!(fs::read(&unrelated).unwrap(), b"user data");
        assert_eq!(fs::read(&unsupported).unwrap(), b"not managed");
        assert!(directory.is_dir());
    }

    #[test]
    fn editor_preview_cache_rejects_a_keep_path_outside_its_root() {
        let root = TestDir::new();
        let cache = root.0.join("editor-preview");
        fs::create_dir(&cache).unwrap();
        let cached = cache.join("preview-cached.png");
        let outside = root.0.join("preview-outside.png");
        fs::write(&cached, b"cached").unwrap();
        fs::write(&outside, b"outside").unwrap();

        let error = prune_editor_preview_cache_with_limits(&cache, &outside, 1, 1)
            .expect_err("outside keep path must be rejected");

        assert!(error.contains("outside its expected cache root"));
        assert_eq!(fs::read(&cached).unwrap(), b"cached");
        assert_eq!(fs::read(&outside).unwrap(), b"outside");
    }

    #[cfg(unix)]
    #[test]
    fn editor_preview_cache_rejects_symlink_roots_and_ignores_symlink_entries() {
        use std::os::unix::fs::symlink;

        let root = TestDir::new();
        let cache = root.0.join("editor-preview");
        fs::create_dir(&cache).unwrap();
        let current = cache.join("preview-current.png");
        fs::write(&current, b"keep").unwrap();
        let linked_root = root.0.join("editor-preview-link");
        symlink(&cache, &linked_root).unwrap();
        assert!(
            prune_editor_preview_cache_with_limits(&linked_root, &current, 1, 4)
                .unwrap_err()
                .contains("real directory")
        );

        let outside = root.0.join("outside.png");
        let linked_entry = cache.join("preview-linked.png");
        fs::write(&outside, b"outside").unwrap();
        symlink(&outside, &linked_entry).unwrap();
        prune_editor_preview_cache_with_limits(&cache, &current, 1, 4).unwrap();
        assert_eq!(fs::read(&outside).unwrap(), b"outside");
        assert!(fs::symlink_metadata(&linked_entry)
            .unwrap()
            .file_type()
            .is_symlink());
    }

    #[test]
    fn read_only_theme_cache_pruning_is_bounded_and_keeps_current() {
        let root = TestDir::new();
        let cache = root.0.join("theme-id");
        fs::create_dir(&cache).unwrap();
        for version in ["aaaaaaaa", "bbbbbbbb", "cccccccc"] {
            let directory = cache.join(version);
            fs::create_dir(&directory).unwrap();
            fs::write(directory.join("marker"), version).unwrap();
        }
        let current = cache.join("bbbbbbbb");
        prune_theme_cache_versions(&cache, &current).unwrap();
        assert!(current.is_dir());
        assert_eq!(
            fs::read_dir(&cache)
                .unwrap()
                .filter_map(Result::ok)
                .filter(|entry| entry.path().is_dir())
                .count(),
            2
        );
    }

    #[test]
    fn runtime_payload_fingerprint_detects_stale_managed_files() {
        let root = TestDir::new();
        let capabilities = fallback_runtime_capabilities();
        for command in [
            &capabilities.commands.install,
            &capabilities.commands.start,
            &capabilities.commands.restore,
        ] {
            let path = root.0.join(&command.script);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, b"runtime").unwrap();
        }
        let assets = root.0.join("assets");
        fs::create_dir(&assets).unwrap();
        fs::write(assets.join("payload.txt"), b"one").unwrap();
        validate_runtime_capabilities(&root.0, &capabilities).unwrap();
        let before = runtime_payload_fingerprint(&root.0).unwrap();
        fs::write(assets.join("payload.txt"), b"two").unwrap();
        let after = runtime_payload_fingerprint(&root.0).unwrap();
        assert_ne!(before, after);
        assert!(capabilities.commands.restore.args.is_empty());
        assert!(!capabilities.commands.restore.base_theme_args.is_empty());
    }

    #[test]
    fn runtime_capability_manifest_accepts_additive_evidence_but_gates_contracts() {
        let root = TestDir::new();
        let capabilities = fallback_runtime_capabilities();
        for command in [
            &capabilities.commands.install,
            &capabilities.commands.start,
            &capabilities.commands.restore,
        ] {
            let path = root.0.join(&command.script);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, b"runtime").unwrap();
        }
        let command_json = |command: &RuntimeCommandContract| {
            let restart_semantics = match &command.restart_semantics {
                RestartSemantics::RequiresCodexClosed => "requires-codex-closed",
                RestartSemantics::OptionalExplicit => "optional-explicit",
                RestartSemantics::None => "none",
            };
            serde_json::json!({
                "script": command.script.clone(),
                "args": command.args.clone(),
                "restartArgs": command.restart_args.clone(),
                "baseThemeArgs": command.base_theme_args.clone(),
                "restartSemantics": restart_semantics,
            })
        };
        let mut value = serde_json::json!({
            "manifestVersion": capabilities.manifest_version,
            "platform": capabilities.platform,
            "runtimeVersion": capabilities.runtime_version,
            "minimumNodeMajor": capabilities.minimum_node_major,
            "themeSchemaVersion": capabilities.theme_schema_version,
            "themeFeatures": {
                "appearance": true,
                "futurePaletteEvidence": true
            },
            "paths": {
                "activeTheme": capabilities.paths.active_theme,
                "themeStore": capabilities.paths.theme_store,
                "state": capabilities.paths.state,
                "logs": capabilities.paths.logs
            },
            "commands": {
                "install": command_json(&capabilities.commands.install),
                "start": command_json(&capabilities.commands.start),
                "restore": command_json(&capabilities.commands.restore)
            },
            "evidence": {
                "rendererAdapters": ["semantic-v2"]
            }
        });

        let parsed: RuntimeCapabilities = serde_json::from_value(value.clone()).unwrap();
        assert!(parsed.theme_features.appearance);
        validate_runtime_capabilities(&root.0, &parsed).unwrap();

        let mut unknown_path = value.clone();
        unknown_path["paths"]["futurePath"] = serde_json::json!("unsafe");
        assert!(serde_json::from_value::<RuntimeCapabilities>(unknown_path)
            .unwrap_err()
            .to_string()
            .contains("unknown field"));

        let mut unknown_command = value.clone();
        unknown_command["commands"]["futureCommand"] = command_json(&capabilities.commands.start);
        assert!(
            serde_json::from_value::<RuntimeCapabilities>(unknown_command)
                .unwrap_err()
                .to_string()
                .contains("unknown field")
        );

        value["manifestVersion"] = serde_json::json!(2);
        let future: RuntimeCapabilities = serde_json::from_value(value).unwrap();
        assert!(validate_runtime_capabilities(&root.0, &future)
            .unwrap_err()
            .contains("Unsupported runtime capability manifest version 2"));
    }

    #[test]
    fn process_identity_rejects_stale_or_prefix_matching_pid_state() {
        let root = TestDir::new();
        let node = root.0.join("node.exe");
        let injector = root.0.join("injector.mjs");
        let theme = root.0.join("active-theme");
        fs::write(&node, b"node").unwrap();
        fs::write(&injector, b"injector").unwrap();
        fs::create_dir(&theme).unwrap();
        let expected = RuntimeExpectedIdentity {
            process_id: 42,
            started_at: "2026-07-17T01:02:03.0000000Z".into(),
            node_path: node.clone(),
            injector_path: injector.clone(),
            port: 9341,
            browser_id: "browser-identity".into(),
            theme_dir: theme.clone(),
        };
        let command = format!(
            "\"{}\" \"{}\" --watch --port 9341 --browser-id browser-identity --theme-dir \"{}\"",
            node.display(),
            injector.display(),
            theme.display()
        );
        let snapshot = RuntimeProcessSnapshot {
            started_at: expected.started_at.clone(),
            executable_path: path_string(&node),
            command_line: command,
        };
        assert!(runtime_identity_matches_snapshot(&expected, &snapshot));

        let mut stale = snapshot.clone();
        stale.started_at = "2026-07-17T01:02:04.0000000Z".into();
        assert!(!runtime_identity_matches_snapshot(&expected, &stale));
        let mut prefix_port = snapshot;
        prefix_port.command_line = prefix_port
            .command_line
            .replace("--port 9341", "--port 93410");
        assert!(!runtime_identity_matches_snapshot(&expected, &prefix_port));
    }
    #[test]
    fn app_status_separates_engine_configuration_from_runtime() {
        let status = AppStatus {
            platform: "windows".into(),
            codex_installed: true,
            engine_installed: false,
            engine_available: true,
            engine_configured: false,
            skin_active: false,
            session_running: false,
            hot_switch_ready: false,
            node_ready: true,
            active_theme_id: None,
            state_message: "Official appearance".into(),
            runtime_manifest_version: Some(1),
            runtime_version: Some("1.3.0".into()),
            theme_features: RuntimeThemeFeatures::default(),
            runtime_compatibility_message: None,
            logs_path: None,
        };
        let value = serde_json::to_value(status).unwrap();
        assert_eq!(value["engineAvailable"], true);
        assert_eq!(value["engineConfigured"], false);
        assert_eq!(value["sessionRunning"], false);
        assert_eq!(value["engineInstalled"], value["engineConfigured"]);
    }

    #[test]
    fn node_version_requires_major_22() {
        assert_eq!(node_major("v22.14.0"), Some(22));
        assert_eq!(node_major(" 24.1.0\n"), Some(24));
        assert_eq!(node_major("not-a-version"), None);
        assert!(node_major("21.7.0").is_some_and(|major| major < 22));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn powershell_paths_never_keep_windows_verbatim_prefixes() {
        assert_eq!(
            path_string(Path::new(r"\\?\C:\Dream Skin\start.ps1")),
            r"C:\Dream Skin\start.ps1"
        );
        assert_eq!(
            path_string(Path::new(r"\\?\UNC\server\share\start.ps1")),
            r"\\server\share\start.ps1"
        );
    }
}
