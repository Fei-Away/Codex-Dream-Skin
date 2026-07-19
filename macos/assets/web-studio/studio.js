import {
  StudioApiError,
  createApiClient,
  isThemeId,
  normalizeColor,
  pollJob,
  readSessionToken,
  validateImageFile,
} from "/studio-client.mjs";

const element = (id) => document.getElementById(id);
const token = readSessionToken(window.location, window.history, window.sessionStorage);
const api = token ? createApiClient({ origin: window.location.origin, token }) : null;
const state = {
  busy: false,
  selectedFile: null,
  previewUrl: null,
  screenshotUrl: null,
  themeUrls: new Set(),
};

function setText(id, value) {
  element(id).textContent = String(value ?? "");
}

function setConnection(message, error = false) {
  const output = element("connection-status");
  output.textContent = message;
  output.classList.toggle("error", error);
}

function setBusy(value) {
  state.busy = value;
  element("studio").setAttribute("aria-busy", String(value));
  for (const button of document.querySelectorAll("button")) button.disabled = value;
}

function showMessage(message, error = false) {
  setConnection(message, error);
  setText("job-message", message);
  if (error) element("job-panel").hidden = false;
}

function updateJob(job) {
  element("job-panel").hidden = false;
  setText("job-title", job.operation || "正在处理");
  setText("job-message", job.progress || job.state);
  setText("job-log", Array.isArray(job.logs) ? job.logs.join("\n") : "");
  const progress = element("job-progress");
  if (job.state === "succeeded" || job.state === "failed") progress.value = 1;
  else progress.removeAttribute("value");
}

async function runJob(start) {
  setBusy(true);
  element("job-panel").hidden = false;
  element("job-progress").removeAttribute("value");
  try {
    const { jobId } = await start();
    const result = await pollJob({ api, jobId, onUpdate: updateJob });
    setConnection("操作完成");
    return result;
  } finally {
    setBusy(false);
  }
}

function confirmAction({ title, message, button = "确认" }) {
  const dialog = element("confirm-dialog");
  setText("confirm-title", title);
  setText("confirm-message", message);
  setText("confirm-action", button);
  dialog.returnValue = "cancel";
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
  });
}

async function runWithRestart(start) {
  try {
    return await runJob(() => start(false));
  } catch (error) {
    if (!(error instanceof StudioApiError) || error.code !== "restart_required") throw error;
    const confirmed = await confirmAction({
      title: "需要重启 Codex",
      message: "当前 Codex 没有启用皮肤调试连接。重启一次后即可应用主题。",
      button: "重启并应用",
    });
    if (!confirmed) throw new StudioApiError("cancelled", "已取消重启。", 0);
    return runJob(() => api.reapply({ allowRestart: true }));
  }
}

function revokeThemeUrls() {
  for (const url of state.themeUrls) URL.revokeObjectURL(url);
  state.themeUrls.clear();
}

function createButton(label, handler, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (className) button.className = className;
  button.addEventListener("click", handler);
  return button;
}

async function renderThemes(themes) {
  const list = element("theme-list");
  list.replaceChildren();
  revokeThemeUrls();
  for (const theme of themes) {
    const item = document.createElement("li");
    item.className = "theme-item";
    const image = document.createElement("img");
    image.className = "theme-thumb";
    image.alt = `${theme.name} 预览`;
    if (!theme.bundled && isThemeId(theme.id)) {
      api.themeImage(theme.id).then((blob) => {
        const url = URL.createObjectURL(blob);
        state.themeUrls.add(url);
        image.src = url;
      }).catch(() => {});
    }
    const meta = document.createElement("div");
    meta.className = "theme-meta";
    const name = document.createElement("strong");
    name.textContent = theme.name;
    meta.append(name);
    if (theme.active) {
      const badge = document.createElement("span");
      badge.className = "active-badge";
      badge.textContent = "当前使用";
      meta.append(badge);
    }
    const actions = document.createElement("div");
    actions.className = "theme-actions";
    if (!theme.active) {
      actions.append(createButton("应用", async () => {
        await guarded(async () => {
          if (theme.bundled) await runWithRestart((allowRestart) => api.applyDemo({ allowRestart }));
          else await runWithRestart((allowRestart) => api.applyTheme(theme.id, { allowRestart }));
          await refresh();
        });
      }));
    }
    if (!theme.bundled && !theme.active) {
      actions.append(createButton("删除", async () => {
        const confirmed = await confirmAction({
          title: "删除已保存主题",
          message: `确定删除“${theme.name}”吗？此操作不会删除原始图片。`,
          button: "删除",
        });
        if (!confirmed) return;
        await guarded(async () => {
          await runJob(() => api.deleteTheme(theme.id));
          await refresh();
        });
      }, "danger-button"));
    }
    meta.append(actions);
    item.append(image, meta);
    list.append(item);
  }
}

function renderStatus(status) {
  element("install-panel").hidden = status.installed;
  element("dashboard").hidden = !status.installed;
  setText("codex-status", status.codexRunning ? "已打开" : "未打开");
  setText("skin-status", status.session === "active" ? "运行中" : status.session === "paused" ? "已暂停" : "未启用");
  setText("cdp-status", status.cdpOk ? `已连接 · ${status.port}` : "未连接");
  setText("current-theme", status.themeName || "内置演示");
  setText("diagnostic-log", status.recentLogs?.length ? status.recentLogs.join("\n") : "暂无日志");
}

