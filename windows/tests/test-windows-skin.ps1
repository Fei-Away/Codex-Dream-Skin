[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$WindowsRoot = Split-Path -Parent $PSScriptRoot
$AssetsRoot = Join-Path $WindowsRoot 'assets'
$ScriptsRoot = Join-Path $WindowsRoot 'scripts'
$ReferencesRoot = Join-Path $WindowsRoot 'references'

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )
  if (-not $Condition) { throw $Message }
}

function Assert-Contains {
  param(
    [string]$Text,
    [string]$Pattern,
    [string]$Message
  )
  Assert-True ([regex]::IsMatch($Text, $Pattern)) $Message
}

function Get-PowerShellFunctionText {
  param(
    [string]$Text,
    [string]$FunctionName
  )
  $tokens = $null
  $errors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseInput(
    $Text,
    [ref]$tokens,
    [ref]$errors
  )
  Assert-True ($errors.Count -eq 0) "PowerShell source containing $FunctionName does not parse."
  $function = $ast.Find({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
      $node.Name -eq $FunctionName
  }, $true)
  Assert-True ($null -ne $function) "Required PowerShell helper $FunctionName is missing."
  return $function.Extent.Text
}

function Assert-GuardedStopFunction {
  param(
    [string]$FunctionText,
    [string]$GuardName,
    [string]$Message
  )
  Assert-True ([regex]::Matches($FunctionText, '\bStop-Process\b').Count -eq 1) "$Message The helper must contain exactly one stop operation."
  $positiveGuard = [regex]::IsMatch(
    $FunctionText,
    '(?s)if\s*\(\s*(?!-not\b)' + [regex]::Escape($GuardName) + '\b[^)]*\)\s*\{[^}]*Stop-Process'
  )
  $rejectBeforeStop = [regex]::IsMatch(
    $FunctionText,
    '(?s)if\s*\(\s*-not\s*\(\s*' + [regex]::Escape($GuardName) + '\b.*?\)\s*\)\s*\{[^}]*return\s+\$false[^}]*\}\s*Stop-Process'
  )
  Assert-True ($positiveGuard -or $rejectBeforeStop) $Message
}

$manifestPath = Join-Path $AssetsRoot 'miku-stage-theme.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
Assert-True ($manifest.schemaVersion -eq 1) 'Unexpected runtime manifest schema.'
Assert-True ($manifest.components.Count -eq 14) 'Runtime manifest must contain exactly 14 components.'
$ids = @($manifest.components | ForEach-Object { $_.id })
Assert-True (($ids | Select-Object -Unique).Count -eq 14) 'Runtime component IDs are not unique.'
Assert-True (($ids -join ',') -eq '01,02,03,04,05,06,07,08,09,10,11,12,13,14') 'Runtime component IDs are not the locked 01-14 sequence.'
Assert-True ($manifest.tokens.dark.accent -eq '#39C5BB') 'Dark accent token drifted.'
Assert-True ($manifest.tokens.light.accent -eq '#139F98') 'Light accent token drifted.'
Assert-True ($manifest.tokens.dark.magenta -eq '#FF4FA3') 'Magenta token drifted.'

$sourceSpecPath = Join-Path $ReferencesRoot 'component-spec-manifest.json'
$sourceSpecText = Get-Content -LiteralPath $sourceSpecPath -Raw
Assert-True (-not [regex]::IsMatch($sourceSpecText, '(?i)chatgpt\.com/c/|reference_manifest|rejected_draft')) 'External component metadata snapshot contains private or stale provenance fields.'
$sourceSpec = $sourceSpecText | ConvertFrom-Json
Assert-Contains ([string]$sourceSpec.snapshot_scope) '(?i)metadata-only snapshot' 'Component specification must declare itself as an external metadata-only snapshot.'
Assert-Contains ([string]$sourceSpec.snapshot_scope) '(?i)not shipped with this runtime repository' 'Component specification must not imply that source-board PNGs are present in this runtime repository.'
Assert-True ($sourceSpec.asset_count -eq 14) 'External component metadata snapshot must contain 14 source-board records.'
Assert-True ($sourceSpec.unique_hash_count -eq 14) 'External component metadata snapshot must contain 14 unique hash records.'
$sourceSlugs = @($sourceSpec.assets | ForEach-Object {
  [System.IO.Path]::GetFileNameWithoutExtension($_.file).Substring(3)
})
$runtimeSlugs = @($manifest.components | ForEach-Object { $_.slug })
Assert-True (($sourceSlugs -join ',') -eq ($runtimeSlugs -join ',')) 'Runtime component order no longer matches the 14-record external specification.'

$heroPath = Join-Path $AssetsRoot $manifest.art
$heroBytes = [System.IO.File]::ReadAllBytes($heroPath)
$pngSignature = @(137, 80, 78, 71, 13, 10, 26, 10)
for ($index = 0; $index -lt $pngSignature.Count; $index++) {
  Assert-True ($heroBytes[$index] -eq $pngSignature[$index]) 'Miku hero is not a valid PNG file.'
}
Assert-True ($heroBytes.Length -gt 500000) 'Miku hero asset is unexpectedly small.'
Add-Type -AssemblyName System.Drawing
$image = [System.Drawing.Image]::FromFile($heroPath)
try {
  Assert-True ($image.Width -ge 1400) 'Miku hero width is too small for the desktop crop.'
  Assert-True ($image.Height -ge 900) 'Miku hero height is too small for the desktop crop.'
} finally {
  $image.Dispose()
}

