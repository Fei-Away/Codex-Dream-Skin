import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { adaptWindowsHomeCss } from './windows-home-css.mjs';

test('Windows modern Home excludes every legacy hero chain, including media rules', async () => {
  const source = await fs.readFile(new URL('../runtime/dream-skin.css', import.meta.url), 'utf8');
  const prefix = '__DREAM_SELECTOR_HOME_ROUTE__ > div:first-child';
  const guard = ':not(:where([class~="group/home-composer-layout"]))';
  const adapted = adaptWindowsHomeCss(source);
  assert.equal(adapted.split(prefix + guard).length, source.split(prefix).length);
  assert.equal(adapted.replaceAll(guard, ''), source,
    'Only the legacy home chain may change; shared colors and other routes remain intact');
  assert.ok(adapted.includes('@media'));
  assert.throws(() => adaptWindowsHomeCss('body {}'), /legacy selector missing/);
});
