const state = {
  name: "Dream Skin",
  tagline: "把喜欢的画面变成可交互的 Codex 工作台。",
  quote: "MAKE SOMETHING WONDERFUL",
  appearance: "system",
  accent: "#7cff46",
  secondary: "#36d7e8",
  highlight: "#642a8c",
  imageDataUrl: "",
  previewImage: "",
  imageName: "Use the built-in atmosphere",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const imageInput = $("#imageInput");
const toast = $("#toast");

function showMessage(message, error = false) {
  $("#saveMessage").textContent = message;
  toast.textContent = message;
  toast.classList.toggle("is-visible", true);
  toast.style.borderColor = error ? "rgba(255, 128, 109, .65)" : "rgba(184, 255, 61, .45)";
  window.clearTimeout(showMessage.timer);
  showMessage.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

function setConnection(online) {
  $("#connectionDot").classList.toggle("is-off", !online);
  $("#connectionText").textContent = online ? "Local service" : "Offline";
}

function setValue(id, value) { $(id).value = value || ""; }

function render() {
  setValue("#nameInput", state.name);
  setValue("#taglineInput", state.tagline);
  setValue("#quoteInput", state.quote);
  setValue("#accentInput", state.accent);
  setValue("#secondaryInput", state.secondary);
  setValue("#highlightInput", state.highlight);
  $("#accentValue").textContent = state.accent.toUpperCase();
  $("#secondaryValue").textContent = state.secondary.toUpperCase();
  $("#highlightValue").textContent = state.highlight.toUpperCase();
  $("#imageName").textContent = state.imageName || "Use the built-in atmosphere";
  $("#previewName").textContent = state.name || "Dream Skin";
  $("#previewThemeName").textContent = state.name || "Dream Skin";
  $("#previewTagline").textContent = state.tagline || "把喜欢的画面变成可交互的 Codex 工作台。";
  const previewImage = state.imageDataUrl || state.previewImage;
  $("#previewDevice").style.setProperty("--preview-image", previewImage ? `url(${JSON.stringify(previewImage)})` : "url(/assets/portal-hero.png)");
  $("#previewAppearance").textContent = `${state.appearance.toUpperCase()} / ${state.appearance === "system" ? "AUTO" : "LOCKED"}`;
  $$(`[data-appearance]`).forEach((button) => button.classList.toggle("is-active", button.dataset.appearance === state.appearance));
}

async function loadState() {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error("Local service unavailable");
    const data = await response.json();
    Object.assign(state, {
      ...data.theme,
      accent: data.theme.colors.accent,
      secondary: data.theme.colors.secondary,
      highlight: data.theme.colors.highlight,
      imageDataUrl: "",
      previewImage: data.theme.preview,
      imageName: data.theme.image,
    });
    $("#autoloadInput").checked = Boolean(data.autoload.enabled);
    $("#agentStatus").textContent = data.autoload.agentLoaded ? "ON" : "OFF";
    $("#cdpStatus").textContent = data.autoload.cdpReady ? "READY" : "WAITING";
    $("#injectorStatus").textContent = data.autoload.injectorAlive ? "LIVE" : "OFF";
    $("#runtimeDescription").textContent = data.autoload.enabled ? "LaunchAgent is watching this session" : "Manual launch mode";
    setConnection(true);
    render();
  } catch (error) {
    setConnection(false);
    showMessage(error.message, true);
  }
}

async function sendJson(url, payload = {}) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function syncForm() {
  state.name = $("#nameInput").value;
  state.tagline = $("#taglineInput").value;
  state.quote = $("#quoteInput").value;
  state.accent = $("#accentInput").value;
  state.secondary = $("#secondaryInput").value;
  state.highlight = $("#highlightInput").value;
  render();
}

async function apply() {
  syncForm();
  const button = $("#applyButton");
  button.disabled = true;
  button.querySelector("span").textContent = "Applying…";
  try {
    const data = await sendJson("/api/apply", state);
    Object.assign(state, {
      ...data.theme,
      accent: data.theme.colors.accent,
      secondary: data.theme.colors.secondary,
      highlight: data.theme.colors.highlight,
      imageDataUrl: "",
      previewImage: data.theme.preview,
      imageName: data.theme.image,
    });
    render();
    showMessage("Applied to Codex");
    await loadState();
  } catch (error) { showMessage(error.message, true); }
  button.disabled = false;
  button.querySelector("span").textContent = "Apply to Codex";
}

imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => { state.imageDataUrl = String(reader.result); state.previewImage = state.imageDataUrl; state.imageName = file.name; render(); showMessage("Image staged — press Apply to Codex"); });
  reader.readAsDataURL(file);
});

$("#applyButton").addEventListener("click", apply);
$("#refreshButton").addEventListener("click", loadState);
$("#resetButton").addEventListener("click", async () => {
  try { const data = await sendJson("/api/reset"); Object.assign(state, { ...data.theme, accent: data.theme.colors.accent, secondary: data.theme.colors.secondary, highlight: data.theme.colors.highlight, imageDataUrl: "", previewImage: data.theme.preview, imageName: data.theme.image }); render(); showMessage("Demo atmosphere restored"); await loadState(); } catch (error) { showMessage(error.message, true); }
});
$("#autoloadInput").addEventListener("change", async (event) => {
  try { await sendJson("/api/autoload", { enabled: event.target.checked }); showMessage(event.target.checked ? "Auto load enabled" : "Auto load disabled"); await loadState(); } catch (error) { event.target.checked = !event.target.checked; showMessage(error.message, true); }
});
$("#nameInput").addEventListener("input", syncForm);
$("#taglineInput").addEventListener("input", syncForm);
$("#quoteInput").addEventListener("input", syncForm);
["accent", "secondary", "highlight"].forEach((name) => $((`#${name}Input`)).addEventListener("input", syncForm));
$$("[data-appearance]").forEach((button) => button.addEventListener("click", () => { state.appearance = button.dataset.appearance; render(); showMessage("Appearance staged — press Apply to Codex"); }));
$$("[data-section]").forEach((button) => button.addEventListener("click", () => { $$('[data-section]').forEach((item) => item.classList.toggle("is-active", item === button)); $$('[data-view]').forEach((view) => view.classList.toggle("is-visible", view.dataset.view === button.dataset.section)); }));

loadState();