$cssPath = Join-Path $AssetsRoot $manifest.stylesheet
$css = Get-Content -LiteralPath $cssPath -Raw
$markers = @([regex]::Matches($css, '/\* \[(\d{2})\]') | ForEach-Object {
  $_.Groups[1].Value
})
Assert-True ($markers.Count -eq 14) 'Stylesheet must contain exactly 14 component section markers.'
Assert-True (($markers | Select-Object -Unique).Count -eq 14) 'Stylesheet component markers are duplicated.'
Assert-True (($markers -join ',') -eq '01,02,03,04,05,06,07,08,09,10,11,12,13,14') 'Stylesheet component markers are not in 01-14 order.'
foreach ($token in @(
  '#07131f',
  '#39c5bb',
  '#22d3c5',
  '#ff4fa3',
  '#7be69c',
  '#ff8995',
  '#139f98',
  '#c63b63'
)) {
  Assert-Contains $css ([regex]::Escape($token)) "Stylesheet is missing locked token $token."
}
Assert-Contains $css '#codex-miku-skin-chrome[\s\S]*?pointer-events:\s*none' 'Decorative chrome must never intercept clicks.'
Assert-Contains $css '@media \(prefers-reduced-motion:\s*reduce\)' 'Reduced-motion handling is missing.'
$lightTokenBridge = [regex]::Match(
  $css,
  '(?s):root\.codex-miku-skin\[data-miku-tone="light"\]\s*\{(?<body>.*?)\}'
)
Assert-True $lightTokenBridge.Success 'Light theme token bridge is missing.'
$lightTokenBridgeBody = $lightTokenBridge.Groups['body'].Value
Assert-Contains $lightTokenBridgeBody '--color-token-foreground:\s*var\(--miku-text\)' 'Light token bridge must map primary foreground to the Miku text token.'
Assert-Contains $lightTokenBridgeBody '--color-token-text-secondary:\s*var\(--miku-secondary\)' 'Light token bridge must map secondary text to the Miku secondary token.'
Assert-Contains $lightTokenBridgeBody '--color-token-border:\s*rgba\(15,\s*42,\s*50,\s*\.14\)' 'Light token bridge must provide a readable boundary token.'
$searchInputFocusRule = [regex]::Match(
  $css,
  '(?s):where\(\s*#plugins-page-search,\s*#scheduled-page-search,\s*aside\.app-shell-left-panel input\[role="searchbox"\]\s*\):focus-visible\s*\{(?<body>.*?)\}'
)
Assert-True $searchInputFocusRule.Success 'Search inputs must share a focus-visible suppression rule.'
$searchInputFocusBody = $searchInputFocusRule.Groups['body'].Value
Assert-Contains $searchInputFocusBody 'outline:\s*none\s*!important' 'Search inputs must suppress their native focus outline.'
Assert-Contains $searchInputFocusBody 'box-shadow:\s*none\s*!important' 'Search inputs must suppress their own focus shadow.'
$searchParentFocusRule = [regex]::Match(
  $css,
  '(?s):where\(\s*div:has\(> #plugins-page-search:focus\),\s*div:has\(> #scheduled-page-search:focus\),\s*div:has\(> input\[role="searchbox"\]:focus\)\s*\)\s*\{(?<body>.*?)\}'
)
Assert-True $searchParentFocusRule.Success 'Rounded search containers must own focus presentation through :has/focus-within.'
$searchParentFocusBody = $searchParentFocusRule.Groups['body'].Value
Assert-Contains $searchParentFocusBody 'border-color:\s*[^;]+!important' 'Focused search containers must expose a border focus state.'
Assert-Contains $searchParentFocusBody 'box-shadow:\s*[^;]+!important' 'Focused search containers must expose a focus ring.'

