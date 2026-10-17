import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const launchCreation = /\bNew-DreamSkinDefaultShortcut(?:Pair)?\s+-/;

test('installation, tray and ordinary launch never create optional Launch shortcuts', () => {
  for (const path of [
    'scripts/install-dream-skin.ps1',
    'installer/setup-bootstrap.ps1',
    'scripts/tray-dream-skin.ps1',
    'scripts/start-dream-skin.ps1',
  ]) {
    assert.doesNotMatch(read(path), launchCreation, path);
  }
  const launcher = read('scripts/launch-themed-codex.ps1');
  const ordinaryLaunch = launcher.slice(launcher.indexOf('if (-not $FunctionsOnly)'));
  assert.ok(ordinaryLaunch.startsWith('if (-not $FunctionsOnly)'));
  assert.doesNotMatch(ordinaryLaunch, launchCreation);
});

test('only the explicit panel Shortcut action requests the optional pair', () => {
  const source = read('scripts/panel-operation.ps1');
  assert.equal([...source.matchAll(/\bNew-DreamSkinDefaultShortcutPair\s+-/g)].length, 1);
  assert.match(source, /'Shortcut'\s*\{\s*\. \(Join-Path \$PSScriptRoot 'launch-themed-codex\.ps1'\) -FunctionsOnly\s*\$null = New-DreamSkinDefaultShortcutPair -StateRoot \$StateRoot/);
  for (const action of ['Save', 'Apply']) {
    const branch = source.match(new RegExp(`'${action}' \\{([^\\n]*)`))?.[1];
    assert.ok(branch, `missing ${action} action`);
    assert.doesNotMatch(branch, launchCreation);
  }
});

test('Setup retains original manager and opt-in Windows sign-in entries', () => {
  const setup = read('installer/codex-dream-skin.iss');
  const icons = setup.match(/\[Icons\]([\s\S]*?)(?=\n\[)/)?.[1];
  assert.ok(icons);
  const entries = icons.split(/\r?\n/).filter((line) => line.startsWith('Name:'));
  assert.equal(entries.length, 3);
  assert.match(entries[0], /"\{group\}\\Codex Dream Skin".*-LaunchTray -ShowWindow/);
  assert.match(entries[1], /"\{userdesktop\}\\Codex Dream Skin".*-LaunchTray -ShowWindow/);
  assert.match(entries[2], /"\{userstartup\}\\Codex Dream Skin".*-LaunchTray".*Tasks: startup/);
  assert.match(setup, /Name: "startup";[^\n]*Flags: unchecked/);
  assert.doesNotMatch(icons, /Dream Skin - Launch|launch-themed-codex/);
});

test('source installation retains manager, tray and desktop restore entries', () => {
  const source = read('scripts/install-dream-skin.ps1');
  assert.match(source, /foreach \(\$folder in @\(\$desktop, \$startMenu\)\)/);
  for (const name of ['Codex Dream Skin.lnk', 'Codex Dream Skin - Tray.lnk', 'Codex Dream Skin - Restore.lnk']) {
    assert.ok(source.includes(`'${name}'`), `missing upstream entry ${name}`);
  }
  assert.doesNotMatch(source, /Dream Skin - Launch|New-DreamSkinDefaultShortcut/);
});

test('optional pair resolves only desktop and installation locations, without Start Menu entries', () => {
  const source = read('scripts/launch-themed-codex.ps1');
  const pair = source.match(/function New-DreamSkinDefaultShortcutPair\s*\{([\s\S]*?)(?=\nfunction )/)?.[1];
  assert.ok(pair);
  assert.match(pair, /Get-DreamSkinDesktopShortcutDirectory/);
  assert.match(pair, /Resolve-DreamSkinShortcutInstallDirectory -StateRoot \$StateRoot/);
  assert.match(pair, /foreach \(\$directory in @\(\$desktop, \$installation\)\)/);
  assert.doesNotMatch(pair, /StartMenu|Start Menu|userprograms|Programs\\|Startup/);
});

test('Setup discovery uses the existing installer identity without registering another entry', () => {
  const setup = read('installer/codex-dream-skin.iss');
  const appId = setup.match(/^AppId=\{\{([A-F0-9-]+)\}/m)?.[1];
  assert.ok(appId);
  const source = read('scripts/launch-themed-codex.ps1');
  assert.ok(source.includes(`{${appId}}_is1`));
  assert.doesNotMatch(source, /\.(?:CreateSubKey|SetValue)\(/);
});
