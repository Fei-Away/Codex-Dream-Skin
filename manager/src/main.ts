import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import { version as managerVersion } from "../package.json";
import "./styles.css";
import {
  themeContrastIssues,
  type ThemeContrastIssue,
} from "./theme-contrast.js";

type UnknownRecord = Record<string, unknown>;
type ViewName = "themes" | "diagnostics";
type ThemeFilter = "all" | "mine" | "builtin";
type ToastTone = "success" | "error" | "info" | "warning";
type ThemePreviewMode = "home" | "task" | "settings" | "narrow";
type ThemeAppearance = "auto" | "light" | "dark";
type ThemeColorMode = "adaptive" | "explicit";
type ThemeSafeArea = "auto" | "left" | "right" | "center" | "none";
type ThemeTaskMode = "auto" | "ambient" | "banner" | "off";
type ThemeSource = "builtin" | "manager" | "platform";

interface RuntimeThemeFeatures {
  appearance: boolean;
  art: boolean;
  partialColors: boolean;
  rgba: boolean;
  alphaHex: boolean;
  paletteAccent: boolean;
  hotReload: boolean;
  auxiliaryWindowGuard: boolean;
}

interface AppStatus {
  connected: boolean;
  platform: string;
  codexInstalled: boolean;
  engineAvailable: boolean;
  engineConfigured: boolean;
  skinActive: boolean;
  sessionRunning: boolean;
  hotSwitchReady: boolean;
  nodeReady: boolean;
  activeThemeId?: string;
  stateMessage: string;
  logsPath?: string;
  runtimeManifestVersion: number | null;
  runtimeVersion: string | null;
  runtimeCompatibilityMessage: string | null;
  themeFeatures: RuntimeThemeFeatures;
}

interface ThemeColorTokens {
  background: string;
  panel: string;
  panelAlt: string;
  accent: string;
  accentAlt: string;
  secondary: string;
  highlight: string;
  text: string;
  muted: string;
  line: string;
}

interface ThemeArt {
  focusX?: number | null;
  focusY?: number | null;
  safeArea?: ThemeSafeArea | null;
  taskMode?: ThemeTaskMode | null;
}

interface ThemePalette {
  accent?: string | null;
}

interface ThemeImageMetadata {
  width: number;
  height: number;
  aspectRatio: number;
  wide: boolean;
  suggestedFocusX: number;
  suggestedFocusY: number;
  suggestedSafeArea: ThemeSafeArea;
  suggestedTaskMode: ThemeTaskMode;
}

interface ThemeSummary {
  id: string;
  selectionKey: string;
  name: string;
  brandSubtitle: string;
  tagline: string;
  projectPrefix: string;
  projectLabel: string;
  statusText: string;
  quote: string;
  promoTitle: string;
  promoSub: string;
  promoUrl: string;
  imagePath: string;
  imageUrl: string;
  previewPath: string;
  previewUrl: string;
  colors: string[];
  colorTokens: ThemeColorTokens;
  derivedColors: ThemeColorTokens;
  explicitColors: Partial<ThemeColorTokens> | null;
  appearance: ThemeAppearance | null;
  art: ThemeArt | null;
  palette: ThemePalette | null;
  source: ThemeSource;
  readOnly: boolean;
  imageMetadata: ThemeImageMetadata | null;
  compatible: boolean;
  unsupportedFeatures: string[];
  builtin: boolean;
  active: boolean;
  reportedActive: boolean;
}
interface ThemeEditorDraft {
  sourceId: string;
  name: string;
  brandSubtitle: string;
  tagline: string;
  projectPrefix: string;
  projectLabel: string;
  statusText: string;
  quote: string;
  promoTitle: string;
  promoSub: string;
  promoUrl: string;
  colors: ThemeColorTokens;
  derivedColors: ThemeColorTokens;
  explicitColors: Partial<ThemeColorTokens> | null;
  colorMode: ThemeColorMode;
  appearance: ThemeAppearance;
  appearancePresent: boolean;
  appearanceRemoved: boolean;
  focusX: number;
  focusY: number;
  safeArea: ThemeSafeArea;
  taskMode: ThemeTaskMode;
  explicitArt: ThemeArt | null;
  artRemoved: boolean;
  paletteAccent: string;
  paletteExplicit: boolean;
  paletteRemoved: boolean;
  replacementImagePath: string | null;
  replacementPreviewPath: string;
  replacementPreviewUrl: string;
  replacementImageMetadata: ThemeImageMetadata | null;
  inspectedImageColors: ThemeColorTokens | null;
  previewMode: ThemePreviewMode;
  createCopy: boolean;
}

interface InspectedThemeImage {
  previewPath: string;
  colors: ThemeColorTokens;
  imageMetadata: ThemeImageMetadata | null;
}

interface RgbaColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

interface CommandResult {
  ok: boolean;
  message: string;
  cancelled: boolean;
  restartRequired: boolean;
}

interface AppState {
  view: ViewName;
  loading: boolean;
  busy: string | null;
  error: string | null;
  status: AppStatus;
  themes: ThemeSummary[];
  selectedThemeId: string | null;
  search: string;
  filter: ThemeFilter;
  onboardingOpen: boolean;
  onboardingStep: number;
  confirmInstall: boolean;
  confirmRestore: boolean;
  confirmApplyRestart: boolean;
  pendingApplyFinishGuide: boolean;
  editorDraft: ThemeEditorDraft | null;
}

interface FocusSnapshot {
  selector: string | null;
  matchIndex: number;
  focusableIndex: number;
  selectionStart: number | null;
  selectionEnd: number | null;
}


interface ElementFocusSnapshot {
  selector: string;
  matchIndex: number;
}
const ONBOARDING_KEY = "codex-dream-skin.onboarding.v2";
const appElement = document.querySelector<HTMLDivElement>("#app");
const toastRegionElement = document.querySelector<HTMLDivElement>("#toast-region");

if (!appElement || !toastRegionElement) {
  throw new Error("应用容器初始化失败");
}

const app = appElement;
const toastRegion = toastRegionElement;
const managerWindow = getCurrentWindow();
let windowMaximized = false;
let renderedModalKey: string | null = null;

const modalOpenerStack: ElementFocusSnapshot[] = [];

const EMPTY_THEME_FEATURES: RuntimeThemeFeatures = {
  appearance: false,
  art: false,
  partialColors: false,
  rgba: false,
  alphaHex: false,
  paletteAccent: false,
  hotReload: false,
  auxiliaryWindowGuard: false,
};

const emptyStatus: AppStatus = {
  connected: false,
  platform: "未知平台",
  codexInstalled: false,
  engineAvailable: false,
  engineConfigured: false,
  skinActive: false,
  sessionRunning: false,
  hotSwitchReady: false,
  nodeReady: false,
  runtimeManifestVersion: null,
  runtimeVersion: null,
  runtimeCompatibilityMessage: null,
  themeFeatures: { ...EMPTY_THEME_FEATURES },
  stateMessage: "正在连接本地管理服务…",
};

const state: AppState = {
  view: "themes",
  loading: true,
  busy: null,
  error: null,
  status: emptyStatus,
  themes: [],
  selectedThemeId: null,
  search: "",
  filter: "all",
  onboardingOpen: !readOnboardingDone(),
  onboardingStep: 1,
  confirmInstall: false,
  confirmRestore: false,
  confirmApplyRestart: false,
  pendingApplyFinishGuide: false,
  editorDraft: null,
};

const EDITABLE_COLOR_FIELDS: Array<{ key: keyof ThemeColorTokens; label: string }> = [
  { key: "background", label: "\u80cc\u666f" },
  { key: "panel", label: "\u9762\u677f" },
  { key: "panelAlt", label: "\u6b21\u7ea7\u9762\u677f" },
  { key: "accent", label: "\u5f3a\u8c03\u8272" },
  { key: "accentAlt", label: "\u8f85\u52a9\u5f3a\u8c03" },
  { key: "secondary", label: "\u6b21\u8981\u8272" },
  { key: "highlight", label: "\u9ad8\u4eae" },
  { key: "text", label: "\u6b63\u6587" },
  { key: "muted", label: "\u5f31\u5316\u6587\u5b57" },
  { key: "line", label: "\u8fb9\u6846 / \u5206\u9694\u7ebf" },
];

const EDITOR_FIELD_KEYS = [
  "name",
  "brandSubtitle",
  "tagline",
  "projectPrefix",
  "projectLabel",
  "statusText",
  "quote",
  "promoTitle",
  "promoSub",
  "promoUrl",
] as const;

type EditorDraftTextKey = (typeof EDITOR_FIELD_KEYS)[number];

const EDITOR_TEXT_FIELDS: Array<{
  key: Exclude<EditorDraftTextKey, "promoTitle" | "promoSub" | "promoUrl">;
  label: string;
  multiline?: boolean;
  maxLength: number;
}> = [
  { key: "name", label: "\u4e3b\u9898\u540d\u79f0", maxLength: 80 },
  { key: "brandSubtitle", label: "\u54c1\u724c\u526f\u6807\u9898", maxLength: 80 },
  { key: "tagline", label: "\u4e3b\u9898\u6587\u6848", multiline: true, maxLength: 160 },
  { key: "projectPrefix", label: "\u9879\u76ee\u524d\u7f00", maxLength: 80 },
  { key: "projectLabel", label: "\u9879\u76ee\u6309\u94ae\u6587\u6848", maxLength: 80 },
  { key: "statusText", label: "\u72b6\u6001\u6587\u6848", maxLength: 80 },
  { key: "quote", label: "\u5f15\u8a00 / \u63d0\u793a", multiline: true, maxLength: 80 },
];

const PREVIEW_MODES: Array<{ key: ThemePreviewMode; label: string }> = [
  { key: "home", label: "Home" },
  { key: "task", label: "Task" },
  { key: "settings", label: "Settings" },
  { key: "narrow", label: "Narrow" },
];

function isEditorDraftTextKey(value: string): value is EditorDraftTextKey {
  return (EDITOR_FIELD_KEYS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unwrapRecord(value: unknown, keys: string[]): UnknownRecord {
  if (!isRecord(value)) return {};
  for (const key of keys) {
    if (isRecord(value[key])) return value[key] as UnknownRecord;
  }
  return value;
}

function pick(record: UnknownRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function readString(record: UnknownRecord, keys: string[], fallback = ""): string {
  const value = pick(record, keys);
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

function readBoolean(record: UnknownRecord, keys: string[], fallback = false): boolean {
  const value = pick(record, keys);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    if (["true", "yes", "ready", "active", "installed", "1"].includes(value.toLowerCase())) return true;
    if (["false", "no", "inactive", "missing", "0"].includes(value.toLowerCase())) return false;
  }
  return fallback;
}

function readNumber(record: UnknownRecord, keys: string[], fallback = 0): number {
  const value = pick(record, keys);
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : fallback;
}

function clampUnit(value: number, fallback = 0.5): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function normalizeChoice<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === "string" && choices.includes(value as T) ? value as T : fallback;
}

function normalizeNullableChoice<T extends string>(value: unknown, choices: readonly T[]): T | null {
  return typeof value === "string" && choices.includes(value as T) ? value as T : null;
}

function normalizeImageMetadata(value: unknown): ThemeImageMetadata | null {
  if (!isRecord(value)) return null;
  const width = Math.max(0, Math.round(readNumber(value, ["width"]))) || 0;
  const height = Math.max(0, Math.round(readNumber(value, ["height"]))) || 0;
  const calculatedRatio = width > 0 && height > 0 ? width / height : 0;
  const aspectRatio = Math.max(0, readNumber(value, ["aspectRatio", "aspect_ratio", "ratio"], calculatedRatio));
  if (!width && !height && !aspectRatio) return null;
  return {
    width,
    height,
    aspectRatio,
    wide: readBoolean(value, ["wide", "isWide", "is_wide"], aspectRatio >= 2.25),
    suggestedFocusX: clampUnit(readNumber(value, ["suggestedFocusX", "suggested_focus_x", "focusX", "focus_x"], 0.5)),
    suggestedFocusY: clampUnit(readNumber(value, ["suggestedFocusY", "suggested_focus_y", "focusY", "focus_y"], 0.5)),
    suggestedSafeArea: normalizeChoice(
      pick(value, ["suggestedSafeArea", "suggested_safe_area", "safeArea", "safe_area"]),
      ["auto", "left", "right", "center", "none"] as const,
      "auto",
    ),
    suggestedTaskMode: normalizeChoice(
      pick(value, ["suggestedTaskMode", "suggested_task_mode", "taskMode", "task_mode"]),
      ["auto", "ambient", "banner", "off"] as const,
      aspectRatio >= 2.25 ? "banner" : "ambient",
    ),
  };
}

function normalizeStatus(value: unknown): AppStatus {
  const record = unwrapRecord(value, ["status", "data"]);
  const platform = readString(record, ["platform", "os"], "未知平台");
  const legacyConfigured = readBoolean(record, ["engineInstalled", "engine_installed"]);
  const hotSwitchReady = readBoolean(record, ["hotSwitchReady", "hot_switch_ready"]);
  const featureRecordValue = pick(record, ["themeFeatures", "theme_features"]);
  const featureRecord = isRecord(featureRecordValue) ? featureRecordValue : {};
  const themeFeatures: RuntimeThemeFeatures = {
    appearance: readBoolean(featureRecord, ["appearance"]),
    art: readBoolean(featureRecord, ["art"]),
    partialColors: readBoolean(featureRecord, ["partialColors", "partial_colors"]),
    rgba: readBoolean(featureRecord, ["rgba"]),
    alphaHex: readBoolean(featureRecord, ["alphaHex", "alpha_hex"]),
    paletteAccent: readBoolean(featureRecord, ["paletteAccent", "palette_accent"]),
    hotReload: readBoolean(featureRecord, ["hotReload", "hot_reload"]),
    auxiliaryWindowGuard: readBoolean(featureRecord, ["auxiliaryWindowGuard", "auxiliary_window_guard"]),
  };
  const manifestVersionValue = pick(record, ["runtimeManifestVersion", "runtime_manifest_version"]);
  const runtimeManifestVersion = typeof manifestVersionValue === "number" && Number.isFinite(manifestVersionValue)
    ? manifestVersionValue : null;
  return {
    connected: true,
    platform,
    codexInstalled: readBoolean(record, ["codexInstalled", "codex_installed"]),
    engineAvailable: readBoolean(record, ["engineAvailable", "engine_available"], true),
    engineConfigured: readBoolean(record, ["engineConfigured", "engine_configured"], legacyConfigured),
    skinActive: readBoolean(record, ["skinActive", "skin_active"]),
    sessionRunning: readBoolean(record, ["sessionRunning", "session_running"], hotSwitchReady),
    hotSwitchReady,
    nodeReady: readBoolean(record, ["nodeReady", "node_ready"]),
    activeThemeId: readString(record, ["activeThemeId", "active_theme_id"]) || undefined,
    stateMessage: readString(record, ["stateMessage", "state_message", "message"], "本地服务已连接"),
    logsPath: readString(record, ["logsPath", "logs_path"]) || undefined,
    runtimeManifestVersion,
    runtimeVersion: readString(record, ["runtimeVersion", "runtime_version"]) || null,
    runtimeCompatibilityMessage: readString(record, ["runtimeCompatibilityMessage", "runtime_compatibility_message"]) || null,
    themeFeatures,
  };
}

function normalizeColors(value: unknown): string[] {
  let values: unknown[] = [];
  if (Array.isArray(value)) values = value;
  if (isRecord(value)) values = Object.values(value);
  if (typeof value === "string") values = value.split(/[;,](?![^(]*\))/);
  return values
    .map((item) => safePaletteColorValue(item) ?? originalThemeColor(item))
    .filter((item): item is string => item !== null)
    .slice(0, 5);
}

function parseThemeColor(value: unknown): RgbaColor | null {
  if (typeof value !== "string") return null;
  const color = value.trim();
  const hex = color.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i);
  if (hex) {
    let digits = hex[1];
    if (digits.length <= 4) {
      digits = Array.from(digits, (digit) => digit + digit).join("");
    }
    const hasAlpha = digits.length === 8;
    return {
      red: Number.parseInt(digits.slice(0, 2), 16),
      green: Number.parseInt(digits.slice(2, 4), 16),
      blue: Number.parseInt(digits.slice(4, 6), 16),
      alpha: hasAlpha ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1,
    };
  }

  const functional = color.match(/^(rgb|rgba)\(([^)]*)\)$/i);
  if (!functional) return null;
  const hasAlpha = functional[1].toLowerCase() === "rgba";
  const parts = functional[2].split(/\s*,\s*/);
  if (parts.length !== (hasAlpha ? 4 : 3)) return null;

  const channel = (part: string): number | null => {
    const component = part.trim();
    if (!/^\d+$/.test(component)) return null;
    const number = Number(component);
    if (!Number.isFinite(number) || number < 0 || number > 255) return null;
    return number;
  };

  const red = channel(parts[0]);
  const green = channel(parts[1]);
  const blue = channel(parts[2]);
  if (red === null || green === null || blue === null) return null;

  let alpha = 1;
  if (hasAlpha) {
    const alphaPart = parts[3].trim();
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(alphaPart)) return null;
    const number = Number(alphaPart);
    if (!Number.isFinite(number) || number < 0 || number > 1) return null;
    alpha = number;
  }
  return { red, green, blue, alpha };
}

function formatAlpha(value: number): string {
  return Math.max(0, Math.min(1, value)).toFixed(6).replace(/0+$/, "").replace(/\.$/, "") || "0";
}

function formatRgba(color: RgbaColor): string {
  return `rgba(${Math.round(color.red)}, ${Math.round(color.green)}, ${Math.round(color.blue)}, ${formatAlpha(color.alpha)})`;
}

function formatRgb(color: RgbaColor): string {
  return `rgb(${Math.round(color.red)}, ${Math.round(color.green)}, ${Math.round(color.blue)})`;
}

function originalThemeColor(value: unknown): string | null {
  return typeof value === "string" && parseThemeColor(value) ? value : null;
}

function formatHexColor(color: RgbaColor, includeAlpha: boolean): string {
  const bytes = [color.red, color.green, color.blue];
  if (includeAlpha) bytes.push(Math.round(Math.max(0, Math.min(1, color.alpha)) * 255));
  return `#${bytes.map((component) => Math.round(component).toString(16).padStart(2, "0")).join("")}`;
}

function supportsTransparentColorEditing(features: RuntimeThemeFeatures): boolean {
  return features.rgba || features.alphaHex;
}