$rendererPath = Join-Path $AssetsRoot 'renderer-inject.js'
$renderer = Get-Content -LiteralPath $rendererPath -Raw
foreach ($placeholder in @(
  '__MIKU_CSS_JSON__',
  '__MIKU_ART_JSON__',
  '__MIKU_MANIFEST_JSON__',
  '__MIKU_TONE_JSON__'
)) {
  Assert-Contains $renderer ([regex]::Escape($placeholder)) "Renderer placeholder $placeholder is missing."
}
Assert-Contains $renderer '__CODEX_MIKU_SKIN_STATE__' 'Renderer state key is missing.'
Assert-Contains $renderer 'MutationObserver' 'Renderer route-change observer is missing.'
Assert-Contains $renderer 'componentCount' 'Renderer does not report component coverage.'
Assert-Contains $renderer 'matchedComponentIds' 'Renderer does not report actual DOM component matches.'
Assert-Contains $renderer 'sidebar\.querySelectorAll\(''\[role="separator"\]''\)[\s\S]{0,240}register\(separator,\s*"miku-shell-separator",\s*"01"\)' 'Sidebar separator must remain part of component 01.'
Assert-Contains $renderer 'for\s*\(const separator of document\.querySelectorAll\([^)]+\)\)\s*\{\s*if\s*\(sidebar\?\.contains\(separator\)\)\s*continue;' 'Global separator classification must exclude sidebar resize handles.'
Assert-Contains $renderer 'const exactDiffPanel\s*=\s*document\.querySelector\([\s\S]{0,180}data-app-shell-tab-panel-controller="right"[\s\S]{0,120}data-tab-id="diff"' 'Renderer must prefer the exact native Diff tabpanel owner.'
Assert-Contains $renderer 'register\(exactDiffPanel,\s*"miku-diff-surface",\s*"04"\)' 'Renderer must register only the exact native Diff tabpanel owner.'
Assert-True (-not [regex]::IsMatch($renderer, 'fallbackDiffRoot|\[data-testid="diff-view"\]|\[class\*="diff-view"')) 'Renderer must not use a broad Diff fallback selector.'
Assert-True (-not [regex]::IsMatch($renderer, 'diff-line')) 'Renderer must not classify individual Diff lines as component 04 owners.'
Assert-Contains $renderer 'const quickChatDialog\s*=\s*document\.querySelector\([\s\S]{0,140}\[role="dialog"\]\[data-pip-obstacle="quick-chat"\]' 'Quick Chat discovery must use the exact native dialog signal.'
Assert-Contains $renderer 'const isQuickChat\s*=\s*dialog\s*===\s*quickChatDialog[\s\S]{0,180}isQuickChat\s*\?\s*"08"\s*:\s*null' 'Only the exact Quick Chat dialog may own component 08.'
Assert-Contains $renderer 'previous\?\.artUrl\s*&&\s*previous\?\.artFingerprint\s*===\s*artFingerprint' 'Art URL reuse must depend on an unchanged fingerprint.'
Assert-Contains $renderer 'const artUrl\s*=\s*reuseArtUrl\s*\?\s*previous\.artUrl\s*:\s*\(\(\)\s*=>\s*\{[\s\S]{0,520}URL\.createObjectURL' 'A new art Blob URL may be created only when the fingerprint changed.'
Assert-Contains $renderer 'if\s*\(previous\?\.artUrl\s*&&\s*!reuseArtUrl\)\s*\{\s*URL\.revokeObjectURL\(previous\.artUrl\)' 'Changed art must revoke the previous Blob URL after replacement.'
Assert-Contains $renderer 'registerAll\(\s*''section > \.overflow-hidden\.rounded-2xl\.border, section > div > \.overflow-hidden\.rounded-2xl\.border[^'']*''[\s\S]{0,160}"miku-settings-card",\s*"05"' 'Renderer must register native rounded settings cards as component 05.'
$settingsCardStyle = [regex]::Match(
  $css,
  '(?s)html\.codex-miku-skin \.miku-settings-card\s*\{(?<body>.*?)\}'
)
Assert-True $settingsCardStyle.Success 'Settings card component style is missing.'
Assert-Contains $settingsCardStyle.Groups['body'].Value 'background:\s*var\(--miku-surface\)\s*!important' 'Settings cards must use the theme surface background.'

$injectorPath = Join-Path $ScriptsRoot 'injector.mjs'
$injector = Get-Content -LiteralPath $injectorPath -Raw
Assert-True (-not [regex]::IsMatch($injector, '\[data-testid\*="diff" i\]|\[class\*="diff-view" i\]')) 'Verifier must not infer a Diff surface from broad class or test-id fragments.'
Assert-Contains $injector 'http://127\.0\.0\.1:' 'CDP discovery must use IPv4 loopback.'
Assert-Contains $injector 'ws://127\.0\.0\.1:' 'CDP WebSocket verification must enforce IPv4 loopback.'
Assert-Contains $injector 'Runtime\.evaluate' 'CDP Runtime.evaluate integration is missing.'
Assert-Contains $injector 'Page\.loadEventFired' 'Renderer reload reinjection is missing.'
Assert-Contains $injector 'Page\.captureScreenshot' 'CDP screenshot verification is missing.'
$captureMatch = [regex]::Match(
  $injector,
  '(?ms)^async function capture\(session,\s*outputPath\)\s*\{(?<body>.*?)^\}'
)
Assert-True $captureMatch.Success 'Could not locate the CDP screenshot capture function.'
$captureBody = $captureMatch.Groups['body'].Value
Assert-Contains $captureBody 'Page\.captureScreenshot' 'The capture function no longer calls Page.captureScreenshot.'
Assert-True (-not [regex]::IsMatch($captureBody, 'Input\.dispatchKeyEvent|Input\.dispatchMouseEvent')) 'The capture function must not send keyboard or mouse events before taking a screenshot.'
Assert-Contains $injector 'const matchedComponentIds\s*=' 'Live verification does not collect actual DOM component IDs.'
Assert-Contains $injector 'const missingRequiredComponents\s*=\s*requiredComponents\.filter\([\s\S]{0,180}!matchedComponentIds\.includes\(item\.id\)' 'Required component coverage is not derived from actual DOM matches.'
Assert-Contains $injector 'sidebar\?\.querySelector\(''\[role="separator"\]\[data-miku-component~="10"\]''\)' 'Live verification does not detect a sidebar separator misclassified as component 10.'
$passMatch = [regex]::Match(
  $injector,
  'result\.pass\s*=\s*(?<expression>[\s\S]*?);\s*return result;'
)
Assert-True $passMatch.Success 'Could not locate the live verification pass expression.'
$passExpression = $passMatch.Groups['expression'].Value
Assert-Contains $passExpression 'result\.missingRequiredComponents\.length\s*===\s*0' 'Live verification pass no longer depends on required DOM component coverage.'
Assert-Contains $passExpression '!\s*result\.sidebarSeparatorMisclassified' 'Live verification pass no longer rejects sidebar separator component-10 misclassification.'

