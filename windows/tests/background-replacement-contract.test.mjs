import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const themeSource = readFileSync(join(root, "scripts", "theme-windows.ps1"), "utf8");
const traySource = readFileSync(join(root, "scripts", "tray-dream-skin.ps1"), "utf8");

const functionBody = (source, name) => source.match(
  new RegExp(`function ${name}\\s*\\{([\\s\\S]*?)(?=\\nfunction |$)`),
)?.[1] ?? "";

test("Windows Change Background preserves the active theme contract", () => {
  const replacement = functionBody(themeSource, "Set-DreamSkinActiveThemeImage");
  assert.ok(replacement, "missing background-only active-theme helper");
  assert.match(replacement, /Read-DreamSkinTheme -ThemeDirectory \$paths\.Active/);
  assert.match(replacement, /ConvertTo-Json -Depth 8 \| ConvertFrom-Json/);
  assert.match(replacement, /Join-Path \$paths\.Active 'theme\.css'/);
  assert.match(replacement, /Assert-DreamSkinSafeCssFile -Path \$safeCssPath/);
  assert.match(
    replacement,
    /Set-DreamSkinActiveTheme -ImagePath \$ImagePath -Theme \$theme[\s\S]*-SafeCssPath \$safeCssPath/,
  );

  assert.match(
    traySource,
    /Set-DreamSkinActiveThemeImage -ImagePath \$dialog\.FileName[\s\S]{0,100}-StateRoot \$StateRoot/,
  );
  assert.doesNotMatch(
    traySource,
    /Set-DreamSkinActiveTheme -ImagePath \$dialog\.FileName -Theme \$null/,
  );
});
