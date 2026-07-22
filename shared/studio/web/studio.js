import { bindThemeEditor, readImageFile, setThemeFormValues, themeFormPayload } from "/theme-editor.js";
import { renderDiagnostics } from "/diagnostics.js";
import { renderThemeCard } from "/theme-card.js";
import { renderThemePreview, setPreviewView } from "/theme-preview.js";
import { sampleImageAccent } from "/readability.js";

const token = document.querySelector('meta[name="dream-studio-token"]')?.content || "";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = {
  status: null,
  official: [],
  themes: [],
  details: null,
  images: [],
  doctor: null,
  filter: "all",
  search: "",
  previewTheme: null,
  editingTheme: null,
  referenceTheme: null,
  pendingDelete: null,
  editorImageUrl: "",
};
const pageCopy = {
  overview: ["THEME CONTROL", "控制台", "管理当前主题与 Codex 运行状态。"],
  themes: ["VISUAL LIBRARY", "主题库", "浏览 Dream Skin 官方场景与本机自定义主题。"],
  diagnostics: ["SYSTEM HEALTH", "诊断", "检查应用、运行时、CDP 与本地存储。"],
};
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Dream-Studio-Token": token,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json();
  if (!response.ok) {
    const detail = typeof payload.error === "object" ? payload.error : { message: payload.error };
    const suggestion = detail?.suggestion ? ` ${detail.suggestion}` : "";
    throw new Error(`${detail?.message || "本地操作失败"}${suggestion}`);
  }
  return payload;
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}
function formatBytes(bytes) {
  if (!Number.isFinite(Number(bytes))) return "未知大小";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function assetUrl(url) {
  if (!url?.startsWith("/api/")) return url || "";
  return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}

function notify(message, error = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = `toast show${error ? " error" : ""}`;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { toast.className = "toast"; }, 3600);
}

function setFeedback(message = "") {
  const feedback = $("#actionFeedback");
  feedback.hidden = !message;
  feedback.textContent = message;
}

function sessionLabel(session) {
  return ({ active: "运行中", paused: "已暂停", stale: "状态失效", off: "未开启", unknown: "待确认", error: "读取失败" })[session] || session || "未知";
}

function currentTheme() {
  return state.official.find((theme) => theme.active)
    || state.themes.find((theme) => theme.active)
    || null;
}

