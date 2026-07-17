function healthItem(status, title, detail, escapeHtml) {
  const symbol = status === "pass" ? "✓" : status === "fail" ? "×" : status === "warn" ? "!" : "·";
  return `<article class="health-item ${status}"><span class="health-status">${symbol}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p></article>`;
}

function renderOverviewNotice(details) {
  const errors = details?.logs || {};
  const latest = [errors.startError, errors.codexError, errors.injectorError]
    .find((entry) => entry && !/cancel(?:led|ed)|已取消/i.test(entry)) || "";
  document.querySelector("#overviewNotice").hidden = !latest;
  document.querySelector("#overviewNoticeText").textContent = latest.split("\n").filter(Boolean).slice(-1)[0] || "";
}

export function renderDiagnostics({ details, status, doctor, escapeHtml, sessionLabel }) {
  if (!details) return;
  document.querySelector("#railLoopback").textContent = details.engine?.loopback || "127.0.0.1";
  const integrity = doctor?.officialAppSignatureValid === true;
  const liveMismatch = doctor?.liveMatchesCurrent === false;
  const healthGrid = document.querySelector("#healthGrid");
  healthGrid.classList.remove("skeleton-grid");
  healthGrid.innerHTML = [
    healthItem(status.codexInstalled ? "pass" : "warn", "Codex 官方应用", status.codexInstalled ? `${status.codexVersion || "版本未知"} · ${status.codexRunning ? "正在运行" : "未运行"}` : "没有找到 com.openai.codex", escapeHtml),
    healthItem(liveMismatch ? "warn" : status.session === "active" ? "pass" : status.session === "stale" ? "fail" : "warn", "Dream Skin 会话", liveMismatch ? `页面版本 ${doctor.liveVersion}，请重新应用 ${doctor.version}` : `${sessionLabel(status.session)} · 注入器${status.injectorAlive ? "正常" : "未运行"}`, escapeHtml),
    healthItem(status.session === "active" && status.injectorAlive ? "pass" : "warn", "回环 CDP", `${status.port || 9341} · 仅限 127.0.0.1`, escapeHtml),
    healthItem(integrity ? "pass" : "neutral", "官方完整性", integrity ? "签名有效，未修改 app.asar" : "运行深度诊断后验证签名", escapeHtml),
  ].join("");

  const environment = [
    ["Studio 版本", details.engine?.version || "未知"],
    ["Codex 版本", status.codexVersion || "未检测"],
    ["Codex 路径", status.codexBundle || "未检测"],
    ["配置文件", details.paths?.configPath],
    ["当前主题", details.paths?.currentThemeRoot],
    ["主题库", details.paths?.themeRoot],
    ["图片收件箱", details.paths?.imagesRoot],
    ["本地控制", details.engine?.loopback],
  ];
  document.querySelector("#environmentList").innerHTML = environment
    .map(([term, value]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value || "—")}</dd></div>`).join("");

  const labels = { injector: "注入器", injectorError: "注入器错误", startError: "启动错误", codexError: "Codex 启动错误" };
  const groups = document.querySelector("#logGroups");
  groups.replaceChildren();
  for (const [key, label] of Object.entries(labels)) {
    const detailsElement = document.createElement("details");
    const summary = document.createElement("summary");
    const pre = document.createElement("pre");
    summary.textContent = `${label}${details.logs?.[key] ? " · 有记录" : " · 空"}`;
    pre.textContent = details.logs?.[key] || "暂无记录";
    detailsElement.append(summary, pre);
    groups.append(detailsElement);
  }
  renderOverviewNotice(details);
}