function formatEditedThemeColor(color: RgbaColor, features: RuntimeThemeFeatures, previousValue = ""): string | null {
  const previous = previousValue.trim();
  const preferredAlphaHex = /^#[\da-f]{4}$/i.test(previous) || /^#[\da-f]{8}$/i.test(previous);
  const preferredRgba = /^rgba\(/i.test(previous);
  if (color.alpha < 1) {
    if (preferredAlphaHex && features.alphaHex) return formatHexColor(color, true);
    if (preferredRgba && features.rgba) return formatRgba(color);
    if (features.rgba) return formatRgba(color);
    if (features.alphaHex) return formatHexColor(color, true);
    return null;
  }
  if (preferredRgba && features.rgba) return formatRgba(color);
  if (preferredAlphaHex && features.alphaHex) return formatHexColor(color, true);
  if (/^rgb\(/i.test(previous)) return formatRgb(color);
  return formatHexColor(color, false);
}

function themeColorSupportedByRuntime(value: unknown, features: RuntimeThemeFeatures): boolean {
  if (typeof value !== "string" || !parseThemeColor(value)) return false;
  const candidate = value.trim();
  if (/^#[\da-f]{4}$/i.test(candidate) || /^#[\da-f]{8}$/i.test(candidate)) return features.alphaHex;
  if (/^rgba\(/i.test(candidate)) return features.rgba;
  return true;
}

function safePaletteColorValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!candidate) return null;
  const isHex = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(candidate);
  const functional = candidate.match(/^(rgb|rgba|hsl|oklch|oklab)\((.*)\)$/is);
  if (!isHex && !functional) return null;
  if (functional) {
    const safeBody = functional[2].replace(/\b(?:deg|grad|rad|turn|none)\b/gi, "");
    if (!safeBody || !/^[\d\s.,%+\-/eE]*$/.test(safeBody)) return null;
  }
  if (typeof CSS !== "undefined" && !CSS.supports("color", candidate)) return null;
  return value;
}

function paletteColorSupportedByRuntime(value: unknown, features: RuntimeThemeFeatures): boolean {
  const safe = safePaletteColorValue(value);
  if (!safe) return false;
  const candidate = safe.trim();
  if (/^#[\da-f]{4}$/i.test(candidate) || /^#[\da-f]{8}$/i.test(candidate)) return features.alphaHex;
  if (/^rgba\(/i.test(candidate)) return features.rgba;
  return true;
}

function encodeColorTokensForRuntime(
  colors: ThemeColorTokens,
  features: RuntimeThemeFeatures,
): ThemeColorTokens | null {
  const parsedBackground = parseThemeColor(colors.background);
  if (!parsedBackground) return null;
  const opaqueBackground: RgbaColor = {
    red: parsedBackground.red,
    green: parsedBackground.green,
    blue: parsedBackground.blue,
    alpha: 1,
  };
  const encoded = {} as ThemeColorTokens;
  for (const key of Object.keys(COLOR_FIELD_ALIASES) as Array<keyof ThemeColorTokens>) {
    const parsed = parseThemeColor(colors[key]);
    if (!parsed) return null;
    let runtimeColor = parsed;
    if (parsed.alpha < 1 && !supportsTransparentColorEditing(features)) {
      runtimeColor = key === "background"
        ? { ...parsed, alpha: 1 }
        : {
            red: (parsed.red * parsed.alpha) + (opaqueBackground.red * (1 - parsed.alpha)),
            green: (parsed.green * parsed.alpha) + (opaqueBackground.green * (1 - parsed.alpha)),
            blue: (parsed.blue * parsed.alpha) + (opaqueBackground.blue * (1 - parsed.alpha)),
            alpha: 1,
          };
    }
    const formatted = formatEditedThemeColor(runtimeColor, features, colors[key]);
    if (!formatted) return null;
    encoded[key] = formatted;
  }
  return encoded;
}

function safeCssColor(value: unknown, fallback: string): string {
  return originalThemeColor(value) ?? originalThemeColor(fallback) ?? "rgba(0, 0, 0, 1)";
}

function colorInputValue(value: string): string {
  const parsed = parseThemeColor(value);
  if (!parsed) return "#808080";
  return `#${[parsed.red, parsed.green, parsed.blue]
    .map((component) => Math.round(component).toString(16).padStart(2, "0"))
    .join("")}`;
}

function alphaInputValue(value: string): number {
  return parseThemeColor(value)?.alpha ?? 1;
}

function normalizeColorTokens(value: unknown): ThemeColorTokens {
  const colors = isRecord(value) ? value : {};
  return {
    background: safeCssColor(pick(colors, ["background"]), "#080c10"),
    panel: safeCssColor(pick(colors, ["panel"]), "#10171d"),
    panelAlt: safeCssColor(pick(colors, ["panelAlt", "panel_alt"]), "#18242b"),
    accent: safeCssColor(pick(colors, ["accent"]), "#3eb1be"),
    accentAlt: safeCssColor(pick(colors, ["accentAlt", "accent_alt"]), "#85e3eb"),
    secondary: safeCssColor(pick(colors, ["secondary"]), "#397986"),
    highlight: safeCssColor(pick(colors, ["highlight"]), "#d66a52"),
    text: safeCssColor(pick(colors, ["text"]), "#eff7f8"),
    muted: safeCssColor(pick(colors, ["muted"]), "#a4b7bc"),
    line: safeCssColor(pick(colors, ["line"]), "rgba(133, 227, 235, 0.28)"),
  };
}

function canonicalizeColorTokens(colors: ThemeColorTokens): ThemeColorTokens {
  return {
    background: safeCssColor(colors.background, "#080c10"),
    panel: safeCssColor(colors.panel, "#10171d"),
    panelAlt: safeCssColor(colors.panelAlt, "#18242b"),
    accent: safeCssColor(colors.accent, "#3eb1be"),
    accentAlt: safeCssColor(colors.accentAlt, "#85e3eb"),
    secondary: safeCssColor(colors.secondary, "#397986"),
    highlight: safeCssColor(colors.highlight, "#d66a52"),
    text: safeCssColor(colors.text, "#eff7f8"),
    muted: safeCssColor(colors.muted, "#a4b7bc"),
    line: safeCssColor(colors.line, "rgba(133, 227, 235, 0.28)"),
  };
}

const COLOR_FIELD_ALIASES: Record<keyof ThemeColorTokens, string[]> = {
  background: ["background"],
  panel: ["panel"],
  panelAlt: ["panelAlt", "panel_alt"],
  accent: ["accent"],
  accentAlt: ["accentAlt", "accent_alt"],
  secondary: ["secondary"],
  highlight: ["highlight"],
  text: ["text"],
  muted: ["muted"],
  line: ["line"],
};

function normalizeExplicitColorTokens(value: unknown): Partial<ThemeColorTokens> | null {
  if (!isRecord(value)) return null;
  const normalized: Partial<ThemeColorTokens> = {};
  for (const [key, aliases] of Object.entries(COLOR_FIELD_ALIASES) as Array<[keyof ThemeColorTokens, string[]]>) {
    const color = originalThemeColor(pick(value, aliases));
    if (color) normalized[key] = color;
  }
  return Object.keys(normalized).length ? normalized : null;
}

function canonicalizePartialColorTokens(colors: Partial<ThemeColorTokens> | null): Partial<ThemeColorTokens> | null {
  if (!colors) return null;
  const normalized: Partial<ThemeColorTokens> = {};
  for (const key of Object.keys(COLOR_FIELD_ALIASES) as Array<keyof ThemeColorTokens>) {
    const color = originalThemeColor(colors[key]);
    if (color) normalized[key] = color;
  }
  return Object.keys(normalized).length ? normalized : null;
}

function canonicalPaletteColor(value: unknown, fallback: string): string {
  return safePaletteColorValue(value) ?? safePaletteColorValue(fallback) ?? "#7c6df2";
}

const DARK_PREVIEW_COLORS = normalizeColorTokens({});
const LIGHT_PREVIEW_COLORS = normalizeColorTokens({
  background: "#f5f6f8",
  panel: "rgba(255, 255, 255, 0.82)",
  panelAlt: "rgba(232, 235, 241, 0.9)",
  accent: "#6558d9",
  accentAlt: "#4e43c1",
  secondary: "#62708a",
  highlight: "#c45368",
  text: "#171a21",
  muted: "#5f6673",
  line: "rgba(31, 37, 48, 0.18)",
});

function resolvedPreviewAppearance(appearance: ThemeAppearance): "light" | "dark" {
  if (appearance !== "auto") return appearance;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function adaptiveBaseColorTokens(draft: ThemeEditorDraft): ThemeColorTokens {
  const fallback = resolvedPreviewAppearance(draft.appearance) === "light" ? LIGHT_PREVIEW_COLORS : DARK_PREVIEW_COLORS;
  return canonicalizeColorTokens(draft.inspectedImageColors ?? draft.derivedColors ?? fallback);
}

function automaticPaletteAccent(draft: ThemeEditorDraft): string {
  return adaptiveBaseColorTokens(draft).accent;
}

function previewColorTokens(draft: ThemeEditorDraft): ThemeColorTokens {
  const base = adaptiveBaseColorTokens(draft);
  const explicit = draft.colorMode === "explicit" ? draft.explicitColors ?? {} : {};
  const preview = canonicalizeColorTokens({ ...base, ...explicit });
  if (draft.paletteExplicit && !Object.prototype.hasOwnProperty.call(explicit, "accent")) {
    preview.accent = canonicalPaletteColor(draft.paletteAccent, base.accent);
  }
  return preview;
}

function explicitColorCount(draft: ThemeEditorDraft): number {
  return Object.keys(draft.explicitColors ?? {}).length;
}

function hasCompleteExplicitColors(draft: ThemeEditorDraft): boolean {
  return explicitColorCount(draft) === EDITABLE_COLOR_FIELDS.length;
}

const CONTRAST_FIELD_LABELS: Record<ThemeContrastIssue["field"], string> = {
  text: "\u6b63\u6587",
  muted: "\u5f31\u5316\u6587\u5b57",
  accent: "\u5f3a\u8c03\u8272",
  accentAlt: "\u8f85\u52a9\u5f3a\u8c03",
};

const CONTRAST_REQUIRED_KEYS: Array<keyof ThemeColorTokens> = [
  "background",
  "panel",
  "panelAlt",
  "text",
  "muted",
  "accent",
  "accentAlt",
];

let lastContrastSignature = "";
let lastContrastIssues: ThemeContrastIssue[] = [];

function editorContrastIssues(draft: ThemeEditorDraft): ThemeContrastIssue[] {
  const explicit = draft.colorMode === "explicit" ? draft.explicitColors : null;
  if (!explicit || !CONTRAST_REQUIRED_KEYS.every((key) => Object.prototype.hasOwnProperty.call(explicit, key))) {
    lastContrastSignature = "";
    lastContrastIssues = [];
    return [];
  }
  const signature = CONTRAST_REQUIRED_KEYS.map((key) => explicit[key]).join("\u0000");
  if (signature === lastContrastSignature) return lastContrastIssues;
  lastContrastSignature = signature;
  lastContrastIssues = themeContrastIssues(previewColorTokens(draft));
  return lastContrastIssues;
}

function contrastIssueText(issue: ThemeContrastIssue): string {
  return `${CONTRAST_FIELD_LABELS[issue.field]}\u5728${issue.surfaceLabel}\u4e0a\u4ec5 ${issue.ratio.toFixed(2)}:1\uff0c\u9700\u8981\u81f3\u5c11 ${issue.minimum}:1\u3002`;
}

function contrastIssueRowText(issue: ThemeContrastIssue): string {
  return `\u5bf9\u6bd4\u5ea6 ${issue.ratio.toFixed(2)}:1 / ${issue.minimum}:1 \u00b7 ${issue.surfaceLabel}`;
}

function contrastIssueRowMarkup(issues: ThemeContrastIssue[], key: keyof ThemeColorTokens): string {
  const issue = issues.find((candidate) => candidate.field === key);
  const text = issue ? escapeHtml(contrastIssueRowText(issue)) : "";
  return `<small class="editor-color-contrast" data-editor-color-contrast="${key}" ${issue ? "" : "hidden"}>${text}</small>`;
}

function contrastIssueSummary(issues: ThemeContrastIssue[]): string {
  return issues.map((issue) => contrastIssueText(issue)).join(" ");
}

function localizedMutationError(error: unknown): string {
  const message = errorMessage(error);
  const match = message.match(/(text|muted|accentAlt|accent) must have at least ([\d.]+):1 contrast/i);
  if (!match) return message;
  const field = match[1] as ThemeContrastIssue["field"];
  return `${CONTRAST_FIELD_LABELS[field]}\u4e0e\u80cc\u666f\u3001\u9762\u677f\u6216\u6b21\u7ea7\u9762\u677f\u7684\u5bf9\u6bd4\u5ea6\u4e0d\u8db3\uff08\u81f3\u5c11 ${match[2]}:1\uff09\u3002\u672c\u6b21\u64cd\u4f5c\u672a\u5199\u5165\uff0c\u8bf7\u8c03\u6574\u4e3b\u9898\u8272\u677f\u540e\u91cd\u8bd5\u3002`;
}

function ordinaryMaterializationColors(draft: ThemeEditorDraft): ThemeColorTokens {
  const base = adaptiveBaseColorTokens(draft);
  const explicit = draft.colorMode === "explicit" ? draft.explicitColors ?? {} : {};
  return canonicalizeColorTokens({ ...base, ...explicit });
}

function materializeFullExplicitColors(draft: ThemeEditorDraft, features: RuntimeThemeFeatures): boolean {
  const encoded = encodeColorTokensForRuntime(ordinaryMaterializationColors(draft), features);
  if (!encoded) return false;
  draft.colorMode = "explicit";
  draft.explicitColors = { ...encoded };
  draft.colors = { ...encoded };
  return true;
}

function selectEditorColorMode(nextMode: ThemeColorMode): boolean {
  const draft = state.editorDraft;
  if (!draft || nextMode === draft.colorMode) return false;
  if (nextMode === "adaptive") {
    draft.colorMode = "adaptive";
    draft.explicitColors = null;
    draft.colors = previewColorTokens(draft);
    return true;
  }
  if (state.status.themeFeatures.partialColors) {
    draft.colorMode = "explicit";
    draft.explicitColors = {};
    draft.colors = previewColorTokens(draft);
    return true;
  }
  if (!materializeFullExplicitColors(draft, state.status.themeFeatures)) {
    showToast("无法生成旧运行时色板", "warning", "无法把当前普通颜色转换为完整十色，请检查主题颜色后重试。");
    return false;
  }
  return true;
}

function toAssetUrl(path: string): string {
  if (!path) return "";
  const isWindowsAbsolute = /^[a-z]:[\\/]/i.test(path) || /^\\\\[^\\]+\\[^\\]+/.test(path);
  const isPosixAbsolute = path.startsWith("/");
  if (!isWindowsAbsolute && !isPosixAbsolute) return "";
  try {
    return convertFileSrc(path);
  } catch {
    return "";
  }
}

function normalizeThemeArt(value: unknown): ThemeArt | null {
  if (!isRecord(value)) return null;
  const art: ThemeArt = {};
  const focusX = pick(value, ["focusX", "focus_x"]);
  const focusY = pick(value, ["focusY", "focus_y"]);
  if (typeof focusX === "number" && Number.isFinite(focusX)) art.focusX = clampUnit(focusX);
  if (typeof focusY === "number" && Number.isFinite(focusY)) art.focusY = clampUnit(focusY);
  const safeArea = normalizeNullableChoice(pick(value, ["safeArea", "safe_area"]), ["auto", "left", "right", "center", "none"] as const);
  const taskMode = normalizeNullableChoice(pick(value, ["taskMode", "task_mode"]), ["auto", "ambient", "banner", "off"] as const);
  if (safeArea) art.safeArea = safeArea;
  if (taskMode) art.taskMode = taskMode;
  return art;
}

function normalizeThemePalette(value: unknown): ThemePalette | null {
  if (!isRecord(value)) return null;
  const accent = safePaletteColorValue(pick(value, ["accent"]));
  return accent ? { accent } : null;
}

function normalizeTheme(value: unknown, index: number): ThemeSummary {
  const record = isRecord(value) ? value : {};
  const imagePath = readString(record, ["imagePath", "image_path", "backgroundPath", "background_path"]);
  const previewPath = readString(record, ["previewPath", "preview_path"]);
  const rawColors = pick(record, ["colors", "colorTokens", "color_tokens", "accentColors", "accent_colors"]);
  const explicitColors = normalizeExplicitColorTokens(rawColors);
  const palette = normalizeThemePalette(pick(record, ["palette"]));
  const paletteAccent = palette?.accent || undefined;
  const derivedColors = normalizeColorTokens(pick(record, ["derivedColors", "derived_colors"]));
  const colorTokens = normalizeColorTokens({ ...derivedColors, ...(explicitColors ?? {}) });
  if (paletteAccent && !Object.prototype.hasOwnProperty.call(explicitColors ?? {}, "accent")) {
    colorTokens.accent = paletteAccent;
  }
  const builtin = readBoolean(record, ["builtin", "builtIn", "built_in", "isBuiltin", "is_builtin"]);
  const source = normalizeChoice(pick(record, ["source", "themeSource", "theme_source"]), ["builtin", "manager", "platform"] as const, builtin ? "builtin" : "manager");
  const id = readString(record, ["id", "themeId", "theme_id"], "theme-" + (index + 1));
  const name = readString(record, ["name", "title"], "\u672a\u547d\u540d\u4e3b\u9898 " + (index + 1));
  const tagline = readString(record, ["tagline", "description", "subtitle"], "\u81ea\u5b9a\u4e49 Codex \u5de5\u4f5c\u7a7a\u95f4");
  const unsupportedValue = pick(record, ["unsupportedFeatures", "unsupported_features"]);
  const unsupportedFeatures = Array.isArray(unsupportedValue)
    ? unsupportedValue.filter((item): item is string => typeof item === "string")
    : [];
  const reportedActive = readBoolean(record, ["active", "isActive", "is_active"]);
  return {
    id,
    selectionKey: readString(record, ["selectionKey", "selection_key"], `${source}:${id}`),
    name,
    brandSubtitle: readString(record, ["brandSubtitle", "brand_subtitle"], "Codex Dream Skin"),
    tagline,
    projectPrefix: readString(record, ["projectPrefix", "project_prefix"], "\u6253\u5f00 "),
    projectLabel: readString(record, ["projectLabel", "project_label"], name),
    statusText: readString(record, ["statusText", "status_text"], "\u672c\u5730\u4e3b\u9898"),
    quote: readString(record, ["quote"], tagline),
    promoTitle: readString(record, ["promoTitle", "promo_title"]),
    promoSub: readString(record, ["promoSub", "promo_sub"]),
    promoUrl: readString(record, ["promoUrl", "promo_url"]),
    imagePath,
    imageUrl: toAssetUrl(imagePath),
    previewPath,
    previewUrl: toAssetUrl(previewPath),
    colors: normalizeColors([colorTokens.accent, colorTokens.accentAlt, colorTokens.secondary, colorTokens.highlight, colorTokens.panelAlt]),
    colorTokens,
    explicitColors,
    derivedColors,
    appearance: normalizeNullableChoice(pick(record, ["appearance"]), ["auto", "light", "dark"] as const),
    art: normalizeThemeArt(pick(record, ["art"])),
    palette,
    source,
    readOnly: readBoolean(record, ["readOnly", "read_only", "readonly"], source !== "manager" || builtin),
    imageMetadata: normalizeImageMetadata(pick(record, ["imageMetadata", "image_metadata", "metadata"])),
    builtin,
    compatible: readBoolean(record, ["compatible"], unsupportedFeatures.length === 0),
    unsupportedFeatures,
    active: reportedActive,
    reportedActive,
  };
}

function normalizeInspectedThemeImage(value: unknown, fallbackPath: string): InspectedThemeImage {
  const record = unwrapRecord(value, ["inspection", "image", "data"]);
  const colorSource = pick(record, ["colors", "colorTokens", "color_tokens", "palette"]);
  return {
    previewPath: readString(record, ["previewPath", "preview_path", "imagePath", "image_path", "path"], fallbackPath),
    colors: normalizeColorTokens(colorSource ?? record),
    imageMetadata: normalizeImageMetadata(pick(record, ["imageMetadata", "image_metadata", "metadata"])),
  };
}

function extractThemes(value: unknown): ThemeSummary[] {
  let source: unknown = value;
  if (isRecord(value)) source = pick(value, ["themes", "items", "data"]);
  if (isRecord(source)) source = pick(source, ["themes", "items"]);
  if (!Array.isArray(source)) return [];
  return source.map(normalizeTheme);
}

function normalizeResult(value: unknown, fallbackMessage: string): CommandResult {
  if (typeof value === "boolean") {
    return { ok: value, message: fallbackMessage, cancelled: false, restartRequired: false };
  }
  const record = unwrapRecord(value, ["result", "data"]);
  return {
    ok: readBoolean(record, ["ok", "success"], false),
    message: readString(record, ["message", "detail"], fallbackMessage),
    cancelled: readBoolean(record, ["cancelled", "canceled"], false),
    restartRequired: readBoolean(record, ["restartRequired", "restart_required", "needsRestart", "needs_restart"]),
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function readOnboardingDone(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "done";
  } catch {
    return false;
  }
}

function markOnboardingDone(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, "done");
  } catch {
    // The manager remains usable when local storage is unavailable.
  }
}

const iconPaths = {
  spark: '<path d="m12 2 1.45 4.55L18 8l-4.55 1.45L12 14l-1.45-4.55L6 8l4.55-1.45L12 2Z"/><path d="m5 14 .9 2.1L8 17l-2.1.9L5 20l-.9-2.1L2 17l2.1-.9L5 14Zm13 1 1.1 2.9L22 19l-2.9 1.1L18 23l-1.1-2.9L14 19l2.9-1.1L18 15Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  activity: '<path d="M3 12h4l2.5-7 5 14 2.5-7h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 3v12m0-12-4 4m4-4 4 4"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
  download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/>',
  rotate: '<path d="M20 11a8 8 0 1 0-2.34 5.66"/><path d="M20 4v7h-7"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  refresh: '<path d="M20 6v5h-5M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 11m16 2-2 4.5A7 7 0 0 1 5.5 15"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.5 3 7.7 7.5 9.5 4.5-1.8 7.5-5 7.5-9.5V6L12 3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 4.5-4.5 3 3L14 13l6 6"/>',
  arrow: '<path d="m9 18 6-6-6-6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  minimize: '<path d="M5 12h14"/>',
  maximize: '<rect x="5" y="5" width="14" height="14" rx="1.5"/>',
  restore: '<path d="M8 8V5h11v11h-3"/><rect x="5" y="8" width="11" height="11" rx="1.5"/>',
  wand: '<path d="m15 4 5 5L8 21H3v-5L15 4Z"/><path d="m13 6 5 5M6 3v3M4.5 4.5h3M19 16v4M17 18h4"/>',
} as const;

type IconName = keyof typeof iconPaths;

function icon(name: IconName, className = ""): string {
  return `<svg class="icon ${escapeAttr(className)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]}</svg>`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (isRecord(error)) return readString(error, ["message", "error", "detail"], "发生了未知错误");
  return "发生了未知错误";
}

function formatPlatform(platform: string): string {
  const normalized = platform.toLowerCase();
  if (normalized.includes("win")) return "Windows";
  if (normalized.includes("darwin") || normalized.includes("mac")) return "macOS";
  return platform || "未知平台";
}

function themeMatchesKey(
  theme: ThemeSummary,
  key: string | null | undefined,
  themes: ThemeSummary[] = state.themes,
): boolean {
  if (!key) return false;
  if (theme.selectionKey === key) return true;
  const qualified = key.match(/^(builtin|manager|platform):(.*)$/);
  if (qualified) return theme.source === qualified[1] && theme.id === qualified[2];
  const legacyMatches = themes.filter((candidate) => candidate.id === key);
  return legacyMatches.length === 1 && legacyMatches[0].selectionKey === theme.selectionKey;
}

function resolveActiveSelectionKeys(
  themes: ThemeSummary[],
  statusKey: string | null | undefined,
  previousKeys: string[] = [],
  preserveAmbiguous = false,
): Set<string> {
  const reported = themes.filter((theme) => theme.reportedActive);
  if (reported.length) return new Set(reported.map((theme) => theme.selectionKey));
  if (!statusKey) return new Set();

  const exact = themes.find((theme) => theme.selectionKey === statusKey);
  if (exact) return new Set([exact.selectionKey]);

  const qualified = statusKey.match(/^(builtin|manager|platform):(.*)$/);
  if (qualified) {
    const matches = themes.filter((theme) => theme.source === qualified[1] && theme.id === qualified[2]);
    return matches.length === 1 ? new Set([matches[0].selectionKey]) : new Set();
  }

  const legacyMatches = themes.filter((theme) => theme.id === statusKey);
  if (legacyMatches.length === 1) return new Set([legacyMatches[0].selectionKey]);
  if (legacyMatches.length > 1 && preserveAmbiguous) {
    const existing = previousKeys.filter((key) => themes.some((theme) => theme.selectionKey === key));
    return new Set(existing);
  }
  return new Set();
}

function withResolvedActiveThemes(
  themes: ThemeSummary[],
  statusKey: string | null | undefined,
  previousKeys: string[] = [],
  preserveAmbiguous = false,
): ThemeSummary[] {
  const activeKeys = resolveActiveSelectionKeys(themes, statusKey, previousKeys, preserveAmbiguous);
  return themes.map((theme) => ({ ...theme, active: activeKeys.has(theme.selectionKey) }));
}

function themeIsActive(theme: ThemeSummary): boolean {
  return theme.active;
}

function themeSourceLabel(source: ThemeSource): string {
  if (source === "builtin") return "\u5185\u7f6e\u9884\u8bbe";
  if (source === "platform") return "\u5e73\u53f0\u4e3b\u9898\u5e93";
  return "Manager \u4e3b\u9898";
}

const THEME_FEATURE_LABELS: Record<string, string> = {
  appearance: "外观模式",
  art: "图片构图",
  partialColors: "部分颜色覆盖",
  rgba: "RGBA 颜色",
  alphaHex: "透明 Hex",
  paletteAccent: "自适应强调色",
};

function unsupportedFeatureSummary(theme: ThemeSummary): string {
  return theme.unsupportedFeatures
    .map((feature) => THEME_FEATURE_LABELS[feature] ?? feature)
    .join("、");
}

function selectedTheme(): ThemeSummary | undefined {
  return state.themes.find((theme) => themeMatchesKey(theme, state.selectedThemeId));
}

function openThemeEditor(theme: ThemeSummary, opener?: Element): void {
  rememberModalOpener(opener);
  const createCopy = theme.readOnly || themeIsActive(theme) || !theme.compatible;
  const imageMetadata = theme.imageMetadata;
  state.editorDraft = {
    sourceId: theme.selectionKey,
    name: createCopy ? theme.name + " \u526f\u672c" : theme.name,
    brandSubtitle: theme.brandSubtitle,
    tagline: theme.tagline,
    projectPrefix: theme.projectPrefix,
    projectLabel: theme.projectLabel,
    statusText: theme.statusText,
    quote: theme.quote,
    promoTitle: theme.promoTitle,
    promoSub: theme.promoSub,
    promoUrl: theme.promoUrl,
    colors: { ...theme.colorTokens },
    derivedColors: { ...theme.derivedColors },
    explicitColors: theme.explicitColors ? { ...theme.explicitColors } : null,
    colorMode: theme.explicitColors === null ? "adaptive" : "explicit",
    appearance: theme.appearance ?? "auto",
    appearancePresent: theme.appearance !== null,
    appearanceRemoved: false,
    focusX: theme.art?.focusX ?? imageMetadata?.suggestedFocusX ?? 0.5,
    focusY: theme.art?.focusY ?? imageMetadata?.suggestedFocusY ?? 0.5,
    safeArea: theme.art?.safeArea ?? imageMetadata?.suggestedSafeArea ?? "auto",
    taskMode: theme.art?.taskMode ?? imageMetadata?.suggestedTaskMode ?? "auto",
    explicitArt: theme.art ? { ...theme.art } : null,
    artRemoved: false,
    paletteAccent: theme.palette?.accent ?? theme.derivedColors.accent,
    paletteExplicit: Boolean(theme.palette?.accent),
    paletteRemoved: false,
    replacementImagePath: null,
    replacementPreviewPath: "",
    replacementPreviewUrl: "",
    replacementImageMetadata: null,
    inspectedImageColors: null,
    previewMode: "home",
    createCopy,
  };
  renderApp();
}

function syncThemeEditorPreview(): void {
  const draft = state.editorDraft;
  const preview = document.querySelector<HTMLElement>(".editor-theme-preview");
  if (!draft || !preview) return;
  const previewColors = previewColorTokens(draft);
  const variables: Record<keyof ThemeColorTokens, string> = {
    background: "--preview-bg",
    panel: "--preview-panel",
    panelAlt: "--preview-panel-alt",
    accent: "--preview-accent",
    accentAlt: "--preview-accent-alt",
    secondary: "--preview-secondary",
    highlight: "--preview-highlight",
    text: "--preview-text",
    muted: "--preview-muted",
    line: "--preview-line",
  };
  for (const [key, variable] of Object.entries(variables) as Array<[keyof ThemeColorTokens, string]>) {
    preview.style.setProperty(variable, previewColors[key]);
  }

  const copy: Record<EditorDraftTextKey, string> = {
    name: draft.name,
    brandSubtitle: draft.brandSubtitle,
    tagline: draft.tagline,
    projectPrefix: draft.projectPrefix,
    projectLabel: draft.projectLabel,
    statusText: draft.statusText,
    quote: draft.quote,
    promoTitle: draft.promoTitle,
    promoSub: draft.promoSub,
    promoUrl: draft.promoUrl,
  };
  for (const [key, value] of Object.entries(copy)) {
    preview.querySelectorAll<HTMLElement>(`[data-preview-copy="${key}"]`).forEach((element) => {
      element.textContent = value;
    });
  }
  const projectText = draft.projectPrefix + draft.projectLabel;
  preview.querySelectorAll<HTMLElement>("[data-preview-project-button]").forEach((element) => {
    element.textContent = projectText;
  });

  const source = state.themes.find((theme) => themeMatchesKey(theme, draft.sourceId));
  const imageUrl = draft.replacementPreviewUrl || source?.imageUrl || "";
  preview.querySelectorAll<HTMLImageElement>("[data-preview-image]").forEach((image) => {
    if (imageUrl) {
      image.src = imageUrl;
      image.hidden = false;
    } else {
      image.removeAttribute("src");
      image.hidden = true;
    }
    const placeholder = image.closest(".sim-image-shell")?.querySelector<HTMLElement>("[data-preview-image-placeholder]");
    if (placeholder) placeholder.hidden = Boolean(imageUrl);
  });
  preview.setAttribute("aria-label", `${draft.name || "\u672a\u547d\u540d\u4e3b\u9898"} Codex \u6a21\u62df\u9884\u89c8`);
  syncEditorContrastFeedback();
}

function isThemeColorKey(value: string): value is keyof ThemeColorTokens {
  return EDITABLE_COLOR_FIELDS.some((field) => field.key === value);
}

function syncEditorColorRow(key: keyof ThemeColorTokens, preserveText = false): void {
  const draft = state.editorDraft;
  if (!draft) return;
  const color = parseThemeColor(draft.colors[key]);
  if (!color) return;
  const row = document.querySelector<HTMLElement>(`[data-editor-color-row="${key}"]`);
  if (!row) return;
  const swatch = row.querySelector<HTMLInputElement>("[data-editor-color-swatch]");
  const textInput = row.querySelector<HTMLInputElement>("[data-editor-color-text]");
  const alpha = row.querySelector<HTMLInputElement>("[data-editor-color-alpha]");
  const output = row.querySelector<HTMLOutputElement>("[data-editor-color-alpha-output]");
  const alphaSwatch = row.querySelector<HTMLElement>("[data-editor-color-alpha-swatch]");
  if (swatch) swatch.value = colorInputValue(draft.colors[key]);
  if (textInput && !preserveText) {
    textInput.value = draft.colors[key];
    textInput.setCustomValidity("");
  }
  const percent = Math.round(color.alpha * 100);
  if (alpha) {
    alpha.value = String(percent);
    alpha.setAttribute("aria-valuetext", `${percent}%`);
  }
  if (output) output.value = `${percent}%`;
  if (alphaSwatch) alphaSwatch.style.setProperty("--alpha-color", draft.colors[key]);
}

function syncEditorContrastFeedback(): void {
  const draft = state.editorDraft;
  if (!draft) return;
  const issues = editorContrastIssues(draft);
  const warning = document.querySelector<HTMLElement>("[data-editor-contrast-warning]");
  const list = document.querySelector<HTMLUListElement>("[data-editor-contrast-list]");
  if (warning) warning.hidden = issues.length === 0;
  if (list) {
    list.replaceChildren(...issues.map((issue) => {
      const item = document.createElement("li");
      item.textContent = contrastIssueText(issue);
      return item;
    }));
  }
  for (const { key } of EDITABLE_COLOR_FIELDS) {
    const row = document.querySelector<HTMLElement>(`[data-editor-color-row="${key}"]`);
    const issue = issues.find((candidate) => candidate.field === key);
    row?.classList.toggle("has-contrast-error", Boolean(issue));
    const feedback = row?.querySelector<HTMLElement>("[data-editor-color-contrast]");
    if (feedback) {
      feedback.hidden = !issue;
      feedback.textContent = issue ? contrastIssueRowText(issue) : "";
    }
  }
  const fix = document.querySelector<HTMLButtonElement>("[data-action=\"editor-fix-contrast\"]");
  if (fix) fix.disabled = !issues.some((issue) => issue.suggestedColor);
  const saveButton = document.querySelector<HTMLButtonElement>("[data-editor-save]");
  if (saveButton) {
    saveButton.disabled = Boolean(state.busy) || saveButton.dataset.colorsSaveable !== "true" || issues.length > 0;
  }
}

function syncEditorPaletteControls(preserveText = false): void {
  const draft = state.editorDraft;
  if (!draft) return;
  const parsed = parseThemeColor(draft.paletteAccent);
  const swatch = document.querySelector<HTMLInputElement>("[data-editor-palette-swatch]");
  const textInput = document.querySelector<HTMLInputElement>("[data-editor-palette-text]");
  const alpha = document.querySelector<HTMLInputElement>("[data-editor-palette-alpha]");
  const output = document.querySelector<HTMLOutputElement>("[data-editor-palette-alpha-output]");
  const alphaSwatch = document.querySelector<HTMLElement>("[data-editor-palette-alpha-swatch]");
  if (swatch && parsed) swatch.value = colorInputValue(draft.paletteAccent);
  if (textInput && !preserveText) {
    textInput.value = draft.paletteAccent;
    textInput.setCustomValidity("");
  }
  if (alpha) {
    alpha.disabled = !parsed || !state.status.themeFeatures.paletteAccent || !supportsTransparentColorEditing(state.status.themeFeatures);
    if (parsed) {
      alpha.value = String(Math.round(parsed.alpha * 100));
      alpha.setAttribute("aria-valuetext", `${Math.round(parsed.alpha * 100)}%`);
    }
  }
  if (output) output.value = parsed ? `${Math.round(parsed.alpha * 100)}%` : "CSS";
  if (alphaSwatch) alphaSwatch.style.setProperty("--alpha-color", draft.paletteAccent);
}

function filteredThemes(): ThemeSummary[] {
  const query = state.search.trim().toLocaleLowerCase("zh-CN");
  return state.themes.filter((theme) => {
    const matchesQuery = !query || `${theme.name} ${theme.tagline}`.toLocaleLowerCase("zh-CN").includes(query);
    const matchesFilter =
      state.filter === "all" ||
      (state.filter === "mine" && !theme.builtin) ||
      (state.filter === "builtin" && theme.builtin);
    return matchesQuery && matchesFilter;
  });
}

function statusTone(): string {
  if (!state.status.connected) return "neutral";
  if (!state.status.codexInstalled || !state.status.engineAvailable) return "warning";
  if (state.status.hotSwitchReady) return "active";
  if (state.status.sessionRunning || state.status.skinActive) return "warning";
  if (state.status.engineConfigured && !state.status.nodeReady) return "warning";
  return "ready";
}

function statusText(): string {
  if (!state.status.connected) return "服务未连接";
  if (!state.status.codexInstalled) return "未检测到 Codex";
  if (!state.status.engineAvailable) return "换肤组件不可用";
  if (state.status.hotSwitchReady) return "热切换已就绪";
  if (state.status.sessionRunning) return "会话连接中";
  if (state.status.skinActive) return "会话待重开";
  if (state.status.engineConfigured && !state.status.nodeReady) return "运行环境待修复";
  if (state.status.engineConfigured) return "换肤环境已配置";
  return "官方外观";
}

function statusDescription(): string {
  if (!state.status.connected) return "暂时无法连接本地管理服务。";
  if (!state.status.codexInstalled) return "尚未检测到官方 Codex 桌面端。";
  if (!state.status.engineAvailable) return "Manager 内置的换肤组件不完整，请重新安装 Manager。";
  if (state.status.hotSwitchReady) return "换肤会话已连接，主题切换会立即应用。";
  if (state.status.sessionRunning) return "换肤 watcher 已启动，正在等待 Codex 本机回环端点就绪。";
  if (state.status.skinActive) return "已保存主题配置，但当前 watcher 未运行；重新应用主题即可连接。";
  if (state.status.engineConfigured && !state.status.nodeReady) return "换肤启动配置仍在，但运行环境未就绪；请在诊断页修复。";
  if (state.status.engineConfigured) return "换肤启动环境已配置，选择一个主题即可开启会话。";
  return "当前是 Codex 官方外观；换肤组件随 Manager 提供，只是尚未启用。";
}

function canApplyTheme(theme?: ThemeSummary): boolean {
  return (theme?.compatible ?? true)
    && state.status.connected
    && state.status.codexInstalled
    && state.status.engineAvailable
    && state.status.engineConfigured
    && state.status.nodeReady;
}

const MODAL_FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function currentModalKey(): string | null {
  if (state.editorDraft) return `theme-editor:${state.editorDraft.sourceId}`;
  if (state.confirmApplyRestart) return "confirm-apply";
  if (state.confirmInstall) return "confirm-install";
  if (state.confirmRestore) return "confirm-restore";
  if (state.onboardingOpen) return "onboarding";
  return null;
}

function dialogFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR))
    .filter((element) => element.tabIndex >= 0 && !element.closest("[hidden]") && element.getAttribute("aria-hidden") !== "true");
}

function selectorAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function rememberModalOpener(element: Element | null = document.activeElement): void {
  if (!(element instanceof HTMLElement) || !app.contains(element)) return;
  const attributes = [
    "id", "data-action", "data-theme-id", "data-filter", "data-window-action",
  ];
  let selector = element.tagName.toLowerCase();
  for (const attribute of attributes) {
    const value = element.getAttribute(attribute);
    if (value === null) continue;
    selector = `${element.tagName.toLowerCase()}[${attribute}${value ? `="${selectorAttributeValue(value)}"` : ""}]`;
    break;
  }
  const matches = Array.from(app.querySelectorAll<HTMLElement>(selector));
  modalOpenerStack.push({ selector, matchIndex: Math.max(0, matches.indexOf(element)) });
}

function restoreModalOpener(fallbackSelector?: string): void {
  const snapshot = modalOpenerStack.pop();
  requestAnimationFrame(() => {
    let target: HTMLElement | undefined;
    if (snapshot) {
      const matches = Array.from(app.querySelectorAll<HTMLElement>(snapshot.selector));
      target = matches[snapshot.matchIndex];
    }
    target ??= fallbackSelector ? app.querySelector<HTMLElement>(fallbackSelector) ?? undefined : undefined;
    target?.focus();
  });
}

function captureDialogFocus(): FocusSnapshot | null {
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  const active = document.activeElement;
  if (!dialog || !(active instanceof HTMLElement) || !dialog.contains(active)) return null;
  const focusable = dialogFocusableElements(dialog);
  const attributes = [
    "id", "data-action", "data-preview-mode", "data-editor-color-mode", "data-editor-color-clear",
    "data-editor-palette-swatch", "data-editor-palette-text", "data-editor-palette-alpha",
    "data-editor-setting", "data-editor-art", "data-editor-field", "data-editor-color-swatch",
    "data-editor-color-text", "data-editor-color-alpha", "data-theme-id", "data-filter", "data-window-action",
  ];
  let selector: string | null = null;
  let matchIndex = 0;
  for (const attribute of attributes) {
    const value = active.getAttribute(attribute);
    if (value === null) continue;
    selector = `${active.tagName.toLowerCase()}[${attribute}${value ? `="${selectorAttributeValue(value)}"` : ""}]`;
    matchIndex = Array.from(dialog.querySelectorAll(selector)).indexOf(active);
    break;
  }
  if (!selector) {
    selector = active.tagName.toLowerCase();
    matchIndex = Array.from(dialog.querySelectorAll(selector)).indexOf(active);
  }
  const textControl = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : null;
  return {
    selector,
    matchIndex: Math.max(0, matchIndex),
    focusableIndex: Math.max(0, focusable.indexOf(active)),
    selectionStart: textControl?.selectionStart ?? null,
    selectionEnd: textControl?.selectionEnd ?? null,
  };
}

function restoreDialogFocus(snapshot: FocusSnapshot | null, focusTitle: boolean): void {
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!dialog) return;
  let target: HTMLElement | undefined;
  if (snapshot?.selector) {
    target = Array.from(dialog.querySelectorAll<HTMLElement>(snapshot.selector))[snapshot.matchIndex];
  }
  if (!target || target.tabIndex < 0 || target.closest("[hidden]")) {
    target = snapshot ? dialogFocusableElements(dialog)[snapshot.focusableIndex] : undefined;
  }
  if (!target && focusTitle) target = dialog.querySelector<HTMLElement>('[tabindex="-1"]') ?? undefined;
  if (!target) return;
  target.focus();
  if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && snapshot && snapshot.selectionStart !== null) {
    try {
      target.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd ?? snapshot.selectionStart);
    } catch {
      // Input types such as color do not expose a text selection.
    }
  }
}

