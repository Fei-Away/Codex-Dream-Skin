// In Windows reduced-motion sessions a nonzero transition duration on every
// element still creates Blink transition work during inherited style changes.
// Disable transitions completely in this existing accessibility rule. Keep
// animation timing (and its completion events), normal motion and macOS intact.
export function adaptWindowsReducedMotionCss(source) {
  const rule = /(@layer dreamskin-accessibility\s*\{\s*@media \(prefers-reduced-motion: reduce\)\s*\{[^{}]*\{[^{}]*)transition-duration: \.01ms !important;/g;
  let count = 0;
  const result = source.replace(rule, (_, prefix) => {
    count += 1;
    return `${prefix}transition: none !important;`;
  });
  if (count !== 1) throw new Error('Windows reduced-motion adapter: expected one accessibility transition rule');
  return result;
}
