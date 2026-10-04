import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { adaptWindowsReducedMotionCss } from './windows-motion-css.mjs';

test('Windows reduced motion disables transitions without changing normal motion or animations', async () => {
  const source = await fs.readFile(new URL('../runtime/dream-skin.css', import.meta.url), 'utf8');
  const result = adaptWindowsReducedMotionCss(source);
  assert.equal(result.replace('transition: none !important;', 'transition-duration: .01ms !important;'), source);
  assert.match(result, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition: none !important;/);
  assert.ok(result.includes('animation-duration: .01ms !important;'));
  assert.throws(() => adaptWindowsReducedMotionCss('body {}'), /expected one/);
  assert.throws(() => adaptWindowsReducedMotionCss(source + source), /expected one/);
});
