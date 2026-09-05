export const MIN_RENDERER_WIDTH = 320;
export const MIN_RENDERER_HEIGHT = 240;
export const MAX_RENDERER_DIMENSION = 65536;

export function hasReasonableDimensions(width, height) {
  return Number.isFinite(width) && Number.isFinite(height)
    && width >= MIN_RENDERER_WIDTH && height >= MIN_RENDERER_HEIGHT
    && width <= MAX_RENDERER_DIMENSION && height <= MAX_RENDERER_DIMENSION;
}

// Inputs are observations from the platform probes; this module performs no
// DOM, CDP, filesystem or process work.
export function assessRendererReadiness(renderer, nativeWindow, expected) {
  const result = renderer && typeof renderer === "object" ? renderer : {};
  const viewportPass = hasReasonableDimensions(
    Number(result.viewport?.width), Number(result.viewport?.height),
  );
  const documentVisible = result.documentVisibility === "visible" && result.documentHidden !== true;
  const homeRoute = result.scope?.baseState === "home" || Boolean(result.homeRoute || result.homePresent);
  const homeVisible = Boolean(result.homePresent && result.homeSurface?.visible);
  const l1ScopePass = result.scope?.level === "L1"
    && Array.isArray(result.scope?.missingL1) && result.scope.missingL1.length === 0;
  const genericStructurePass = Boolean(result.genericMain?.visible)
    && (Boolean(result.genericInput?.visible) || (homeRoute && homeVisible));
  const l0StructurePass = result.scope?.level === "L0"
    && result.scope?.baseState === "settings" && Boolean(result.settings?.visible);
  const structurePass = l0StructurePass || (l1ScopePass && (
    Boolean(result.shell?.visible && result.sidebar?.visible) || genericStructurePass
  ));
  const nativeWindowPass = nativeWindow?.status === "ready";
  const fallbackWindowPass = nativeWindow?.status === "unsupported";
  const nativeBindingPass = nativeWindowPass || fallbackWindowPass;
  const windowPass = documentVisible && viewportPass && nativeBindingPass;
  const payloadPass = (!expected.expectedThemeId || result.themeId === expected.expectedThemeId)
    && (!expected.expectedRevision || result.revision === expected.expectedRevision);
  const visibleSuggestionLabels = Array.isArray(result.suggestionLabels)
    ? result.suggestionLabels.filter((item) => item?.visible) : [];
  const homePass = !homeRoute || (homeVisible
    && (Boolean(result.hero?.visible && result.hero.width >= 280 && result.hero.height >= 120)
      || Boolean(result.genericMain?.visible))
    && (result.visibleCardCount === 0 || (visibleSuggestionLabels.length >= result.visibleCardCount
      && result.suggestionLabelColorsMatch === true)));
  const basePass = result.installed === true && result.version === expected.skinVersion
    && result.stylePresent === true && result.businessClassPollution === 0
    && result.documentOverflow?.x === false;

  return {
    pass: Boolean(basePass && structurePass && windowPass && payloadPass && homePass),
    checks: {
      documentVisible, fallbackWindowPass, nativeWindowPass, nativeBindingPass,
      payloadPass, structurePass, viewportPass, windowPass,
    },
    homePass,
    softNotes: {
      projectButtonOptional: !result.projectButton?.visible,
      composerOptionalOnNonTaskRoutes: !result.composer?.visible,
      suggestionCardsOptional: homeRoute && result.visibleCardCount === 0,
    },
  };
}
