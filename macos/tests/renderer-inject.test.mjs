import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(here, "..");
const template = await fs.readFile(path.join(macosRoot, "assets", "renderer-inject.js"), "utf8");
const css = await fs.readFile(path.join(macosRoot, "assets", "dream-skin.css"), "utf8");
const duoThemeId = "preset-sky-garden-duo";
const duoThemeSelector = `[data-dream-theme-id="${duoThemeId}"]`;
const duoAssetRoot = path.join(macosRoot, "assets", "preset-extras", duoThemeId);
const duoIconFiles = [
  "nav-new-task.webp",
  "nav-pull-requests.webp",
  "nav-sites.webp",
  "nav-scheduled.webp",
  "nav-plugins.webp",
  "nav-search.webp",
  "control-permissions.webp",
  "control-send.webp",
];
const duoIconRoles = ["newTask", "pullRequests", "sites", "scheduled", "plugins", "search", "permissions", "send"];
const fixtureDuoIcons = Object.fromEntries(
  duoIconRoles.map((role) => [role, "data:image/webp;base64,UklGRg=="]),
);
const fixtureDuoWidgetArt = "data:image/png;base64,V0lER0VU";
const fixtureDuoForegroundArt = "data:image/png;base64,Rk9SRUdST1VORA==";
const fixtureDuoLoungeArt = "data:image/png;base64,TE9VTkdF";
const fixtureDuoLoungeBodyArt = "data:image/webp;base64,Qk9EWQ==";
const fixtureDuoLoungeLeftLegsArt = "data:image/webp;base64,TEVGVExFR1M=";
const fixtureDuoLoungeRightLegsArt = "data:image/webp;base64,UklHSFRMRUdT";
const fixtureDuoLoungeBlinkArt = "data:image/webp;base64,QkxJTks=";
let duoIconBytes = 0;
for (const name of duoIconFiles) {
  const icon = await fs.readFile(path.join(duoAssetRoot, "duo-character-icons", name));
  assert.equal(icon.subarray(0, 4).toString("ascii"), "RIFF", `${name} must be a WebP asset.`);
  assert.ok(icon.length < 80_000, `${name} must stay compact enough for the renderer payload.`);
  duoIconBytes += icon.length;
}
assert.ok(duoIconBytes < 250_000, "The complete character icon pack must stay below 250 KB.");
for (const name of ["duo-sidebar-widget-v3.png", "duo-foreground-characters-jk-v1.png"]) {
  const asset = await fs.readFile(path.join(duoAssetRoot, name));
  assert.equal(asset.subarray(0, 4).toString("hex"), "89504e47", `${name} must be a PNG asset.`);
  assert.ok(asset.length < 2_000_000, `${name} must stay below 2 MB.`);
}
const duoLoungeAsset = await fs.readFile(path.join(duoAssetRoot, "duo-lounge-jk-v1.png"));
assert.equal(duoLoungeAsset.subarray(0, 4).toString("hex"), "89504e47");
assert.ok(duoLoungeAsset.length < 2_000_000, "The lounge mascot must stay below 2 MB.");
for (const name of [
  "duo-lounge-body-v2.webp",
  "duo-lounge-left-legs-v2.webp",
  "duo-lounge-right-legs-v2.webp",
  "duo-lounge-blink-v1.webp",
]) {
  const asset = await fs.readFile(path.join(duoAssetRoot, name));
  assert.equal(asset.subarray(0, 4).toString("ascii"), "RIFF", `${name} must be a WebP asset.`);
  assert.ok(asset.length < 500_000, `${name} must stay compact enough for the renderer payload.`);
}