function switchPage(page) {
  const selected = pageCopy[page] ? page : "overview";
  $$("[data-view]").forEach((button) => {
    const active = button.dataset.view === selected;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  $$("[data-page]").forEach((section) => {
    const active = section.dataset.page === selected;
    section.hidden = !active;
    section.classList.toggle("active", active);
  });
  const [eyebrow, title, subtitle] = pageCopy[selected];
  $("#pageEyebrow").textContent = eyebrow;
  $("#pageTitle").textContent = title;
  $("#pageSubtitle").textContent = subtitle;
  document.title = `${title} · Dream Skin Studio`;
}

function renderStatus(status) {
  state.status = status;
  const active = status.session === "active";
  const pill = $("#statusPill");
  pill.className = `status-pill${active ? " on" : status.session === "stale" || status.session === "error" ? " warn" : ""}`;
  pill.innerHTML = `<span></span>${escapeHtml(active ? "皮肤运行中" : sessionLabel(status.session))}`;
  $("#metricSession").textContent = sessionLabel(status.session);
  $("#metricSessionHint").textContent = status.injectorAlive ? "注入器进程正常" : "注入器未运行";
  $("#metricCodex").textContent = status.codexVersion || (status.codexInstalled ? "版本未知" : "未检测到");
  $("#metricCodexHint").textContent = status.codexRunning ? "Codex 已打开" : status.codexInstalled ? "已安装 · 当前未运行" : "未找到官方应用";
  $("#metricTheme").textContent = status.themeName || "未设置";
  $("#metricCdp").textContent = active ? `${status.port || 9341} · 已连接` : `${status.port || 9341} · 未连接`;
  $("#metricCdpHint").textContent = status.injectorAlive ? "回环注入器正常" : "仅监听 127.0.0.1";
}

function renderCurrent() {
  const theme = currentTheme();
  const image = $("#currentImage");
  if (!theme) {
    image.removeAttribute("src");
    $("#currentName").textContent = "尚未创建主题";
    $("#currentTagline").textContent = "从主题库创建第一套自定义主题。";
    $("#currentQuote").textContent = "DREAM SKIN READY";
    return;
  }
  image.src = assetUrl(theme.imageUrl);
  image.alt = `${theme.name || "当前主题"}预览`;
  $("#currentName").textContent = theme.name || "Dream Skin";
  $("#currentTagline").textContent = theme.tagline || "本机自定义 Dream Skin 主题";
  $("#currentQuote").textContent = theme.quote || "MAKE SOMETHING WONDERFUL";
}

function renderRecommendations() {
  const container = $("#recommendedThemes");
  container.classList.remove("skeleton-row");
  const available = [...state.official, ...state.themes].sort((left, right) => Number(right.active) - Number(left.active)).slice(0, 3);
  container.innerHTML = available.length ? available.map((theme) => `
    <article class="recommendation">
      <img src="${escapeHtml(assetUrl(theme.imageUrl))}" alt="${escapeHtml(theme.name)}主题预览">
      <div><h3>${escapeHtml(theme.name)}</h3><button class="text-command" data-apply="${escapeHtml(theme.id)}" ${theme.active ? "disabled" : ""}>${theme.active ? "正在使用" : "应用主题"}</button></div>
    </article>`).join("") : '<div class="empty-state">还没有可切换的本机主题，请先创建主题。</div>';
}

function filteredThemes() {
  const catalog = [...state.official, ...state.themes];
  const query = state.search.trim().toLocaleLowerCase("zh-CN");
  return catalog.filter((theme) => {
    const sourceMatches = state.filter === "all"
      || (state.filter === "official" && theme.source === "official")
      || (state.filter === "mine" && theme.source !== "official");
    const haystack = [theme.name, theme.tagline, theme.tag, theme.quote].filter(Boolean).join(" ").toLocaleLowerCase("zh-CN");
    return sourceMatches && (!query || haystack.includes(query));
  });
}

function renderFeatured() {
  const featured = state.official[0];
  const container = $("#featuredTheme");
  container.hidden = !featured || state.filter === "mine" || Boolean(state.search);
  if (container.hidden) return;
  container.innerHTML = `<img src="${escapeHtml(assetUrl(featured.imageUrl))}" alt="${escapeHtml(featured.name)}精选官方场景"><div class="featured-copy"><span class="source-label">FEATURED · OFFICIAL SCENE</span><h3>${escapeHtml(featured.name)}</h3><p>${escapeHtml(featured.tagline)}</p><div class="card-actions"><button class="command primary" data-apply="${escapeHtml(featured.id)}" ${featured.active ? "disabled" : ""}>${featured.active ? "正在使用" : "应用主题"}</button><button class="command" data-preview="${escapeHtml(featured.id)}">查看完整效果</button></div></div>`;
}

function renderThemeLibrary() {
  const themes = filteredThemes();
  const grid = $("#themeGrid");
  grid.classList.remove("skeleton-grid");
  $("#themeCount").textContent = `${themes.length} 个主题`;
  grid.innerHTML = themes.length ? themes.map((theme) => renderThemeCard(theme, escapeHtml, assetUrl)).join("") : '<div class="empty-state">没有匹配的主题。调整搜索内容或来源筛选。</div>';
  renderFeatured();
}

function renderInbox() {
  const container = $("#imageInbox");
  $("#inboxCount").textContent = `${state.images.length} 张图片`;
  if (!state.images.length) {
    container.innerHTML = '<div class="empty-state">图片收件箱为空。通过菜单栏打开 `images/` 文件夹并放入纯背景图。</div>';
    return;
  }
  container.innerHTML = state.images.map((image) => `<article class="inbox-item"><img src="${escapeHtml(assetUrl(image.imageUrl))}" alt="${escapeHtml(image.name)}"><div><strong>${escapeHtml(image.name)}</strong><small>${formatBytes(image.bytes)}</small><button class="text-command" data-import-image="${escapeHtml(image.name)}">生成并应用</button></div></article>`).join("");
}

function renderDetails() {
  const details = state.details;
  const status = state.status || details?.status || {};
  renderDiagnostics({ details, status, doctor: state.doctor, escapeHtml, sessionLabel });
}

function openPreview(theme) {
  if (!theme) return;
  state.previewTheme = theme;
  $("#previewDialogTitle").textContent = theme.name;
  $("#previewDialogImage").src = theme.referenceImageUrl || assetUrl(theme.imageUrl);
  $("#previewDialogText").textContent = theme.referenceImageUrl
    ? `${theme.tagline || "Dream Skin 官方场景"}。这张图片是设计参考，运行效果由 Theme v3 参数与纯背景实时渲染。`
    : `${theme.tagline || "Dream Skin 官方场景"}。这是主题纯背景，实际界面由同一套 Theme v3 参数渲染。`;
  $("#themePreviewDialog").showModal();
}

function openCreate(reference = null) {
  state.editingTheme = null;
  state.referenceTheme = reference;
  state.editorImageUrl = reference ? assetUrl(reference.imageUrl) : "";
  setThemeFormValues($("#themeForm"), reference || {});
  const hint = $("#referenceHint");
  hint.hidden = !reference;
  hint.textContent = reference ? `以“${reference.name}”为参考创建独立主题，可沿用背景或替换图片。` : "";
  if (reference) $("#themeForm").elements.name.value = `${reference.name} 参考主题`;
  $("#themeDialogMode").textContent = reference ? "REFERENCE THEME" : "CUSTOM THEME";
  $("#themeDialogTitle").textContent = reference ? "参考创建主题" : "创建自定义主题";
  $("#imageHelp").textContent = reference ? "可选；留空则沿用原主题背景" : "PNG、JPEG 或 WebP，最大 50 MB";
  $("#saveThemeButton").textContent = reference ? "创建参考主题" : "保存并应用";
  $("#themeDialog").showModal();
}

function openEdit(theme) {
  if (!theme || theme.source === "official") return;
  state.editingTheme = theme;
  state.referenceTheme = null;
  state.editorImageUrl = assetUrl(theme.imageUrl);
  setThemeFormValues($("#themeForm"), theme);
  $("#referenceHint").hidden = true;
  $("#themeDialogMode").textContent = "EDIT THEME";
  $("#themeDialogTitle").textContent = `编辑 ${theme.name}`;
  $("#imageHelp").textContent = "可选；留空则保留当前背景";
  $("#saveThemeButton").textContent = theme.active ? "保存并重新应用" : "保存更改";
  $("#themeDialog").showModal();
}

async function refreshStatus() {
  try { renderStatus(await api("/api/status")); } catch (error) { notify(error.message, true); }
}

async function refreshAll() {
  $("#refreshAll").disabled = true;
  try {
    const [status, catalog, details, inbox] = await Promise.all([
      api("/api/status"), api("/api/themes"), api("/api/details"), api("/api/library-images"),
    ]);
    state.official = catalog.official || [];
    state.themes = catalog.themes || [];
    state.details = details;
    state.images = inbox.images || [];
    renderStatus(status);
    renderCurrent();
    renderRecommendations();
    renderThemeLibrary();
    renderInbox();
    renderDetails();
  } catch (error) { notify(error.message, true); }
  finally { $("#refreshAll").disabled = false; }
}

async function runAction(name) {
  $$("[data-action]").forEach((button) => { button.disabled = true; });
  setFeedback(`正在执行：${name}…`);
  try {
    const endpoint = name === "reapply" ? "start" : name;
    const result = await api(`/api/actions/${endpoint}`, { method: "POST" });
    if (result.doctor) {
      state.doctor = result.doctor;
      $("#doctorSummary").className = "report-empty";
      $("#doctorSummary").textContent = result.doctor.liveMatchesCurrent === false
        ? `诊断完成 · 页面版本 ${result.doctor.liveVersion}，请重新应用 ${result.doctor.version}`
        : `诊断通过 · Codex ${result.doctor.codexVersion} · Node ${result.doctor.nodeVersion}`;
      $("#doctorOutput").textContent = JSON.stringify(result.doctor, null, 2);
    }
    setFeedback(result.output || "操作完成");
    notify(name === "doctor" ? "深度诊断已完成" : "操作已完成");
    await refreshAll();
  } catch (error) {
    setFeedback(error.message);
    notify(error.message, true);
  } finally { $$("[data-action]").forEach((button) => { button.disabled = false; }); }
}

async function applyTheme(id) {
  try { await api(`/api/themes/${encodeURIComponent(id)}/apply`, { method: "POST" }); notify("主题已应用"); await refreshAll(); }
  catch (error) { notify(error.message, true); }
}

async function importImage(name) {
  try { await api(`/api/library-images/${encodeURIComponent(name)}/import`, { method: "POST" }); notify("图片已生成主题并应用"); await refreshAll(); }
  catch (error) { notify(error.message, true); }
}

function requestDelete(id) {
  const theme = state.themes.find((candidate) => candidate.id === id);
  if (!theme) return;
  state.pendingDelete = theme;
  $("#deleteThemeName").textContent = `“${theme.name}”将从本机主题库删除，当前主题不会被修改。`;
  $("#deleteDialog").showModal();
}

async function confirmDelete() {
  if (!state.pendingDelete) return;
  try { await api(`/api/themes/${encodeURIComponent(state.pendingDelete.id)}`, { method: "DELETE" }); $("#deleteDialog").close(); notify("主题已删除"); await refreshAll(); }
  catch (error) { notify(error.message, true); }
}

function officialById(id) { return state.official.find((theme) => theme.id === id); }

async function copyNativeTheme() {
  const value = $("[data-theme-preview]").dataset.nativeTheme;
  if (!value) return notify("当前主题配置尚未生成", true);
  try {
    await navigator.clipboard.writeText(value);
    notify("Codex 原生主题配置已复制");
  } catch { notify("无法访问剪贴板，请检查浏览器权限", true); }
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("button, [data-preview], [data-go-themes], [data-go-diagnostics], [data-open-create]");
  if (!target) return;
  if (target.dataset.view) switchPage(target.dataset.view);
  if (target.dataset.action) runAction(target.dataset.action);
  if (target.hasAttribute("data-go-themes")) switchPage("themes");
  if (target.hasAttribute("data-go-diagnostics")) switchPage("diagnostics");
  if (target.hasAttribute("data-open-create")) openCreate();
  if (target.dataset.preview) openPreview(officialById(target.dataset.preview));
  if (target.dataset.createReference) openCreate(officialById(target.dataset.createReference));
  if (target.dataset.apply) applyTheme(target.dataset.apply);
  if (target.dataset.edit) openEdit(state.themes.find((theme) => theme.id === target.dataset.edit));
  if (target.dataset.duplicate) openCreate(state.themes.find((theme) => theme.id === target.dataset.duplicate));
  if (target.dataset.delete) requestDelete(target.dataset.delete);
  if (target.dataset.importImage) importImage(target.dataset.importImage);
  if (target.dataset.previewView) setPreviewView($("[data-theme-preview]"), target.dataset.previewView);
  if (target.hasAttribute("data-copy-native-theme")) copyNativeTheme();
});

$("#themeSearch").addEventListener("input", (event) => { state.search = event.target.value; renderThemeLibrary(); });
$$('[data-filter]').forEach((button) => button.addEventListener("click", () => {
  state.filter = button.dataset.filter;
  $$('[data-filter]').forEach((candidate) => candidate.classList.toggle("active", candidate === button));
  renderThemeLibrary();
}));
$("#refreshAll").addEventListener("click", refreshAll);
$("#createFromPreview").addEventListener("click", () => { $("#themePreviewDialog").close(); openCreate(state.previewTheme); });
$$('[data-close-preview]').forEach((button) => button.addEventListener("click", () => $("#themePreviewDialog").close()));
$$('[data-close-create]').forEach((button) => button.addEventListener("click", () => $("#themeDialog").close()));
$$('[data-cancel-delete]').forEach((button) => button.addEventListener("click", () => $("#deleteDialog").close()));
$("#confirmDelete").addEventListener("click", confirmDelete);
bindThemeEditor($("#themeForm"), (theme) => renderThemePreview($("[data-theme-preview]"), theme, state.editorImageUrl));
$("#image").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (state.editorImageUrl.startsWith("blob:")) URL.revokeObjectURL(state.editorImageUrl);
  state.editorImageUrl = URL.createObjectURL(file);
  try {
    const suggested = await sampleImageAccent(file);
    $("#themeForm").elements.nativeAccent.value = suggested;
    $("#themeForm").elements.accent.value = suggested;
    $("#themeForm").elements.accent.dispatchEvent(new Event("input", { bubbles: true }));
    notify(`已从图片建议强调色 ${suggested}`);
  } catch { notify("图片已载入，但未能自动建议强调色", true); }
  renderThemePreview($("[data-theme-preview]"), themeFormPayload($("#themeForm"), null), state.editorImageUrl);
});

$("#themeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = $("#image").files[0];
  const referenceTheme = state.referenceTheme;
  if (!file && !state.editingTheme && !referenceTheme) return notify("请选择一张纯背景图片", true);
  const imageData = await readImageFile(file);
  const payload = themeFormPayload(event.target, imageData);
  try {
    if (state.editingTheme) {
      await api(`/api/themes/${encodeURIComponent(state.editingTheme.id)}`, { method: "PUT", body: JSON.stringify(payload) });
      notify(state.editingTheme.active ? "主题已保存并重新应用" : "主题更改已保存");
    } else if (referenceTheme) {
      await api(`/api/themes/${encodeURIComponent(state.referenceTheme.id)}/duplicate`, { method: "POST", body: JSON.stringify(payload) });
      notify("参考主题已创建");
    } else {
      const result = await api("/api/themes", { method: "POST", body: JSON.stringify(payload) });
      notify("主题已保存，正在应用");
      await applyTheme(result.theme.id);
    }
    $("#themeDialog").close();
    await refreshAll();
  } catch (error) { notify(error.message, true); }
});

refreshAll();
setInterval(() => { if (!document.hidden) refreshStatus(); }, 10000);
