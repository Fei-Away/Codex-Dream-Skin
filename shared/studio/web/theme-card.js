export function renderThemeCard(theme, escapeHtml, assetUrl) {
  const official = theme.source === "official";
  const sourceLabel = official ? "Dream Skin 官方场景" : theme.source === "current" ? "当前主题" : "我的主题";
  const media = official
    ? `<button class="theme-media" data-preview="${escapeHtml(theme.id)}" aria-label="查看${escapeHtml(theme.name)}大图"><img src="${escapeHtml(assetUrl(theme.imageUrl))}" alt="${escapeHtml(theme.name)}运行效果预览"></button>`
    : `<div class="theme-media"><img src="${escapeHtml(assetUrl(theme.imageUrl))}" alt="${escapeHtml(theme.name)}主题预览"></div>`;
  let actions;
  if (official) {
    actions = `<button class="command ${theme.active ? "" : "primary"}" data-apply="${escapeHtml(theme.id)}" ${theme.active ? "disabled" : ""}>${theme.active ? "正在使用" : "应用主题"}</button><button class="command" data-preview="${escapeHtml(theme.id)}">查看大图</button><button class="command" data-create-reference="${escapeHtml(theme.id)}">参考创建</button>`;
  } else {
    actions = [
      `<button class="command ${theme.active ? "" : "primary"}" data-apply="${escapeHtml(theme.id)}" ${theme.active ? "disabled" : ""}>${theme.active ? "正在使用" : "应用主题"}</button>`,
      `<button class="command" data-edit="${escapeHtml(theme.id)}">编辑</button>`,
      `<button class="command" data-duplicate="${escapeHtml(theme.id)}">参考创建</button>`,
      theme.source === "library" && !theme.active ? `<button class="command danger" data-delete="${escapeHtml(theme.id)}">删除</button>` : "",
    ].join("");
  }
  return `<article class="theme-card${theme.active ? " active" : ""}">
    ${media}<div class="theme-badges"><span class="theme-badge ${official ? "official" : theme.active ? "active" : ""}">${sourceLabel}</span>${theme.active ? '<span class="theme-badge active">正在使用</span>' : ""}</div>
    <div class="theme-body"><h3>${escapeHtml(theme.name || "未命名主题")}</h3><p>${escapeHtml(theme.tagline || "本机 Dream Skin 自定义主题")}</p><div class="theme-tags">${escapeHtml(theme.tag || (official ? "OFFICIAL SCENE" : "LOCAL THEME"))}</div><div class="card-actions multi">${actions}</div></div>
  </article>`;
}