$startPath = Join-Path $ScriptsRoot 'start-miku-skin.ps1'
$start = Get-Content -LiteralPath $startPath -Raw
Assert-Contains $start '--remote-debugging-address=127\.0\.0\.1' 'Launcher must explicitly bind CDP to loopback.'
Assert-Contains $start 'Port is already occupied by a non-Codex process' 'Launcher does not reject occupied non-Codex ports.'
Assert-Contains $start '\$_\.Path' 'Launcher must scope restart handling to the official Codex executable path.'
$installerPath = Join-Path $ScriptsRoot 'install-miku-skin.ps1'
$installer = Get-Content -LiteralPath $installerPath -Raw
Assert-True (-not [regex]::IsMatch($installer, 'Arguments[\s\S]{0,240}-RestartExisting')) 'Default shortcut must not force-restart an existing Codex process.'
Assert-Contains $installer 'EnableAutoHook' 'Installer does not expose the opt-in automatic hook.'
foreach ($forbiddenConfigWrite in @(
  '\bSet-TomlTableValues\b',
  '\bappearanceTheme\b',
  '\bappearance[A-Za-z0-9_]*CodeThemeId\b',
  '\bappearanceDiffMarkerStyle\b',
  '\bdesktop\.appearance[A-Za-z0-9_]*ChromeTheme(?:\.[A-Za-z0-9_]+)*\b'
)) {
  Assert-True (-not [regex]::IsMatch($installer, $forbiddenConfigWrite)) "Installer must not write Codex appearance config matching $forbiddenConfigWrite."
}
Assert-True (-not [regex]::IsMatch($installer, '(?i)Codex config not found')) 'Installer must not require config.toml to exist.'
Assert-True (-not [regex]::IsMatch($installer, 'Get-Content\s+-LiteralPath\s+\$ConfigPath')) 'Installer must not read config.toml as a required mutation input.'
Assert-True (-not [regex]::IsMatch($installer, 'Set-Content\s+-LiteralPath\s+\$ConfigPath')) 'Installer must not write config.toml.'
Assert-Contains $installer '(?s)if\s*\([^)]*Test-Path\s+-LiteralPath\s+\$ConfigPath[^)]*\)[\s\S]{0,360}Copy-Item\s+-LiteralPath\s+\$ConfigPath\s+-Destination\s+\$BackupPath' 'Installer may back up config.toml only after confirming it exists.'
Assert-Contains $installer 'configModified\s*=\s*\$false' 'Install state must declare that config.toml was not modified.'

$restorePath = Join-Path $ScriptsRoot 'restore-miku-skin.ps1'
$restore = Get-Content -LiteralPath $restorePath -Raw
Assert-Contains $restore 'unregister-miku-hook\.ps1' 'Restore does not disable the automatic hook.'
Assert-Contains $restore 'if\s*\(\$Uninstall\s+-and\s+\$KeepAutoHook\)\s*\{\s*throw' 'Restore must reject -Uninstall combined with -KeepAutoHook.'

$hookPath = Join-Path $ScriptsRoot 'hook-miku-skin.ps1'
$hook = Get-Content -LiteralPath $hookPath -Raw
Assert-Contains $hook 'IgnoreExisting' 'Live hook registration cannot protect the currently running Codex process.'
Assert-Contains $hook 'controlled-restart' 'Hook does not describe the required one-time CDP restart.'
Assert-Contains $hook '-RestartProcessId' 'Hook must restart only the newly detected unskinned Codex process.'
Assert-Contains $hook 'CodexMikuSkinAutoHook' 'Hook is missing its single-instance mutex.'
Assert-Contains $hook '\$_\.Path' 'Hook must identify the official Codex executable path.'
Assert-Contains $start 'RestartProcessId' 'Launcher does not support a PID-scoped automatic restart.'

$unregisterHookPath = Join-Path $ScriptsRoot 'unregister-miku-hook.ps1'
$unregisterHook = Get-Content -LiteralPath $unregisterHookPath -Raw
$processIdentityPath = Join-Path $ScriptsRoot 'process-identity.ps1'
Assert-True (Test-Path -LiteralPath $processIdentityPath) 'Shared persisted-PID identity helper is missing.'
$processIdentity = Get-Content -LiteralPath $processIdentityPath -Raw
$processRecordHelper = Get-PowerShellFunctionText $processIdentity 'Get-MikuProcessRecord'
Assert-Contains $processRecordHelper 'Get-CimInstance\s+Win32_Process' 'Persisted PID lookup must read the Win32 process record, not trust Get-Process by PID.'
$commandLineHelper = Get-PowerShellFunctionText $processIdentity 'Test-MikuCommandLineArgument'
Assert-Contains $commandLineHelper '\[regex\]::Escape' 'Command-line identity matching must escape the exact persisted script path.'
Assert-Contains $commandLineHelper '\(\?:\^\|\\s\)' 'Command-line identity matching must enforce an argument boundary before the script path.'