assert.match(
  template,
  /\(\(cssText, artDataUrl, themeConfig, duoIcons, duoWidgetArt, duoForegroundArt, duoLoungeArt, duoLoungeBodyArt, duoLoungeLeftLegsArt, duoLoungeRightLegsArt, duoLoungeBlinkArt\) =>/,
  "The renderer must receive the icon pack and all independent duo artwork as payload arguments.",
);
assert.match(template, /__DREAM_DUO_ICONS_JSON__/);
for (const role of duoIconRoles) {
  assert.match(template, new RegExp(`\\b${role}\\b`), `The renderer must map the ${role} character role.`);
}
assert.match(
  template,
  /DUO_NAV_TARGETS[\s\S]{0,900}新建任务[\s\S]{0,900}拉取请求[\s\S]{0,900}站点[\s\S]{0,900}已安排[\s\S]{0,900}插件[\s\S]{0,5000}ensureDuoCharacterIcons/,
  "Native Chinese navigation labels must map to their generated character roles.",
);
assert.match(
  template,
  /DUO_ICON_ATTR\s*=\s*"data-dream-character-icon"[\s\S]{0,300}DUO_ROLE_ATTR\s*=\s*"data-dream-character-role"[\s\S]+removeDuoCharacterIcons\(\);[\s\S]{0,1800}delete window\[STATE_KEY\]/,
  "Soft-off must remove generated character nodes and their target markers.",
);
assert.match(
  css,
  /\.dream-duo-character-icon\s*\{[\s\S]{0,500}pointer-events:\s*none/,
  "Decorative characters must never intercept native Codex controls.",
);
assert.match(
  css,
  /data-dream-character-kind="nav"[\s\S]{0,500}min-height:\s*44px/,
  "Character navigation rows must keep a comfortable native click target.",
);
assert.match(
  css,
  /data-dream-character-kind="nav"[\s\S]{0,500}padding-left:\s*24px !important/,
  "Character navigation rows must reserve enough space to keep labels clear of the artwork.",
);
assert.match(
  css,
  /data-dream-character-role="permissions"[\s\S]{0,500}padding-left:\s*20px !important/,
  "The permission character must not overlap its native label.",
);

assert.match(
  template,
  /const ensureDuoWidget[\s\S]{0,1600}<img src="\$\{DUO_WIDGET_ART\}" alt="">/,
  "The sidebar widget must stay bound to its dedicated long-gown artwork.",
);
assert.match(
  template,
  /createDuoMotion[\s\S]{0,3000}dream-duo-characters[\s\S]{0,260}src="\$\{DUO_FOREGROUND_ART\}"/,
  "The motion stage must render the clear duo as an independent foreground layer.",
);
assert.match(
  template,
  /createDuoMotion[\s\S]{0,1600}dream-duo-lounge-static[\s\S]{0,260}src="\$\{DUO_LOUNGE_ART\}"/,
  "The motion stage must preserve the original reclining duo as a static fallback.",
);
assert.match(
  template,
  /createDuoMotion[\s\S]{0,2200}dream-duo-lounge-left-legs[\s\S]{0,260}src="\$\{DUO_LOUNGE_LEFT_LEGS_ART\}"[\s\S]{0,500}dream-duo-lounge-right-legs[\s\S]{0,260}src="\$\{DUO_LOUNGE_RIGHT_LEGS_ART\}"[\s\S]{0,500}dream-duo-lounge-body[\s\S]{0,260}src="\$\{DUO_LOUNGE_BODY_ART\}"/,
  "The upper mascot must render a fixed body above two independently moving leg groups.",
);
assert.match(
  css,
  /\.dream-duo-lounge-left-legs[\s\S]{0,900}transform-origin:\s*13\.65% 75\.4%[\s\S]{0,500}animation:\s*dream-duo-lounge-left-swing 4\.6s cubic-bezier\(\.45, 0, \.55, 1\) infinite alternate/,
  "The white-stocking legs must swing continuously around their knee pivot.",
);
assert.match(
  css,
  /\.dream-duo-lounge-right-legs[\s\S]{0,900}transform-origin:\s*87% 75\.4%[\s\S]{0,500}animation:\s*dream-duo-lounge-right-swing 4\.6s cubic-bezier\(\.45, 0, \.55, 1\) infinite alternate/,
  "The black-stocking legs must counter-swing continuously around their knee pivot.",
);
assert.doesNotMatch(
  css,
  /dream-duo-lounge-(?:left|right)-swing[\s\S]{0,500}steps\(/,
  "The leg motion must not use stepped sprite playback.",
);
assert.match(
  css,
  /\.dream-duo-lounge-blink[\s\S]{0,700}animation:\s*dream-duo-lounge-blink/,
  "The eyelids must animate independently from the leg sprite.",
);
assert.match(
  css,
  /data-dream-motion-state="paused"[\s\S]{0,240}animation-play-state:\s*paused !important;/,
  "The lounge animation layers must inherit the hidden-window pause contract.",
);

assert.match(
  css,
  new RegExp(`${duoThemeSelector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]+#codex-dream-skin-motion-stage`),
  "The dynamic stage must be scoped to the dedicated white-black duo theme.",
);
assert.match(
  css,
  /data-dream-motion-state="paused"[\s\S]{0,180}animation-play-state:\s*paused !important;/,
  "Hidden Codex windows must pause the dedicated theme animations.",
);
for (const match of css.matchAll(/@keyframes\s+dream-duo-[^{]+\{([\s\S]*?)\n\}/g)) {
  assert.doesNotMatch(
    match[1],
    /\b(?:background-position|filter|top|left|width|height)\s*:/,
    "Dedicated motion keyframes may animate only compositor-friendly transform and opacity properties.",
  );
}

assert.doesNotMatch(
  css,
  /main\.main-surface\s*>\s*header\.app-header-tint\s*\{[^}]*\b(?:position|z-index)\s*:/,
  "The skin must preserve Codex's native fixed header so the side-panel toggle remains reachable.",
);
assert.doesNotMatch(
  css,
  /main\.main-surface:not\(\.dream-skin-home-shell\)\s*>\s*\*\s*\{[^}]*\bposition\s*:/,
  "Task-route child layering must not overwrite the native header position.",
);

assert.doesNotMatch(
  css,
  /background-image:\s*var\(--dream-skin-art\),\s*var\(--dream-skin-art\)/,
  "The home hero must not stack duplicate copies of the selected image.",
);
assert.match(
  css,
  /data-dream-art-safe="left"[\s\S]{0,140}--ds-art-position:\s*100% var\(--ds-focus-y\);/,
  "A left text-safe image must preserve its right-side subject on narrower windows.",
);
assert.doesNotMatch(
  css,
  /background-size:\s*auto 100% !important;/,
  "Wide home artwork must not leave an unpainted half-card by fitting only to height.",
);
assert.doesNotMatch(
  css,
  /background-size:\s*100% 100%,\s*100% 100%,\s*100% auto;/,
  "Wide task artwork must cover the full route instead of ending above the composer.",
);
assert.match(
  css,
  /data-dream-art-task-mode="ambient"[\s\S]{0,500}body\s*\{[\s\S]{0,500}background-image:\s*var\(--dream-skin-art\) !important;[\s\S]{0,200}background-size:\s*cover !important;/,
  "Wide ambient task artwork should cover the full application window.",
);
assert.match(
  css,
  /data-dream-task-mode="banner"[\s\S]{0,900}body\s*\{[\s\S]{0,500}background-image:\s*var\(--dream-skin-art\) !important;[\s\S]{0,200}background-size:\s*cover !important;/,
  "Wide banner task artwork should use the same full-window wallpaper contract as ambient routes.",
);
assert.match(
  css,
  /data-dream-art-wide="true"\]:has\(main\.main-surface\.dream-skin-home-shell\)[\s\S]{0,100}body\s*\{[\s\S]{0,300}background-image:\s*var\(--dream-skin-art\) !important;/,
  "Wide home artwork should use the same full-window image as utility routes.",
);
assert.match(
  css,
  /data-dream-art-wide="true"\]:has\(main\.main-surface\.dream-skin-home-shell\)[\s\S]{0,120}body\s*\{[\s\S]{0,260}background-position:\s*var\(--ds-art-position\) !important;/,
  "Wide home artwork must honor the configured focal point instead of forcing a centered crop.",
);
assert.match(
  css,
  /data-dream-art-task-mode="ambient"[\s\S]{0,260}data-dream-art-wide="true"\]:has\(main\.main-surface:not\(\.dream-skin-home-shell\)\)[\s\S]{0,120}body\s*\{[\s\S]{0,260}background-position:\s*var\(--ds-art-position\) !important;/,
  "Wide task artwork must retain the same focal point as the home route.",
);
assert.match(
  css,
  /data-dream-art-wide="true"\]\s+\.composer-surface-chrome\s*\{[\s\S]{0,500}backdrop-filter:\s*none !important;/,
  "Wide artwork should use one uniform composer surface without a split blur layer.",
);
assert.match(
  css,
  /--ds-immersive-composer-solid:\s*rgb\(var\(--ds-panel-rgb\) \/ \.74\);/,
  "The light composer should retain enough transparency to reveal the selected artwork.",
);
assert.match(
  css,
  /data-dream-shell="light"\]\[data-dream-art-wide="true"\][\s\S]{0,100}\.composer-surface-chrome\s*\{[\s\S]{0,400}backdrop-filter:\s*blur\(8px\) saturate\(102%\) !important;/,
  "The translucent light composer should softly separate text from detailed artwork.",
);
assert.match(
  template,
  /\[class\*="_homeUtilityBar_"\][\s\S]{0,500}dream-skin-home-utility/,
  "The renderer should give the current native home utility bar a stable theme class.",
);
assert.match(
  css,
  /\.dream-skin-home:has\(\.dream-skin-home-utility\)[\s\S]{0,120}\.composer-surface-chrome\s*\{[\s\S]{0,180}border-radius:\s*0 0 22px 22px !important;/,
  "The home utility bar and composer should render as one continuous control.",
);
assert.match(
  css,
  /\.composer-surface-chrome button:not\(\[class~="bg-token-foreground"\]\)[\s\S]{0,100}color:\s*var\(--ds-muted\) !important;/,
  "Composer controls must remain readable when Codex native tokens lag behind a forced dark appearance.",
);
assert.match(
  css,
  /\.composer-surface-chrome button:not\(\[class~="bg-token-foreground"\]\) \*\s*\{[\s\S]{0,80}color:\s*currentColor !important;/,
  "Nested labels inside composer controls must inherit the corrected theme color.",
);
assert.match(
  css,
  /home-suggestions button \[class~="text-token-text-primary"\]\s*\{[\s\S]{0,80}color:\s*var\(--ds-text\) !important;/,
  "Home suggestion labels must override native light-shell text tokens with the selected theme color.",
);
assert.match(
  css,
  /\.composer-surface-chrome p\.placeholder::after\s*\{[\s\S]{0,120}color:\s*rgb\(var\(--ds-muted-rgb\) \/ \.82\) !important;[\s\S]{0,80}opacity:\s*1 !important;/,
  "Composer placeholder text must not inherit a stale native color with double opacity.",
);
assert.match(
  css,
  /header\.app-header-tint\s*\{[\s\S]{0,180}background:\s*transparent !important;/,
  "Wide artwork should not paint a separate opaque header band.",
);
assert.match(
  css,
  /\.thread-scroll-container \.bg-gradient-to-t\.from-token-main-surface-primary\s*\{[\s\S]{0,100}background:\s*transparent !important;/,
  "Wide artwork should remove the native opaque fade behind the sticky composer.",
);
assert.match(
  css,
  /div\.sticky:has\(input\[type="text"\]\)[\s\S]{0,100}background:\s*transparent !important;/,
  "Search routes should not retain the native opaque sticky band.",
);
assert.match(
  css,
  /\[class~="bg-token-main-surface-primary"\]\[class~="h-full"\]\[class~="w-full"\][\s\S]{0,100}background:\s*transparent !important;/,
  "Full-size utility route wrappers should not hide the selected artwork.",
);
assert.match(
  css,
  /\.dream-duo-petals i\s*\{[\s\S]{0,700}rgb\(116 157 223 \/ \.95\)[\s\S]{0,300}box-shadow:/,
  "Duo petals must use a visible blue edge and shadow on the bright artwork.",
);
assert.match(
  css,
  /@keyframes dream-duo-petal\s*\{[\s\S]{0,180}12%\s*\{\s*opacity:\s*\.9/,
  "Duo petals must reach a readable foreground opacity.",
);
assert.match(
  css,
  /\.dream-duo-art\s*\{[\s\S]{0,520}background-position:\s*calc\(100% \+ 18px\) var\(--ds-focus-y\);[\s\S]{0,180}background-size:\s*auto 92%;[\s\S]{0,220}filter:\s*contrast\(1\.08\) saturate\(1\.06\)/,
  "The duo artwork must shrink slightly, move right, and retain crisp character contrast.",
);
assert.match(
  css,
  /@keyframes dream-duo-breathe\s*\{[\s\S]{0,240}scale\(\.996\)[\s\S]{0,160}scale\(1\.006\)/,
  "Background breathing must remain nearly scale-neutral so the smaller artwork stays crisp.",
);
assert.doesNotMatch(
  css,
  /--dream-motion-[xy]/,
  "Background breathing must not include pointer-driven translation variables.",
);
assert.match(
  css,
  /\.dream-duo-lounge\s*\{[\s\S]{0,760}top:\s*var\(--dream-duo-lounge-top,\s*clamp\([\s\S]{0,200}right:\s*var\(--dream-duo-lounge-right,\s*clamp\([\s\S]{0,180}left:\s*var\(--dream-duo-lounge-left,\s*auto\)[\s\S]{0,300}height:\s*var\(--dream-duo-lounge-height,\s*clamp\([\s\S]{0,280}pointer-events:\s*none[\s\S]{0,120}translate:\s*var\(--dream-duo-lounge-translate-x,\s*0\) 0/,
  "The reclining duo must support measured panel-centered placement and remain non-interactive.",
);
assert.match(
  css,
  /\.dream-duo-characters\s*\{[\s\S]{0,520}height:\s*var\(--dream-duo-foreground-height,\s*clamp\(300px, 44%, 460px\)\)/,
  "The main duo must accept a measured collision-safe height.",
);
assert.match(
  css,
  /data-dream-duo-foreground-mode="hidden"[\s\S]{0,180}\.dream-duo-characters\s*\{[\s\S]{0,100}opacity:\s*0 !important/,
  "The main duo must fade out when a native floating panel leaves no safe area.",
);
assert.doesNotMatch(
  css,
  /#codex-dream-skin-motion-stage\s*\{[^}]*background-image:\s*var\(--dream-skin-art\)/,
  "The motion stage must not paint a second full-window copy of the artwork.",
);
assert.equal(
  (template.match(/<div class="dream-duo-light/g) || []).length,
  1,
  "The dynamic stage must use one combined flowing-light layer.",
);
assert.match(template, /dream-duo-light dream-duo-light-flow/);
assert.doesNotMatch(
  css,
  /\.dream-duo-light\s*\{[^}]*(?:mix-blend-mode|mask-image)/,
  "The combined light must avoid full-window blend and mask surfaces.",
);
assert.match(
  css,
  /@keyframes dream-duo-light-flow\s*\{[\s\S]{0,220}opacity:\s*\.22/,
  "The combined light must remain subtle enough to preserve facial detail.",
);
assert.match(css, /#codex-dream-skin-sidebar-widget\s*\{/);
assert.match(
  css,
  /#codex-dream-skin-sidebar-widget img\s*\{[\s\S]{0,420}inset:\s*0;[\s\S]{0,140}width:\s*100%;[\s\S]{0,100}height:\s*100%;[\s\S]{0,100}object-fit:\s*cover;[\s\S]{0,100}object-position:\s*78% 48%;[\s\S]{0,160}animation:\s*none !important;/,
  "The sidebar artwork must fill the measured card with a stable crop of the matching source image.",
);
assert.match(
  css,
  /\.dream-skin-home \.group\\\/home-suggestions button\s*\{[\s\S]{0,320}rgb\(var\(--ds-panel-rgb\) \/ \.94\)[\s\S]{0,100}rgb\(var\(--ds-panel-rgb\) \/ \.90\)/,
  "All four home suggestion cards must use the same high-opacity glass surface.",
);
assert.match(
  css,
  /aside\.app-shell-left-panel\s*\{[\s\S]{0,420}backdrop-filter:\s*none !important;/,
  "The nearly opaque sidebar must not continuously blur the moving artwork.",
);
assert.match(
  css,
  /\.dream-skin-home \.group\\\/home-suggestions button\s*\{[\s\S]{0,420}backdrop-filter:\s*none !important;/,
  "The nearly opaque home cards must not continuously blur the moving artwork.",
);
assert.match(
  css,
  /data-dream-theme-id="preset-sky-garden-duo"\][\s\S]{0,100}main\.main-surface\.dream-skin-home-shell[\s\S]{0,160}\.dream-skin-home > div:first-child > div:first-child > div:first-child\s*\{[\s\S]{0,260}background:\s*transparent !important;[\s\S]{0,180}backdrop-filter:\s*none !important;/,
  "The duo home hero must not blur or cover the full artwork.",
);
assert.match(
  css,
  /\.dream-skin-home > div:first-child > div:first-child > div:first-child > div:first-child > div:first-child\s*\{[\s\S]{0,500}background:\s*linear-gradient[\s\S]{0,240}backdrop-filter:\s*blur\(10px\)/,
  "Only the compact home-title panel may retain a readability blur.",
);
assert.match(
  css,
  /:is\(pre, \[class\*="codeBlock"\], \[class\*="_codeBlock_"\]\)\s*\{[\s\S]{0,220}rgb\(var\(--ds-bg-rgb\) \/ \.98\)[\s\S]{0,220}backdrop-filter:\s*none !important;/,
  "Duo code and command output must use a nearly opaque, blur-free reading surface.",
);
assert.match(
  css,
  /\[class\*="thread-floating-content"\] \.pointer-events-auto > \[class~="bg-token-dropdown-background"\]\s*\{[\s\S]{0,420}linear-gradient[\s\S]{0,260}border-box[\s\S]{0,220}backdrop-filter:\s*none !important;/,
  "The native thread floating panel must use the duo gradient frame without a continuous blur.",
);
assert.match(
  css,
  /\[class\*="thread-floating-content"\][\s\S]{0,180}\[class~="bg-token-dropdown-background"\] section > header\s*\{[\s\S]{0,260}color:\s*var\(--ds-highlight\) !important;/,
  "Floating panel section titles must inherit the duo hierarchy color.",
);
assert.match(
  css,
  /aside:has\(\[role="tabpanel"\]\)[\s\S]{0,180}\[class~="bg-token-main-surface-primary"\]\s*\{[\s\S]{0,420}linear-gradient[\s\S]{0,260}border-left:\s*1px solid rgb\(var\(--ds-secondary-rgb\) \/ \.30\) !important;[\s\S]{0,180}backdrop-filter:\s*none !important;/,
  "Expanded native workspace panels must use the opaque duo surface instead of the official white token.",
);
assert.match(
  css,
  /aside:has\(\[role="tabpanel"\]\)[\s\S]{0,180}\[class~="h-toolbar"\]\[class~="bg-token-main-surface-primary"\]\s*\{[\s\S]{0,260}linear-gradient[\s\S]{0,180}border-bottom:/,
  "Expanded panel toolbars must visually connect to the duo panel surface.",
);
assert.match(
  css,
  /aside:has\(\[role="tabpanel"\]\) \[role="tab"\]\s*\{[\s\S]{0,260}background:\s*linear-gradient[\s\S]{0,220}border:\s*1px solid rgb\(var\(--ds-secondary-rgb\) \/ \.24\) !important;/,
  "Expanded panel tabs must replace the native gray pill with the duo active-tab treatment.",
);
assert.match(
  css,
  /aside:has\(\[role="tabpanel"\]\)[\s\S]{0,180}\[role="tabpanel"\] h2\s*\{[\s\S]{0,220}color:\s*var\(--ds-highlight\) !important;[\s\S]{0,160}border-left:/,
  "Expanded panel section headings must use the duo hierarchy treatment.",
);
assert.match(
  css,
  /aside:has\(\[role="tabpanel"\]\)[\s\S]{0,180}\[role="tabpanel"\] button\[class~="min-h-8"\]\[class~="w-full"\]\s*\{[\s\S]{0,300}background:\s*linear-gradient[\s\S]{0,240}border:\s*1px solid rgb\(var\(--ds-accent-rgb\) \/ \.14\) !important;/,
  "Expanded subagent and source rows must receive a restrained themed card surface.",
);
assert.match(
  css,
  /\[role="tabpanel"\]:is\(\[aria-label="来源"\], \[aria-label="Sources"\]\)[\s\S]{0,120}button\[class~="w-full"\]\s*\{[\s\S]{0,300}background:\s*linear-gradient[\s\S]{0,240}border:\s*1px solid rgb\(var\(--ds-secondary-rgb\) \/ \.16\) !important;/,
  "Expanded source rows must use the theme card surface even though they do not share the subagent row classes.",
);

function createStyleDeclaration() {
  const values = new Map();
  return {
    values,
    getPropertyValue(name) { return values.get(name) ?? ""; },
    setProperty(name, value) { values.set(name, value); },
    removeProperty(name) { values.delete(name); },
  };
}

function createClassList(initial = []) {
  const values = new Set(initial);
  const calls = { add: 0, remove: 0, toggle: 0 };
  return {
    values,
    calls,
    add(...names) {
      calls.add += 1;
      for (const name of names) values.add(name);
    },
    remove(...names) {
      calls.remove += 1;
      for (const name of names) values.delete(name);
    },
    contains(name) { return values.has(name); },
    toggle(name, enabled) {
      calls.toggle += 1;
      if (enabled) values.add(name);
      else values.delete(name);
    },
  };
}

function createFixture(theme, {
  nativeShell = "light",
  analysisFixture = null,
  analysisCache = null,
  withCharacterTargets = false,
  blockingOverlayBox = null,
} = {}) {
  let fixtureShell = nativeShell;
  const nodes = new Map();
  const attributes = new Map();
  const bodyAttributes = new Map();
  const observers = [];
  const resizeObservers = [];
  const timers = new Map();
  const animationFrames = new Map();
  const windowListeners = new Map();
  const documentListeners = new Map();
  const allElements = new Set();
  const blockingOverlays = [];
  let nextTimer = 1;
  let nextAnimationFrame = 1;
  let nextBlob = 1;
  let documentHidden = false;
  const rootStyle = createStyleDeclaration();
  const root = {
    className: nativeShell === "dark" ? "electron-dark" : "electron-light",
    classList: createClassList(),
    style: rootStyle,
    appendChild(node) {
      node.parentElement = root;
      if (node.id) nodes.set(node.id, node);
    },
    getAttribute(name) { return attributes.get(name) ?? null; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
  };
  const body = {
    className: "",
    appendChild(node) {
      node.parentElement = body;
      if (node.id) nodes.set(node.id, node);
    },
    getAttribute(name) { return bodyAttributes.get(name) ?? null; },
    setAttribute(name, value) { bodyAttributes.set(name, String(value)); },
  };
  const shellBox = { left: 280, top: 36, width: 1000, height: 764 };
  const setBlockingOverlayBox = (box) => {
    blockingOverlays.length = 0;
    if (!box) return;
    const normalized = {
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
      right: box.left + box.width,
      bottom: box.top + box.height,
    };
    blockingOverlays.push({
      childElementCount: 1,
      className: "pointer-events-auto fixed z-[60]",
      computedStyle: {
        display: "block",
        visibility: "visible",
        opacity: "1",
        pointerEvents: "auto",
      },
      getBoundingClientRect() { return { ...normalized }; },
      querySelectorAll() { return []; },
    });
  };
  setBlockingOverlayBox(blockingOverlayBox);
  const shellMain = {
    classList: createClassList(),
    children: [],
    appendChild(node) {
      node.parentElement = shellMain;
      shellMain.children.push(node);
      if (node.id) nodes.set(node.id, node);
    },
    getBoundingClientRect() {
      return { ...shellBox };
    },
  };
  const sidebarNav = { id: "native-sidebar-navigation" };
  const sidebarContent = { id: "native-sidebar-content" };
  const sidebarScroll = {
    children: [sidebarNav, sidebarContent],
    insertBefore(node, reference) {
      node.parentElement = sidebarScroll;
      const index = sidebarScroll.children.indexOf(reference);
      if (index < 0) sidebarScroll.children.push(node);
      else sidebarScroll.children.splice(index, 0, node);
      if (node.id) nodes.set(node.id, node);
    },
  };
  const sidebar = {
    querySelector(selector) {
      return selector === ".vertical-scroll-fade-mask" ? sidebarScroll : null;
    },
  };

  const createElement = (tagName) => {
    if (tagName === "canvas" && analysisFixture) {
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            drawImage() {},
            getImageData() { return { data: analysisFixture.pixels }; },
          };
        },
      };
    }
    const childNodes = new Map();
    const elementAttributes = new Map();
    const normalizedTagName = String(tagName).toLowerCase();
    const descendantElements = () => {
      const descendants = [];
      const visit = (node) => {
        for (const child of node.children ?? []) {
          descendants.push(child);
          visit(child);
        }
      };
      visit(element);
      return descendants;
    };
    const matchesSelector = (node, selector) => {
      if (selector === "svg") return node.tagName === "svg";
      const attribute = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
      if (!attribute) return false;
      const value = node.getAttribute?.(attribute[1]);
      return attribute[2] === undefined ? value !== null : value === attribute[2];
    };
    const element = {
      id: "",
      tagName: normalizedTagName,
      dataset: {},
      style: createStyleDeclaration(),
      classList: createClassList(),
      className: "",
      parentElement: null,
      children: [],
      textContent: "",
      innerHTML: "",
      get firstChild() { return element.children[0] ?? null; },
      getAttribute(name) { return elementAttributes.get(name) ?? null; },
      setAttribute(name, value) { elementAttributes.set(name, String(value)); },
      removeAttribute(name) { elementAttributes.delete(name); },
      appendChild(node) {
        node.parentElement = element;
        element.children.push(node);
        allElements.add(node);
        if (node.id) nodes.set(node.id, node);
      },
      insertBefore(node, reference) {
        node.parentElement = element;
        const index = element.children.indexOf(reference);
        if (index < 0) element.children.push(node);
        else element.children.splice(index, 0, node);
        allElements.add(node);
      },
      prepend(node) { element.insertBefore(node, element.firstChild); },
      querySelector(selector) {
        const match = descendantElements().find((node) => matchesSelector(node, selector));
        if (match) return match;
        if (selector === "svg" || /^\[[^\]]+\]$/.test(selector)) return null;
        if (!childNodes.has(selector)) childNodes.set(selector, { textContent: "" });
        return childNodes.get(selector);
      },
      querySelectorAll(selector) {
        return descendantElements().filter((node) => matchesSelector(node, selector));
      },
      remove() {
        if (element.id) nodes.delete(element.id);
        if (element.parentElement?.children) {
          element.parentElement.children = element.parentElement.children.filter((child) => child !== element);
        }
        element.parentElement = null;
        allElements.delete(element);
      },
    };
    allElements.add(element);
    return element;
  };

  const makeCharacterTarget = (text, ariaLabel = text) => {
    const target = createElement("button");
    target.textContent = text;
    target.setAttribute("aria-label", ariaLabel);
    target.parentElement = sidebar;
    target.appendChild(createElement("svg"));
    return target;
  };
  const characterTargets = withCharacterTargets ? {
    nav: [
      makeCharacterTarget("新建任务"),
      makeCharacterTarget("拉取请求"),
      makeCharacterTarget("站点"),
      makeCharacterTarget("已安排"),
      makeCharacterTarget("插件"),
      makeCharacterTarget("", "搜索"),
      makeCharacterTarget("站点"),
    ],
    controls: [
      makeCharacterTarget("", "添加附件"),
      makeCharacterTarget("完全访问"),
      makeCharacterTarget("", "发送消息"),
    ],
  } : { nav: [], controls: [] };

  const document = {
    documentElement: root,
    head: root,
    body,
    get hidden() { return documentHidden; },
    addEventListener(name, callback) { documentListeners.set(name, callback); },
    removeEventListener(name, callback) {
      if (documentListeners.get(name) === callback) documentListeners.delete(name);
    },
    createElement,
    getElementById(id) { return nodes.get(id) ?? null; },
    querySelector(selector) {
      if (selector === "main.main-surface" || selector === "main") return shellMain;
      if (selector === "aside.app-shell-left-panel") return sidebar;
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes('z-[60]') && selector.includes('thread-floating-content')) {
        return blockingOverlays;
      }
      if (selector === "aside.app-shell-left-panel button, aside.app-shell-left-panel a") {
        return characterTargets.nav;
      }
      if (selector === ".composer-surface-chrome button") return characterTargets.controls;
      const attribute = /^\[([^=\]]+)\]$/.exec(selector);
      if (attribute) {
        return [...allElements].filter((node) => node.getAttribute?.(attribute[1]) !== null);
      }
      return [];
    },
  };
  const mediaQuery = {
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  };
  const revokedUrls = [];
  const window = {
    innerWidth: 1280,
    innerHeight: 800,
    requestAnimationFrame(callback) {
      const id = nextAnimationFrame++;
      animationFrames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) { animationFrames.delete(id); },
    addEventListener(name, callback) { windowListeners.set(name, callback); },
    removeEventListener(name, callback) {
      if (windowListeners.get(name) === callback) windowListeners.delete(name);
    },
    matchMedia() {
      mediaQuery.matches = fixtureShell === "dark";
      return mediaQuery;
    },
  };
  if (analysisCache) window.__CODEX_DREAM_SKIN_ANALYSIS_CACHE__ = analysisCache;
  if (analysisFixture) {
    window.Image = class {
      naturalWidth = analysisFixture.naturalWidth;
      naturalHeight = analysisFixture.naturalHeight;
      set src(_) { this.onload(); }
    };
  }
  const context = {
    window,
    document,
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe() {}
      disconnect() {}
    },
    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.target = null;
        this.observeCalls = 0;
        resizeObservers.push(this);
      }
      observe(target) {
        this.target = target;
        this.observeCalls += 1;
      }
      unobserve(target) {
        if (this.target === target) this.target = null;
      }
      disconnect() { this.target = null; }
    },
    URL: {
      createObjectURL() { return `blob:fixture-${nextBlob++}`; },
      revokeObjectURL(value) { revokedUrls.push(value); },
    },
    Blob,
    Uint8Array,
    atob,
    getComputedStyle(node) {
      if (node?.computedStyle) return node.computedStyle;
      const skinShell = root.classList.contains("codex-dream-skin")
        ? (attributes.get("data-dream-shell") || "dark") : fixtureShell;
      return {
        colorScheme: skinShell,
        backgroundColor: fixtureShell === "dark" ? "rgb(24, 24, 27)" : "rgb(250, 250, 250)",
      };
    },
    setInterval: () => 1,
    clearInterval() {},
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  const payloadFor = (
    nextTheme,
    cssText = ".fixture { color: blue; }",
    artData = "data:image/png;base64,AA==",
  ) => template
    .replace("__DREAM_SKIN_CSS_JSON__", JSON.stringify(cssText))
    .replace("__DREAM_SKIN_ART_JSON__", JSON.stringify(artData))
    .replace("__DREAM_SKIN_THEME_JSON__", JSON.stringify(nextTheme))
    .replace("__DREAM_DUO_ICONS_JSON__", JSON.stringify(fixtureDuoIcons))
    .replace("__DREAM_DUO_WIDGET_ART_JSON__", JSON.stringify(fixtureDuoWidgetArt))
    .replace("__DREAM_DUO_FOREGROUND_ART_JSON__", JSON.stringify(fixtureDuoForegroundArt))
    .replace("__DREAM_DUO_LOUNGE_ART_JSON__", JSON.stringify(fixtureDuoLoungeArt))
    .replace("__DREAM_DUO_LOUNGE_BODY_ART_JSON__", JSON.stringify(fixtureDuoLoungeBodyArt))
    .replace("__DREAM_DUO_LOUNGE_LEFT_LEGS_ART_JSON__", JSON.stringify(fixtureDuoLoungeLeftLegsArt))
    .replace("__DREAM_DUO_LOUNGE_RIGHT_LEGS_ART_JSON__", JSON.stringify(fixtureDuoLoungeRightLegsArt))
    .replace("__DREAM_DUO_LOUNGE_BLINK_ART_JSON__", JSON.stringify(fixtureDuoLoungeBlinkArt))
    .replace("__DREAM_SKIN_VERSION_JSON__", JSON.stringify("test"))
    .replace("__DREAM_SKIN_STYLE_REVISION_JSON__", JSON.stringify(cssText))
    .replace(
      "__DREAM_SKIN_PAYLOAD_REVISION_JSON__",
      JSON.stringify(`${nextTheme.id}:${cssText}`),
    );
  const flushTimers = (maximumDelay = Infinity) => {
    const pending = [...timers.entries()].filter(([, timer]) => timer.delay <= maximumDelay);
    for (const [id, timer] of pending) {
      timers.delete(id);
      timer.callback();
    }
  };
  const flushAnimationFrames = (limit = 100) => {
    let passes = 0;
    while (animationFrames.size && passes < limit) {
      const pending = [...animationFrames.entries()];
      animationFrames.clear();
      for (const [, callback] of pending) callback(performance.now());
      passes += 1;
    }
    return passes;
  };

  return {
    animationFrames,
    attributes,
    body,
    bodyAttributes,
    characterTargets,
    context,
    documentListeners,
    flushAnimationFrames,
    flushTimers,
    nodes,
    observers,
    payload: payloadFor(theme),
    payloadFor,
    revokedUrls,
    resizeObservers,
    root,
    rootStyle,
    shellBox,
    shellMain,
    sidebarScroll,
    timers,
    window,
    windowListeners,
    setBlockingOverlayBox,
    setHidden(value) {
      documentHidden = Boolean(value);
      documentListeners.get("visibilitychange")?.();
    },
    setNativeShell(value) { fixtureShell = value; },
  };
}

const duoTheme = {
  id: duoThemeId,
  appearance: "auto",
  art: { safeArea: "left", taskMode: "ambient", focusX: 0.78, focusY: 0.5 },
  artMetadata: {
    width: 1672,
    height: 941,
    ratio: 1672 / 941,
    wide: true,
    aspect: "wide",
    taskMode: "ambient",
  },
};
const duo = createFixture(duoTheme);
vm.runInNewContext(duo.payload, duo.context);
assert.equal(duo.attributes.get("data-dream-theme-id"), duoThemeId);
assert.equal(duo.attributes.get("data-dream-motion-state"), "running");
assert.equal(duo.shellBox.width, 1000);
assert.equal(duo.shellBox.height, 764);
const duoStage = duo.nodes.get("codex-dream-skin-motion-stage");
assert.ok(duoStage, "The duo theme must create its dedicated motion stage.");
assert.equal(
  (duoStage.innerHTML.match(/<i><\/i>/g) || []).length,
  14,
  "The motion stage must create exactly fourteen petals.",
);
assert.equal(
  (duoStage.innerHTML.match(/dream-duo-light/g) || []).length,
  2,
  "The motion stage must render one light element with its shared and flow classes.",
);
assert.equal(duo.shellMain?.children?.length ?? 1, 1);
assert.equal(
  duo.windowListeners.has("pointermove"),
  false,
  "The duo theme must not register a pointer listener for background tracking.",
);
assert.ok(duo.documentListeners.has("visibilitychange"));
const duoWidget = duo.nodes.get("codex-dream-skin-sidebar-widget");
assert.ok(duoWidget, "The duo theme must add its sidebar companion widget.");
assert.equal(duo.sidebarScroll.children[1], duoWidget, "The widget must sit after native navigation without overlaying tasks.");
assert.match(duoWidget.innerHTML, /天空花园/);
assert.match(duoWidget.innerHTML, /<img src="data:image\/png;base64,V0lER0VU"/);
assert.doesNotMatch(duoWidget.innerHTML, /data:image\/png;base64,AA==/);
assert.match(duoStage.innerHTML, /dream-duo-characters/);
assert.match(duoStage.innerHTML, /data:image\/png;base64,Rk9SRUdST1VORA==/);
assert.match(duoStage.innerHTML, /dream-duo-lounge/);
assert.match(duoStage.innerHTML, /data:image\/png;base64,TE9VTkdF/);
assert.match(duoStage.innerHTML, /dream-duo-lounge-animated/);
assert.match(duoStage.innerHTML, /dream-duo-lounge-body/);
assert.match(duoStage.innerHTML, /data:image\/webp;base64,Qk9EWQ==/);
assert.match(duoStage.innerHTML, /dream-duo-lounge-left-legs/);
assert.match(duoStage.innerHTML, /data:image\/webp;base64,TEVGVExFR1M=/);
assert.match(duoStage.innerHTML, /dream-duo-lounge-right-legs/);
assert.match(duoStage.innerHTML, /data:image\/webp;base64,UklHSFRMRUdT/);
assert.match(duoStage.innerHTML, /dream-duo-lounge-blink/);
assert.match(duoStage.innerHTML, /data:image\/webp;base64,QkxJTks=/);
assert.equal(duo.attributes.get("data-dream-duo-foreground-mode") ?? null, null);

assert.equal(duo.animationFrames.size, 0, "The static background must not schedule pointer interpolation frames.");
assert.equal(duo.rootStyle.values.has("--dream-motion-x"), false);
assert.equal(duo.rootStyle.values.has("--dream-motion-y"), false);
assert.equal(duo.window.__CODEX_DREAM_SKIN_STATE__.metrics.motionFrames, 0);
assert.equal(duo.window.__CODEX_DREAM_SKIN_STATE__.metrics.motionPointerEvents, 0);

const scaledDuo = createFixture(duoTheme, {
  blockingOverlayBox: { left: 900, top: 150, width: 360, height: 360 },
});
vm.runInNewContext(scaledDuo.payload, scaledDuo.context);
assert.equal(scaledDuo.attributes.get("data-dream-duo-foreground-mode"), "scaled");
const scaledHeight = Number.parseFloat(
  scaledDuo.rootStyle.values.get("--dream-duo-foreground-height"),
);
assert.ok(scaledHeight >= 240 && scaledHeight < 300, "The duo must fit below the blocking panel.");
assert.equal(
  scaledDuo.window.__CODEX_DREAM_SKIN_STATE__.metrics.motionAvoidanceMode,
  "scaled",
);
assert.equal(
  scaledDuo.rootStyle.values.get("--dream-duo-lounge-left"),
  "800px",
  "The lounge duo must be horizontally centered over the blocking panel.",
);
assert.equal(
  scaledDuo.rootStyle.values.get("--dream-duo-lounge-top"),
  "22px",
  "The lounge duo must sit directly above the blocking panel.",
);
assert.equal(
  scaledDuo.rootStyle.values.get("--dream-duo-lounge-height"),
  "104px",
  "The lounge duo must use the available fixed space above the panel instead of staying undersized.",
);
assert.equal(scaledDuo.rootStyle.values.get("--dream-duo-lounge-right"), "auto");
assert.equal(scaledDuo.rootStyle.values.get("--dream-duo-lounge-translate-x"), "-50%");
assert.equal(scaledDuo.resizeObservers.length, 2);
assert.ok(scaledDuo.resizeObservers[1].target, "The blocking panel must be resize-observed.");
const blockerObserveCalls = scaledDuo.resizeObservers[1].observeCalls;
scaledDuo.window.__CODEX_DREAM_SKIN_STATE__.ensure({ root: false, route: true, layout: false });
assert.equal(
  scaledDuo.resizeObservers[1].observeCalls,
  blockerObserveCalls,
  "Repeated route checks must not re-observe the same blocking panel.",
);
const avoidanceChecksBeforeStableResize =
  scaledDuo.window.__CODEX_DREAM_SKIN_STATE__.metrics.motionAvoidanceChecks;
scaledDuo.resizeObservers[1].callback([{ target: scaledDuo.resizeObservers[1].target }]);
assert.equal(
  scaledDuo.window.__CODEX_DREAM_SKIN_STATE__.metrics.motionAvoidanceChecks,
  avoidanceChecksBeforeStableResize,
  "A resize notification with unchanged blocker geometry must not start an avoidance loop.",
);
scaledDuo.setBlockingOverlayBox(null);
scaledDuo.window.__CODEX_DREAM_SKIN_STATE__.ensure({ root: false, route: true, layout: true });
assert.equal(scaledDuo.attributes.get("data-dream-duo-foreground-mode") ?? null, null);
assert.equal(scaledDuo.rootStyle.values.get("--dream-duo-foreground-height") ?? "", "");
for (const property of [
  "--dream-duo-lounge-left",
  "--dream-duo-lounge-top",
  "--dream-duo-lounge-right",
  "--dream-duo-lounge-translate-x",
  "--dream-duo-lounge-height",
]) {
  assert.equal(
    scaledDuo.rootStyle.values.get(property) ?? "",
    "",
    `The fallback lounge position must clear ${property} after the panel closes.`,
  );
}

const tightTopDuo = createFixture(duoTheme, {
  blockingOverlayBox: { left: 900, top: 104, width: 360, height: 479 },
});
vm.runInNewContext(tightTopDuo.payload, tightTopDuo.context);
assert.equal(
  tightTopDuo.rootStyle.values.get("--dream-duo-lounge-height"),
  "64px",
  "The lounge duo must shrink when the panel leaves less than its normal height above it.",
);
assert.equal(tightTopDuo.rootStyle.values.get("--dream-duo-lounge-top"), "16px");

const hiddenDuo = createFixture(duoTheme, {
  blockingOverlayBox: { left: 900, top: 120, width: 360, height: 600 },
});
vm.runInNewContext(hiddenDuo.payload, hiddenDuo.context);
assert.equal(hiddenDuo.attributes.get("data-dream-duo-foreground-mode"), "hidden");
assert.equal(hiddenDuo.rootStyle.values.get("--dream-duo-foreground-height") ?? "", "");
assert.equal(
  hiddenDuo.window.__CODEX_DREAM_SKIN_STATE__.metrics.motionAvoidanceMode,
  "hidden",
);
assert.equal(hiddenDuo.window.__CODEX_DREAM_SKIN_STATE__.cleanup(), true);
assert.equal(hiddenDuo.attributes.has("data-dream-duo-foreground-mode"), false);

duo.setHidden(true);
assert.equal(duo.attributes.get("data-dream-motion-state"), "paused");
duo.setHidden(false);
assert.equal(duo.attributes.get("data-dream-motion-state"), "running");

const previousDuoState = duo.window.__CODEX_DREAM_SKIN_STATE__;
vm.runInNewContext(
  duo.payloadFor(duoTheme, ".fixture { color: blue; }", "data:image/png;base64,QkFDS0dST1VORC0y"),
  duo.context,
);
assert.equal(
  duo.shellMain?.children?.filter((node) => node.id === "codex-dream-skin-motion-stage").length ?? 1,
  1,
  "Reinjection must replace rather than duplicate the motion stage.",
);
assert.equal(
  duo.sidebarScroll.children.filter((node) => node.id === "codex-dream-skin-sidebar-widget").length,
  1,
  "Reinjection must replace rather than duplicate the sidebar widget.",
);
assert.match(
  duo.nodes.get("codex-dream-skin-sidebar-widget").innerHTML,
  /data:image\/png;base64,V0lER0VU/,
  "Changing the main background must not change the theme card artwork.",
);
assert.equal(previousDuoState.cleanup(), false);
const activeDuoState = duo.window.__CODEX_DREAM_SKIN_STATE__;
assert.equal(activeDuoState.cleanup(), true);
assert.equal(duo.nodes.has("codex-dream-skin-motion-stage"), false);
assert.equal(duo.nodes.has("codex-dream-skin-sidebar-widget"), false);
assert.equal(duo.attributes.has("data-dream-theme-id"), false);
assert.equal(duo.attributes.has("data-dream-motion-state"), false);
assert.equal(duo.rootStyle.values.has("--dream-motion-x"), false);
assert.equal(duo.windowListeners.has("pointermove"), false);
assert.equal(duo.documentListeners.has("visibilitychange"), false);
assert.equal(duo.animationFrames.size, 0);

vm.runInNewContext(duo.payloadFor(duoTheme), duo.context);
assert.ok(duo.nodes.has("codex-dream-skin-motion-stage"), "The duo theme must reopen after a clean soft-off.");
assert.ok(duo.nodes.has("codex-dream-skin-sidebar-widget"), "The sidebar widget must reopen after a clean soft-off.");

const decorated = createFixture(duoTheme, { withCharacterTargets: true });
const preservedLabels = [...decorated.characterTargets.nav, ...decorated.characterTargets.controls]
  .map((target) => target.getAttribute("aria-label"));
vm.runInNewContext(decorated.payload, decorated.context);
const expectedNavRoles = ["newTask", "pullRequests", "sites", "scheduled", "plugins", "search"];
const expectedControlRoles = ["newTask", "permissions", "send"];
for (const [index, target] of decorated.characterTargets.nav.slice(0, expectedNavRoles.length).entries()) {
  assert.equal(target.getAttribute("data-dream-character-role"), expectedNavRoles[index]);
  assert.equal(target.querySelectorAll("[data-dream-character-icon]").length, 1);
  assert.equal(target.querySelector("svg").getAttribute("data-dream-native-icon"), "true");
}
assert.equal(
  decorated.characterTargets.nav.at(-1).getAttribute("data-dream-character-role"),
  null,
  "A task sharing a native navigation label must not receive a duplicate character role.",
);
for (const [index, target] of decorated.characterTargets.controls.entries()) {
  assert.equal(target.getAttribute("data-dream-character-role"), expectedControlRoles[index]);
  assert.equal(target.querySelectorAll("[data-dream-character-icon]").length, 1);
}
assert.deepEqual(
  [...decorated.characterTargets.nav, ...decorated.characterTargets.controls]
    .map((target) => target.getAttribute("aria-label")),
  preservedLabels,
  "Decorative characters must preserve every native accessible label.",
);
const firstCharacterCreateCount = decorated.window.__CODEX_DREAM_SKIN_STATE__.metrics.characterIconCreates;
decorated.window.__CODEX_DREAM_SKIN_STATE__.ensure({ root: false, route: true, layout: false });
assert.equal(
  decorated.window.__CODEX_DREAM_SKIN_STATE__.metrics.characterIconCreates,
  firstCharacterCreateCount,
  "Repeated ensure passes must not duplicate character nodes.",
);
vm.runInNewContext(decorated.payloadFor(duoTheme), decorated.context);
for (const target of [
  ...decorated.characterTargets.nav.slice(0, expectedNavRoles.length),
  ...decorated.characterTargets.controls,
]) {
  assert.equal(target.querySelectorAll("[data-dream-character-icon]").length, 1);
}
assert.equal(decorated.characterTargets.nav.at(-1).querySelectorAll("[data-dream-character-icon]").length, 0);
assert.equal(decorated.window.__CODEX_DREAM_SKIN_STATE__.cleanup(), true);
for (const target of [...decorated.characterTargets.nav, ...decorated.characterTargets.controls]) {
  assert.equal(target.getAttribute("data-dream-character-role"), null);
  assert.equal(target.querySelectorAll("[data-dream-character-icon]").length, 0);
  assert.equal(target.querySelector("svg").getAttribute("data-dream-native-icon"), null);
}

const nonDuo = createFixture({
  id: "another-theme",
  appearance: "auto",
  art: { safeArea: "left", taskMode: "ambient" },
});
vm.runInNewContext(nonDuo.payload, nonDuo.context);
assert.equal(nonDuo.attributes.get("data-dream-theme-id"), "another-theme");
assert.equal(nonDuo.nodes.has("codex-dream-skin-motion-stage"), false);
assert.equal(nonDuo.nodes.has("codex-dream-skin-sidebar-widget"), false);
assert.equal(nonDuo.windowListeners.has("pointermove"), false);

const defaults = createFixture({
  id: "default-contract",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
});
const defaultResult = vm.runInNewContext(defaults.payload, defaults.context);
assert.equal(defaultResult.installed, true);
assert.equal(defaults.attributes.get("data-dream-shell"), "light");
assert.equal(defaults.attributes.get("data-dream-art-safe-area"), "center");
assert.equal(defaults.attributes.get("data-dream-art-task-mode"), "ambient");
assert.equal(defaults.attributes.get("data-dream-art-ready"), "false");
assert.equal(defaults.rootStyle.values.get("--dream-art-position"), "50.00% 50.00%");
const defaultMetrics = defaults.window.__CODEX_DREAM_SKIN_STATE__.metrics;
assert.equal(defaultMetrics.rootPasses, 1);
assert.equal(defaultMetrics.routePasses, 1);
assert.equal(defaultMetrics.layoutReads, 1);
for (let index = 0; index < 50; index += 1) defaults.observers[0].callback([]);
assert.equal(defaults.timers.size, 1, "Mutation bursts should coalesce into one scheduled ensure.");
defaults.flushTimers(64);
assert.equal(defaultMetrics.rootPasses, 1, "Subtree mutations must not recompute root theme tokens.");
assert.equal(defaultMetrics.routePasses, 2);
assert.equal(defaultMetrics.layoutReads, 1, "Subtree mutations must not force shell layout reads.");
assert.equal(defaults.resizeObservers.length, 1);
assert.ok(defaults.resizeObservers[0].target);
defaults.shellBox.left = 196;
defaults.shellBox.width = 1084;
defaults.resizeObservers[0].callback([]);
defaults.flushTimers(64);
assert.equal(defaultMetrics.layoutReads, 2, "Shell ResizeObserver changes must refresh chrome geometry.");
const defaultChrome = defaults.nodes.get("codex-dream-skin-chrome");
assert.equal(defaultChrome.style.values.get("left"), "196px");
assert.equal(defaultChrome.style.values.get("width"), "1084px");

// Auto appearance must continue following the native shell after the skin is
// already installed. The fixture makes the injected root color-scheme win
// whenever our class remains on <html>, so a temporary native probe is needed
// for each light → dark → light transition.
const shellFollow = createFixture({
  id: "shell-follow",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
});
shellFollow.root.className = "";
vm.runInNewContext(shellFollow.payload, shellFollow.context);
assert.equal(shellFollow.attributes.get("data-dream-shell"), "light");
const rootClassAddsBeforeRefresh = shellFollow.root.classList.calls.add;
shellFollow.window.__CODEX_DREAM_SKIN_STATE__.ensure({ root: true, route: false, layout: false });
assert.equal(
  shellFollow.root.classList.calls.add - rootClassAddsBeforeRefresh,
  1,
  "Refreshing root tokens may restore the shell probe class once, but must not add it redundantly.",
);
shellFollow.setNativeShell("dark");
shellFollow.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(shellFollow.attributes.get("data-dream-shell"), "dark");
shellFollow.setNativeShell("light");
shellFollow.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(shellFollow.attributes.get("data-dream-shell"), "light");

defaults.root.className = "";
defaults.body.setAttribute("data-theme", "dark");
defaults.observers[1].callback([{ type: "attributes", target: defaults.body }]);
defaults.flushTimers(64);
assert.equal(defaults.attributes.get("data-dream-shell"), "dark", "Body theme changes must apply without the fallback interval.");

const synchronousWide = createFixture({
  id: "synchronous-wide",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
  artKey: "wide-art",
  artMetadata: {
    width: 2400,
    height: 1350,
    ratio: 2400 / 1350,
    wide: true,
    aspect: "wide",
    taskMode: "ambient",
  },
});
vm.runInNewContext(synchronousWide.payload, synchronousWide.context);
assert.equal(synchronousWide.attributes.get("data-dream-art-wide"), "true");
assert.equal(synchronousWide.attributes.get("data-dream-art-aspect"), "wide");
assert.equal(synchronousWide.attributes.get("data-dream-art-task-mode"), "ambient");
assert.equal(synchronousWide.attributes.get("data-dream-art-ready"), "false");

const cachedAnalysis = {
  width: 2400,
  height: 1350,
  ratio: 2400 / 1350,
  wide: true,
  aspect: "wide",
  taskMode: "ambient",
  safeArea: "left",
  focusX: 0.72,
  focusY: 0.48,
  accentRgb: { r: 180, g: 90, b: 110 },
};
const cached = createFixture({
  id: "cached-wide",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
  artKey: "cached-art",
  artMetadata: synchronousWide.window.__CODEX_DREAM_SKIN_STATE__.artMetadata,
}, { analysisCache: new Map([["cached-art", cachedAnalysis]]) });
vm.runInNewContext(cached.payload, cached.context);
assert.equal(cached.attributes.get("data-dream-art-ready"), "true");
assert.equal(cached.attributes.get("data-dream-art-safe-area"), "left");
assert.equal(cached.window.__CODEX_DREAM_SKIN_STATE__.metrics.analysisCacheHits, 1);
assert.equal(cached.window.__CODEX_DREAM_SKIN_STATE__.metrics.analysisRuns, 0);

const previousWideState = synchronousWide.window.__CODEX_DREAM_SKIN_STATE__;
const stableStyle = synchronousWide.nodes.get("codex-dream-skin-style");
vm.runInNewContext(synchronousWide.payloadFor({
  id: "switched-wide",
  appearance: "dark",
  art: { safeArea: "right", taskMode: "ambient" },
  artKey: "switched-art",
  artMetadata: {
    width: 2400,
    height: 1350,
    ratio: 2400 / 1350,
    wide: true,
    aspect: "wide",
    taskMode: "ambient",
  },
}, ".fixture { color: red; }"), synchronousWide.context);
assert.equal(synchronousWide.nodes.get("codex-dream-skin-style"), stableStyle);
assert.equal(stableStyle.textContent, ".fixture { color: red; }");
assert.equal(stableStyle.dataset.dreamSkinVersion, "test");
assert.equal(synchronousWide.rootStyle.values.get("--dream-skin-art"), 'url("blob:fixture-2")');
assert.deepEqual(synchronousWide.revokedUrls, ["blob:fixture-1"]);
assert.equal(previousWideState.cleanup(), false, "An old async cleanup must not remove the new theme.");

const brightPixels = new Uint8ClampedArray(96 * 32 * 4);
for (let offset = 0; offset < brightPixels.length; offset += 4) {
  brightPixels[offset] = 245;
  brightPixels[offset + 1] = 224;
  brightPixels[offset + 2] = 224;
  brightPixels[offset + 3] = 255;
}
const nativeDark = createFixture({
  id: "native-dark-contract",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
}, {
  nativeShell: "dark",
  analysisFixture: { naturalWidth: 2400, naturalHeight: 800, pixels: brightPixels },
});
vm.runInNewContext(nativeDark.payload, nativeDark.context);
await Promise.resolve();
await Promise.resolve();
nativeDark.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(nativeDark.window.__CODEX_DREAM_SKIN_STATE__.analysis.shell, "light");
assert.equal(nativeDark.attributes.get("data-dream-shell"), "dark");
assert.match(nativeDark.rootStyle.values.get("--ds-bg"), /^#[0-9a-f]{6}$/);
assert.ok(Number.parseInt(nativeDark.rootStyle.values.get("--ds-bg").slice(1), 16) < 0x303030);

const explicit = createFixture({
  id: "explicit-contract",
  appearance: "dark",
  art: { focusX: 0.15, focusY: 0.8, safeArea: "none", taskMode: "off" },
});
const explicitResult = vm.runInNewContext(explicit.payload, explicit.context);
assert.equal(explicitResult.shell, "dark");
assert.equal(explicit.attributes.get("data-dream-shell"), "dark");
assert.equal(explicit.attributes.get("data-dream-art-safe-area"), "none");
assert.equal(explicit.attributes.get("data-dream-art-safe"), "none");
assert.equal(explicit.attributes.get("data-dream-art-task-mode"), "off");
assert.equal(explicit.rootStyle.values.get("--dream-art-position"), "15.00% 80.00%");
assert.equal(explicit.window.__CODEX_DREAM_SKIN_STATE__.analysis, null);

const banner = createFixture({
  id: "banner-contract",
  appearance: "auto",
  art: { safeArea: "left", taskMode: "banner" },
  artMetadata: {
    width: 2560,
    height: 1440,
    ratio: 2560 / 1440,
    wide: true,
    aspect: "ultrawide",
    taskMode: "banner",
    safeArea: "left",
    focusX: 0.72,
    focusY: 0.44,
  },
});
vm.runInNewContext(banner.payload, banner.context);
assert.equal(banner.attributes.get("data-dream-art-wide"), "true");
assert.equal(banner.attributes.get("data-dream-art-task-mode"), "banner");
assert.equal(banner.attributes.get("data-dream-task-mode"), "banner");

assert.equal(explicit.window.__CODEX_DREAM_SKIN_STATE__.cleanup(), true);
assert.equal(explicit.root.classList.contains("codex-dream-skin"), false);
assert.equal(explicit.attributes.has("data-dream-shell"), false);
assert.equal(explicit.attributes.has("data-dream-art-safe-area"), false);
assert.equal(explicit.attributes.has("data-dream-art-task-mode"), false);
assert.equal(explicit.rootStyle.values.has("--dream-art-position"), false);
assert.equal(explicit.nodes.has("codex-dream-skin-style"), false);
assert.equal(explicit.nodes.has("codex-dream-skin-chrome"), false);
assert.deepEqual(explicit.revokedUrls, ["blob:fixture-1"]);
await Promise.resolve();
await Promise.resolve();
assert.equal(explicit.root.classList.contains("codex-dream-skin"), false);
assert.equal(explicit.nodes.has("codex-dream-skin-style"), false);
assert.equal(explicit.window.__CODEX_DREAM_SKIN_STATE__, undefined);

console.log("PASS: renderer honors adaptive art metadata, fallback, and cleanup behavior.");
