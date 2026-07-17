function assertPositiveSize(value, label) {
  if (!value || !Number.isFinite(value.width) || !Number.isFinite(value.height) ||
      value.width <= 0 || value.height <= 0) {
    throw new Error(`${label} width and height must be positive numbers.`);
  }
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export const DEFAULT_SCENARIOS = Object.freeze([
  Object.freeze({ id: "home-wide", label: "Wide home", width: 1440, height: 900, kind: "home" }),
  Object.freeze({ id: "home-standard", label: "Standard home", width: 1154, height: 786, kind: "home" }),
  Object.freeze({ id: "home-narrow", label: "Narrow home", width: 880, height: 820, kind: "home" }),
  Object.freeze({ id: "task-banner", label: "Task banner", width: 1440, height: 360, kind: "task" }),
]);

const CONTRAST_PAIRS = [
  { foreground: "text", background: "panel", minimum: 4.5 },
  { foreground: "muted", background: "panel", minimum: 3 },
];

function parseHexColor(value) {
  const match = /^#([0-9a-f]{6})$/i.exec(value || "");
  if (!match) return null;
  const packed = Number.parseInt(match[1], 16);
  return {
    r: packed >> 16,
    g: (packed >> 8) & 0xff,
    b: packed & 0xff,
  };
}

function relativeLuminance(color) {
  const channels = [color.r, color.g, color.b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

/** Return the WCAG contrast ratio for two six-digit hex colors. */
export function contrastRatio(foreground, background) {
  const front = parseHexColor(foreground);
  const back = parseHexColor(background);
  if (!front || !back) return null;
  const frontLuminance = relativeLuminance(front);
  const backLuminance = relativeLuminance(back);
  const lighter = Math.max(frontLuminance, backLuminance);
  const darker = Math.min(frontLuminance, backLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Calculate the source rectangle visible through a CSS background-size cover viewport. */
export function calculateCoverCrop(image, viewport, focus = { x: 0.5, y: 0.5 }) {
  assertPositiveSize(image, "Image");
  assertPositiveSize(viewport, "Viewport");
  const focusX = clamp(Number.isFinite(focus?.x) ? focus.x : 0.5);
  const focusY = clamp(Number.isFinite(focus?.y) ? focus.y : 0.5);
  const scale = Math.max(viewport.width / image.width, viewport.height / image.height);
  const visibleWidth = viewport.width / scale;
  const visibleHeight = viewport.height / scale;
  const x = (image.width - visibleWidth) * focusX;
  const y = (image.height - visibleHeight) * focusY;

  return {
    scale,
    rendered: {
      width: image.width * scale,
      height: image.height * scale,
    },
    visibleSource: {
      x,
      y,
      width: visibleWidth,
      height: visibleHeight,
    },
    crop: {
      left: x / image.width,
      right: (image.width - x - visibleWidth) / image.width,
      top: y / image.height,
      bottom: (image.height - y - visibleHeight) / image.height,
    },
    sourcePixelsPerCssPixel: 1 / scale,
    focusViewport: {
      x: focusX,
      y: focusY,
      marginX: Math.min(focusX, 1 - focusX),
      marginY: Math.min(focusY, 1 - focusY),
    },
  };
}

function resolveComposition(theme, image) {
  const art = theme?.art && typeof theme.art === "object" ? theme.art : {};
  const safeArea = typeof art.safeArea === "string" ? art.safeArea : "auto";
  const taskMode = typeof art.taskMode === "string" && art.taskMode !== "auto"
    ? art.taskMode
    : image.taskMode || "ambient";
  const explicitFocusX = Number.isFinite(art.focusX);
  const explicitFocusY = Number.isFinite(art.focusY);
  const focusX = explicitFocusX ? clamp(art.focusX)
    : safeArea === "left" ? 0.72 : safeArea === "right" ? 0.28 : 0.5;
  const focusY = explicitFocusY ? clamp(art.focusY) : 0.5;
  const focusSource = explicitFocusX && explicitFocusY ? "explicit"
    : explicitFocusX || explicitFocusY ? "mixed" : "fallback";
  return {
    appearance: typeof theme?.appearance === "string" ? theme.appearance : "auto",
    safeArea,
    taskMode,
    focusX,
    focusY,
    focusSource,
  };
}

function scenarioResult(image, scenario, composition) {
  const geometry = calculateCoverCrop(
    image,
    { width: scenario.width, height: scenario.height },
    { x: composition.focusX, y: composition.focusY },
  );
  const horizontalCrop = geometry.crop.left + geometry.crop.right;
  const verticalCrop = geometry.crop.top + geometry.crop.bottom;
  const warnings = [];
  const applicable = scenario.kind !== "task" || composition.taskMode === "banner";
  if (applicable && Math.max(horizontalCrop, verticalCrop) > 0.35) {
    warnings.push({
      code: "heavy-crop",
      message: "More than 35% of one source-image axis is cropped.",
    });
  }
  if (applicable && geometry.sourcePixelsPerCssPixel < 1) {
    warnings.push({
      code: "upscaled",
      message: "The source image is enlarged beyond one source pixel per CSS pixel.",
    });
  }
  return {
    id: scenario.id,
    label: scenario.label,
    kind: scenario.kind,
    applicable,
    viewport: { width: scenario.width, height: scenario.height },
    scale: round(geometry.scale),
    rendered: {
      width: round(geometry.rendered.width),
      height: round(geometry.rendered.height),
    },
    visibleSource: {
      x: round(geometry.visibleSource.x),
      y: round(geometry.visibleSource.y),
      width: round(geometry.visibleSource.width),
      height: round(geometry.visibleSource.height),
    },
    crop: Object.fromEntries(
      Object.entries(geometry.crop).map(([key, value]) => [key, round(value)]),
    ),
    sourcePixelsPerCssPixel: round(geometry.sourcePixelsPerCssPixel),
    focus: {
      x: composition.focusX,
      y: composition.focusY,
      marginX: round(geometry.focusViewport.marginX),
      marginY: round(geometry.focusViewport.marginY),
    },
    status: !applicable ? "not-applicable" : warnings.length ? "warning" : "pass",
    warnings,
  };
}

/** Evaluate static theme fit without applying the theme or decoding image pixels. */
export function evaluateThemeFit({ theme, image, scenarios = DEFAULT_SCENARIOS }) {
  if (!theme || typeof theme !== "object") throw new Error("Theme must be an object.");
  assertPositiveSize(image, "Image");
  const composition = resolveComposition(theme, image);
  const warnings = [];
  const notices = [];

  if (composition.safeArea === "left" && composition.focusX < 0.55) {
    warnings.push({
      code: "safe-area-conflict",
      message: "The focus point overlaps the declared left content-safe region.",
    });
  } else if (composition.safeArea === "right" && composition.focusX > 0.45) {
    warnings.push({
      code: "safe-area-conflict",
      message: "The focus point overlaps the declared right content-safe region.",
    });
  }

  if (composition.safeArea === "auto" || composition.focusSource !== "explicit") {
    notices.push({
      code: "runtime-adaptive",
      message: "Runtime Canvas analysis may refine automatic focus and safe-area values.",
    });
  }

  const colors = theme.colors && typeof theme.colors === "object" ? theme.colors : {};
  const contrasts = [];
  for (const pair of CONTRAST_PAIRS) {
    const ratio = contrastRatio(colors[pair.foreground], colors[pair.background]);
    if (ratio === null) continue;
    const result = {
      foreground: pair.foreground,
      background: pair.background,
      ratio: round(ratio, 3),
      minimum: pair.minimum,
      status: ratio >= pair.minimum ? "pass" : "warning",
    };
    contrasts.push(result);
    if (result.status === "warning") {
      warnings.push({
        code: "low-contrast",
        message: `${pair.foreground} on ${pair.background} is below ${pair.minimum}:1.`,
        pair: `${pair.foreground}-on-${pair.background}`,
        ratio: result.ratio,
        minimum: pair.minimum,
      });
    }
  }

  const evaluatedScenarios = scenarios.map((scenario) =>
    scenarioResult(image, scenario, composition));
  const scenarioWarningCount = evaluatedScenarios.reduce(
    (total, scenario) => total + scenario.warnings.length,
    0,
  );
  const warningCount = warnings.length + scenarioWarningCount;

  return {
    schemaVersion: 1,
    tool: "dream-skin-theme-fit",
    theme: {
      id: typeof theme.id === "string" ? theme.id : "unknown",
      name: typeof theme.name === "string" ? theme.name : "Unnamed theme",
      image: typeof theme.image === "string" ? theme.image : "",
    },
    image: {
      width: image.width,
      height: image.height,
      ratio: image.ratio ?? image.width / image.height,
      aspect: image.aspect || "unknown",
      bytes: image.bytes ?? null,
    },
    composition,
    summary: {
      status: warningCount ? "warning" : "pass",
      warningCount,
      noticeCount: notices.length,
    },
    warnings,
    notices,
    contrasts,
    scenarios: evaluatedScenarios,
  };
}

function percent(value, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function findingLines(findings, prefix = "  !") {
  return findings.map((finding) => `${prefix} ${finding.code}: ${finding.message}`);
}

/** Render a stable terminal report suitable for attaching to an issue or PR. */
export function renderTextReport(report) {
  const lines = [
    "Dream Skin Theme Fit",
    `Theme: ${report.theme.name} (${report.theme.id})`,
    `Image: ${report.image.width} x ${report.image.height} (${report.image.aspect}, ${report.image.bytes ?? "unknown"} bytes)`,
    `Composition: ${report.composition.appearance}; safe ${report.composition.safeArea}; task ${report.composition.taskMode}; focus ${percent(report.composition.focusX)} ${percent(report.composition.focusY)} (${report.composition.focusSource})`,
    `Summary: ${report.summary.status.toUpperCase()} (${report.summary.warningCount} warnings, ${report.summary.noticeCount} notices)`,
  ];

  if (report.warnings.length) {
    lines.push("", "Warnings:", ...findingLines(report.warnings));
  }
  if (report.notices.length) {
    lines.push("", "Notices:", ...findingLines(report.notices, "  -"));
  }
  if (report.contrasts.length) {
    lines.push("", "Declared contrast:");
    for (const contrast of report.contrasts) {
      lines.push(
        `  - ${contrast.foreground} on ${contrast.background}: ${contrast.ratio}:1 (minimum ${contrast.minimum}:1) ${contrast.status.toUpperCase()}`,
      );
    }
  }

  lines.push("", "Scenarios:");
  for (const scenario of report.scenarios) {
    const horizontal = scenario.crop.left + scenario.crop.right;
    const vertical = scenario.crop.top + scenario.crop.bottom;
    lines.push(
      `  - ${scenario.label} ${scenario.viewport.width} x ${scenario.viewport.height}: ${scenario.status.toUpperCase()}`,
      `    crop horizontal ${percent(horizontal)}, vertical ${percent(vertical)}; density ${scenario.sourcePixelsPerCssPixel.toFixed(2)} source px/CSS px`,
      ...findingLines(scenario.warnings, "    !"),
    );
  }
  return `${lines.join("\n")}\n`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
}

function findingMarkup(findings, className) {
  if (!findings.length) return "";
  return `<ul class="${className}">${findings.map((finding) =>
    `<li><strong>${escapeHtml(finding.code)}</strong> ${escapeHtml(finding.message)}</li>`).join("")}</ul>`;
}

function safeAreaMarkup(safeArea) {
  if (safeArea !== "left" && safeArea !== "right") return "";
  return `<div class="safe-area safe-area-${safeArea}" aria-hidden="true"><span>${safeArea.toUpperCase()} SAFE</span></div>`;
}

function scenarioMarkup(scenario, report, imageDataUrl) {
  const horizontal = scenario.crop.left + scenario.crop.right;
  const vertical = scenario.crop.top + scenario.crop.bottom;
  const statusLabel = scenario.status === "pass" ? "Pass"
    : scenario.status === "not-applicable" ? "Reference" : "Review";
  const position = `${percent(report.composition.focusX, 2)} ${percent(report.composition.focusY, 2)}`;
  return `
    <article class="scenario" data-scenario="${escapeHtml(scenario.id)}">
      <header class="scenario-header">
        <div>
          <h2>${escapeHtml(scenario.label)}</h2>
          <p>${scenario.viewport.width} x ${scenario.viewport.height} CSS px</p>
        </div>
        <span class="status status-${escapeHtml(scenario.status)}">${statusLabel}</span>
      </header>
      <div class="preview" style="aspect-ratio:${scenario.viewport.width}/${scenario.viewport.height};background-image:url('${escapeHtml(imageDataUrl)}');background-position:${position}">
        ${safeAreaMarkup(report.composition.safeArea)}
        <span class="focus" style="left:${percent(report.composition.focusX, 2)};top:${percent(report.composition.focusY, 2)}" aria-label="Resolved focus"></span>
      </div>
      <dl class="metrics">
        <div><dt>Horizontal crop</dt><dd>${percent(horizontal)}</dd></div>
        <div><dt>Vertical crop</dt><dd>${percent(vertical)}</dd></div>
        <div><dt>Pixel density</dt><dd>${scenario.sourcePixelsPerCssPixel.toFixed(2)}x</dd></div>
        <div><dt>Cover scale</dt><dd>${scenario.scale.toFixed(3)}x</dd></div>
      </dl>
      ${findingMarkup(scenario.warnings, "scenario-findings")}
    </article>`;
}

/** Render a self-contained, no-script visual report using only the validated image. */
export function renderHtmlReport(report, imageDataUrl) {
  const summaryStatus = report.summary.status === "pass" ? "Pass" : "Review";
  const scenarios = report.scenarios.map((scenario) =>
    scenarioMarkup(scenario, report, imageDataUrl)).join("");
  const contrastRows = report.contrasts.length ? `
    <section class="band" aria-labelledby="contrast-title">
      <div class="band-inner">
        <h2 id="contrast-title">Declared contrast</h2>
        <div class="contrast-list">${report.contrasts.map((contrast) => `
          <div>
            <span>${escapeHtml(contrast.foreground)} on ${escapeHtml(contrast.background)}</span>
            <strong>${contrast.ratio}:1</strong>
            <span class="status status-${escapeHtml(contrast.status)}">${contrast.status === "pass" ? "Pass" : "Review"}</span>
          </div>`).join("")}
        </div>
      </div>
    </section>` : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  <title>${escapeHtml(report.theme.name)} - Dream Skin Theme Fit</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #182126; background: #f3f5f6; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f5f6; }
    .masthead { padding: 32px 24px 26px; border-bottom: 1px solid #cfd7da; background: #ffffff; }
    .masthead-inner, .band-inner, main { width: min(1180px, calc(100% - 40px)); margin: 0 auto; }
    .eyebrow { margin: 0 0 7px; color: #0a7279; font-size: 12px; font-weight: 750; text-transform: uppercase; }
    h1 { margin: 0; font-size: 30px; line-height: 1.18; letter-spacing: 0; overflow-wrap: anywhere; }
    .theme-meta { margin: 8px 0 0; color: #58666d; font-size: 14px; }
    .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-top: 22px; border: 1px solid #d3dadd; border-radius: 6px; overflow: hidden; }
    .summary div { min-width: 0; padding: 14px 16px; border-right: 1px solid #d3dadd; background: #f8fafb; }
    .summary div:last-child { border-right: 0; }
    .summary span { display: block; margin-bottom: 4px; color: #66747b; font-size: 11px; text-transform: uppercase; }
    .summary strong { display: block; font-size: 15px; overflow-wrap: anywhere; }
    main { padding: 28px 0 36px; }
    .findings { margin-bottom: 22px; padding: 15px 18px; border-left: 4px solid #b54768; background: #fff7f9; }
    .findings ul, .scenario-findings { margin: 0; padding-left: 20px; }
    .notices { margin-top: 10px; border-left-color: #b28b20; background: #fffaf0; }
    .scenario-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 18px; }
    .scenario { min-width: 0; overflow: hidden; border: 1px solid #cbd4d7; border-radius: 6px; background: #ffffff; }
    .scenario-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 15px 16px; border-bottom: 1px solid #dbe1e3; }
    .scenario-header h2 { margin: 0; font-size: 17px; letter-spacing: 0; }
    .scenario-header p { margin: 3px 0 0; color: #6a777d; font-size: 12px; }
    .status { display: inline-flex; flex: 0 0 auto; align-items: center; min-height: 24px; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 750; text-transform: uppercase; }
    .status-pass { color: #175e45; background: #e2f4eb; }
    .status-warning { color: #8a2f4c; background: #fbe5ec; }
    .status-not-applicable { color: #5c6870; background: #e9edef; }
    .preview { position: relative; width: 100%; overflow: hidden; background-color: #d9e0e2; background-repeat: no-repeat; background-size: cover; }
    .preview::after { position: absolute; inset: 0; border: 1px solid rgba(0, 0, 0, .12); content: ""; pointer-events: none; }
    .safe-area { position: absolute; top: 0; bottom: 0; width: 55%; border-color: rgba(10, 114, 121, .8); background: rgba(211, 246, 246, .28); }
    .safe-area-left { left: 0; border-right: 2px solid rgba(10, 114, 121, .8); }
    .safe-area-right { right: 0; border-left: 2px solid rgba(10, 114, 121, .8); }
    .safe-area span { position: absolute; top: 10px; left: 10px; padding: 3px 6px; color: #073e43; background: rgba(237, 255, 255, .88); font-size: 10px; font-weight: 800; }
    .safe-area-right span { right: 10px; left: auto; }
    .focus { position: absolute; width: 20px; height: 20px; border: 2px solid #ffffff; border-radius: 50%; background: #b54768; box-shadow: 0 0 0 2px rgba(24, 33, 38, .72); transform: translate(-50%, -50%); }
    .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0; border-top: 1px solid #dbe1e3; }
    .metrics div { min-width: 0; padding: 12px; border-right: 1px solid #e2e7e9; }
    .metrics div:last-child { border-right: 0; }
    .metrics dt { color: #6a777d; font-size: 10px; text-transform: uppercase; }
    .metrics dd { margin: 5px 0 0; font-size: 14px; font-weight: 700; }
    .scenario-findings { padding: 12px 16px 14px 34px; border-top: 1px solid #efd5de; color: #8a2f4c; background: #fff8fa; font-size: 12px; }
    .band { border-top: 1px solid #cfd7da; background: #ffffff; }
    .band-inner { padding: 28px 0 36px; }
    .band h2 { margin: 0 0 14px; font-size: 19px; }
    .contrast-list { border-top: 1px solid #d8dfe1; }
    .contrast-list > div { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 14px; padding: 11px 0; border-bottom: 1px solid #d8dfe1; }
    @media (max-width: 760px) {
      .masthead-inner, .band-inner, main { width: min(100% - 24px, 1180px); }
      .masthead { padding: 24px 0 20px; }
      h1 { font-size: 24px; }
      .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .summary div:nth-child(2) { border-right: 0; }
      .summary div:nth-child(-n+2) { border-bottom: 1px solid #d3dadd; }
      .scenario-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 460px) {
      .summary { grid-template-columns: 1fr; }
      .summary div { border-right: 0; border-bottom: 1px solid #d3dadd; }
      .summary div:last-child { border-bottom: 0; }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .metrics div:nth-child(2) { border-right: 0; }
      .metrics div:nth-child(-n+2) { border-bottom: 1px solid #e2e7e9; }
      .contrast-list > div { grid-template-columns: minmax(0, 1fr) auto; }
      .contrast-list .status { grid-column: 1 / -1; width: fit-content; }
    }
  </style>
</head>
<body>
  <header class="masthead">
    <div class="masthead-inner">
      <p class="eyebrow">Dream Skin theme fit</p>
      <h1>${escapeHtml(report.theme.name)}</h1>
      <p class="theme-meta">${escapeHtml(report.theme.id)} · ${report.image.width} x ${report.image.height} · ${escapeHtml(report.image.aspect)}</p>
      <div class="summary">
        <div><span>Status</span><strong>${summaryStatus}</strong></div>
        <div><span>Composition</span><strong>${escapeHtml(report.composition.taskMode)}</strong></div>
        <div><span>Content safe</span><strong>${escapeHtml(report.composition.safeArea)}</strong></div>
        <div><span>Resolved focus</span><strong>${percent(report.composition.focusX)} ${percent(report.composition.focusY)}</strong></div>
      </div>
    </div>
  </header>
  <main>
    ${report.warnings.length ? `<section class="findings" aria-label="Warnings">${findingMarkup(report.warnings, "")}</section>` : ""}
    ${report.notices.length ? `<section class="findings notices" aria-label="Notices">${findingMarkup(report.notices, "")}</section>` : ""}
    <section class="scenario-grid" aria-label="Viewport scenarios">${scenarios}
    </section>
  </main>
  ${contrastRows}
</body>
</html>
`;
}