$injectorGuard = Get-PowerShellFunctionText $processIdentity 'Test-MikuInjectorProcess'
foreach ($identitySignal in @(
  '\.Name',
  '\.ExecutablePath',
  '\.CommandLine',
  'node\.exe',
  'GetFullPath\(\$InjectorPath\)',
  'GetFullPath\(\$ExecutablePath\)',
  'OrdinalIgnoreCase',
  'InstanceToken -notmatch',
  'IsNullOrWhiteSpace\(\$StartedAt\)',
  '--watch',
  '--port'
)) {
  Assert-Contains $injectorGuard $identitySignal "Injector identity guard is missing $identitySignal."
}
$hookGuard = Get-PowerShellFunctionText $processIdentity 'Test-MikuHookProcess'
foreach ($identitySignal in @(
  '\.Name',
  '\.ExecutablePath',
  '\.CommandLine',
  'powershell\.exe',
  'pwsh\.exe',
  'GetFullPath\(\$HookScriptPath\)',
  'GetFullPath\(\$ExecutablePath\)',
  'OrdinalIgnoreCase',
  'InstanceToken -notmatch',
  'IsNullOrWhiteSpace\(\$StartedAt\)',
  '-Port'
)) {
  Assert-Contains $hookGuard $identitySignal "Hook identity guard is missing $identitySignal."
}
$stopInjectorHelper = Get-PowerShellFunctionText $processIdentity 'Stop-MikuInjectorProcess'
Assert-GuardedStopFunction $stopInjectorHelper 'Test-MikuInjectorProcess' 'Stop-MikuInjectorProcess must stop only after injector identity validation succeeds.'
$stopHookHelper = Get-PowerShellFunctionText $processIdentity 'Stop-MikuHookProcess'
Assert-GuardedStopFunction $stopHookHelper 'Test-MikuHookProcess' 'Stop-MikuHookProcess must stop only after hook identity validation succeeds.'

foreach ($scriptContract in @(
  @{ Name = 'start'; Text = $start; RequiredCall = 'Stop-MikuInjectorProcess' },
  @{ Name = 'restore'; Text = $restore; RequiredCall = 'Stop-MikuInjectorProcess' },
  @{ Name = 'unregister'; Text = $unregisterHook; RequiredCall = 'Stop-MikuHookProcess' },
  @{ Name = 'hook'; Text = $hook; RequiredCall = 'Test-MikuInjectorProcess' }
)) {
  Assert-Contains $scriptContract.Text 'process-identity\.ps1' "$($scriptContract.Name) must load the shared process identity helper."
  Assert-Contains $scriptContract.Text '(?m)^\s*\.\s+\$[A-Za-z][A-Za-z0-9_]*\s*$' "$($scriptContract.Name) must dot-source the shared process identity helper."
  Assert-Contains $scriptContract.Text ([regex]::Escape($scriptContract.RequiredCall)) "$($scriptContract.Name) must use $($scriptContract.RequiredCall) for persisted PID handling."
  Assert-True (-not [regex]::IsMatch($scriptContract.Text, 'Get-Process\s+-Id\s+[^\r\n]*(?:injectorPid|hookPid)')) "$($scriptContract.Name) must not decide persisted PID liveness with Get-Process alone."
  Assert-True (-not [regex]::IsMatch($scriptContract.Text, 'Stop-Process\s+-Id\s+[^\r\n]*(?:injectorPid|hookPid)')) "$($scriptContract.Name) must not stop a persisted PID directly."
}
Assert-Contains $start 'Stop-MikuInjectorProcess[\s\S]{0,420}-ProcessId\s+\(\[int\]\$old\.injectorPid\)[\s\S]{0,180}-InjectorPath\s+\$oldInjector[\s\S]{0,120}-ExecutablePath\s+\$oldExecutable[\s\S]{0,120}-Port\s+\$oldPort' 'Launcher must pass persisted injector PID, exact script path, executable path, and port through the guarded stop helper.'
Assert-Contains $restore 'Stop-MikuInjectorProcess[\s\S]{0,420}-ProcessId\s+\(\[int\]\$state\.injectorPid\)[\s\S]{0,180}-InjectorPath\s+\$stateInjector[\s\S]{0,120}-ExecutablePath\s+\$stateExecutable[\s\S]{0,120}-Port\s+\$statePort' 'Restore must pass persisted injector PID, exact script path, executable path, and port through the guarded stop helper.'
Assert-Contains $unregisterHook 'Stop-MikuHookProcess[\s\S]{0,420}-ProcessId\s+\(\[int\]\$state\.hookPid\)[\s\S]{0,180}-HookScriptPath\s+\$hookScript[\s\S]{0,120}-ExecutablePath\s+\$hookExecutable[\s\S]{0,120}-Port\s+\$hookPort' 'Unregister must pass persisted hook PID, exact script path, executable path, and port through the guarded stop helper.'
Assert-Contains $hook 'Test-MikuInjectorProcess[\s\S]{0,420}-ProcessId\s+\(\[int\]\$state\.injectorPid\)[\s\S]{0,180}-InjectorPath\s+\$stateInjector[\s\S]{0,120}-ExecutablePath\s+\$stateExecutable[\s\S]{0,120}-Port\s+\$ExpectedPort' 'Hook liveness must validate persisted injector PID, exact script path, executable path, and port.'
Assert-Contains $start 'injectorPath\s*=\s*\$Injector' 'Runtime state must persist the exact injector path used for identity checks.'
Assert-Contains $start 'nodeExecutable\s*=\s*\$node' 'Runtime state must persist the injector executable identity.'
Assert-Contains $hook 'hookExecutable\s*=\s*\$hookExecutable' 'Hook state must persist its exact PowerShell host executable identity.'
Assert-Contains $hook 'hookScript\s*=\s*[^\r\n]*\$PSCommandPath' 'Hook state must persist the exact hook script path used for identity checks.'

