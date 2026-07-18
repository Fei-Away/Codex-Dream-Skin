const CHECKED_FIELDS = [
  { field: "text", minimum: 4.5 },
  { field: "muted", minimum: 4.5 },
  { field: "accent", minimum: 3 },
  { field: "accentAlt", minimum: 3 },
];

const SURFACE_LABELS = {
  background: "\u80cc\u666f",
  panel: "\u9762\u677f",
  panelAlt: "\u6b21\u7ea7\u9762\u677f",
};

const PASS_MARGIN = 0.06;

export function parseThemeColor(value) {
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

  const channel = (part) => {
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

function compositeColor(foreground, background) {
  return [
    foreground.red * foreground.alpha + background[0] * (1 - foreground.alpha),
    foreground.green * foreground.alpha + background[1] * (1 - foreground.alpha),
    foreground.blue * foreground.alpha + background[2] * (1 - foreground.alpha),
  ];
}

function relativeLuminance(rgb) {
  const linear = rgb.map((component) => {
    const normalized = component / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastRatio(left, right) {
  const leftLuminance = relativeLuminance(left);
  const rightLuminance = relativeLuminance(right);
  return (Math.max(leftLuminance, rightLuminance) + 0.05)
    / (Math.min(leftLuminance, rightLuminance) + 0.05);
}

function resolvedSurfaces(colors) {
  const backgroundColor = parseThemeColor(colors.background);
  const panelColor = parseThemeColor(colors.panel);
  const panelAltColor = parseThemeColor(colors.panelAlt);
  if (!backgroundColor || !panelColor || !panelAltColor) return null;
  const background = compositeColor(backgroundColor, [255, 255, 255]);
  return {
    background,
    panel: compositeColor(panelColor, background),
    panelAlt: compositeColor(panelAltColor, background),
  };
}

function ratiosForColor(color, surfaces) {
  return Object.fromEntries(
    Object.entries(surfaces).map(([surface, surfaceColor]) => [
      surface,
      contrastRatio(compositeColor(color, surfaceColor), surfaceColor),
    ]),
  );
}

function worstRatio(ratios) {
  return Math.min(...Object.values(ratios));
}

function candidateCost(original, candidate) {
  const channelDistance = Math.hypot(
    candidate.red - original.red,
    candidate.green - original.green,
    candidate.blue - original.blue,
  ) / (255 * Math.sqrt(3));
  return channelDistance + Math.abs(candidate.alpha - original.alpha) * 0.65;
}

function mixedCandidate(original, target, alpha, amount) {
  return {
    red: original.red * (1 - amount) + target * amount,
    green: original.green * (1 - amount) + target * amount,
    blue: original.blue * (1 - amount) + target * amount,
    alpha,
  };
}

function suggestedReadableColor(original, surfaces, minimum) {
  let best = null;
  const required = minimum + PASS_MARGIN;
  const alphaStart = Math.ceil(original.alpha * 100);

  for (const target of [255, 0]) {
    for (let alphaPercent = alphaStart; alphaPercent <= 100; alphaPercent += 1) {
      const alpha = Math.max(original.alpha, alphaPercent / 100);
      const endpoint = mixedCandidate(original, target, alpha, 1);
      if (worstRatio(ratiosForColor(endpoint, surfaces)) < required) continue;

      let low = 0;
      let high = 1;
      for (let iteration = 0; iteration < 14; iteration += 1) {
        const middle = (low + high) / 2;
        const candidate = mixedCandidate(original, target, alpha, middle);
        if (worstRatio(ratiosForColor(candidate, surfaces)) >= required) {
          high = middle;
        } else {
          low = middle;
        }
      }
      const candidate = mixedCandidate(original, target, alpha, high);
      const cost = candidateCost(original, candidate);
      if (!best || cost < best.cost) best = { color: candidate, cost };
    }
  }
  return best?.color ?? null;
}

export function themeContrastIssues(colors) {
  const surfaces = resolvedSurfaces(colors);
  if (!surfaces) return [];
  const issues = [];

  for (const { field, minimum } of CHECKED_FIELDS) {
    const color = parseThemeColor(colors[field]);
    if (!color) continue;
    const ratios = ratiosForColor(color, surfaces);
    const failedSurfaces = Object.entries(ratios)
      .filter(([, ratio]) => ratio < minimum)
      .map(([surface, ratio]) => ({
        surface,
        surfaceLabel: SURFACE_LABELS[surface],
        ratio,
      }))
      .sort((left, right) => left.ratio - right.ratio);
    if (!failedSurfaces.length) continue;
    issues.push({
      field,
      minimum,
      surface: failedSurfaces[0].surface,
      surfaceLabel: failedSurfaces[0].surfaceLabel,
      ratio: failedSurfaces[0].ratio,
      failedSurfaces,
      suggestedColor: suggestedReadableColor(color, surfaces, minimum),
    });
  }
  return issues;
}