async function refresh() {
  if (!api) return;
  const [status, themes] = await Promise.all([api.status(), api.themes()]);
  renderStatus(status);
  if (status.installed) await renderThemes(themes);
  setConnection(`本地服务已连接 · v${status.version}`);
  element("studio").setAttribute("aria-busy", "false");
}

async function guarded(operation) {
  try {
    await operation();
  } catch (error) {
    if (error instanceof StudioApiError && error.code === "cancelled") {
      showMessage(error.message);
      return;
    }
    showMessage(error instanceof Error ? error.message : "操作失败。", true);
  }
}

function selectImage(file) {
  validateImageFile(file);
  state.selectedFile = file;
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = URL.createObjectURL(file);
  element("image-preview").src = state.previewUrl;
  element("task-preview").src = state.previewUrl;
  element("preview-grid").hidden = false;
  const baseName = file.name.replace(/\.[^.]+$/, "").slice(0, 80);
  if (baseName) element("theme-name").value = baseName;
}

element("theme-image").addEventListener("change", () => {
  const [file] = element("theme-image").files;
  if (file) guarded(async () => selectImage(file));
});

for (const eventName of ["dragenter", "dragover"]) {
  element("drop-zone").addEventListener(eventName, (event) => {
    event.preventDefault();
    element("drop-zone").classList.add("dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  element("drop-zone").addEventListener(eventName, (event) => {
    event.preventDefault();
    element("drop-zone").classList.remove("dragging");
  });
}
element("drop-zone").addEventListener("drop", (event) => {
  const [file] = event.dataTransfer.files;
  if (file) guarded(async () => selectImage(file));
});

element("theme-form").addEventListener("submit", (event) => {
  event.preventDefault();
  guarded(async () => {
    const file = validateImageFile(state.selectedFile);
    const form = new FormData();
    form.set("image", file, file.name);
    form.set("name", element("theme-name").value);
    form.set("tagline", element("theme-tagline").value);
    form.set("quote", element("theme-quote").value);
    form.set("accent", normalizeColor(element("theme-accent").value));
    form.set("secondary", normalizeColor(element("theme-secondary").value));
    form.set("highlight", normalizeColor(element("theme-highlight").value));
    form.set("apply", "true");
    form.set("allowRestart", "false");
    try {
      await runJob(() => api.createTheme(form));
    } catch (error) {
      if (!(error instanceof StudioApiError) || error.code !== "restart_required") throw error;
      const confirmed = await confirmAction({
        title: "主题已保存，需要重启 Codex",
        message: "图片和主题已经保存。现在重启 Codex 并应用它吗？",
        button: "重启并应用",
      });
      if (!confirmed) return;
      await runJob(() => api.reapply({ allowRestart: true }));
    }
    await refresh();
  });
});

element("install-button").addEventListener("click", () => guarded(async () => {
  await runJob(() => api.install());
  await refresh();
}));
element("reapply-button").addEventListener("click", () => guarded(async () => {
  await runWithRestart((allowRestart) => api.reapply({ allowRestart }));
  await refresh();
}));
element("pause-button").addEventListener("click", () => guarded(async () => {
  await runJob(() => api.pause());
  await refresh();
}));
element("demo-button").addEventListener("click", () => guarded(async () => {
  await runWithRestart((allowRestart) => api.applyDemo({ allowRestart }));
  await refresh();
}));
element("verify-button").addEventListener("click", () => guarded(async () => {
  const result = await runJob(() => api.verify());
  const blob = await api.verificationScreenshot();
  if (state.screenshotUrl) URL.revokeObjectURL(state.screenshotUrl);
  state.screenshotUrl = URL.createObjectURL(blob);
  element("screenshot-image").src = state.screenshotUrl;
  element("screenshot-dialog").showModal();
  showMessage(result.pass ? "验证通过" : "验证完成");
}));
element("restore-button").addEventListener("click", async () => {
  const confirmed = await confirmAction({
    title: "恢复官方 Codex 界面",
    message: "这会移除当前皮肤、恢复外观配置并重启 Codex。主题库仍会保留。",
    button: "恢复官方界面并重启 Codex",
  });
  if (!confirmed) return;
  await guarded(async () => {
    await runJob(() => api.restore({ confirmation: "restore-official", allowRestart: true }));
    await refresh();
  });
});
element("copy-log").addEventListener("click", () => guarded(async () => {
  await navigator.clipboard.writeText(element("diagnostic-log").textContent);
  showMessage("诊断信息已复制");
}));

window.addEventListener("beforeunload", () => {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  if (state.screenshotUrl) URL.revokeObjectURL(state.screenshotUrl);
  revokeThemeUrls();
});

if (!api) {
  element("studio").setAttribute("aria-busy", "false");
  showMessage("本地会话令牌缺失，请重新双击 Dream Skin 控制台启动器。", true);
} else {
  guarded(refresh);
  window.setInterval(() => {
    if (!state.busy && document.visibilityState === "visible") guarded(refresh);
  }, 10_000);
}