. $processIdentityPath
$identityToken = '0123456789abcdef0123456789abcdef'
$identityStartedAt = (Get-Date).ToUniversalTime().ToString('o')
$trustedNode = 'C:\Trusted\node.exe'
$trustedInjector = 'C:\Trusted\injector.mjs'
$script:mikuMockProcessRecord = [pscustomobject]@{
  Name = 'node.exe'
  ExecutablePath = $trustedNode
  CommandLine = '"C:\Trusted\node.exe" "C:\Trusted\injector.mjs" --watch --port 9347 --instance-token ' + $identityToken
  CreationDate = [DateTime]::Parse($identityStartedAt)
}
function Get-MikuProcessRecord {
  param([int]$ProcessId)
  return $script:mikuMockProcessRecord
}
$injectorIdentity = @{
  ProcessId = 4242
  InjectorPath = $trustedInjector
  ExecutablePath = $trustedNode
  Port = 9347
  InstanceToken = $identityToken
  StartedAt = $identityStartedAt
}
Assert-True (Test-MikuInjectorProcess @injectorIdentity) 'A complete matching injector identity must pass.'
$wrongExecutableIdentity = $injectorIdentity.Clone()
$wrongExecutableIdentity.ExecutablePath = 'D:\UnrelatedNode\node.exe'
Assert-True (-not (Test-MikuInjectorProcess @wrongExecutableIdentity)) 'Injector identity must reject an executable path mismatch.'
$missingTokenIdentity = $injectorIdentity.Clone()
$missingTokenIdentity.InstanceToken = ''
Assert-True (-not (Test-MikuInjectorProcess @missingTokenIdentity)) 'Injector identity must reject a missing instance token.'
$missingStartIdentity = $injectorIdentity.Clone()
$missingStartIdentity.StartedAt = ''
Assert-True (-not (Test-MikuInjectorProcess @missingStartIdentity)) 'Injector identity must reject a missing start time.'

$trustedPowerShell = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
$trustedHook = 'C:\Trusted\hook-miku-skin.ps1'
$script:mikuMockProcessRecord = [pscustomobject]@{
  Name = 'powershell.exe'
  ExecutablePath = $trustedPowerShell
  CommandLine = '"' + $trustedPowerShell + '" -NoProfile -File "' + $trustedHook + '" -Port 9347 -InstanceToken ' + $identityToken
  CreationDate = [DateTime]::Parse($identityStartedAt)
}
$hookIdentity = @{
  ProcessId = 4343
  HookScriptPath = $trustedHook
  ExecutablePath = $trustedPowerShell
  Port = 9347
  InstanceToken = $identityToken
  StartedAt = $identityStartedAt
}
Assert-True (Test-MikuHookProcess @hookIdentity) 'A complete matching hook identity must pass.'
$missingHookToken = $hookIdentity.Clone()
$missingHookToken.InstanceToken = ''
Assert-True (-not (Test-MikuHookProcess @missingHookToken)) 'Hook identity must reject a missing instance token.'
$missingHookStart = $hookIdentity.Clone()
$missingHookStart.StartedAt = ''
Assert-True (-not (Test-MikuHookProcess @missingHookStart)) 'Hook identity must reject a missing start time.'