function renderApp(): void {
  const nextModalKey = currentModalKey();
  const sameModal = Boolean(nextModalKey && nextModalKey === renderedModalKey);
  const focusSnapshot = sameModal ? captureDialogFocus() : null;
  const focusTitle = Boolean(nextModalKey && nextModalKey !== renderedModalKey);
  renderedModalKey = nextModalKey;
  const modalOpen = Boolean(nextModalKey);
  document.body.classList.toggle("modal-open", modalOpen);
  app.innerHTML = `
    <div class="window-frame">
      ${renderWindowTitlebar()}
      <div class="ambient ambient-one" aria-hidden="true"></div>
      <div class="ambient ambient-two" aria-hidden="true"></div>
      <div class="app-shell" aria-busy="${state.loading || Boolean(state.busy)}" ${modalOpen ? 'inert aria-hidden="true"' : ""}>
        ${renderSidebar()}
        <main class="main-panel">
          ${renderTopbar()}
          ${state.error ? renderErrorBanner() : ""}
          ${state.loading ? renderLoadingState() : state.view === "themes" ? renderThemesView() : renderDiagnosticsView()}
        </main>
      </div>
      ${state.onboardingOpen && !state.confirmInstall && !state.confirmRestore && !state.confirmApplyRestart ? renderOnboarding() : ""}
      ${state.confirmInstall ? renderInstallConfirmation() : ""}
      ${state.confirmRestore ? renderRestoreConfirmation() : ""}
      ${state.confirmApplyRestart ? renderApplyRestartConfirmation() : ""}
      ${state.editorDraft ? renderThemeEditor() : ""}
    </div>
  `;
  if (nextModalKey) requestAnimationFrame(() => restoreDialogFocus(focusSnapshot, focusTitle));
}

function renderWindowTitlebar(): string {
  const maximizeIcon: IconName = windowMaximized ? "restore" : "maximize";
  const maximizeLabel = windowMaximized ? "还原窗口" : "最大化窗口";
  return `
    <header class="window-titlebar" data-tauri-drag-region="deep">
      <div class="window-titlebar-identity" data-tauri-drag-region="deep">
        <span class="window-titlebar-mark" data-tauri-drag-region="deep">${icon("spark")}</span>
        <span class="window-titlebar-copy" data-tauri-drag-region="deep">
          <strong data-tauri-drag-region="deep">Dream Skin</strong>
          <small data-tauri-drag-region="deep">Codex 主题管理器</small>
        </span>
      </div>
      <div class="window-controls" aria-label="窗口控制">
        <button type="button" data-window-action="minimize" aria-label="最小化窗口" title="最小化">
          ${icon("minimize")}
        </button>
        <button type="button" data-window-action="maximize" aria-label="${maximizeLabel}" title="${maximizeLabel}">
          ${icon(maximizeIcon)}
        </button>
        <button class="window-close" type="button" data-window-action="close" aria-label="关闭窗口" title="关闭">
          ${icon("close")}
        </button>
      </div>
    </header>
  `;
}

async function syncWindowFrameState(): Promise<void> {
  try {
    windowMaximized = await managerWindow.isMaximized();
    document.body.classList.toggle("window-maximized", windowMaximized);
    const maximizeButton = document.querySelector<HTMLButtonElement>('[data-window-action="maximize"]');
    if (maximizeButton) {
      const label = windowMaximized ? "还原窗口" : "最大化窗口";
      maximizeButton.setAttribute("aria-label", label);
      maximizeButton.title = label;
      maximizeButton.innerHTML = icon(windowMaximized ? "restore" : "maximize");
    }
  } catch {
    // Browser preview mode has no native window; the app remains visually testable.
  }
}

async function handleWindowAction(action: string): Promise<void> {
  try {
    if (action === "minimize") {
      await managerWindow.minimize();
      return;
    }
    if (action === "maximize") {
      await managerWindow.toggleMaximize();
      await syncWindowFrameState();
      return;
    }
    if (action === "close") await managerWindow.close();
  } catch (error) {
    showToast("窗口操作没有完成", "error", errorMessage(error));
  }
}

function renderSidebar(): string {
  return `
    <aside class="sidebar">
      <button class="brand" type="button" data-action="show-themes" aria-label="返回主题库">
        <span class="brand-mark">${icon("spark")}</span>
        <span class="brand-copy"><strong>Dream Skin</strong><small>Codex 主题管理器</small></span>
      </button>
      <nav class="primary-nav" aria-label="主导航">
        <button class="nav-item ${state.view === "themes" ? "is-active" : ""}" type="button" data-action="show-themes" aria-current="${state.view === "themes" ? "page" : "false"}">
          ${icon("grid")}<span>主题库</span><span class="nav-count">${state.themes.length}</span>
        </button>
        <button class="nav-item ${state.view === "diagnostics" ? "is-active" : ""}" type="button" data-action="show-diagnostics" aria-current="${state.view === "diagnostics" ? "page" : "false"}">
          ${icon("activity")}<span>运行与诊断</span>
        </button>
      </nav>
      <div class="sidebar-spacer"></div>
      <div class="safety-note">
        <span class="safety-icon">${icon("shield")}</span>
        <div><strong>本地安全运行</strong><p>主题与配置只保存在你的设备上。</p></div>
      </div>
      <button class="guide-link" type="button" data-action="open-guide">
        ${icon("info")}<span>重新查看使用引导</span>
      </button>
      <div class="sidebar-footer">Dream Skin Manager <span>v${escapeHtml(managerVersion)}</span></div>
    </aside>
  `;
}

