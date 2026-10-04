// Windows 26.930 has a home-composer-layout wrapper with a display:contents
// child and a home-takeover slot. The legacy first-child hero chain mistakes
// that slot for artwork, adds a 248px minimum height and clips the composer.
// Keep the shared source and macOS payload unchanged. Older Windows homes
// retain their existing rules; semantic colors and author Safe CSS are intact.
export function adaptWindowsHomeCss(source) {
  const legacy = '__DREAM_SELECTOR_HOME_ROUTE__ > div:first-child';
  if (!source.includes(legacy)) throw new Error('Windows Home adapter: legacy selector missing');
  return source.replaceAll(legacy,
    `${legacy}:not(:where([class~="group/home-composer-layout"]))`);
}