$registerHookPath = Join-Path $ScriptsRoot 'register-miku-hook.ps1'
$registerHook = Get-Content -LiteralPath $registerHookPath -Raw
Assert-Contains $registerHook 'New-ScheduledTaskTrigger -AtLogOn' 'Automatic hook must start at user logon.'
Assert-Contains $registerHook "RunLevel = 'Limited'" 'Automatic hook must use a limited user task.'
Assert-Contains $registerHook '-IgnoreExisting' 'Immediate hook start must ignore the current Codex process.'
Assert-Contains $registerHook 'process-identity\.ps1' 'Hook registration must load the shared process identity helper.'
Assert-Contains $registerHook '(?m)^\s*\.\s+\$[A-Za-z][A-Za-z0-9_]*\s*$' 'Hook registration must dot-source the shared process identity helper.'
Assert-Contains $registerHook 'Stop-MikuHookProcess' 'Hook registration must validate persisted hook identity before replacing an existing hook.'
Assert-True (-not [regex]::IsMatch($registerHook, 'Get-Process\s+-Id\s+[^\r\n]*hookPid')) 'Hook registration must not trust a persisted hook PID by itself.'
Assert-Contains $registerHook 'Stop-MikuHookProcess[\s\S]{0,480}-ProcessId\s+\(\[int\]\$existing\.hookPid\)[\s\S]{0,180}-HookScriptPath\s+\$existingScript[\s\S]{0,120}-ExecutablePath\s+\$existingExecutable[\s\S]{0,120}-Port\s+\$existingPort[\s\S]{0,160}-InstanceToken\s+\(\[string\]\$existing\.instanceToken\)' 'Re-registration must validate and retire the prior hook using its persisted executable, script, port, token, and start time.'
Assert-Contains $registerHook '\$hookToken\s*=\s*\[Guid\]::NewGuid\(\)\.ToString\(''N''\)' 'Each hook registration must converge on a fresh instance token.'
Assert-Contains $registerHook '" -Port "|''" -Port ''' 'Scheduled hook arguments must carry the requested port.'
Assert-Contains $registerHook ''' -Tone ''[\s\S]{0,80}\$Tone' 'Scheduled hook arguments must carry the requested tone.'
Assert-Contains $registerHook ''' -InstanceToken ''[\s\S]{0,80}\$hookToken' 'Scheduled hook arguments must carry the fresh instance token.'
Assert-Contains $registerHook 'port\s*=\s*\$Port[\s\S]{0,100}tone\s*=\s*\$Tone\.ToLowerInvariant\(\)[\s\S]{0,140}instanceToken\s*=\s*\$hookToken' 'Registration state must persist the converged port, tone, and instance token.'
Assert-Contains $registerHook 'hookExecutable\s*=\s*\$powershell' 'Registration state must persist the exact PowerShell executable used by the scheduled and live hook.'
Assert-True (-not [regex]::IsMatch($registerHook, '(?i)RunLevel\s*=\s*''Highest''|Image File Execution Options|\\IFEO')) 'Automatic hook requests an unsafe process interception or elevated task.'

$canonicalFiles = @(
  $cssPath,
  $rendererPath,
  $injectorPath,
  $startPath,
  $installerPath,
  $restorePath,
  (Join-Path $ScriptsRoot 'verify-miku-skin.ps1'),
  $processIdentityPath,
  $hookPath,
  $registerHookPath,
  $unregisterHookPath
)
$canonicalText = ($canonicalFiles | ForEach-Object { Get-Content -LiteralPath $_ -Raw }) -join [Environment]::NewLine
Assert-True (-not [regex]::IsMatch($canonicalText, '(?i)app\.asar|takeown|icacls|WindowsApps\\.*(?:Set-Content|Copy-Item|Remove-Item)')) 'Canonical runtime contains an official-package mutation path.'