function renderTopbar(): string {
  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">${state.view === "themes" ? "PERSONALIZE YOUR CODEX" : "SYSTEM HEALTH"}</p>
        <h1>${state.view === "themes" ? "让工作空间更像你" : "运行与诊断"}</h1>
      </div>
      <div class="topbar-actions">
        <button class="status-pill status-${statusTone()}" type="button" data-action="show-diagnostics" aria-label="查看运行状态：${escapeAttr(statusText())}">
          <span class="status-dot"></span><span>${escapeHtml(statusText())}</span>${icon("arrow")}
        </button>
        <button class="icon-button" type="button" data-action="refresh" aria-label="刷新状态" title="刷新状态">
          ${state.busy === "refresh" ? '<span class="spinner"></span>' : icon("refresh")}
        </button>
      </div>
    </header>
  `;
}

function renderErrorBanner(): string {
  return `
    <section class="error-banner" role="alert">
      <span>${icon("info")}</span>
      <div><strong>有些信息暂时无法读取</strong><p>${escapeHtml(state.error ?? "请稍后重试")}</p></div>
      <button class="button button-ghost button-small" type="button" data-action="refresh">重试</button>
    </section>
  `;
}

function renderLoadingState(): string {
  return `
    <div class="loading-page" aria-label="正在加载主题">
      <div class="skeleton skeleton-hero"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-grid">
        ${Array.from({ length: 6 }, () => '<div class="skeleton skeleton-card"></div>').join("")}
      </div>
    </div>
  `;
}

function renderThemesView(): string {
  const themes = filteredThemes();
  const selected = themes.find((theme) => themeMatchesKey(theme, state.selectedThemeId));
  return `
    <div class="content themes-view">
      <section class="hero-card">
        <div class="hero-copy">
          <span class="hero-kicker">${icon("wand")} 一键切换，不改动 Codex 程序文件</span>
          <h2>今天，想换一种灵感氛围吗？</h2>
          <p>添加一张喜欢的图片，或导入朋友分享的 <code>.codexskin</code>，其余交给 Dream Skin。</p>
          <div class="hero-actions">
            <button class="button button-primary" type="button" data-action="add-image" aria-keyshortcuts="Alt+A" ${state.busy ? "disabled" : ""}>
              ${state.busy === "add" ? '<span class="spinner"></span>' : icon("plus")} 添加背景图
            </button>
            <button class="button button-secondary" type="button" data-action="import-theme" aria-keyshortcuts="Alt+I" ${state.busy ? "disabled" : ""}>
              ${state.busy === "import" ? '<span class="spinner"></span>' : icon("upload")} 导入主题包
            </button>
          </div>
        </div>
        <div class="hero-art" aria-hidden="true">
          <div class="orb orb-a"></div><div class="orb orb-b"></div>
          <div class="mini-window">
            <div class="mini-window-bar"><i></i><i></i><i></i></div>
            <div class="mini-window-body"><span></span><span></span><span></span><b></b></div>
          </div>
          <span class="floating-chip chip-one">${icon("spark")} ${state.status.hotSwitchReady ? "热切换已就绪" : "首次启用后热切换"}</span>
          <span class="floating-chip chip-two">本地存储</span>
        </div>
      </section>

      <section class="library-section" aria-labelledby="theme-library-title">
        <div class="section-heading">
          <div><h2 id="theme-library-title">你的主题库</h2><p>${state.themes.length ? `共 ${state.themes.length} 个主题，选择即可预览与应用` : "从一张图片开始创建你的第一个主题"}</p></div>
          <div class="library-tools">
            <label class="search-box">
              <span class="sr-only">搜索主题</span>${icon("search")}
              <input id="theme-search" type="search" placeholder="搜索主题…" value="${escapeAttr(state.search)}" autocomplete="off" />
              <kbd>/</kbd>
            </label>
            <div class="segmented" role="group" aria-label="筛选主题">
              ${renderFilterButton("all", "全部")}
              ${renderFilterButton("mine", "我的")}
              ${renderFilterButton("builtin", "内置")}
            </div>
          </div>
        </div>
        ${state.themes.length === 0 ? renderEmptyLibrary() : themes.length === 0 ? renderNoSearchResults() : `
          <div class="library-layout ${selected ? "has-detail" : ""}">
            <div class="theme-grid" role="listbox" aria-label="主题列表">
              ${themes.map(renderThemeCard).join("")}
            </div>
            ${selected ? renderThemeDetail(selected) : ""}
          </div>
        `}
      </section>
    </div>
  `;
}

function renderFilterButton(filter: ThemeFilter, label: string): string {
  return `<button type="button" data-filter="${filter}" class="${state.filter === filter ? "is-active" : ""}" aria-pressed="${state.filter === filter}">${label}</button>`;
}

function renderThemePreview(theme: ThemeSummary, className: string): string {
  const actualPreviewUrl = theme.previewUrl;
  if (actualPreviewUrl) {
    return `<img class="${className} actual-theme-preview" src="${escapeAttr(actualPreviewUrl)}" alt="${escapeAttr(theme.name)} 实机预览" loading="lazy" />`;
  }
  if (theme.imageUrl) {
    const colors = theme.colorTokens;
    const style = [
      `--preview-bg:${colors.background}`,
      `--preview-panel:${colors.panel}`,
      `--preview-panel-alt:${colors.panelAlt}`,
      `--preview-accent:${colors.accent}`,
      `--preview-accent-alt:${colors.accentAlt}`,
      `--preview-secondary:${colors.secondary}`,
      `--preview-highlight:${colors.highlight}`,
      `--preview-text:${colors.text}`,
      `--preview-muted:${colors.muted}`,
      `--preview-line:${colors.line}`,
    ].join(";");
    return `
      <span class="${className} composition-theme-preview" role="img" aria-label="${escapeAttr(theme.name)} 3 比 1 构图预检，非实机预览" style="${escapeAttr(style)}">
        <span class="composition-preview-stage">
          <img src="${escapeAttr(theme.imageUrl)}" alt="" loading="lazy" />
          <span class="composition-preview-gradient"></span>
          <span class="composition-safe-zone" aria-hidden="true"><small>文字安全区</small></span>
          <span class="composition-preview-kind">构图预检 · 非实机</span>
        </span>
      </span>`;
  }
  const initials = Array.from(theme.name.trim()).slice(0, 2).join("") || "DS";
  return `<div class="${className} preview-placeholder" aria-label="${escapeAttr(theme.name)} 暂无预览"><span>${escapeHtml(initials)}</span><i></i><b></b></div>`;
}

function renderPalette(theme: ThemeSummary): string {
  const colors = theme.colors.length ? theme.colors : ["#775cff", "#33d6c6", "#ff78b5"];
  return `<span class="palette" aria-label="主题色板">${colors.map((color) => `<i style="--swatch:${escapeAttr(color)}"></i>`).join("")}</span>`;
}

function renderThemeCard(theme: ThemeSummary): string {
  const selected = themeMatchesKey(theme, state.selectedThemeId);
  const active = themeIsActive(theme);
  const live = active && state.status.hotSwitchReady;
  return `
    <button class="theme-card ${selected ? "is-selected" : ""} ${active ? "is-active" : ""} ${theme.compatible ? "" : "is-incompatible"}" type="button" role="option" aria-selected="${selected}" data-theme-id="${escapeAttr(theme.selectionKey)}">
      <span class="theme-preview-wrap">
        ${renderThemePreview(theme, "theme-preview")}
        <span class="preview-scrim"></span>
        ${active ? `<span class="active-badge">${icon(live ? "check" : "activity")} ${live ? "使用中" : "已配置"}</span>` : ""}
        ${theme.compatible ? "" : `<span class="compatibility-badge">${icon("shield")} 运行时不兼容</span>`}
        <span class="select-indicator">${icon("check")}</span>
      </span>
      <span class="theme-card-copy">
        <span><strong>${escapeHtml(theme.name)}</strong><small>${escapeHtml(theme.tagline)}</small></span>
        ${renderPalette(theme)}
        <span class="theme-source-badge source-${theme.source}" title="${theme.readOnly ? "\u53ea\u8bfb\uff1b\u7f16\u8f91\u65f6\u5c06\u4fdd\u5b58\u526f\u672c" : "\u53ef\u76f4\u63a5\u7f16\u8f91"}">
          ${theme.readOnly ? icon("shield") : ""}${escapeHtml(themeSourceLabel(theme.source))}
        </span>
      </span>
    </button>
  `;
}

function renderThemeDetail(theme: ThemeSummary): string {
  const active = themeIsActive(theme);
  const live = active && state.status.hotSwitchReady;
  const canApply = canApplyTheme(theme);
  return `
    <aside class="theme-detail" aria-label="已选主题详情">
      <div class="detail-sticky">
        <div class="detail-preview-wrap">
          ${renderThemePreview(theme, "detail-preview")}
          <div class="detail-preview-label"><span>${live ? "正在使用" : active ? "当前配置" : theme.previewUrl ? "实机预览" : "构图预检 · 非实机"}</span><b>Codex</b></div>
        </div>
        <div class="detail-heading">
          <div><span class="detail-type source-${theme.source}">${escapeHtml(themeSourceLabel(theme.source))}${theme.readOnly ? " · 只读" : ""}</span><h3>${escapeHtml(theme.name)}</h3></div>
          ${renderPalette(theme)}
        </div>
        <p class="detail-tagline">${escapeHtml(theme.tagline)}</p>
        ${theme.compatible ? "" : `<div class="theme-compatibility-note" role="note"><strong>${icon("shield")} 当前运行时无法完整呈现</strong><span>缺少：${escapeHtml(unsupportedFeatureSummary(theme) || "未知主题能力")}</span></div>`}
        <button class="button button-secondary button-wide editor-launch" type="button" data-action="open-theme-editor" ${state.busy ? "disabled" : ""}>
          ${theme.readOnly || active ? icon("copy") : icon("wand")} ${theme.readOnly || active ? "保存副本并编辑" : "编辑主题"}
        </button>
        <button class="button button-primary button-wide" type="button" data-action="apply-theme" ${live || state.busy || !canApply ? "disabled" : ""}>
          ${state.busy === "apply" ? '<span class="spinner"></span>' : !theme.compatible ? icon("shield") : live ? icon("check") : canApply ? icon("play") : icon("activity")}
          ${!theme.compatible ? "当前运行时不兼容" : live ? "当前正在使用" : active && canApply ? "重新连接换肤会话" : canApply ? state.status.hotSwitchReady ? "立即切换主题" : "启用主题（需重启一次）" : "请先完成环境检查"}
        </button>
        <div class="detail-actions">
          <button class="button button-ghost" type="button" data-action="export-theme" ${state.busy ? "disabled" : ""}>${icon("download")} 导出分享</button>
          <button class="button button-ghost danger-hover" type="button" data-action="request-restore" ${state.busy || !(state.status.engineConfigured || state.status.skinActive) ? "disabled" : ""}>${icon("rotate")} 恢复官方</button>
        </div>
        <p class="detail-hint">${!theme.compatible ? `请先更新运行时，或另存副本并移除不支持的能力：${escapeHtml(unsupportedFeatureSummary(theme))}` : canApply ? state.status.hotSwitchReady ? "当前换肤会话已连接，切换主题无需重启 Codex。" : "首次启用，或从官方入口重开 Codex 后，需要安全重启一次；之后即可热切换。" : "前往“运行与诊断”启用或修复换肤环境后即可应用。"}</p>
      </div>
    </aside>
  `;
}

function renderSimulationImage(imageUrl: string, className: string): string {
  return `
    <span class="sim-image-shell">
      <img class="${className}" data-preview-image${imageUrl ? ` src="${escapeAttr(imageUrl)}"` : ""} alt="" ${imageUrl ? "" : "hidden"} />
      <span class="sim-image-placeholder" data-preview-image-placeholder ${imageUrl ? "hidden" : ""}>DS</span>
    </span>
  `;
}

function currentImageMetadata(draft: ThemeEditorDraft, source: ThemeSummary): ThemeImageMetadata | null {
  return draft.replacementImagePath !== null ? draft.replacementImageMetadata : source.imageMetadata;
}

function resolvePreviewSafeArea(draft: ThemeEditorDraft, source: ThemeSummary): Exclude<ThemeSafeArea, "auto"> {
  if (draft.safeArea !== "auto") return draft.safeArea;
  const suggested = currentImageMetadata(draft, source)?.suggestedSafeArea;
  if (suggested && suggested !== "auto") return suggested;
  if (draft.focusX >= 0.62) return "left";
  if (draft.focusX <= 0.38) return "right";
  return "center";
}

function resolvePreviewTaskMode(draft: ThemeEditorDraft, source: ThemeSummary): Exclude<ThemeTaskMode, "auto"> {
  if (draft.taskMode !== "auto") return draft.taskMode;
  const metadata = currentImageMetadata(draft, source);
  const suggested = metadata?.suggestedTaskMode;
  if (suggested && suggested !== "auto") return suggested;
  return metadata?.wide ? "banner" : "ambient";
}

function syncPreviewArtState(): void {
  const draft = state.editorDraft;
  const source = draft ? state.themes.find((theme) => themeMatchesKey(theme, draft.sourceId)) : undefined;
  const preview = document.querySelector<HTMLElement>(".editor-theme-preview");
  if (!draft || !source || !preview) return;
  const safeArea = resolvePreviewSafeArea(draft, source);
  const taskMode = resolvePreviewTaskMode(draft, source);
  for (const value of ["left", "right", "center", "none"] as const) preview.classList.remove(`safe-${value}`);
  for (const value of ["ambient", "banner", "off"] as const) preview.classList.remove(`task-${value}`);
  preview.classList.add(`safe-${safeArea}`, `task-${taskMode}`);
  const resolution = document.querySelector<HTMLElement>(".preview-resolution");
  if (resolution) {
    resolution.textContent = `${draft.appearance} → ${resolvedPreviewAppearance(draft.appearance)} · ${safeArea} · ${taskMode} · ${draft.colorMode}`;
  }
}

function renderImageMetadata(metadata: ThemeImageMetadata | null): string {
  if (!metadata) return '<span class="image-metadata-empty">等待图片分析</span>';
  const dimensions = metadata.width && metadata.height ? `${metadata.width} × ${metadata.height}` : "尺寸未知";
  const ratio = metadata.aspectRatio ? metadata.aspectRatio.toFixed(2) : "—";
  return `<span><b>${dimensions}</b><i>比例 ${ratio}</i><i>${metadata.wide ? "超宽图" : "标准图"}</i><i>推荐 ${metadata.suggestedSafeArea} / ${metadata.suggestedTaskMode}</i></span>`;
}

function renderCodexSimulation(draft: ThemeEditorDraft, source: ThemeSummary): string {
  const imageUrl = draft.replacementPreviewUrl || source.imageUrl;
  const colors = previewColorTokens(draft);
  const safeArea = resolvePreviewSafeArea(draft, source);
  const taskMode = resolvePreviewTaskMode(draft, source);
  const appearance = resolvedPreviewAppearance(draft.appearance);
  const style = [
    `--preview-bg:${colors.background}`,
    `--preview-panel:${colors.panel}`,
    `--preview-panel-alt:${colors.panelAlt}`,
    `--preview-accent:${colors.accent}`,
    `--preview-accent-alt:${colors.accentAlt}`,
    `--preview-secondary:${colors.secondary}`,
    `--preview-highlight:${colors.highlight}`,
    `--preview-text:${colors.text}`,
    `--preview-muted:${colors.muted}`,
    `--preview-line:${colors.line}`,
    `--preview-focus-x:${Math.round(draft.focusX * 100)}%`,
    `--preview-focus-y:${Math.round(draft.focusY * 100)}%`,
  ].join(";");
  const mode = draft.previewMode;
  const scene = (name: ThemePreviewMode, content: string) =>
    `<section id="preview-scene-${name}" class="sim-scene sim-scene-${name}" role="tabpanel" aria-labelledby="preview-tab-${name}" data-preview-scene="${name}" ${mode === name ? "" : "hidden"}>${content}</section>`;

  return `
    <div class="editor-preview-toolbar">
      <div>
        <span class="simulation-badge">${icon("spark")} &#x6A21;&#x62DF;&#x9884;&#x89C8;</span>
        <small>&#x63A7;&#x4EF6;&#x53EF;&#x70B9;&#x51FB; &middot; &#x975E;&#x5B9E;&#x673A;&#x622A;&#x56FE;</small>
        <small class="preview-resolution">${draft.appearance} → ${appearance} · ${safeArea} · ${taskMode} · ${draft.colorMode}</small>
      </div>
      <div class="preview-mode-tabs" role="tablist" aria-label="Preview pages">
        ${PREVIEW_MODES.map(({ key, label }) => `<button id="preview-tab-${key}" type="button" role="tab" aria-controls="preview-scene-${key}" aria-selected="${mode === key}" tabindex="${mode === key ? "0" : "-1"}" class="${mode === key ? "is-active" : ""}" data-preview-mode="${key}">${label}</button>`).join("")}
      </div>
    </div>
    <div class="editor-theme-preview codex-simulation ${mode === "narrow" ? "is-narrow" : ""} appearance-${appearance} safe-${safeArea} task-${taskMode} mode-${mode}" role="region" aria-label="${escapeAttr(draft.name)} Codex preview" style="${escapeAttr(style)}">
      <div class="sim-wallpaper" aria-hidden="true">
        ${renderSimulationImage(imageUrl, "sim-wallpaper-image")}
        <i class="sim-wallpaper-scrim"></i>
      </div>
      <span class="sim-safe-guide" aria-hidden="true">原生内容安全区</span>
      <aside class="sim-sidebar">
        <div class="sim-brand"><span>${icon("spark")}</span><div><b>Codex</b><small data-preview-copy="brandSubtitle">${escapeHtml(draft.brandSubtitle)}</small></div></div>
        <nav aria-label="Simulated navigation">
          <button type="button" class="${mode === "home" || mode === "narrow" ? "is-selected" : ""}" data-preview-action="select-nav"><span>+</span>&#x65B0;&#x5EFA;&#x4EFB;&#x52A1;</button>
          <button type="button" class="${mode === "task" ? "is-selected" : ""}" data-preview-action="select-nav"><span>&#x25CB;</span>&#x4EFB;&#x52A1;</button>
          <button type="button" data-preview-action="select-nav"><span>@</span>&#x63D2;&#x4EF6;</button>
          <button type="button" class="${mode === "settings" ? "is-selected" : ""}" data-preview-action="select-nav"><span>&#x2699;</span>&#x8BBE;&#x7F6E;</button>
        </nav>
        <div class="sim-sidebar-section"><small>&#x9879;&#x76EE;</small><button type="button" class="sim-project is-selected" data-preview-action="select-nav">&#x25A1; codex-dream-skin</button></div>
        <div class="sim-sidebar-spacer"></div>
        <div class="sim-profile"><span>LC</span><div><b>li canghao</b><small data-preview-copy="statusText">${escapeHtml(draft.statusText)}</small></div></div>
      </aside>
      <main class="sim-main">
        <header class="sim-header">
          <div><b data-preview-copy="name">${escapeHtml(draft.name || "Untitled")}</b><small>Local workspace</small></div>
          <div class="sim-header-actions">
            <button type="button" data-preview-action="open-menu" aria-haspopup="menu" aria-expanded="false" aria-controls="preview-simulation-menu" aria-label="打开模拟菜单">&hellip;</button>
            <button type="button" disabled aria-label="Disabled example">&times;</button>
          </div>
          <div class="sim-popover" id="preview-simulation-menu" role="menu" aria-label="模拟主题操作" data-preview-popover hidden>
            <button type="button" role="menuitem" tabindex="0" data-preview-action="menu-command" data-preview-feedback-message="已模拟打开主题目录">&#x6253;&#x5F00;&#x4E3B;&#x9898;&#x76EE;&#x5F55;</button>
            <button type="button" role="menuitem" tabindex="-1" data-preview-action="menu-command" data-preview-feedback-message="主题信息已模拟复制">&#x590D;&#x5236;&#x4E3B;&#x9898;&#x4FE1;&#x606F;</button>
            <button type="button" role="menuitem" tabindex="-1" disabled>&#x6682;&#x4E0D;&#x53EF;&#x7528;</button>
          </div>
        </header>
        <div class="sim-feedback" data-preview-feedback role="status" aria-live="polite" hidden></div>
        <div class="sim-content">
          ${scene("home", `
            <div class="sim-hero">
              <div class="sim-hero-shade"></div>
              <div class="sim-hero-copy">
                <small data-preview-copy="brandSubtitle">${escapeHtml(draft.brandSubtitle)}</small>
                <h3 data-preview-copy="name">${escapeHtml(draft.name || "Untitled")}</h3>
                <p data-preview-copy="tagline">${escapeHtml(draft.tagline)}</p>
                <button type="button" data-preview-project-button data-preview-action="select-card">${escapeHtml(draft.projectPrefix + draft.projectLabel)}</button>
              </div>
            </div>
            <div class="sim-section-title"><div><b>&#x4ECE;&#x54EA;&#x91CC;&#x5F00;&#x59CB;&#xFF1F;</b><small data-preview-copy="quote">${escapeHtml(draft.quote)}</small></div><span data-preview-copy="statusText">${escapeHtml(draft.statusText)}</span></div>
            <div class="sim-card-grid">
              <button type="button" class="is-selected" data-preview-action="select-card"><span>+</span><b>&#x5F00;&#x59CB;&#x65B0;&#x5DE5;&#x4F5C;</b><small>Codex &#x5C06;&#x534F;&#x52A9;&#x5B8C;&#x6210;&#x76EE;&#x6807;</small></button>
              <button type="button" data-preview-action="select-card"><span>&#x25C7;</span><b>&#x5BA1;&#x67E5;&#x4EE3;&#x7801;</b><small>&#x5B9A;&#x4F4D;&#x98CE;&#x9669;&#x4E0E;&#x7EF4;&#x62A4;&#x95EE;&#x9898;</small></button>
              <button type="button" data-preview-action="select-card"><span>&#x2713;</span><b>&#x4FEE;&#x590D;&#x95EE;&#x9898;</b><small>&#x8BCA;&#x65AD;&#x3001;&#x4FEE;&#x6539;&#x5E76;&#x9A8C;&#x8BC1;</small></button>
              <button type="button" disabled><span>&#x2022;</span><b>&#x4EE5;&#x540E;&#x5F00;&#x653E;</b><small>&#x7981;&#x7528;&#x72B6;&#x6001;&#x793A;&#x4F8B;</small></button>
            </div>
          `)}
          ${scene("task", `
            ${taskMode === "banner" ? `<div class="sim-task-banner">${renderSimulationImage(imageUrl, "sim-task-banner-image")}<span>${escapeHtml(draft.name || "Codex")}</span></div>` : ""}
            <div class="sim-thread">
              <div class="sim-thread-meta"><span>main</span><span>local</span><span data-preview-copy="statusText">${escapeHtml(draft.statusText)}</span></div>
              <article class="sim-message sim-message-user"><span>LC</span><p>&#x8BF7;&#x8BA9;&#x7F16;&#x8F91;&#x5668;&#x91CC;&#x7684;&#x5373;&#x65F6;&#x9884;&#x89C8;&#x66F4;&#x50CF; Codex&#x3002;</p></article>
              <article class="sim-message sim-message-assistant"><span>${icon("spark")}</span><div><b data-preview-copy="name">${escapeHtml(draft.name || "Untitled")}</b><p>&#x56FE;&#x7247;&#x3001;RGBA &#x8272;&#x5F69;&#x548C;&#x6587;&#x6848;&#x5DF2;&#x540C;&#x6B65;&#x3002;</p><pre><code>preview.update({ theme: "live" })</code></pre></div></article>
              <article class="sim-message sim-message-assistant is-muted"><span>&#x2022;</span><p data-preview-copy="quote">${escapeHtml(draft.quote)}</p></article>
            </div>
            <div class="sim-composer" tabindex="0" role="textbox" aria-label="Simulated composer" data-preview-action="focus-composer">
              <span data-preview-composer-text>&#x8BF7;&#x8F93;&#x5165;&#x4E00;&#x4E2A;&#x8981;&#x6C42;&hellip;</span>
              <div><button type="button" disabled aria-label="Attachment disabled">+</button><button type="button" class="sim-access is-selected" data-preview-action="select-card">&#x5B8C;&#x5168;&#x8BBF;&#x95EE;</button><button type="button" class="sim-send" data-preview-action="send-message" aria-label="发送模拟消息">&uarr;</button></div>
            </div>
          `)}
          ${scene("settings", `
            <div class="sim-settings-heading"><div><small>APPEARANCE</small><h3>&#x4E3B;&#x9898;&#x4E0E;&#x5916;&#x89C2;</h3><p>&#x8FD9;&#x4E9B;&#x5F00;&#x5173;&#x548C;&#x83DC;&#x5355;&#x7528;&#x6765;&#x9884;&#x89C8;&#x4EA4;&#x4E92;&#x72B6;&#x6001;&#x3002;</p></div><span data-preview-copy="brandSubtitle">${escapeHtml(draft.brandSubtitle)}</span></div>
            <div class="sim-settings-list">
              <div><span><b>&#x8DDF;&#x968F;&#x5DE5;&#x4F5C;&#x533A;&#x4E3B;&#x9898;</b><small>&#x4F7F;&#x7528;&#x5F53;&#x524D;&#x914D;&#x8272;</small></span><button type="button" class="sim-switch is-on" role="switch" aria-label="&#x8DDF;&#x968F;&#x5DE5;&#x4F5C;&#x533A;&#x4E3B;&#x9898;" aria-checked="true" data-preview-action="toggle"><i></i></button></div>
              <div><span><b>&#x51CF;&#x5C11;&#x52A8;&#x6001;&#x6548;&#x679C;</b><small>&#x9002;&#x5408;&#x9700;&#x8981;&#x7A33;&#x5B9A;&#x754C;&#x9762;&#x7684;&#x7528;&#x6237;</small></span><button type="button" class="sim-switch" role="switch" aria-label="&#x51CF;&#x5C11;&#x52A8;&#x6001;&#x6548;&#x679C;" aria-checked="false" data-preview-action="toggle"><i></i></button></div>
              <div><span><b>&#x9AD8;&#x5BF9;&#x6BD4;&#x7126;&#x70B9;</b><small>&#x952E;&#x76D8;&#x5BFC;&#x822A;&#x65F6;&#x66F4;&#x6E05;&#x6670;</small></span><button type="button" class="sim-switch" role="switch" aria-label="&#x9AD8;&#x5BF9;&#x6BD4;&#x7126;&#x70B9;" aria-checked="false" data-preview-action="toggle"><i></i></button></div>
              <div class="is-disabled"><span><b>&#x4E91;&#x7AEF;&#x540C;&#x6B65;</b><small>&#x672C;&#x5730;&#x4E3B;&#x9898;&#x4E0D;&#x4F1A;&#x4E0A;&#x4F20;</small></span><button type="button" class="sim-switch" role="switch" aria-label="&#x4E91;&#x7AEF;&#x540C;&#x6B65;" disabled aria-checked="false"><i></i></button></div>
            </div>
            <div class="sim-market-card"><span>&#x4E3B;&#x9898;&#x5E02;&#x573A;&#x5143;&#x6570;&#x636E;</span><b data-preview-copy="promoTitle">${escapeHtml(draft.promoTitle || "Optional marketplace title")}</b><p data-preview-copy="promoSub">${escapeHtml(draft.promoSub || "Optional marketplace description")}</p><small data-preview-copy="promoUrl">${escapeHtml(draft.promoUrl || "No promotion link")}</small></div>
          `)}
          ${scene("narrow", `
            <div class="sim-narrow-hero">
              ${renderSimulationImage(imageUrl, "sim-narrow-image")}
              <div><small data-preview-copy="brandSubtitle">${escapeHtml(draft.brandSubtitle)}</small><h3 data-preview-copy="name">${escapeHtml(draft.name || "Untitled")}</h3><p data-preview-copy="tagline">${escapeHtml(draft.tagline)}</p></div>
            </div>
            <div class="sim-narrow-thread"><span>${icon("spark")}</span><div><b>&#x54CD;&#x5E94;&#x5F0F;&#x9884;&#x89C8;</b><p>&#x7A84;&#x7A97;&#x53E3;&#x4E0B;&#x4FDD;&#x6301;&#x53EF;&#x8BFB;&#x3001;&#x53EF;&#x70B9;&#x51FB;&#x3002;</p></div></div>
            <button type="button" class="sim-narrow-project is-selected" data-preview-project-button data-preview-action="select-card">${escapeHtml(draft.projectPrefix + draft.projectLabel)}</button>
            <div class="sim-composer" tabindex="0" role="textbox" aria-label="窄屏模拟输入框" data-preview-action="focus-composer"><span data-preview-composer-text>&#x7A84;&#x5C4F;&#x8F93;&#x5165;&hellip;</span><div><button type="button" class="sim-send" data-preview-action="send-message" aria-label="发送窄屏模拟消息">&uarr;</button></div></div>
          `)}
        </div>
      </main>
    </div>
  `;
}

function renderThemeEditor(): string {
  const draft = state.editorDraft;
  const source = draft ? state.themes.find((theme) => themeMatchesKey(theme, draft.sourceId)) : undefined;
  if (!draft || !source) return "";
  const features = state.status.themeFeatures;
  const encodedInspectedColors = draft.inspectedImageColors
    ? encodeColorTokensForRuntime(draft.inspectedImageColors, features)
    : null;
  const transparencyEditable = supportsTransparentColorEditing(features);
  const explicitCount = explicitColorCount(draft);
  const completeExplicitColors = hasCompleteExplicitColors(draft);
  const colorEditingEnabled = draft.colorMode === "explicit" && (features.partialColors || completeExplicitColors);
  const colorsSaveable = draft.colorMode === "adaptive" || features.partialColors || completeExplicitColors;
  const transparencyHint = features.rgba && features.alphaHex
    ? "透明度可输出 rgba() 或 #RRGGBBAA。"
    : features.rgba ? "透明度输出为 rgba()；当前运行时不接受透明 Hex。"
      : features.alphaHex ? "透明度输出为 #RRGGBBAA；当前运行时不接受 rgba()。" : "当前运行时只能编辑不透明颜色。";
  const contrastIssues = editorContrastIssues(draft);
  const contrastCanFix = contrastIssues.some((issue) => issue.suggestedColor);
  const imageMetadata = currentImageMetadata(draft, source);
  const sourceImageName = source.imagePath.split(/[\\/]/).pop() || "\u539f\u59cb\u4e3b\u9898\u56fe\u7247";
  const activeImageName = draft.replacementImagePath
    ? draft.replacementImagePath.split(/[\\/]/).pop() || draft.replacementImagePath
    : sourceImageName;

  return `
    <div class="modal-backdrop" data-modal="theme-editor">
      <section class="theme-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="theme-editor-title">
        <button class="modal-close" type="button" data-action="close-theme-editor" aria-label="Close">${icon("close")}</button>
        <header class="theme-editor-header">
          <p class="step-eyebrow">LOCAL THEME STUDIO</p>
          <h2 id="theme-editor-title" tabindex="-1">${draft.createCopy ? "&#x590D;&#x5236;&#x4E3A;&#x6211;&#x7684;&#x4E3B;&#x9898;" : "&#x7F16;&#x8F91;&#x4E3B;&#x9898;"}</h2>
          <span class="editor-source-badge source-${source.source}">${escapeHtml(themeSourceLabel(source.source))}${source.readOnly ? " · 只读来源" : ""}</span>
          ${!source.compatible ? `<div class="editor-downgrade-note">${icon("shield")} <span><strong>正在另存兼容副本</strong><small>当前运行时缺少：${escapeHtml(unsupportedFeatureSummary(source) || "未知能力")}。请使用下方“移除”或“恢复自动”清掉不支持字段；原主题不会被改动。</small></span></div>` : ""}
          <p>&#x6240;&#x6709;&#x6587;&#x6848;&#x3001;&#x56FE;&#x7247;&#x548C; RGBA &#x8272;&#x5F69;&#x90FD;&#x4F1A;&#x5373;&#x65F6;&#x540C;&#x6B65;&#x5230;&#x5DE6;&#x4FA7;&#x6A21;&#x62DF;&#x754C;&#x9762;&#x3002;</p>
        </header>
        <div class="theme-editor-content">
          <aside class="editor-preview-panel">
            <div class="editor-preview-frame">${renderCodexSimulation(draft, source)}</div>
            <div class="editor-source-note">
              <span>${icon("image")}</span>
              <div><strong>${draft.replacementImagePath ? "&#x5DF2;&#x9009;&#x62E9;&#x66FF;&#x6362;&#x56FE;&#x7247;" : "&#x5F53;&#x524D;&#x4E3B;&#x9898;&#x56FE;&#x7247;"}</strong><p>${escapeHtml(activeImageName)} &middot; &#x53EA;&#x5728;&#x672C;&#x5730;&#x4F7F;&#x7528;</p></div>
              <div class="editor-image-metadata">${renderImageMetadata(imageMetadata)}</div>
            </div>
          </aside>
          <form id="theme-editor-form" class="theme-editor-form">
            <section class="editor-section">
              <div class="editor-section-heading"><div><span>01</span><h3>&#x56FE;&#x7247;</h3></div><small>16:9 / PNG / JPG / WebP</small></div>
              <div class="editor-image-actions">
                <button class="button button-secondary" type="button" data-action="editor-replace-image" ${state.busy ? "disabled" : ""}>${icon("image")} &#x9009;&#x62E9;&#x56FE;&#x7247;</button>
                <button class="button button-ghost" type="button" data-action="editor-use-image-colors" ${encodedInspectedColors ? "" : "disabled"}>${icon("wand")} 转为完整十色</button>
                <button class="button button-ghost" type="button" data-action="editor-use-image-layout" ${imageMetadata && features.art ? "" : "disabled"}>${icon("spark")} &#x4F7F;&#x7528;&#x63A8;&#x8350;&#x5E03;&#x5C40;</button>
                <button class="button button-ghost" type="button" data-action="editor-reset-image" ${draft.replacementImagePath ? "" : "disabled"}>${icon("rotate")} &#x6062;&#x590D;&#x539F;&#x56FE;</button>
              </div>
            </section>
            <section class="editor-section editor-layout-section">
              <div class="editor-section-heading"><div><span>02</span><h3>外观与构图</h3></div><small>上游自适应主题</small></div>
              ${state.status.runtimeCompatibilityMessage ? `<div class="editor-capability-note">${icon("info")} ${escapeHtml(state.status.runtimeCompatibilityMessage)}</div>` : ""}
              <div class="editor-setting-grid">
                <div class="editor-field">
                  <span class="editor-field-heading">外观 <span class="editor-inline-actions">${draft.appearancePresent ? `<button type="button" data-action="editor-clear-appearance">移除 appearance</button>` : draft.appearanceRemoved && source.appearance ? `<button type="button" data-action="editor-restore-appearance">恢复原值</button>` : features.appearance ? `<button type="button" data-action="editor-enable-appearance">写入 appearance</button>` : ""}</span></span>
                  <select data-editor-setting="appearance" ${features.appearance ? "" : "disabled"}>
                    <option value="auto" ${draft.appearance === "auto" ? "selected" : ""}>自动跟随 Codex</option>
                    <option value="light" ${draft.appearance === "light" ? "selected" : ""}>浅色</option>
                    <option value="dark" ${draft.appearance === "dark" ? "selected" : ""}>深色</option>
                  </select>
                  <small>${draft.appearanceRemoved ? "保存副本时将不写 appearance。" : !features.appearance ? "当前运行时不支持 appearance；可移除该字段生成降级副本。" : draft.appearancePresent ? "manifest 将保留 appearance。" : "当前未写 appearance；修改选项或点击写入即可添加。"}</small>
                </div>
                <div class="editor-field editor-field-wide">
                  <span>配色模式</span>
                  <div class="editor-choice-group" role="radiogroup" aria-label="配色模式">
                    <button type="button" role="radio" tabindex="${draft.colorMode === "adaptive" ? "0" : "-1"}" aria-checked="${draft.colorMode === "adaptive"}" class="${draft.colorMode === "adaptive" ? "is-active" : ""}" data-editor-color-mode="adaptive">自适应 · 移除 colors</button>
                    <button type="button" role="radio" tabindex="${draft.colorMode === "explicit" ? "0" : "-1"}" aria-checked="${draft.colorMode === "explicit"}" class="${draft.colorMode === "explicit" ? "is-active" : ""}" data-editor-color-mode="explicit">显式色板 · ${explicitCount}/10</button>
                  </div>
                  <small>${draft.colorMode === "adaptive" ? "保存时不写 colors，可用于移除当前运行时不支持的颜色能力。" : features.partialColors ? "支持部分覆盖：只保存原有或你实际修改的色键。" : completeExplicitColors ? "旧运行时完整色板模式：保持 10/10，可编辑但不能单独移除某一色键。" : `当前只有 ${explicitCount}/10；旧运行时不能保存部分色板，请补全或切回自适应。`}</small>
                  ${draft.colorMode === "explicit" && !features.partialColors && !completeExplicitColors ? `<button class="button button-ghost editor-materialize-colors" type="button" data-action="editor-materialize-colors">补齐为完整十色</button>` : ""}
                </div>
                <div class="editor-field editor-field-wide editor-palette-accent">
                  <span class="editor-field-heading">自适应强调色 <small>palette.accent</small><span class="editor-inline-actions"><button type="button" data-action="editor-clear-palette" ${draft.paletteExplicit ? "" : "disabled"}>移除 palette</button>${draft.paletteRemoved && source.palette?.accent ? `<button type="button" data-action="editor-restore-palette">恢复原值</button>` : ""}</span></span>
                  <div class="editor-color-control">
                    <span class="editor-alpha-swatch" data-editor-palette-alpha-swatch style="--alpha-color:${escapeAttr(draft.paletteAccent)}"></span>
                    <input type="color" data-editor-palette-swatch value="${colorInputValue(draft.paletteAccent)}" aria-label="强调色" ${features.paletteAccent ? "" : "disabled"} />
                    <input type="text" data-editor-palette-text value="${escapeAttr(draft.paletteAccent)}" spellcheck="false" aria-label="palette accent" ${features.paletteAccent ? "" : "disabled"} />
                    <output data-editor-palette-alpha-output>${Math.round(alphaInputValue(draft.paletteAccent) * 100)}%</output>
                  </div>
                  <input class="editor-alpha-range" type="range" min="0" max="100" step="1" data-editor-palette-alpha value="${Math.round(alphaInputValue(draft.paletteAccent) * 100)}" aria-label="palette.accent 透明度" aria-valuetext="${Math.round(alphaInputValue(draft.paletteAccent) * 100)}%" ${features.paletteAccent && transparencyEditable && parseThemeColor(draft.paletteAccent) ? "" : "disabled"} />
                  <small>${draft.paletteRemoved ? "保存副本时不写 palette。" : !features.paletteAccent ? "当前运行时不支持 palette.accent；仍可用“移除 palette”生成降级副本。" : "支持 Hex、rgb(a)、hsl、oklch 与 oklab；文本输入会保留原始语法。"}</small>
                </div>
                <div class="editor-field editor-field-wide editor-manifest-actions">
                  <span class="editor-field-heading">图片构图 <small>art</small><span class="editor-inline-actions"><button type="button" data-action="editor-clear-art" ${draft.explicitArt ? "" : "disabled"}>移除 art</button>${draft.artRemoved && source.art ? `<button type="button" data-action="editor-restore-art">恢复原值</button>` : ""}</span></span>
                  <small>${draft.artRemoved ? "保存副本时不写 art，预览使用图片分析建议。" : !features.art ? "当前运行时不支持 art；仍可一键移除。" : "焦点与安全区会写入 manifest.art。"}</small>
                </div>
                <label class="editor-field"><span>水平焦点 <output data-editor-art-output="focusX">${Math.round(draft.focusX * 100)}%</output></span><input type="range" min="0" max="100" step="1" data-editor-art="focusX" value="${Math.round(draft.focusX * 100)}" ${features.art ? "" : "disabled"} /></label>
                <label class="editor-field"><span>垂直焦点 <output data-editor-art-output="focusY">${Math.round(draft.focusY * 100)}%</output></span><input type="range" min="0" max="100" step="1" data-editor-art="focusY" value="${Math.round(draft.focusY * 100)}" ${features.art ? "" : "disabled"} /></label>
                <label class="editor-field"><span>原生内容安全区</span><select data-editor-art="safeArea" ${features.art ? "" : "disabled"}>
                  ${(["auto", "left", "right", "center", "none"] as ThemeSafeArea[]).map((value) => `<option value="${value}" ${draft.safeArea === value ? "selected" : ""}>${value}</option>`).join("")}
                </select></label>
                <label class="editor-field"><span>任务页壁纸</span><select data-editor-art="taskMode" ${features.art ? "" : "disabled"}>
                  ${(["auto", "ambient", "banner", "off"] as ThemeTaskMode[]).map((value) => `<option value="${value}" ${draft.taskMode === value ? "selected" : ""}>${value}</option>`).join("")}
                </select></label>
              </div>
            </section>
            <section class="editor-section">
              <div class="editor-section-heading"><div><span>03</span><h3>&#x754C;&#x9762;&#x6587;&#x6848;</h3></div><small>v1 manifest</small></div>
              <div class="editor-text-grid">
                ${EDITOR_TEXT_FIELDS.map(({ key, label, multiline, maxLength }) => `
                  <label class="editor-field ${multiline ? "editor-field-wide" : ""}">
                    <span>${label}</span>
                    ${multiline
                      ? `<textarea data-editor-field="${key}" maxlength="${maxLength}" rows="2" required>${escapeHtml(draft[key])}</textarea>`
                      : `<input type="text" data-editor-field="${key}" maxlength="${maxLength}" value="${escapeAttr(draft[key])}" autocomplete="off" required />`}
                  </label>
                `).join("")}
              </div>
              <details class="editor-details">
                <summary>&#x4E3B;&#x9898;&#x5E02;&#x573A;&#x5143;&#x6570;&#x636E; <small>&#x53EF;&#x9009;</small></summary>
                <div class="editor-text-grid">
                  <label class="editor-field"><span>&#x63A8;&#x5E7F;&#x6807;&#x9898;</span><input type="text" data-editor-field="promoTitle" maxlength="120" value="${escapeAttr(draft.promoTitle)}" /></label>
                  <label class="editor-field"><span>&#x63A8;&#x5E7F;&#x94FE;&#x63A5;</span><input type="text" data-editor-field="promoUrl" maxlength="500" value="${escapeAttr(draft.promoUrl)}" /></label>
                  <label class="editor-field editor-field-wide"><span>&#x63A8;&#x5E7F;&#x526F;&#x6807;&#x9898;</span><textarea data-editor-field="promoSub" maxlength="120" rows="2">${escapeHtml(draft.promoSub)}</textarea></label>
                </div>
              </details>
            </section>
            <fieldset class="editor-colors editor-section ${colorEditingEnabled ? "" : "is-disabled"}" ${colorEditingEnabled ? "" : "disabled"}>
              <legend><span>04</span> &#x4E3B;&#x9898;&#x989C;&#x8272;&#x8986;&#x76D6;</legend>
              <p>${draft.colorMode === "adaptive" ? "colors 已标记为移除；切换为显式色板后再编辑。" : !features.partialColors && !completeExplicitColors ? "请先补齐为完整十色；旧运行时不能继续写部分 colors。" : !features.partialColors ? `完整 10/10 色板可编辑；单项恢复会造成部分色板，因此已禁用。${transparencyHint}` : `只保存你实际修改的色键。${transparencyHint}`}</p>
              <div class="editor-color-grid">
                ${EDITABLE_COLOR_FIELDS.map(({ key, label }) => `
                  <div class="editor-color-field" data-editor-color-row="${key}">
                    <div class="editor-color-heading"><span>${label}</span><span class="editor-color-heading-actions"><button type="button" data-editor-color-clear="${key}" ${features.partialColors && Object.prototype.hasOwnProperty.call(draft.explicitColors ?? {}, key) ? "" : "disabled"}>恢复自适应</button><output data-editor-color-alpha-output="${key}">${Math.round(alphaInputValue(draft.colors[key]) * 100)}%</output></span></div>
                    ${contrastIssueRowMarkup(contrastIssues, key)}
                    <div class="editor-color-control">
                      <span class="editor-alpha-swatch" data-editor-color-alpha-swatch="${key}" style="--alpha-color:${escapeAttr(draft.colors[key])}"></span>
                      <input type="color" data-editor-color-swatch="${key}" value="${colorInputValue(draft.colors[key])}" aria-label="${label}" />
                      <input type="text" data-editor-color-text="${key}" value="${escapeAttr(draft.colors[key])}" spellcheck="false" aria-label="${label} 颜色" />
                    </div>
                    <input class="editor-alpha-range" type="range" min="0" max="100" step="1" data-editor-color-alpha="${key}" value="${Math.round(alphaInputValue(draft.colors[key]) * 100)}" aria-label="${label} 透明度" aria-valuetext="${Math.round(alphaInputValue(draft.colors[key]) * 100)}%" ${transparencyEditable ? "" : "disabled"} />
                  </div>
                `).join("")}
              </div>
            </fieldset>
            <div class="editor-contrast-warning" data-editor-contrast-warning ${contrastIssues.length ? "" : "hidden"}>
              <span>${icon("shield")}</span>
              <div>
                <strong>&#x6682;&#x672A;&#x4FDD;&#x5B58;&#xFF1A;&#x6709; ${contrastIssues.length} &#x4E2A;&#x989C;&#x8272;&#x672A;&#x8FBE;&#x5230;&#x53EF;&#x8BFB;&#x6027;&#x8981;&#x6C42;</strong>
                <ul data-editor-contrast-list>${contrastIssues.map((issue) => `<li>${escapeHtml(contrastIssueText(issue))}</li>`).join("")}</ul>
                <small>&#x4FEE;&#x6539;&#x80CC;&#x666F;&#x6216;&#x6587;&#x5B57;&#x8272;&#x540E;&#x4F1A;&#x7ACB;&#x5373;&#x91CD;&#x65B0;&#x68C0;&#x67E5;&#xFF1B;&#x4E5F;&#x53EF;&#x624B;&#x52A8;&#x4F7F;&#x7528;&#x4E0B;&#x65B9;&#x5EFA;&#x8BAE;&#x3002;</small>
              </div>
              <button class="button button-secondary" type="button" data-action="editor-fix-contrast" ${contrastCanFix ? "" : "disabled"}>&#x81EA;&#x52A8;&#x4FEE;&#x590D;&#x53EF;&#x8BFB;&#x6027;</button>
            </div>
            <div class="editor-safety-note">${icon("shield")} &#x53EA;&#x4FDD;&#x5B58;&#x672C;&#x5730;&#x56FE;&#x7247;&#x5F15;&#x7528;&#x3001;&#x6587;&#x5B57;&#x548C;&#x989C;&#x8272;&#xFF1B;&#x4E0D;&#x5141;&#x8BB8;&#x811A;&#x672C;&#x3001;CSS&#x3001;&#x8FDC;&#x7A0B;&#x8D44;&#x6E90;&#x6216;&#x547D;&#x4EE4;&#x3002;</div>
            <footer class="theme-editor-actions">
              <button class="button button-ghost" type="button" data-action="close-theme-editor">&#x53D6;&#x6D88;</button>
              <button class="button button-primary" type="submit" data-editor-save data-colors-saveable="${colorsSaveable}" ${state.busy || !colorsSaveable || contrastIssues.length ? "disabled" : ""}>
                ${state.busy === "edit" ? '<span class="spinner"></span>' : draft.createCopy ? icon("copy") : icon("check")}
                ${draft.createCopy ? "&#x4FDD;&#x5B58;&#x4E3A;&#x65B0;&#x4E3B;&#x9898;" : "&#x4FDD;&#x5B58;&#x4FEE;&#x6539;"}
              </button>
            </footer>
          </form>
        </div>
      </section>
    </div>
  `;
}

function renderEmptyLibrary(): string {
  return `
    <div class="empty-state">
      <div class="empty-visual">${icon("image")}<span>${icon("plus")}</span></div>
      <h3>你的主题库还空着</h3>
      <p>选择一张符合人物安全区的 16:9 背景图；系统会提取色板并检查文字可读性。</p>
      <div class="empty-actions">
        <button class="button button-primary" type="button" data-action="add-image">${icon("plus")} 添加第一张图片</button>
        <button class="button button-ghost" type="button" data-action="import-theme">${icon("upload")} 导入他人的配置</button>
      </div>
    </div>
  `;
}

function renderNoSearchResults(): string {
  return `
    <div class="empty-state compact-empty">
      <div class="empty-visual">${icon("search")}</div>
      <h3>没有找到匹配的主题</h3>
      <p>换个关键词，或清除当前筛选条件。</p>
      <button class="button button-ghost" type="button" data-action="clear-search">清除筛选</button>
    </div>
  `;
}

function renderDiagnosticsView(): string {
  const checks = [
    { label: "Codex 桌面端", detail: state.status.codexInstalled ? "已检测到兼容安装" : "未找到 Codex，请先安装或启动", ok: state.status.codexInstalled, idle: false },
    { label: "Dream Skin 组件", detail: state.status.engineAvailable ? "已随 Manager 提供，无需单独安装" : "组件缺失，请重新安装 Manager", ok: state.status.engineAvailable, idle: false },
    { label: "换肤启动配置", detail: state.status.engineConfigured ? "已配置；可以启动或恢复换肤会话" : "未启用；当前保持 Codex 官方外观", ok: state.status.engineConfigured, idle: !state.status.engineConfigured },
    { label: "兼容运行时", detail: state.status.nodeReady ? `运行环境准备就绪${state.status.runtimeVersion ? ` · ${state.status.runtimeVersion}` : ""}` : state.status.runtimeCompatibilityMessage ?? "未找到满足当前平台能力声明的 Node.js 或内置运行时", ok: state.status.nodeReady, idle: false },
    { label: "换肤会话", detail: state.status.hotSwitchReady ? "已连接，可直接切换主题" : state.status.sessionRunning ? "watcher 已启动，正在等待 Codex 端点" : state.status.skinActive ? "会话记录存在，但 watcher 未运行" : "当前没有换肤会话", ok: state.status.hotSwitchReady, idle: !state.status.sessionRunning && !state.status.skinActive },
  ];
  return `
    <div class="content diagnostics-view">
      <section class="diagnostic-summary status-${statusTone()}">
        <div class="diagnostic-orb"><span>${state.status.hotSwitchReady ? icon("spark") : icon("activity")}</span></div>
        <div class="diagnostic-summary-copy">
          <p class="eyebrow">CURRENT STATUS</p>
          <h2>${escapeHtml(statusText())}</h2>
          <p>${escapeHtml(statusDescription())}</p>
        </div>
        <div class="diagnostic-summary-actions">
          ${state.status.engineAvailable && !state.status.engineConfigured ? `<button class="button button-primary" type="button" data-action="install-engine" ${state.busy ? "disabled" : ""}>${state.busy === "install" ? '<span class="spinner"></span>' : icon("download")} 启用换肤环境</button>` : ""}
          <button class="button button-secondary" type="button" data-action="refresh" ${state.busy ? "disabled" : ""}>${icon("refresh")} 重新检测</button>
        </div>
      </section>
      <div class="diagnostic-grid">
        <section class="panel health-panel">
          <div class="panel-heading"><div><h2>环境检查</h2><p>${escapeHtml(formatPlatform(state.status.platform))} · 本机检测结果</p></div><span class="score-ring">${checks.filter((check) => check.ok || check.idle).length}/${checks.length}</span></div>
          <div class="check-list">
            ${checks.map((check) => `
              <div class="check-row">
                <span class="check-icon ${check.ok ? "is-ok" : check.idle ? "is-idle" : "is-warning"}">${check.ok ? icon("check") : check.idle ? icon("info") : "!"}</span>
                <div><strong>${escapeHtml(check.label)}</strong><p>${escapeHtml(check.detail)}</p></div>
                <span class="check-result">${check.ok ? "正常" : check.idle ? "待启用" : "需处理"}</span>
              </div>
            `).join("")}
          </div>
        </section>
        <section class="panel action-panel">
          <div class="panel-heading"><div><h2>维护工具</h2><p>遇到显示问题时从这里开始</p></div></div>
          <button class="maintenance-item" type="button" data-action="refresh">
            <span>${icon("refresh")}</span><div><strong>刷新运行状态</strong><p>重新检查 Codex、引擎与当前皮肤</p></div>${icon("arrow")}
          </button>
          <button class="maintenance-item" type="button" data-action="install-engine" ${state.busy || state.status.skinActive || !state.status.engineAvailable ? "disabled" : ""}>
            <span>${icon("download")}</span><div><strong>${state.status.skinActive ? "已有换肤会话记录" : state.status.engineConfigured ? "修复换肤环境" : "启用换肤环境"}</strong><p>${state.status.skinActive ? "如需重新配置，请先恢复官方外观" : "重新写入本地启动配置"}</p></div>${icon("arrow")}
          </button>
          <button class="maintenance-item danger" type="button" data-action="request-restore" ${!(state.status.engineConfigured || state.status.skinActive) || state.busy ? "disabled" : ""}>
            <span>${icon("rotate")}</span><div><strong>恢复 Codex 官方外观</strong><p>停用注入并恢复已备份的配置</p></div>${icon("arrow")}
          </button>
        </section>
      </div>
      <section class="panel system-panel">
        <div class="panel-heading"><div><h2>诊断信息</h2><p>需要排查问题时，可把这些信息提供给维护者</p></div></div>
        <dl class="system-list">
          <div><dt>平台</dt><dd>${escapeHtml(formatPlatform(state.status.platform))}</dd></div>
          <div><dt>活动主题</dt><dd>${escapeHtml(selectedActiveThemeName())}</dd></div>
          <div><dt>运行模式</dt><dd>${state.status.hotSwitchReady ? "本机回环 · 热切换" : state.status.sessionRunning ? "本机回环 · 连接中" : state.status.engineConfigured ? "本机回环 · 待启动" : "官方外观 · 未启用"}</dd></div>
          <div><dt>日志位置</dt><dd class="path-value"><span title="${escapeAttr(state.status.logsPath ?? "暂无日志路径")}">${escapeHtml(state.status.logsPath ?? "暂无日志路径")}</span>${state.status.logsPath ? `<button class="mini-icon-button" type="button" data-action="copy-logs" aria-label="复制日志路径">${icon("copy")}</button>` : ""}</dd></div>
        </dl>
        <div class="privacy-strip">${icon("shield")} <span><strong>隐私说明：</strong>管理器不会上传图片、主题或 Codex 配置；所有操作都在本机完成。</span></div>
      </section>
    </div>
  `;
}

function selectedActiveThemeName(): string {
  const active = state.themes.find(themeIsActive);
  return active?.name ?? (state.status.skinActive ? "自定义主题" : "官方外观");
}

function renderOnboarding(): string {
  const titles = ["检查运行环境", "先了解安全边界", "添加你的第一个主题", "选择并应用主题"];
  return `
    <div class="modal-backdrop" data-modal="onboarding">
      <section class="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <button class="modal-close" type="button" data-action="close-guide" aria-label="关闭使用引导">${icon("close")}</button>
        <aside class="onboarding-aside">
          <div class="onboarding-brand"><span>${icon("spark")}</span><div><strong>Dream Skin</strong><small>两分钟完成设置</small></div></div>
          <ol class="step-list">
            ${titles.map((title, index) => {
              const step = index + 1;
              const statusClass = step === state.onboardingStep ? "is-current" : step < state.onboardingStep ? "is-done" : "";
              return `<li class="${statusClass}"><span>${step < state.onboardingStep ? icon("check") : step}</span><div><small>步骤 ${step}</small><strong>${title}</strong></div></li>`;
            }).join("")}
          </ol>
          <div class="onboarding-aside-note">${icon("shield")} 随时可以一键恢复官方外观</div>
        </aside>
        <div class="onboarding-main">
          <div class="mobile-progress" aria-label="引导进度"><span style="width:${state.onboardingStep * 25}%"></span></div>
          <div class="onboarding-content">
            <p class="step-eyebrow">步骤 ${state.onboardingStep} / 4</p>
            <h2 id="onboarding-title" tabindex="-1">${titles[state.onboardingStep - 1]}</h2>
            ${renderOnboardingStep()}
          </div>
          ${renderOnboardingFooter()}
        </div>
      </section>
    </div>
  `;
}

function renderOnboardingStep(): string {
  switch (state.onboardingStep) {
    case 1:
      return renderOnboardingEnvironment();
    case 2:
      return renderOnboardingSafety();
    case 3:
      return renderOnboardingAdd();
    default:
      return renderOnboardingApply();
  }
}

function renderOnboardingEnvironment(): string {
  const checks = [
    { label: "Codex 桌面端", detail: state.status.codexInstalled ? "已找到，可以继续" : "暂未检测到，请确认已安装 Codex", ok: state.status.codexInstalled },
    { label: "系统平台", detail: formatPlatform(state.status.platform), ok: state.status.connected },
    { label: "Dream Skin 组件", detail: state.status.engineAvailable ? "已随 Manager 提供" : "组件缺失，请重新安装 Manager", ok: state.status.engineAvailable },
    { label: "换肤启动配置", detail: state.status.engineConfigured ? "已经配置" : "当前是官方外观，可一键启用", ok: state.status.engineConfigured },
    { label: "运行环境", detail: state.status.nodeReady ? "依赖环境准备就绪" : "启用或修复环境后会自动检测", ok: state.status.nodeReady },
  ];
  return `
    <p class="onboarding-lead">我们先确认 Codex 和本地换肤组件是否准备就绪。</p>
    <div class="setup-checks">
      ${checks.map((check) => `<div class="setup-check"><span class="${check.ok ? "is-ok" : "is-warning"}">${check.ok ? icon("check") : "!"}</span><div><strong>${escapeHtml(check.label)}</strong><p>${escapeHtml(check.detail)}</p></div></div>`).join("")}
    </div>
    ${!canApplyTheme() ? `<button class="inline-action" type="button" data-action="install-engine" ${state.busy || !state.status.codexInstalled || !state.status.engineAvailable ? "disabled" : ""}>${state.busy === "install" ? '<span class="spinner"></span>' : icon("download")} ${state.status.engineConfigured ? "修复换肤环境" : "启用换肤环境"} <span>推荐</span></button>` : `<div class="success-callout">${icon("check")} 环境已准备好，可以继续。</div>`}
  `;
}

function renderOnboardingSafety(): string {
  return `
    <p class="onboarding-lead">Dream Skin 通过本机调试连接为 Codex 加载视觉样式。了解这三点，就能放心使用。</p>
    <div class="safety-cards">
      <article><span>${icon("shield")}</span><div><strong>不修改官方程序</strong><p>不会替换 Codex 的 app、签名或核心文件。</p></div></article>
      <article><span>${icon("rotate")}</span><div><strong>应用前自动备份</strong><p>配置出现异常时，可以快速恢复官方外观。</p></div></article>
      <article><span>${icon("activity")}</span><div><strong>仅连接本机回环</strong><p>换肤会话不会暴露到局域网或互联网。</p></div></article>
    </div>
    <div class="warning-callout"><span>${icon("info")}</span><p><strong>小提醒</strong>换肤运行期间请勿把调试端口开放给其他设备；不用皮肤时可随时点击“恢复官方”。</p></div>
  `;
}

function renderOnboardingAdd(): string {
  return `
    <p class="onboarding-lead">用自己的图片快速生成，或导入朋友分享的完整主题包。</p>
    <div class="import-options">
      <button type="button" data-action="add-image" ${state.busy ? "disabled" : ""}>
        <span class="option-icon image-option">${icon("image")}</span>
        <strong>从图片创建</strong><p>按通用人物构图裁切并自动提取明暗色板；这不是角色图片生成器。</p><b>${icon("plus")} 选择图片</b>
      </button>
      <button type="button" data-action="import-theme" ${state.busy ? "disabled" : ""}>
        <span class="option-icon bundle-option">${icon("upload")}</span>
        <strong>导入主题包</strong><p>打开他人分享的 <code>.codexskin</code>，自动校验并加入主题库。</p><b>${icon("upload")} 选择主题包</b>
      </button>
    </div>
    <div class="format-tip">${icon("info")} 推荐 2560×1440：左侧 42% 保持低细节，主体放在右侧 52–92%，不要文字、水印或假 UI；单图不超过 16 MB。</div>
    ${state.themes.length ? `<div class="success-callout">${icon("check")} 主题库已有 ${state.themes.length} 个主题，可以继续选择并应用。</div>` : ""}
  `;
}

function renderOnboardingApply(): string {
  const selected = selectedTheme();
  const themes = selected
    ? [selected, ...state.themes.filter((theme) => theme.selectionKey !== selected.selectionKey)].slice(0, 6)
    : state.themes.slice(0, 6);
  return `
    <p class="onboarding-lead">${state.status.hotSwitchReady ? "当前换肤会话已就绪，选择主题后会立即切换，无需重启。" : "第一次启用需要安全重启 Codex 一次；之后可在换肤会话中立即切换主题。"}</p>
    ${themes.length ? `
      <div class="onboarding-theme-list" role="listbox" aria-label="选择要应用的主题">
        ${themes.map((theme) => `<button type="button" role="option" aria-selected="${themeMatchesKey(theme, state.selectedThemeId)}" class="${themeMatchesKey(theme, state.selectedThemeId) ? "is-selected" : ""} ${theme.compatible ? "" : "is-incompatible"}" data-theme-id="${escapeAttr(theme.selectionKey)}">${renderThemePreview(theme, "onboarding-theme-image")}<span><strong>${escapeHtml(theme.name)}</strong><small>${escapeHtml(themeSourceLabel(theme.source))}${theme.readOnly ? " · 只读" : ""}</small>${theme.compatible ? "" : `<em class="onboarding-compatibility">不兼容：${escapeHtml(unsupportedFeatureSummary(theme) || "未知能力")}</em>`}</span><i>${theme.compatible ? icon("check") : icon("shield")}</i></button>`).join("")}
      </div>
      ${selected ? !selected.compatible ? `<div class="warning-callout"><span>${icon("shield")}</span><p><strong>${escapeHtml(selected.name)} 与当前运行时不兼容</strong>缺少：${escapeHtml(unsupportedFeatureSummary(selected) || "未知能力")}。可在主题库中另存降级副本并移除这些字段。</p></div>` : canApplyTheme(selected) ? `<div class="ready-callout"><span>${icon("spark")}</span><div><strong>${escapeHtml(selected.name)} 已准备好</strong><p>${state.status.hotSwitchReady ? "点击“立即应用”，当前 Codex 会直接刷新主题。" : "点击“启用并完成”，Codex 会安全重启一次并建立热切换会话。"}</p></div></div>` : `<div class="warning-callout"><span>${icon("info")}</span><p><strong>还差一步</strong>返回第 1 步完成环境检查，之后才能安全应用主题。</p></div>` : ""}
    ` : `
      <div class="mini-empty"><span>${icon("image")}</span><div><strong>还没有可应用的主题</strong><p>返回上一步添加图片或导入主题包。</p></div></div>
    `}
  `;
}

function renderOnboardingFooter(): string {
  const isLast = state.onboardingStep === 4;
  const selected = selectedTheme();
  const blockedByEnvironment = state.onboardingStep === 1 ? !canApplyTheme()
    : isLast ? !selected || !canApplyTheme(selected) : false;
  return `
    <footer class="onboarding-footer">
      <button class="button button-ghost" type="button" data-action="guide-back" ${state.onboardingStep === 1 ? "disabled" : ""}>上一步</button>
      <div>
        ${isLast ? `<button class="text-button" type="button" data-action="finish-later">稍后再应用</button>` : ""}
        <button class="button button-primary" type="button" data-action="${isLast ? "apply-and-finish" : "guide-next"}" ${blockedByEnvironment || Boolean(state.busy) ? "disabled" : ""}>
          ${state.busy === "apply" ? '<span class="spinner"></span>' : isLast ? icon("spark") : ""}${isLast ? state.status.hotSwitchReady ? "立即应用" : "启用并完成" : "继续"}${!isLast ? icon("arrow") : ""}
        </button>
      </div>
    </footer>
  `;
}

function renderApplyRestartConfirmation(): string {
  const theme = selectedTheme();
  return `
    <div class="modal-backdrop confirm-backdrop">
      <section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="apply-restart-title">
        <span class="confirm-icon">${icon("spark")}</span>
        <h2 id="apply-restart-title" tabindex="-1">重启一次 Codex 并启用主题？</h2>
        <p>当前没有在线的换肤会话。请先保存尚未发送的输入；确认后会关闭并重新打开 Codex，启用 ${escapeHtml(theme?.name ?? "所选主题")}。之后切换主题无需重启。</p>
        <div class="confirm-actions">
          <button class="button button-ghost" type="button" data-action="cancel-apply-restart">取消</button>
          <button class="button button-primary" type="button" data-action="confirm-apply-restart">重启并启用</button>
        </div>
      </section>
    </div>
  `;
}
function renderRestoreConfirmation(): string {
  return `
    <div class="modal-backdrop confirm-backdrop">
      <section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="restore-title">
        <span class="confirm-icon">${icon("rotate")}</span>
        <h2 id="restore-title" tabindex="-1">恢复 Codex 官方外观？</h2>
        <p>这会关闭并重新打开当前 Codex 窗口，然后恢复已备份的外观配置。请先保存未提交的输入；你的主题库会继续保留。</p>
        <div class="confirm-actions">
          <button class="button button-ghost" type="button" data-action="cancel-restore">取消</button>
          <button class="button button-danger" type="button" data-action="confirm-restore">确认恢复</button>
        </div>
      </section>
    </div>
  `;
}

function renderInstallConfirmation(): string {
  return `
    <div class="modal-backdrop confirm-backdrop">
      <section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="install-title">
        <span class="confirm-icon">${icon("download")}</span>
        <h2 id="install-title" tabindex="-1">请先手动关闭 Codex</h2>
        <p>上游安装器要求 Codex 在配置期间保持关闭。请保存尚未发送的输入并手动退出所有 Codex / ChatGPT 桌面窗口；Manager 不会代替你强制结束进程。</p>
        <div class="confirm-actions">
          <button class="button button-ghost" type="button" data-action="cancel-install">取消</button>
          <button class="button button-primary" type="button" data-action="confirm-install">我已关闭，继续启用</button>
        </div>
      </section>
    </div>
  `;
}

function showToast(message: string, tone: ToastTone = "info", detail = ""): void {
  const toast = document.createElement("div");
  toast.className = `toast toast-${tone}`;
  toast.setAttribute("role", tone === "error" ? "alert" : "status");
  const toastIcon: IconName = tone === "success" ? "check" : tone === "error" ? "close" : tone === "warning" ? "info" : "spark";
  toast.innerHTML = `<span class="toast-icon">${icon(toastIcon)}</span><div><strong>${escapeHtml(message)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div><button type="button" aria-label="关闭通知">${icon("close")}</button>`;
  toast.querySelector("button")?.addEventListener("click", () => dismissToast(toast));
  toastRegion.append(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  window.setTimeout(() => dismissToast(toast), tone === "error" ? 6500 : 4200);
}

function dismissToast(toast: HTMLElement): void {
  if (!toast.isConnected) return;
  toast.classList.remove("is-visible");
  window.setTimeout(() => toast.remove(), 220);
}

let statusRequestInFlight: Promise<AppStatus> | null = null;
let statusRefreshTimer: number | undefined;
let statusRefreshFailures = 0;
let managerWindowFocused = true;
const STATUS_REFRESH_BASE_MS = 6000;
const STATUS_REFRESH_MAX_MS = 60000;

function requestAppStatus(): Promise<AppStatus> {
  if (!statusRequestInFlight) {
    const request = invoke<unknown>("get_app_status").then(normalizeStatus);
    statusRequestInFlight = request.finally(() => {
      statusRequestInFlight = null;
    });
  }
  return statusRequestInFlight;
}

function clearStatusRefreshTimer(): void {
  if (statusRefreshTimer !== undefined) {
    window.clearTimeout(statusRefreshTimer);
    statusRefreshTimer = undefined;
  }
}

function scheduleStatusRefresh(delay?: number): void {
  clearStatusRefreshTimer();
  if (document.hidden || !managerWindowFocused) return;
  const retryDelay = Math.min(
    STATUS_REFRESH_MAX_MS,
    STATUS_REFRESH_BASE_MS * 2 ** Math.min(statusRefreshFailures, 4),
  );
  statusRefreshTimer = window.setTimeout(() => {
    statusRefreshTimer = undefined;
    void refreshStatusSilently();
  }, delay ?? retryDelay);
}

function statusFingerprint(status: AppStatus): string {
  return JSON.stringify(status);
}

function applyStatus(nextStatus: AppStatus): void {
  const previousActiveKeys = state.themes.filter((theme) => theme.active).map((theme) => theme.selectionKey);
  state.status = nextStatus;
  state.themes = withResolvedActiveThemes(
    state.themes,
    nextStatus.activeThemeId,
    previousActiveKeys,
    true,
  );
}

async function loadData(showLoading = false): Promise<void> {
  if (showLoading) {
    state.loading = true;
    renderApp();
  }
  const [statusResult, themesResult] = await Promise.allSettled([
    requestAppStatus(),
    invoke<unknown>("list_themes"),
  ]);
  const errors: string[] = [];
  if (statusResult.status === "fulfilled") {
    state.status = statusResult.value;
    statusRefreshFailures = 0;
  } else {
    state.status = { ...emptyStatus, stateMessage: "\u65e0\u6cd5\u8fde\u63a5\u672c\u5730\u7ba1\u7406\u670d\u52a1" };
    errors.push(`\u72b6\u6001\u68c0\u6d4b\u5931\u8d25\uff1a${errorMessage(statusResult.reason)}`);
    statusRefreshFailures += 1;
  }
  const previousActiveKeys = state.themes.filter((theme) => theme.active).map((theme) => theme.selectionKey);
  if (themesResult.status === "fulfilled") {
    const nextThemes = extractThemes(themesResult.value);
    state.themes = withResolvedActiveThemes(
      nextThemes,
      state.status.activeThemeId,
      previousActiveKeys,
      true,
    );
  } else {
    state.themes = withResolvedActiveThemes(state.themes, state.status.activeThemeId, previousActiveKeys, true);
    errors.push(`\u4e3b\u9898\u8bfb\u53d6\u5931\u8d25\uff1a${errorMessage(themesResult.reason)}`);
  }
  const selectedStillExists = state.themes.some((theme) => themeMatchesKey(theme, state.selectedThemeId));
  if (!selectedStillExists) {
    state.selectedThemeId =
      state.themes.find(themeIsActive)?.selectionKey ??
      state.themes[0]?.selectionKey ??
      null;
  }
  state.error = errors.length ? errors.join("\uff1b") : null;
  state.loading = false;
  renderApp();
  scheduleStatusRefresh();
}

async function refreshStatusSilently(): Promise<void> {
  if (state.loading || state.busy || document.hidden || !managerWindowFocused) {
    scheduleStatusRefresh();
    return;
  }
  try {
    const nextStatus = await requestAppStatus();
    const changed = statusFingerprint(nextStatus) !== statusFingerprint(state.status);
    statusRefreshFailures = 0;
    if (changed) {
      applyStatus(nextStatus);
      if (!state.editorDraft) renderApp();
    }
  } catch {
    statusRefreshFailures += 1;
  } finally {
    scheduleStatusRefresh();
  }
}

async function runMutation(
  busyKey: string,
  command: string,
  args: UnknownRecord,
  fallbackMessage: string,
): Promise<boolean> {
  if (state.busy) return false;
  state.busy = busyKey;
  renderApp();
  try {
    const raw = await invoke<unknown>(command, args);
    const result = normalizeResult(raw, fallbackMessage);
    if (result.cancelled) {
      showToast("操作已取消", "info", result.message);
      await loadData(false);
      return false;
    }
    if (!result.ok) throw new Error(result.message);
    showToast(result.message || fallbackMessage, "success");
    if (result.restartRequired) {
      showToast("需要重启 Codex", "warning", "重新打开 Codex 后，新设置会完整生效。");
    }
    await loadData(false);
    return true;
  } catch (error) {
    try {
      await loadData(false);
    } catch {
      // Preserve the original operation error as the user-facing result.
    }
    showToast("操作没有完成", "error", localizedMutationError(error));
    return false;
  } finally {
    state.busy = null;
    renderApp();
  }
}

async function addImageTheme(): Promise<void> {
  try {
    const chosen = await open({
      multiple: false,
      directory: false,
      title: "选择一张主题背景图",
      filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (typeof chosen !== "string") return;
    const fileName = chosen.split(/[\\/]/).pop() ?? "我的主题";
    const name = fileName.replace(/\.[^.]+$/, "") || "我的主题";
    const before = new Set(state.themes.map((theme) => theme.selectionKey));
    const succeeded = await runMutation("add", "add_theme_from_image", { imagePath: chosen, name }, "主题已添加");
    if (succeeded) {
      const added = state.themes.find((theme) => !before.has(theme.selectionKey));
      state.selectedThemeId = added?.selectionKey ?? state.selectedThemeId;
      if (added && !state.onboardingOpen) openThemeEditor(added);
      else renderApp();
    }
  } catch (error) {
    showToast("无法打开图片", "error", errorMessage(error));
  }
}

async function selectEditorReplacementImage(): Promise<void> {
  const draft = state.editorDraft;
  if (!draft || state.busy) return;
  try {
    const chosen = await open({
      multiple: false,
      directory: false,
      title: "\u9009\u62e9\u4e3b\u9898\u80cc\u666f\u56fe",
      filters: [{ name: "\u56fe\u7247", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (typeof chosen !== "string") return;
    const sourceId = draft.sourceId;
    state.busy = "inspect-image";
    renderApp();
    const raw = await invoke<unknown>("inspect_theme_image", { imagePath: chosen });
    if (!state.editorDraft || state.editorDraft.sourceId !== sourceId) return;
    const inspection = normalizeInspectedThemeImage(raw, chosen);
    state.editorDraft.replacementImagePath = chosen;
    state.editorDraft.replacementPreviewPath = inspection.previewPath;
    state.editorDraft.replacementPreviewUrl = toAssetUrl(inspection.previewPath || chosen);
    state.editorDraft.replacementImageMetadata = inspection.imageMetadata;
    state.editorDraft.inspectedImageColors = canonicalizeColorTokens(inspection.colors);
    state.editorDraft.colors = previewColorTokens(state.editorDraft);
    if (inspection.imageMetadata) {
      const metadata = inspection.imageMetadata;
      if (state.editorDraft.explicitArt?.focusX === undefined) state.editorDraft.focusX = metadata.suggestedFocusX;
      if (state.editorDraft.explicitArt?.focusY === undefined) state.editorDraft.focusY = metadata.suggestedFocusY;
      if (state.editorDraft.explicitArt?.safeArea === undefined) state.editorDraft.safeArea = metadata.suggestedSafeArea;
      if (state.editorDraft.explicitArt?.taskMode === undefined) state.editorDraft.taskMode = metadata.suggestedTaskMode;
    }
    showToast("\u56fe\u7247\u5df2\u52a0\u8f7d", "success", "\u53ef\u4ee5\u7ee7\u7eed\u8c03\u6574\uff0c\u6216\u4e00\u952e\u4f7f\u7528\u56fe\u7247\u8272\u677f\u3002");
  } catch (error) {
    showToast("\u65e0\u6cd5\u68c0\u67e5\u56fe\u7247", "error", errorMessage(error));
  } finally {
    if (state.busy === "inspect-image") state.busy = null;
    renderApp();
  }
}

async function importThemeBundle(): Promise<void> {
  try {
    const chosen = await open({
      multiple: false,
      directory: false,
      title: "导入 Dream Skin 主题包",
      filters: [{ name: "Codex Dream Skin", extensions: ["codexskin"] }],
    });
    if (typeof chosen !== "string") return;
    const before = new Set(state.themes.map((theme) => theme.selectionKey));
    const succeeded = await runMutation("import", "import_theme_bundle", { path: chosen }, "主题包已安全导入");
    if (succeeded) {
      state.selectedThemeId = state.themes.find((theme) => !before.has(theme.selectionKey))?.selectionKey ?? state.selectedThemeId;
      renderApp();
    }
  } catch (error) {
    showToast("无法导入主题包", "error", errorMessage(error));
  }
}

async function exportSelectedTheme(): Promise<void> {
  const theme = selectedTheme();
  if (!theme) return;
  try {
    const safeName = theme.name.replace(/[\\/:*?"<>|]/g, "-").trim() || "dream-skin";
    const destination = await save({
      title: "导出主题包",
      defaultPath: `${safeName}.codexskin`,
      filters: [{ name: "Codex Dream Skin", extensions: ["codexskin"] }],
    });
    if (!destination) return;
    await runMutation("export", "export_theme_bundle", { themeId: theme.selectionKey, destination }, "主题包已导出，可以分享给朋友了");
  } catch (error) {
    showToast("无法导出主题包", "error", errorMessage(error));
  }
}

async function applySelectedTheme(finishGuide = false, restartExisting = false, opener?: Element): Promise<void> {
  const theme = selectedTheme();
  if (!theme) {
    showToast("请先选择一个主题", "warning");
    return;
  }
  if (!theme.compatible) {
    showToast("当前运行时不兼容此主题", "warning", `缺少：${unsupportedFeatureSummary(theme) || "未知主题能力"}`);
    return;
  }
  if (!canApplyTheme(theme)) {
    showToast("请先完成环境检查", "warning", "启用或修复换肤环境后再应用主题。");
    return;
  }
  if (!state.status.hotSwitchReady && !restartExisting) {
    state.confirmApplyRestart = true;
    state.pendingApplyFinishGuide = finishGuide;
    rememberModalOpener(opener);
    renderApp();
    return;
  }
  const succeeded = await runMutation(
    "apply",
    "apply_theme",
    { themeId: theme.selectionKey, restartExisting },
    `${theme.name} 已应用`,
  );
  if (succeeded && finishGuide) {
    markOnboardingDone();
    state.onboardingOpen = false;
    renderApp();
    restoreModalOpener('[data-action="open-guide"]');
  }
}
async function restoreOfficial(): Promise<void> {
  state.confirmRestore = false;
  renderApp();
  restoreModalOpener();
  await runMutation("restore", "restore_official", {}, "已恢复 Codex 官方外观");
}

async function installEngine(): Promise<void> {
  state.confirmInstall = false;
  renderApp();
  restoreModalOpener();
  await runMutation("install", "install_engine", {}, state.status.engineConfigured ? "换肤环境已修复" : "换肤环境已启用");
}

function openGuide(opener?: Element): void {
  rememberModalOpener(opener);
  state.onboardingOpen = true;
  state.onboardingStep = 1;
  renderApp();
}

function closeGuide(markDone = false): void {
  if (markDone) markOnboardingDone();
  state.onboardingOpen = false;
  renderApp();
  restoreModalOpener('[data-action="open-guide"]');
}

function showPreviewFeedback(anchor: HTMLElement, message: string): void {
  const preview = anchor.closest<HTMLElement>(".editor-theme-preview");
  const feedback = preview?.querySelector<HTMLElement>("[data-preview-feedback]");
  if (!feedback) return;
  feedback.textContent = message;
  feedback.hidden = false;
  feedback.classList.add("is-visible");
}

app.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement;
  const windowActionButton = target.closest<HTMLButtonElement>("[data-window-action]");
  if (windowActionButton?.dataset.windowAction) {
    await handleWindowAction(windowActionButton.dataset.windowAction);
    return;
  }
  const previewModeButton = target.closest<HTMLButtonElement>("[data-preview-mode]");
  if (previewModeButton?.dataset.previewMode && state.editorDraft) {
    const mode = previewModeButton.dataset.previewMode as ThemePreviewMode;
    if (PREVIEW_MODES.some((item) => item.key === mode)) {
      state.editorDraft.previewMode = mode;
      renderApp();
    }
    return;
  }

  const colorModeButton = target.closest<HTMLButtonElement>("[data-editor-color-mode]");
  if (colorModeButton?.dataset.editorColorMode && state.editorDraft && !colorModeButton.disabled) {
    const nextMode = colorModeButton.dataset.editorColorMode as ThemeColorMode;
    if (selectEditorColorMode(nextMode)) renderApp();
    return;
  }

  const clearColorButton = target.closest<HTMLButtonElement>("[data-editor-color-clear]");
  if (clearColorButton?.dataset.editorColorClear && state.editorDraft && !clearColorButton.disabled) {
    const key = clearColorButton.dataset.editorColorClear;
    if (isThemeColorKey(key)) {
      const nextExplicit = { ...(state.editorDraft.explicitColors ?? {}) };
      delete nextExplicit[key];
      state.editorDraft.explicitColors = nextExplicit;
      state.editorDraft.colors = previewColorTokens(state.editorDraft);
      renderApp();
    }
    return;
  }

  const previewControl = target.closest<HTMLElement>("[data-preview-action]");
  if (previewControl && state.editorDraft) {
    const previewAction = previewControl.dataset.previewAction;
    if (previewAction === "select-nav") {
      previewControl.closest(".sim-sidebar")?.querySelectorAll(".is-selected").forEach((element) => {
        element.classList.remove("is-selected");
      });
      previewControl.classList.add("is-selected");
    } else if (previewAction === "select-card") {
      const group = previewControl.closest(".sim-card-grid, .sim-composer, .sim-content");
      group?.querySelectorAll<HTMLElement>('[data-preview-action="select-card"].is-selected').forEach((element) => {
        element.classList.remove("is-selected");
      });
      previewControl.classList.add("is-selected");
    } else if (previewAction === "toggle" && previewControl instanceof HTMLButtonElement && !previewControl.disabled) {
      const enabled = previewControl.classList.toggle("is-on");
      previewControl.setAttribute("aria-checked", String(enabled));
    } else if (previewAction === "open-menu" && previewControl instanceof HTMLButtonElement) {
      const popover = previewControl.closest(".sim-header")?.querySelector<HTMLElement>("[data-preview-popover]");
      if (popover) {
        const opening = popover.hidden;
        popover.hidden = !opening;
        previewControl.setAttribute("aria-expanded", String(opening));
        if (opening) {
          const menuItems = Array.from(popover.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
          menuItems.forEach((item, index) => { item.tabIndex = index === 0 ? 0 : -1; });
          requestAnimationFrame(() => menuItems[0]?.focus());
        } else {
          previewControl.focus();
        }
      }
    } else if (previewAction === "menu-command") {
      const header = previewControl.closest<HTMLElement>(".sim-header");
      const popover = header?.querySelector<HTMLElement>("[data-preview-popover]");
      const opener = header?.querySelector<HTMLButtonElement>('[data-preview-action="open-menu"]');
      showPreviewFeedback(previewControl, previewControl.dataset.previewFeedbackMessage ?? "模拟操作已完成");
      if (popover) popover.hidden = true;
      opener?.setAttribute("aria-expanded", "false");
      opener?.focus();
    } else if (previewAction === "send-message") {
      const composer = previewControl.closest<HTMLElement>(".sim-composer");
      composer?.classList.add("is-sent");
      const composerText = composer?.querySelector<HTMLElement>("[data-preview-composer-text]");
      if (composerText) composerText.textContent = "已发送（模拟）";
      showPreviewFeedback(previewControl, "消息已在预览中模拟发送");
    } else if (previewAction === "focus-composer") {
      previewControl.classList.add("is-focused");
      previewControl.focus();
    }
    return;
  }

  const filterButton = target.closest<HTMLElement>("[data-filter]");
  if (filterButton?.dataset.filter) {
    state.filter = filterButton.dataset.filter as ThemeFilter;
    const visible = filteredThemes();
    if (!visible.some((theme) => themeMatchesKey(theme, state.selectedThemeId))) {
      state.selectedThemeId = visible[0]?.selectionKey ?? null;
    }
    renderApp();
    return;
  }

  const actionButton = target.closest<HTMLElement>("[data-action]");
  if (actionButton) {
    const action = actionButton.dataset.action;
    switch (action) {
      case "show-themes":
        state.view = "themes";
        renderApp();
        return;
      case "show-diagnostics":
        state.view = "diagnostics";
        renderApp();
        return;
      case "refresh":
        if (state.busy) return;
        state.busy = "refresh";
        renderApp();
        await loadData(false);
        state.busy = null;
        renderApp();
        showToast("状态已刷新", "info");
        return;
      case "add-image":
        await addImageTheme();
        return;
      case "import-theme":
        await importThemeBundle();
        return;
      case "open-theme-editor": {
        const theme = selectedTheme();
        if (theme) openThemeEditor(theme, actionButton);
        return;
      }
      case "close-theme-editor":
        if (state.busy) return;
        state.editorDraft = null;
        renderApp();
        restoreModalOpener();
        return;
      case "editor-fix-contrast":
        if (state.editorDraft) {
          const issues = editorContrastIssues(state.editorDraft);
          let fixed = 0;
          for (const issue of issues) {
            if (!issue.suggestedColor) continue;
            const previous = state.editorDraft.colors[issue.field];
            const formatted = formatEditedThemeColor(issue.suggestedColor, state.status.themeFeatures, previous);
            if (!formatted) continue;
            state.editorDraft.colors[issue.field] = formatted;
            state.editorDraft.explicitColors = { ...(state.editorDraft.explicitColors ?? {}), [issue.field]: formatted };
            fixed += 1;
          }
          renderApp();
          showToast("\u5df2\u5e94\u7528\u53ef\u8bfb\u6027\u5efa\u8bae", "info", `\u5df2\u663e\u5f0f\u8c03\u6574 ${fixed} \u4e2a\u989c\u8272\uff1b\u8bf7\u9884\u89c8\u540e\u518d\u4fdd\u5b58\u3002`);
        }
        return;
      case "editor-clear-appearance":
        if (state.editorDraft) {
          state.editorDraft.appearancePresent = false;
          state.editorDraft.appearanceRemoved = true;
          state.editorDraft.appearance = "auto";
          renderApp();
        }
        return;
      case "editor-restore-appearance":
        if (state.editorDraft) {
          const source = state.themes.find((theme) => themeMatchesKey(theme, state.editorDraft?.sourceId));
          if (source?.appearance) {
            state.editorDraft.appearance = source.appearance;
            state.editorDraft.appearancePresent = true;
            state.editorDraft.appearanceRemoved = false;
            renderApp();
          }
        }
        return;
      case "editor-enable-appearance":
        if (state.editorDraft) {
          state.editorDraft.appearancePresent = true;
          state.editorDraft.appearanceRemoved = false;
          renderApp();
        }
        return;
      case "editor-materialize-colors":
        if (state.editorDraft) {
          if (!materializeFullExplicitColors(state.editorDraft, state.status.themeFeatures)) {
            showToast("无法补齐完整十色", "warning", "请先移除当前运行时不支持的透明色或 palette。");
            return;
          }
          renderApp();
        }
        return;
      case "editor-replace-image":
        await selectEditorReplacementImage();
        return;
      case "editor-use-image-colors":
        if (state.editorDraft?.inspectedImageColors) {
          const encoded = encodeColorTokensForRuntime(state.editorDraft.inspectedImageColors, state.status.themeFeatures);
          if (!encoded) return;
          state.editorDraft.colors = encoded;
          state.editorDraft.explicitColors = { ...encoded };
          state.editorDraft.colorMode = "explicit";
          renderApp();
        }
        return;
      case "editor-use-image-layout":
        if (state.editorDraft) {
          const source = state.themes.find((theme) => themeMatchesKey(theme, state.editorDraft?.sourceId));
          const metadata = source ? currentImageMetadata(state.editorDraft, source) : state.editorDraft.replacementImageMetadata;
          if (metadata) {
            state.editorDraft.focusX = metadata.suggestedFocusX;
            state.editorDraft.focusY = metadata.suggestedFocusY;
            state.editorDraft.safeArea = metadata.suggestedSafeArea;
            state.editorDraft.taskMode = metadata.suggestedTaskMode;
            state.editorDraft.explicitArt = { focusX: metadata.suggestedFocusX, focusY: metadata.suggestedFocusY, safeArea: metadata.suggestedSafeArea, taskMode: metadata.suggestedTaskMode };
            state.editorDraft.artRemoved = false;
            renderApp();
          }
        }
        return;
      case "editor-clear-palette":
        if (state.editorDraft) {
          state.editorDraft.paletteExplicit = false;
          state.editorDraft.paletteRemoved = true;
          state.editorDraft.paletteAccent = automaticPaletteAccent(state.editorDraft);
          state.editorDraft.colors = previewColorTokens(state.editorDraft);
          renderApp();
        }
        return;
      case "editor-clear-art":
        if (state.editorDraft) {
          const source = state.themes.find((theme) => themeMatchesKey(theme, state.editorDraft?.sourceId));
          const metadata = source ? currentImageMetadata(state.editorDraft, source) : state.editorDraft.replacementImageMetadata;
          state.editorDraft.explicitArt = null;
          state.editorDraft.artRemoved = true;
          state.editorDraft.focusX = metadata?.suggestedFocusX ?? 0.5;
          state.editorDraft.focusY = metadata?.suggestedFocusY ?? 0.5;
          state.editorDraft.safeArea = metadata?.suggestedSafeArea ?? "auto";
          state.editorDraft.taskMode = metadata?.suggestedTaskMode ?? "auto";
          renderApp();
        }
        return;
      case "editor-restore-art":
        if (state.editorDraft) {
          const source = state.themes.find((theme) => themeMatchesKey(theme, state.editorDraft?.sourceId));
          if (source?.art) {
            const metadata = currentImageMetadata(state.editorDraft, source);
            state.editorDraft.explicitArt = { ...source.art };
            state.editorDraft.artRemoved = false;
            state.editorDraft.focusX = source.art.focusX ?? metadata?.suggestedFocusX ?? 0.5;
            state.editorDraft.focusY = source.art.focusY ?? metadata?.suggestedFocusY ?? 0.5;
            state.editorDraft.safeArea = source.art.safeArea ?? metadata?.suggestedSafeArea ?? "auto";
            state.editorDraft.taskMode = source.art.taskMode ?? metadata?.suggestedTaskMode ?? "auto";
            renderApp();
          }
        }
        return;
      case "editor-restore-palette":
        if (state.editorDraft) {
          const source = state.themes.find((theme) => themeMatchesKey(theme, state.editorDraft?.sourceId));
          const accent = source?.palette?.accent;
          if (accent) {
            state.editorDraft.paletteAccent = accent;
            state.editorDraft.paletteExplicit = true;
            state.editorDraft.paletteRemoved = false;
            state.editorDraft.colors = previewColorTokens(state.editorDraft);
            renderApp();
          }
        }
        return;
      case "editor-reset-image":
        if (state.editorDraft) {
          state.editorDraft.replacementImagePath = null;
          state.editorDraft.replacementPreviewPath = "";
          state.editorDraft.replacementPreviewUrl = "";
          state.editorDraft.replacementImageMetadata = null;
          state.editorDraft.inspectedImageColors = null;
          const source = state.themes.find((theme) => themeMatchesKey(theme, state.editorDraft?.sourceId));
          if (source) {
            const metadata = source.imageMetadata;
            const sourceArt = state.editorDraft.artRemoved ? null : source.art;
            if (state.editorDraft.explicitArt?.focusX === undefined) state.editorDraft.focusX = sourceArt?.focusX ?? metadata?.suggestedFocusX ?? 0.5;
            if (state.editorDraft.explicitArt?.focusY === undefined) state.editorDraft.focusY = sourceArt?.focusY ?? metadata?.suggestedFocusY ?? 0.5;
            if (state.editorDraft.explicitArt?.safeArea === undefined) state.editorDraft.safeArea = sourceArt?.safeArea ?? metadata?.suggestedSafeArea ?? "auto";
            if (state.editorDraft.explicitArt?.taskMode === undefined) state.editorDraft.taskMode = sourceArt?.taskMode ?? metadata?.suggestedTaskMode ?? "auto";
          }
          state.editorDraft.colors = previewColorTokens(state.editorDraft);
          renderApp();
        }
        return;
      case "export-theme":
        await exportSelectedTheme();
        return;
      case "apply-theme":
        await applySelectedTheme(false, false, actionButton);
        return;
      case "cancel-apply-restart":
        state.confirmApplyRestart = false;
        state.pendingApplyFinishGuide = false;
        renderApp();
        restoreModalOpener();
        return;
      case "confirm-apply-restart": {
        const finishGuide = state.pendingApplyFinishGuide;
        state.confirmApplyRestart = false;
        state.pendingApplyFinishGuide = false;
        renderApp();
        await applySelectedTheme(finishGuide, true);
        restoreModalOpener();
        return;
      }
      case "request-restore":
        rememberModalOpener(actionButton);
        state.confirmRestore = true;
        renderApp();
        return;
      case "cancel-restore":
        state.confirmRestore = false;
        renderApp();
        restoreModalOpener();
        return;
      case "confirm-restore":
        await restoreOfficial();
        return;
      case "install-engine":
        if (state.status.skinActive) {
          showToast("已有换肤会话记录", "info", "如需重新配置，请先恢复官方外观。");
          return;
        }
        rememberModalOpener(actionButton);
        state.confirmInstall = true;
        renderApp();
        return;
      case "cancel-install":
        state.confirmInstall = false;
        renderApp();
        restoreModalOpener();
        return;
      case "confirm-install":
        await installEngine();
        return;
      case "clear-search":
        state.search = "";
        state.filter = "all";
        if (!state.themes.some((theme) => themeMatchesKey(theme, state.selectedThemeId))) {
          state.selectedThemeId = state.themes[0]?.selectionKey ?? null;
        }
        renderApp();
        return;
      case "open-guide":
        openGuide(actionButton);
        return;
      case "close-guide":
        closeGuide();
        return;
      case "guide-back":
        state.onboardingStep = Math.max(1, state.onboardingStep - 1);
        renderApp();
        return;
      case "guide-next":
        state.onboardingStep = Math.min(4, state.onboardingStep + 1);
        renderApp();
        return;
      case "finish-later":
        closeGuide(true);
        return;
      case "apply-and-finish":
        await applySelectedTheme(true, false, actionButton);
        return;
      case "copy-logs":
        if (!state.status.logsPath) return;
        try {
          await navigator.clipboard.writeText(state.status.logsPath);
          showToast("日志路径已复制", "success");
        } catch (error) {
          showToast("复制失败", "error", errorMessage(error));
        }
        return;
    }
  }

  const themeButton = target.closest<HTMLElement>("[data-theme-id]");
  if (themeButton?.dataset.themeId) {
    state.selectedThemeId = themeButton.dataset.themeId;
    renderApp();
  }
});

app.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.id !== "theme-editor-form") return;
  event.preventDefault();
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  const draft = state.editorDraft;
  if (!draft || state.busy) return;
  const contrastIssues = editorContrastIssues(draft);
  if (contrastIssues.length) {
    syncEditorContrastFeedback();
    const firstRow = document.querySelector<HTMLElement>(`[data-editor-color-row="${contrastIssues[0].field}"]`);
    firstRow?.scrollIntoView({ block: "center", behavior: "smooth" });
    firstRow?.querySelector<HTMLInputElement>("[data-editor-color-text]")?.focus();
    showToast("\u6682\u672a\u4fdd\u5b58\uff1a\u8bf7\u5148\u4fee\u590d\u914d\u8272\u53ef\u8bfb\u6027", "warning", contrastIssueSummary(contrastIssues));
    return;
  }
  const before = new Set(state.themes.map((theme) => theme.selectionKey));
  const sourceId = draft.sourceId;
  const createCopy = draft.createCopy;
  if (draft.colorMode === "explicit" && !state.status.themeFeatures.partialColors && !hasCompleteExplicitColors(draft)) {
    showToast("旧运行时需要完整十色", "warning", "请选择“补齐为完整十色”，或切回自适应以移除 colors。");
    return;
  }
  const colors = draft.colorMode === "adaptive" ? null : canonicalizePartialColorTokens(draft.explicitColors);
  const appearance = draft.appearancePresent ? draft.appearance : null;
  const art = draft.explicitArt ? normalizeThemeArt(draft.explicitArt) : null;
  const palette = draft.paletteExplicit ? { accent: canonicalPaletteColor(draft.paletteAccent, draft.colors.accent) } : null;
  const succeeded = await runMutation(
    "edit",
    "save_theme_draft",
    {
      themeId: sourceId,
      draft: {
        name: draft.name.trim(),
        brandSubtitle: draft.brandSubtitle.trim(),
        tagline: draft.tagline.trim(),
        projectPrefix: draft.projectPrefix,
        projectLabel: draft.projectLabel,
        statusText: draft.statusText.trim(),
        quote: draft.quote.trim(),
        promoTitle: draft.promoTitle.trim(),
        promoSub: draft.promoSub.trim(),
        promoUrl: draft.promoUrl.trim(),
        colors,
        appearance,
        art,
        palette,
        replacementImagePath: draft.replacementImagePath,
      },
      createCopy,
    },
    createCopy ? "\u4e3b\u9898\u526f\u672c\u5df2\u4fdd\u5b58" : "\u4e3b\u9898\u4fee\u6539\u5df2\u4fdd\u5b58",
  );
  if (!succeeded) return;
  state.editorDraft = null;
  state.filter = "all";
  state.selectedThemeId = createCopy
    ? state.themes.find((theme) => !before.has(theme.selectionKey))?.selectionKey ?? sourceId
    : sourceId;
  renderApp();
  restoreModalOpener('[data-action="open-theme-editor"]');
});

app.addEventListener("input", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement)) return;
  const draft = state.editorDraft;

  const field = input.dataset.editorField;
  if (draft && field && isEditorDraftTextKey(field)) {
    draft[field] = input.value;
    syncThemeEditorPreview();
    return;
  }

  if (draft && input instanceof HTMLInputElement) {
    if (input.matches("[data-editor-palette-swatch]")) {
      const nextRgb = parseThemeColor(input.value);
      const previous = parseThemeColor(draft.paletteAccent);
      const alpha = supportsTransparentColorEditing(state.status.themeFeatures) ? previous?.alpha ?? 1 : 1;
      const formatted = nextRgb ? formatEditedThemeColor({ ...nextRgb, alpha }, state.status.themeFeatures, draft.paletteAccent) : null;
      if (formatted) {
        draft.paletteAccent = formatted;
        draft.paletteExplicit = true;
        draft.paletteRemoved = false;
        syncEditorPaletteControls();
        syncThemeEditorPreview();
      }
      return;
    }

    if (input.matches("[data-editor-palette-text]")) {
      const value = input.value.trim();
      const supported = paletteColorSupportedByRuntime(value, state.status.themeFeatures);
      input.setCustomValidity(supported ? "" : "仅支持当前运行时可用的 Hex、rgb(a)、hsl、oklch 或 oklab 颜色");
      if (supported) {
        draft.paletteAccent = safePaletteColorValue(value) ?? draft.paletteAccent;
        draft.paletteExplicit = true;
        draft.paletteRemoved = false;
        syncEditorPaletteControls(true);
        syncThemeEditorPreview();
      }
      return;
    }

    if (input.matches("[data-editor-palette-alpha]")) {
      const parsed = parseThemeColor(draft.paletteAccent);
      if (parsed) {
        parsed.alpha = Number(input.value) / 100;
        const formatted = formatEditedThemeColor(parsed, state.status.themeFeatures, draft.paletteAccent);
        if (!formatted) return;
        draft.paletteAccent = formatted;
        draft.paletteExplicit = true;
        draft.paletteRemoved = false;
        syncEditorPaletteControls();
        syncThemeEditorPreview();
      }
      return;
    }

    const artKey = input.dataset.editorArt;
    if (artKey === "focusX" || artKey === "focusY") {
      const value = clampUnit(Number(input.value) / 100);
      draft[artKey] = value;
      draft.explicitArt = { ...(draft.explicitArt ?? {}), [artKey]: value };
      draft.artRemoved = false;
      const output = document.querySelector<HTMLOutputElement>(`[data-editor-art-output="${artKey}"]`);
      if (output) output.value = `${Math.round(value * 100)}%`;
      const preview = document.querySelector<HTMLElement>(".editor-theme-preview");
      preview?.style.setProperty(artKey === "focusX" ? "--preview-focus-x" : "--preview-focus-y", `${Math.round(value * 100)}%`);
      syncPreviewArtState();
      return;
    }

    const swatchKey = input.dataset.editorColorSwatch;
    if (swatchKey && isThemeColorKey(swatchKey)) {
      const nextRgb = parseThemeColor(input.value);
      const previous = parseThemeColor(draft.colors[swatchKey]);
      const alpha = supportsTransparentColorEditing(state.status.themeFeatures) ? previous?.alpha ?? 1 : 1;
      const formatted = nextRgb ? formatEditedThemeColor({ ...nextRgb, alpha }, state.status.themeFeatures, draft.colors[swatchKey]) : null;
      if (formatted) {
        draft.colors[swatchKey] = formatted;
        draft.explicitColors = { ...(draft.explicitColors ?? {}), [swatchKey]: formatted };
        syncEditorColorRow(swatchKey);
        syncThemeEditorPreview();
      }
      return;
    }

    const textKey = input.dataset.editorColorText;
    if (textKey && isThemeColorKey(textKey)) {
      const value = input.value.trim();
      const parsed = parseThemeColor(value);
      const supported = themeColorSupportedByRuntime(input.value, state.status.themeFeatures);
      input.setCustomValidity(supported ? "" : "请输入当前运行时支持的 Hex、rgb() 或 rgba() 颜色");
      if (parsed && supported) {
        draft.colors[textKey] = value;
        draft.explicitColors = { ...(draft.explicitColors ?? {}), [textKey]: value };
        syncEditorColorRow(textKey, true);
        syncThemeEditorPreview();
      }
      return;
    }

    const alphaKey = input.dataset.editorColorAlpha;
    if (alphaKey && isThemeColorKey(alphaKey)) {
      const parsed = parseThemeColor(draft.colors[alphaKey]);
      if (parsed) {
        parsed.alpha = Number(input.value) / 100;
        const formatted = formatEditedThemeColor(parsed, state.status.themeFeatures, draft.colors[alphaKey]);
        if (!formatted) return;
        draft.colors[alphaKey] = formatted;
        draft.explicitColors = { ...(draft.explicitColors ?? {}), [alphaKey]: formatted };
        syncEditorColorRow(alphaKey);
        syncThemeEditorPreview();
      }
      return;
    }
  }

  if (!(input instanceof HTMLInputElement) || input.id !== "theme-search") return;
  state.search = input.value;
  const visible = filteredThemes();
  if (!visible.some((theme) => themeMatchesKey(theme, state.selectedThemeId))) {
    state.selectedThemeId = visible[0]?.selectionKey ?? null;
  }
  const cursor = input.selectionStart ?? input.value.length;
  renderApp();
  requestAnimationFrame(() => {
    const nextInput = document.querySelector<HTMLInputElement>("#theme-search");
    nextInput?.focus();
    nextInput?.setSelectionRange(cursor, cursor);
  });
});

app.addEventListener("change", (event) => {
  const input = event.target;
  const draft = state.editorDraft;
  if (!draft) return;
  if (input instanceof HTMLSelectElement) {
    if (input.dataset.editorSetting === "appearance") {
      draft.appearance = normalizeChoice(input.value, ["auto", "light", "dark"] as const, "auto");
      draft.appearancePresent = true;
      draft.appearanceRemoved = false;
      renderApp();
      return;
    }
    const artKey = input.dataset.editorArt;
    if (artKey === "safeArea") {
      draft.safeArea = normalizeChoice(input.value, ["auto", "left", "right", "center", "none"] as const, "auto");
      draft.explicitArt = { ...(draft.explicitArt ?? {}), safeArea: draft.safeArea };
      draft.artRemoved = false;
      renderApp();
      return;
    }
    if (artKey === "taskMode") {
      draft.taskMode = normalizeChoice(input.value, ["auto", "ambient", "banner", "off"] as const, "auto");
      draft.explicitArt = { ...(draft.explicitArt ?? {}), taskMode: draft.taskMode };
      draft.artRemoved = false;
      renderApp();
      return;
    }
  }
  if (!(input instanceof HTMLInputElement)) return;
  if (input.matches("[data-editor-palette-text]")) {
    const value = input.value.trim();
    const supported = paletteColorSupportedByRuntime(value, state.status.themeFeatures);
    if (!supported) {
      input.setCustomValidity("");
      input.value = draft.paletteAccent;
      syncEditorPaletteControls();
    } else {
      draft.paletteAccent = safePaletteColorValue(value) ?? draft.paletteAccent;
      draft.paletteExplicit = true;
      draft.paletteRemoved = false;
      input.setCustomValidity("");
      syncEditorPaletteControls();
      syncThemeEditorPreview();
    }
    return;
  }
  const key = input.dataset.editorColorText;
  if (!key || !isThemeColorKey(key)) return;
  const value = input.value.trim();
  const parsed = parseThemeColor(value);
  const supported = themeColorSupportedByRuntime(input.value, state.status.themeFeatures);
  if (!parsed || !supported) {
    input.setCustomValidity("");
    input.value = draft.colors[key];
    syncEditorColorRow(key);
    syncThemeEditorPreview();
    return;
  }
  draft.colors[key] = value;
  draft.explicitColors = { ...(draft.explicitColors ?? {}), [key]: value };
  input.setCustomValidity("");
  syncEditorColorRow(key);
  syncThemeEditorPreview();
});

app.addEventListener("error", (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) return;
  if (image.matches("[data-preview-image]")) {
    image.hidden = true;
    const placeholder = image.closest(".sim-image-shell")?.querySelector<HTMLElement>("[data-preview-image-placeholder]");
    if (placeholder) placeholder.hidden = false;
    return;
  }
  const label = image.dataset.fallbackLabel?.trim() || "Dream Skin";
  const placeholder = document.createElement("div");
  placeholder.className = `${image.className} preview-placeholder`;
  placeholder.setAttribute("aria-label", `${label} \u9884\u89c8\u6682\u4e0d\u53ef\u7528`);
  const initials = Array.from(label).slice(0, 2).join("") || "DS";
  const text = document.createElement("span");
  text.textContent = initials;
  placeholder.append(text, document.createElement("i"), document.createElement("b"));
  image.replaceWith(placeholder);
}, true);

document.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement;
  const previewMenuItem = target.closest<HTMLButtonElement>('[role="menuitem"]');
  const previewMenu = previewMenuItem?.closest<HTMLElement>('[data-preview-popover]:not([hidden])');
  if (previewMenuItem && previewMenu && ["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const items = Array.from(previewMenu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
    const currentIndex = Math.max(0, items.indexOf(previewMenuItem));
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? items.length - 1
        : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items.forEach((item, index) => { item.tabIndex = index === nextIndex ? 0 : -1; });
    items[nextIndex]?.focus();
    return;
  }

  const colorModeRadio = target.closest<HTMLButtonElement>('[role="radio"][data-editor-color-mode]');
  const colorModeKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
  if (colorModeRadio && state.editorDraft && colorModeKeys.includes(event.key)) {
    event.preventDefault();
    const group = colorModeRadio.closest<HTMLElement>('[role="radiogroup"]');
    const radios = Array.from(group?.querySelectorAll<HTMLButtonElement>('[role="radio"][data-editor-color-mode]:not(:disabled)') ?? []);
    const currentIndex = Math.max(0, radios.indexOf(colorModeRadio));
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? radios.length - 1
        : (currentIndex + (forward ? 1 : -1) + radios.length) % radios.length;
    const nextMode = radios[nextIndex]?.dataset.editorColorMode as ThemeColorMode | undefined;
    if (nextMode && selectEditorColorMode(nextMode)) {
      renderApp();
      requestAnimationFrame(() => {
        document.querySelector<HTMLButtonElement>(`[data-editor-color-mode="${nextMode}"]`)?.focus();
      });
    }
    return;
  }

  const previewTab = target.closest<HTMLButtonElement>('[role="tab"][data-preview-mode]');
  if (previewTab && state.editorDraft && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const currentIndex = Math.max(0, PREVIEW_MODES.findIndex((item) => item.key === previewTab.dataset.previewMode));
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? PREVIEW_MODES.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + PREVIEW_MODES.length) % PREVIEW_MODES.length;
    const nextMode = PREVIEW_MODES[nextIndex].key;
    state.editorDraft.previewMode = nextMode;
    renderApp();
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-preview-mode="${nextMode}"]`)?.focus());
    return;
  }
  const isTyping = target.matches("input, textarea, select, [contenteditable='true']");
  if (event.key === "/" && !isTyping && !state.onboardingOpen && !state.confirmInstall && !state.confirmRestore && !state.confirmApplyRestart && !state.editorDraft) {
    event.preventDefault();
    state.view = "themes";
    renderApp();
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#theme-search")?.focus());
    return;
  }
  if (event.altKey && event.key.toLowerCase() === "a" && !state.onboardingOpen && !state.confirmInstall && !state.confirmRestore && !state.confirmApplyRestart && !state.editorDraft) {
    event.preventDefault();
    void addImageTheme();
    return;
  }
  if (event.altKey && event.key.toLowerCase() === "i" && !state.confirmInstall && !state.confirmRestore && !state.confirmApplyRestart && !state.editorDraft) {
    event.preventDefault();
    void importThemeBundle();
    return;
  }
  if (event.key === "Escape") {
    const openPreviewMenu = document.querySelector<HTMLElement>("[data-preview-popover]:not([hidden])");
    if (openPreviewMenu) {
      openPreviewMenu.hidden = true;
      const opener = openPreviewMenu.closest(".sim-header")?.querySelector<HTMLButtonElement>('[data-preview-action="open-menu"]');
      opener?.setAttribute("aria-expanded", "false");
      opener?.focus();
      event.preventDefault();
      return;
    }
    if (state.editorDraft && !state.busy) {
      state.editorDraft = null;
      renderApp();
      restoreModalOpener();
      return;
    }
    if (state.confirmApplyRestart) {
      state.confirmApplyRestart = false;
      state.pendingApplyFinishGuide = false;
      renderApp();
      restoreModalOpener();
      return;
    }
    if (state.confirmInstall) {
      state.confirmInstall = false;
      renderApp();
      restoreModalOpener();
      return;
    }
    if (state.confirmRestore) {
      state.confirmRestore = false;
      renderApp();
      restoreModalOpener();
      return;
    }
    if (state.onboardingOpen) closeGuide();
    return;
  }
  if (event.key === "Tab") trapDialogFocus(event);
});

function trapDialogFocus(event: KeyboardEvent): void {
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!dialog) return;
  const focusable = dialogFocusableElements(dialog);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (!dialog.contains(active) || !focusable.includes(active as HTMLElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

renderApp();
void syncWindowFrameState();
let windowFrameResizeTimer: number | undefined;
void managerWindow.onResized(() => {
  if (windowFrameResizeTimer !== undefined) {
    window.clearTimeout(windowFrameResizeTimer);
  }
  windowFrameResizeTimer = window.setTimeout(() => {
    windowFrameResizeTimer = undefined;
    void syncWindowFrameState();
  }, 120);
}).catch(() => undefined);
void managerWindow.onFocusChanged(({ payload: focused }) => {
  managerWindowFocused = focused;
  document.body.classList.toggle("window-unfocused", !focused);
  if (focused) {
    scheduleStatusRefresh(200);
    void refreshStatusSilently();
  } else {
    clearStatusRefreshTimer();
  }
}).catch(() => undefined);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearStatusRefreshTimer();
    return;
  }
  scheduleStatusRefresh(200);
  void refreshStatusSilently();
});
void loadData(true);