$node = (Get-Command node -ErrorAction Stop).Source
& $node --check $injectorPath
if ($LASTEXITCODE -ne 0) { throw 'Node syntax check failed for injector.mjs.' }
& $node --check $rendererPath
if ($LASTEXITCODE -ne 0) { throw 'Node syntax check failed for renderer-inject.js.' }
$liveAuditPath = Join-Path $PSScriptRoot 'audit-live-components.mjs'
Assert-True (Test-Path -LiteralPath $liveAuditPath) 'Live selector contract audit is missing.'
$liveAudit = Get-Content -LiteralPath $liveAuditPath -Raw
Assert-Contains $liveAudit '--screenshot' 'Live selector contract audit does not expose screenshot capture.'
Assert-Contains $liveAudit 'Page\.captureScreenshot' 'Live selector contract audit does not use CDP screenshot capture.'
Assert-Contains $liveAudit '!item\.url\.includes\("initialRoute=%2Fchatgpt%2Fquick-chat-prewarm"\)' 'Live selector contract audit must exclude the quick-chat prewarm renderer target.'
Assert-Contains $liveAudit 'Number\.isInteger\(contract\.minimum\)' 'Live selector contract audit does not support minimum-match contracts.'
Assert-Contains $liveAudit 'contract\.visibleOnly' 'Live selector contract audit does not support visible-only contracts.'
Assert-Contains $liveAudit 'targetId:\s*target\.id[\s\S]{0,80}renderer:\s*"app://"' 'Live audit output must expose only a target ID and fixed renderer scheme.'
Assert-True (-not [regex]::IsMatch($liveAudit, '(?:title|url):\s*target\.(?:title|url)')) 'Live audit output must not expose raw renderer titles or URLs.'
foreach ($scenarioContract in @(
  @{ Scenario = 'home'; Signal = '\[role="main"\]:has\(\[data-testid="home-icon"\]\)' },
  @{ Scenario = 'diff'; Signal = 'data-app-shell-tab-panel-controller=\\?"right\\?' },
  @{ Scenario = 'settings-general'; Signal = 'aside\.app-shell-left-panel \[role=\\?"searchbox\\?"\]' },
  @{ Scenario = 'plugins'; Signal = '#plugins-page-search' },
  @{ Scenario = 'scheduled'; Signal = '#scheduled-page-search' },
  @{ Scenario = 'terminal'; Signal = '\.xterm' },
  @{ Scenario = 'popover'; Signal = '\[role=\\?"menu\\?"\]' },
  @{ Scenario = 'quick-chat'; Signal = '\[data-pip-obstacle=\\?"quick-chat\\?"\]' },
  @{ Scenario = 'profile'; Signal = '--profile-usage-level' },
  @{ Scenario = 'appearance'; Signal = 'appearance-theme' },
  @{ Scenario = 'pets'; Signal = '#pet-size' }
)) {
  Assert-Contains $liveAudit ([regex]::Escape('"' + $scenarioContract.Scenario + '"')) "Live selector contract audit is missing scenario $($scenarioContract.Scenario)."
  Assert-Contains $liveAudit $scenarioContract.Signal "Live selector scenario $($scenarioContract.Scenario) is missing its stable route signal."
}
Assert-Contains $liveAudit 'key:\s*"home-route-is-component-03"[\s\S]{0,260}selector:\s*''\[role="main"\]\.miku-home\[data-miku-component~="03"\]:has\(\[data-testid="home-icon"\]\)''' 'Home component 03 must belong to the native inner role=main container.'
Assert-Contains $liveAudit 'key:\s*"four-visible-native-suggestion-cards"[\s\S]{0,180}expected:\s*4[\s\S]{0,120}visibleOnly:\s*true' 'Home live contract must require exactly four visible native suggestion cards.'
Assert-Contains $liveAudit 'key:\s*"four-visible-native-suggestion-cards"[\s\S]{0,260}selector:\s*''\[role="main"\]:has\(\[data-testid="home-icon"\]\)' 'Home suggestion cards must be scoped to the native inner role=main container.'
Assert-Contains $liveAudit 'key:\s*"native-settings-card"[\s\S]{0,220}minimum:\s*1[\s\S]{0,220}section > \.overflow-hidden\.rounded-2xl\.border' 'Settings live scenario must require at least one native rounded settings card.'
Assert-Contains $liveAudit 'key:\s*"settings-card-is-component-05"[\s\S]{0,220}minimum:\s*1[\s\S]{0,320}\.miku-settings-card\[data-miku-component~="05"\]' 'Settings live scenario must require a native settings card marked as component 05.'
foreach ($exactContractKey in @(
  'native-diff-tabpanel',
  'diff-surface-is-component-04',
  'diff-has-only-one-component-04-surface-owner',
  'native-profile-menu',
  'profile-menu-is-component-09'
)) {
  Assert-Contains $liveAudit ('key:\s*"' + [regex]::Escape($exactContractKey) + '"[\s\S]{0,400}expected:\s*1') "Live contract $exactContractKey must require exactly one match."
}
foreach ($contractKey in @(
  'diff-surface-is-component-04',
  'diff-has-only-one-component-04-surface-owner',
  'diff-sidebar-separator-is-not-component-10',
  'non-quick-chat-dialog-is-not-component-08',
  'profile-menu-is-component-09',
  'popover-sidebar-separator-is-not-component-10',
  'quick-chat-resize-separator-is-not-component-10',
  'quick-chat-composer-is-component-08',
  'quick-chat-composer-is-not-component-02',
  'terminal-surface-or-host-is-component-10',
  'terminal-sidebar-separator-is-not-component-10',
  'profile-usage-heatmap-is-component-12',
  'appearance-route-is-component-13',
  'appearance-state-controls-include-component-14',
  'pets-route-is-component-13'
)) {
  Assert-Contains $liveAudit ([regex]::Escape('key: "' + $contractKey + '"')) "Live selector contract audit is missing contract $contractKey."
}
foreach ($negativeContractKey in @(
  'diff-sidebar-separator-is-not-component-10',
  'non-quick-chat-dialog-is-not-component-08',
  'popover-sidebar-separator-is-not-component-10',
  'quick-chat-resize-separator-is-not-component-10',
  'quick-chat-composer-is-not-component-02',
  'terminal-sidebar-separator-is-not-component-10'
)) {
  Assert-Contains $liveAudit ('key:\s*"' + [regex]::Escape($negativeContractKey) + '"[\s\S]{0,180}expected:\s*0') "Live selector negative contract $negativeContractKey must require zero matches."
}
Assert-True (-not [regex]::IsMatch($liveAudit, 'Input\.dispatch|Page\.(?:navigate|reload)')) 'Live screenshot audit must not send input, navigate, or reload the page.'
& $node --check $liveAuditPath
if ($LASTEXITCODE -ne 0) { throw 'Node syntax check failed for audit-live-components.mjs.' }

$powershellFiles = Get-ChildItem -LiteralPath $ScriptsRoot -Filter '*.ps1'
$powershellFiles += Get-Item -LiteralPath $PSCommandPath
foreach ($file in $powershellFiles) {
  $tokens = $null
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile(
    $file.FullName,
    [ref]$tokens,
    [ref]$errors
  )
  if ($errors.Count -gt 0) {
    throw "PowerShell syntax error in $($file.Name): $($errors[0].Message)"
  }
}

$result = [ordered]@{
  componentContracts = 14
  cssSections = $markers.Count
  sourceBoardRecords = $sourceSpec.asset_count
  hashRecords = $sourceSpec.unique_hash_count
  heroBytes = $heroBytes.Length
  nodeSyntax = 'passed'
  powershellSyntax = 'passed'
  loopbackGuard = 'passed'
  officialPackageMutationGuard = 'passed'
}
$result | ConvertTo-Json
