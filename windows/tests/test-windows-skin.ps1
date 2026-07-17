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
Assert-Contains $injector 'constructor\(target,\s*timeoutMs\s*=\s*\d+\)[\s\S]{0,180}this\.timeoutMs\s*=\s*timeoutMs' 'Each CDP session must retain its caller-supplied finite timeout.'
Assert-Contains $injector 'Number\.isInteger\(options\.timeoutMs\)[\s\S]{0,100}options\.timeoutMs\s*<\s*250[\s\S]{0,100}options\.timeoutMs\s*>\s*120000' 'Injector timeout arguments must be finite integers within 250-120000ms.'
$waitForTargets = [regex]::Match(
  $injector,
  '(?s)async function waitForTargets\(port,\s*timeoutMs\)\s*\{(?<body>.*?)\r?\n\}\s*\r?\n\s*async function loadPayload'
)
Assert-True $waitForTargets.Success 'Could not locate bounded CDP target discovery.'
$waitForTargetsBody = $waitForTargets.Groups['body'].Value
Assert-Contains $waitForTargetsBody 'const deadline\s*=\s*Date\.now\(\)\s*\+\s*timeoutMs' 'Target discovery must retain one overall deadline.'
Assert-Contains $waitForTargetsBody 'new AbortController\(\)' 'Each /json/list request must have an AbortController.'
Assert-Contains $waitForTargetsBody 'Math\.max\(1,\s*Math\.min\(1000,\s*deadline\s*-\s*Date\.now\(\)\)\)' 'Each /json/list request timeout must be at most 1000ms and never exceed the remaining overall timeout.'
Assert-Contains $waitForTargetsBody 'setTimeout\(\(\)\s*=>\s*requestController\.abort\(\),\s*requestTimeoutMs\)' 'Target discovery must actively abort a stalled /json/list request.'
Assert-Contains $waitForTargetsBody 'fetch\([^)]*/json/list[^)]*,\s*\{\s*signal:\s*requestController\.signal\s*\}\s*\)' 'The /json/list fetch must receive the AbortController signal.'
Assert-Contains $waitForTargetsBody '(?s)finally\s*\{\s*clearTimeout\(requestTimer\);?\s*\}' 'Target discovery must clear every per-request abort timer in a finalizer.'
Assert-Contains $waitForTargetsBody 'const retryDelayMs\s*=\s*Math\.min\(350,\s*Math\.max\(0,\s*deadline\s*-\s*Date\.now\(\)\)\)' 'Target retry delay must be capped at 350ms and the remaining overall deadline.'
Assert-Contains $waitForTargetsBody '(?s)if\s*\(retryDelayMs\s*>\s*0\)\s*\{\s*await new Promise\(\(resolve\)\s*=>\s*setTimeout\(resolve,\s*retryDelayMs\)\);?\s*\}' 'Target discovery may sleep only for a positive remaining retry delay.'
Assert-True (-not [regex]::IsMatch(
  $waitForTargetsBody,
  'setTimeout\(resolve,\s*350\)'
)) 'Target discovery must not use a fixed retry sleep that can exceed the overall deadline.'
$cdpOpenMethod = [regex]::Match(
  $injector,
  '(?s)async open\(\)\s*\{(?<body>.*?)\r?\n\s*onMessage\(event\)'
)
Assert-True $cdpOpenMethod.Success 'Could not locate the CDP WebSocket open method.'
Assert-Contains $cdpOpenMethod.Groups['body'].Value 'setTimeout\([\s\S]{0,360}\},\s*this\.timeoutMs\)' 'CDP WebSocket open must reject after the session timeout.'
Assert-Contains $cdpOpenMethod.Groups['body'].Value 'clearTimeout\(timer\)' 'CDP WebSocket open must clear its timeout when the socket settles.'
$cdpSendMethod = [regex]::Match(
  $injector,
  '(?s)send\(method,\s*params\s*=\s*\{\},\s*timeoutMs\s*=\s*this\.timeoutMs\)\s*\{(?<body>.*?)\r?\n\s*async evaluate\(expression,\s*timeoutMs\s*=\s*this\.timeoutMs\)'
)
Assert-True $cdpSendMethod.Success 'Could not locate the CDP command send method.'
Assert-Contains $cdpSendMethod.Groups['body'].Value 'Number\.isFinite\(timeoutMs\)\s*\?\s*timeoutMs\s*:\s*this\.timeoutMs' 'CDP command timeout must fall back to the session timeout for a non-finite override.'
Assert-Contains $cdpSendMethod.Groups['body'].Value 'const commandTimeoutMs\s*=\s*Math\.max\(1,\s*Math\.min\(this\.timeoutMs,\s*requestedTimeoutMs\)\)' 'CDP command timeout must be clamped to the remaining caller budget and the session timeout.'
Assert-Contains $cdpSendMethod.Groups['body'].Value 'setTimeout\([\s\S]{0,320}\},\s*commandTimeoutMs\)' 'Every pending CDP command must reject after its bounded command timeout.'
Assert-Contains $cdpSendMethod.Groups['body'].Value 'pending\.delete\(id\)' 'Timed-out CDP commands must be removed from the pending map.'
Assert-Contains $injector 'async evaluate\(expression,\s*timeoutMs\s*=\s*this\.timeoutMs\)[\s\S]{0,280}this\.send\("Runtime\.evaluate",[\s\S]{0,220}\},\s*timeoutMs\)' 'Renderer evaluation must forward its remaining caller budget to the CDP command.'
Assert-Contains $injector 'async function connectTarget\(target,\s*timeoutMs\)\s*\{\s*return new CdpSession\(target,\s*timeoutMs\)\.open\(\);\s*\}' 'connectTarget must construct each CDP session with the requested timeout.'
Assert-True ([regex]::Matches(
  $injector,
  'await connectTarget\(target,\s*options\.timeoutMs\)'
).Count -eq 2) 'One-shot and watch connection paths must both pass options.timeoutMs to connectTarget.'
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
$visibleHelperMatch = [regex]::Match(
  $injector,
  '(?s)const isActuallyVisible\s*=\s*\(node\)\s*=>\s*\{(?<body>.*?)\r?\n\s*\};\s*\r?\n\s*const root'
)
Assert-True $visibleHelperMatch.Success 'Could not locate the actual-visibility verifier used for home suggestion cards.'
$visibleHelperBody = $visibleHelperMatch.Groups['body'].Value
Assert-Contains $visibleHelperBody '!node\?\.isConnected' 'Actual visibility must reject detached suggestion cards.'
Assert-Contains $visibleHelperBody 'node\.getClientRects\(\)\.length\s*===\s*0' 'Actual visibility must reject suggestion cards without layout boxes.'
Assert-Contains $visibleHelperBody 'rect\.width\s*<=\s*0\s*\|\|\s*rect\.height\s*<=\s*0' 'Actual visibility must reject zero-size suggestion cards.'
Assert-Contains $visibleHelperBody 'for\s*\(let current\s*=\s*node;\s*current instanceof Element;\s*current\s*=\s*current\.parentElement\)' 'Actual visibility must inspect the suggestion card and all element ancestors.'
Assert-Contains $visibleHelperBody 'getComputedStyle\(current\)' 'Actual visibility must inspect computed styles along the ancestor chain.'
Assert-Contains $visibleHelperBody 'computed\.display\s*===\s*"none"' 'Actual visibility must reject display:none suggestion cards or ancestors.'
Assert-Contains $visibleHelperBody 'computed\.visibility\s*===\s*"hidden"' 'Actual visibility must reject visibility:hidden suggestion cards or ancestors.'
Assert-Contains $visibleHelperBody 'computed\.visibility\s*===\s*"collapse"' 'Actual visibility must reject visibility:collapse suggestion cards or ancestors.'
Assert-Contains $visibleHelperBody 'Number\.parseFloat\(computed\.opacity\)\s*<=\s*0' 'Actual visibility must reject fully transparent suggestion cards or ancestors.'
Assert-Contains $visibleHelperBody 'const centerX\s*=\s*rect\.left\s*\+\s*rect\.width\s*/\s*2' 'Actual visibility must calculate the suggestion card horizontal center.'
Assert-Contains $visibleHelperBody 'const centerY\s*=\s*rect\.top\s*\+\s*rect\.height\s*/\s*2' 'Actual visibility must calculate the suggestion card vertical center.'
Assert-Contains $visibleHelperBody 'centerX\s*<\s*0[\s\S]{0,120}centerX\s*>=\s*innerWidth[\s\S]{0,120}centerY\s*>=\s*innerHeight' 'Actual visibility must reject suggestion-card centers outside the viewport.'
Assert-Contains $visibleHelperBody 'document\.elementFromPoint\(centerX,\s*centerY\)' 'Actual visibility must hit-test the suggestion card center point.'
Assert-Contains $visibleHelperBody 'centerOwner\s*===\s*node\s*\|\|\s*node\.contains\(centerOwner\)' 'Actual visibility must reject a suggestion card whose center point is occluded.'
Assert-Contains $injector 'const homeScenario\s*=\s*Boolean\(nativeHome\s*\|\|\s*home\s*\|\|\s*suggestions\)' 'Home verification must activate when any native or decorated home signal is present.'
Assert-Contains $injector 'const visibleSuggestionCount\s*=\s*suggestionButtons\.filter\(isActuallyVisible\)\.length' 'Visible suggestion count must be derived by applying the actual-visibility verifier to native buttons.'
Assert-Contains $injector 'visibleSuggestionCount:\s*suggestions\s*\?\s*visibleSuggestionCount\s*:\s*null' 'Live verification result must expose visibleSuggestionCount when the suggestion group exists.'
$passMatch = [regex]::Match(
  $injector,
  'result\.pass\s*=\s*(?<expression>[\s\S]*?);\s*return result;'
)
Assert-True $passMatch.Success 'Could not locate the live verification pass expression.'
$passExpression = $passMatch.Groups['expression'].Value
Assert-Contains $passExpression 'result\.missingRequiredComponents\.length\s*===\s*0' 'Live verification pass no longer depends on required DOM component coverage.'
Assert-Contains $passExpression '!\s*result\.sidebarSeparatorMisclassified' 'Live verification pass no longer rejects sidebar separator component-10 misclassification.'
$homePassMatch = [regex]::Match(
  $passExpression,
  '\(\s*!result\.homeScenario\s*\|\|\s*\((?<requirements>[\s\S]*?)\)\s*\)'
)
Assert-True $homePassMatch.Success 'Live verification pass must include a conditional home-scene contract.'
$homePassRequirements = $homePassMatch.Groups['requirements'].Value
Assert-True ([regex]::Matches(
  $homePassRequirements,
  'result\.suggestionCount\s*===\s*4'
).Count -eq 1) 'When a home scene is present, live verification must require exactly four native suggestion cards.'
Assert-True ([regex]::Matches(
  $homePassRequirements,
  'result\.visibleSuggestionCount\s*===\s*4'
).Count -eq 1) 'When a home scene is present, live verification must require exactly four actually visible suggestion cards.'
$verifySessionMatch = [regex]::Match(
  $injector,
  '(?ms)^async function verifySession\(session,\s*timeoutMs\s*=\s*session\.timeoutMs\)\s*\{(?<body>.*?)^\}'
)
Assert-True $verifySessionMatch.Success 'Could not locate the timeout-aware live verification function.'
Assert-Contains $verifySessionMatch.Groups['body'].Value 'session\.evaluate\([\s\S]*?timeoutMs\);' 'Live verification must forward the caller remaining budget to Runtime.evaluate.'
$waitForVerifiedSessionMatch = [regex]::Match(
  $injector,
  '(?ms)^async function waitForVerifiedSession\(session,\s*timeoutMs\)\s*\{(?<body>.*?)^\}'
)
Assert-True $waitForVerifiedSessionMatch.Success 'Could not locate the bounded verification retry helper.'
$waitForVerifiedSessionBody = $waitForVerifiedSessionMatch.Groups['body'].Value
Assert-Contains $waitForVerifiedSessionBody 'const deadline\s*=\s*Date\.now\(\)\s*\+\s*timeoutMs' 'Verification retries must share one caller-provided deadline.'
Assert-Contains $waitForVerifiedSessionBody 'const remainingBeforeVerify\s*=\s*deadline\s*-\s*Date\.now\(\)' 'Verification must calculate the remaining budget before each Runtime.evaluate call.'
Assert-Contains $waitForVerifiedSessionBody 'if\s*\(remainingBeforeVerify\s*<=\s*0\)\s*break' 'Verification must stop before issuing a command after its deadline.'
Assert-Contains $waitForVerifiedSessionBody 'verifySession\(session,\s*remainingBeforeVerify\)' 'Verification must pass the remaining deadline budget into Runtime.evaluate.'
Assert-Contains $waitForVerifiedSessionBody 'const retryDelayMs\s*=\s*Math\.min\(500,\s*Math\.max\(0,\s*deadline\s*-\s*Date\.now\(\)\)\)' 'Verification retry sleep must be capped at 500ms and the remaining overall deadline.'
Assert-Contains $waitForVerifiedSessionBody 'if\s*\(retryDelayMs\s*>\s*0\)[\s\S]{0,140}setTimeout\(resolve,\s*retryDelayMs\)' 'Verification may sleep only for a positive remaining retry delay.'
Assert-True (-not [regex]::IsMatch(
  $waitForVerifiedSessionBody,
  'setTimeout\(resolve,\s*500\)'
)) 'Verification must not use a fixed retry sleep that can exceed the overall deadline.'
$runOneShotMatch = [regex]::Match(
  $injector,
  '(?s)async function runOneShot\(options\)\s*\{(?<body>.*?)\r?\n\}\s*\r?\n\s*async function runWatch'
)
Assert-True $runOneShotMatch.Success 'Could not locate the one-shot injector path.'
Assert-Contains $runOneShotMatch.Groups['body'].Value 'const verified\s*=\s*options\.mode\s*===\s*"remove"\s*\?\s*await session\.evaluate\([\s\S]*?\)\s*:\s*await waitForVerifiedSession\(session,\s*options\.timeoutMs\)\s*;' 'Ordinary --verify mode must use the bounded verification wait so delayed SPA component markers do not cause a false failure.'

$startPath = Join-Path $ScriptsRoot 'start-miku-skin.ps1'
$start = Get-Content -LiteralPath $startPath -Raw
Assert-Contains $start '--remote-debugging-address=127\.0\.0\.1' 'Launcher must explicitly bind CDP to loopback.'
Assert-Contains $start 'Port is already occupied by a non-Codex process' 'Launcher does not reject occupied non-Codex ports.'
Assert-Contains $start '\$_\.Path' 'Launcher must scope restart handling to the official Codex executable path.'
$storeLaunchPath = Join-Path $ScriptsRoot 'codex-store-launch.ps1'
Assert-True (Test-Path -LiteralPath $storeLaunchPath) 'The packaged Codex activation helper is missing.'
$storeLaunch = Get-Content -LiteralPath $storeLaunchPath -Raw
$storeLaunchHelper = Get-PowerShellFunctionText $storeLaunch 'Start-CodexStoreApp'
Assert-Contains ($start + [Environment]::NewLine + $storeLaunch) 'Get-AppxPackage(?:\s+-Name)?\s+OpenAI\.Codex' 'Packaged Codex activation must resolve the installed OpenAI.Codex package.'
foreach ($activationSignal in @(
  'Get-AppxPackageManifest',
  'PackageFamilyName',
  'Applications\.Application',
  'application(?:\[[^\]]+\])?\.Id',
  'IApplicationActivationManager',
  'ActivateApplication'
)) {
  Assert-Contains $storeLaunch $activationSignal "Packaged Codex activation is missing $activationSignal."
}
Assert-Contains $storeLaunch '(?:\+\s*''!''\s*\+|\$\([^)]+\)!\$\([^)]+\)|[''"]\{0\}!\{1\}[''"]\s*-f)' 'The Codex AUMID must be composed from the installed package family and manifest application ID.'
Assert-Contains $storeLaunchHelper 'Arguments' 'The packaged Codex activation helper must accept the CDP argument list.'
Assert-True (-not [regex]::IsMatch($storeLaunch, '(?i)shell:AppsFolder')) 'shell:AppsFolder cannot carry the required CDP arguments and must not be used as the launch strategy.'
$storeLaunchAssignment = [regex]::Match(
  $start,
  '(?m)^\s*\$(?<name>[A-Za-z][A-Za-z0-9_]*)\s*=\s*Join-Path\s+\$PSScriptRoot\s+''codex-store-launch\.ps1''\s*$'
)
Assert-True $storeLaunchAssignment.Success 'Launcher must resolve codex-store-launch.ps1 relative to its scripts directory.'
Assert-Contains $start ('(?m)^\s*\.\s+\$' + [regex]::Escape($storeLaunchAssignment.Groups['name'].Value) + '\s*$') 'Launcher must dot-source the packaged Codex activation helper it resolved.'
Assert-Contains $start 'Start-CodexStoreApp[\s\S]{0,260}-Arguments\s+\$arguments' 'Launcher must pass the loopback CDP argument list through Start-CodexStoreApp.'
Assert-True (-not [regex]::IsMatch($start, '(?im)\bStart-Process\b[^\r\n]*-FilePath\s+\$exe\b')) 'Launcher must not directly Start-Process the access-controlled WindowsApps ChatGPT.exe.'
Assert-Contains $start '\[switch\]\$HookInvocation' 'Launcher must expose an internal-only hook invocation guard.'
$hookInvocationPauseGuard = [regex]::Match(
  $start,
  '(?s)\$runtimeTransition\s*=\s*Enter-MikuRuntimeTransition\s*\r?\n\s*\$transitionHeld\s*=\s*\$true\s*\r?\n\s*try\s*\{\s*(?<guard>if\s*\(\s*\$HookInvocation\s+-and\s+\(\s*Test-Path\s+-LiteralPath\s+\$HookPausePath\s*\)\s*\)\s*\{(?<body>.*?)\})'
)
Assert-True $hookInvocationPauseGuard.Success 'Hook pause must be checked as the first operation after acquiring the shared runtime transition lock.'
$hookInvocationPauseBody = $hookInvocationPauseGuard.Groups['body'].Value
Assert-Contains $hookInvocationPauseBody '(?m)^\s*return\s*$' 'A hook invocation must return immediately while Restore owns a current-session pause.'
Assert-True (-not [regex]::IsMatch(
  $hookInvocationPauseBody,
  '(?i)Start-Process|Stop-Process|Start-CodexStoreApp|CloseMainWindow|Remove-Item|Set-Content'
)) 'The locked hook-pause guard must return without changing processes or runtime state.'
$startBeforeHookInvocationGuard = $start.Substring(
  0,
  $hookInvocationPauseGuard.Groups['guard'].Index
)
Assert-True (-not [regex]::IsMatch(
  $startBeforeHookInvocationGuard,
  '(?im)^\s*New-Item\b[^\r\n]*-Path\s+\$StateRoot\b'
)) 'A paused hook invocation must be able to return before the launcher creates or mutates StateRoot.'
$stateRootCreationIndex = $start.IndexOf(
  'New-Item -ItemType Directory -Force -Path $StateRoot',
  [System.StringComparison]::Ordinal
)
Assert-True (
  $stateRootCreationIndex -gt (
    $hookInvocationPauseGuard.Groups['guard'].Index +
    $hookInvocationPauseGuard.Groups['guard'].Length
  )
) 'StateRoot creation must occur only after the locked HookInvocation pause guard completes.'
$transitionAcquireIndex = $start.IndexOf(
  'Enter-MikuRuntimeTransition',
  [System.StringComparison]::Ordinal
)
$packagedLaunchIndex = $start.IndexOf(
  'Start-CodexStoreApp',
  [System.StringComparison]::Ordinal
)
$daemonStartIndex = $start.IndexOf(
  '$daemon = Start-Process',
  [System.StringComparison]::Ordinal
)
$stateWriteIndex = $start.IndexOf(
  'Set-Content -LiteralPath $StatePath',
  [System.StringComparison]::Ordinal
)
$normalTransitionReleaseIndex = $start.IndexOf(
  'Exit-MikuRuntimeTransition -Mutex $runtimeTransition',
  $stateWriteIndex,
  [System.StringComparison]::Ordinal
)
$verifyInvocationIndex = $start.IndexOf(
  '& $node $Injector --verify',
  [System.StringComparison]::Ordinal
)
Assert-True (
  $transitionAcquireIndex -ge 0 -and
  $transitionAcquireIndex -lt $hookInvocationPauseGuard.Groups['guard'].Index -and
  $hookInvocationPauseGuard.Groups['guard'].Index -lt $packagedLaunchIndex -and
  $packagedLaunchIndex -lt $daemonStartIndex -and
  $daemonStartIndex -lt $stateWriteIndex -and
  $stateWriteIndex -lt $normalTransitionReleaseIndex -and
  $normalTransitionReleaseIndex -lt $verifyInvocationIndex
) 'The transition lock must cover launch, daemon startup, and state persistence, then release before verification.'
Assert-True ([regex]::Matches($start, '\$runtimeTransition\s*=\s*Enter-MikuRuntimeTransition').Count -eq 1) 'Launcher must acquire its initial shared runtime transition lock exactly once.'
Assert-Contains $start '\$runtimeTransition\s*=\s*Enter-MikuRuntimeTransition\s*\r?\n\s*\$transitionHeld\s*=\s*\$true' 'Launcher must track ownership immediately after acquiring the runtime transition lock.'
Assert-Contains $start 'Set-Content\s+-LiteralPath\s+\$StatePath[\s\S]{0,360}Exit-MikuRuntimeTransition\s+-Mutex\s+\$runtimeTransition\s*\r?\n\s*\$transitionHeld\s*=\s*\$false' 'Launcher must release transition ownership immediately after durable state persistence.'
Assert-Contains $start '(?s)finally\s*\{\s*if\s*\(\s*\$transitionHeld\s*\)\s*\{\s*Exit-MikuRuntimeTransition\s+-Mutex\s+\$runtimeTransition\s*\}\s*\}' 'Launcher finalization must release the transition lock only while it is still held.'
$runtimeStateWrite = [regex]::Match(
  $start,
  '(?s)@\{(?<body>[^{}]*?injectorPid\s*=\s*\$daemon\.Id.*?)\}\s*\|\s*ConvertTo-Json\s*\|\s*Set-Content\s+-LiteralPath\s+\$StatePath'
)
Assert-True $runtimeStateWrite.Success 'Launcher must persist the managed watcher state before releasing the transition lock.'
$runtimeStateWriteBody = $runtimeStateWrite.Groups['body'].Value
foreach ($runtimeIdentitySignal in @(
  'injectorPid\s*=\s*\$daemon\.Id',
  'injectorStartedAt\s*=\s*\$injectorStartedAt',
  'instanceToken\s*=\s*\$instanceToken',
  'injectorPath\s*=\s*\$Injector',
  'nodeExecutable\s*=\s*\$node'
)) {
  Assert-Contains $runtimeStateWriteBody $runtimeIdentitySignal "Managed watcher state is missing $runtimeIdentitySignal."
}
Assert-True (-not [regex]::IsMatch($start, '(?m)^\s*&\s+\$node\s+\$Injector\s+--watch\b')) 'Foreground mode must not regress to an unmanaged direct node --watch invocation.'
Assert-Contains $start '\$daemon\s*=\s*Start-Process\s+@startInjector' 'Foreground and background modes must both obtain a managed watcher PID through Start-Process.'
Assert-Contains $start '(?s)\$startInjector\s*=\s*@\{.*?PassThru\s*=\s*\$true.*?\}' 'Managed watcher startup must request a process object containing the watcher PID.'
$foregroundLifecycle = [regex]::Match(
  $start,
  '(?s)if\s*\(\s*\$ForegroundInjector\s*\)\s*\{\s*\$foregroundExitCode\s*=\s*1(?<body>.*?)\r?\n\s*exit\s+\$foregroundExitCode\s*\r?\n\s*\}'
)
Assert-True $foregroundLifecycle.Success 'Could not locate the managed foreground watcher lifecycle.'
$foregroundLifecycleBody = $foregroundLifecycle.Groups['body'].Value
$foregroundWaitAndCleanup = [regex]::Match(
  $foregroundLifecycleBody,
  '(?s)try\s*\{(?<waitBody>.*?)\}\s*finally\s*\{(?<cleanupBody>.*)\}\s*$'
)
Assert-True $foregroundWaitAndCleanup.Success 'Foreground watcher wait must have a dedicated cleanup finalizer.'
$foregroundWaitBody = $foregroundWaitAndCleanup.Groups['waitBody'].Value
$foregroundCleanupBody = $foregroundWaitAndCleanup.Groups['cleanupBody'].Value
Assert-Contains $foregroundWaitBody '\$daemon\.WaitForExit\(\)' 'Foreground mode must wait on the managed watcher process only after startup state is durable.'
$foregroundWaitIndex = $start.IndexOf(
  '$daemon.WaitForExit()',
  [System.StringComparison]::Ordinal
)
Assert-True (
  $daemonStartIndex -lt $stateWriteIndex -and
  $stateWriteIndex -lt $normalTransitionReleaseIndex -and
  $normalTransitionReleaseIndex -lt $foregroundWaitIndex
) 'Foreground mode must start the watcher, persist state, release the transition lock, and only then wait for exit.'
Assert-Contains $foregroundCleanupBody '\$foregroundTransition\s*=\s*Enter-MikuRuntimeTransition[\s\S]{0,160}try\s*\{' 'Foreground cleanup must reacquire the runtime transition lock from its finalizer.'
$foregroundStopBlock = [regex]::Match(
  $foregroundCleanupBody,
  '(?s)if\s*\(\s*-not\s+\$foregroundExited\s*\)\s*\{(?<body>.*?)\r?\n\s*\}'
)
Assert-True $foregroundStopBlock.Success 'Foreground cleanup must check watcher liveness before attempting a stop.'
Assert-Contains $foregroundCleanupBody '\$foregroundExited\s*=\s*\$daemon\.HasExited' 'Foreground cleanup must snapshot whether the watcher already exited.'
Assert-Contains $foregroundStopBlock.Groups['body'].Value '\$foregroundStopAccepted\s*=\s*Stop-MikuInjectorProcess[\s\S]{0,360}-ProcessId\s+\$daemon\.Id[\s\S]{0,120}-InjectorPath\s+\$Injector[\s\S]{0,120}-ExecutablePath\s+\$node[\s\S]{0,120}-Port\s+\$Port[\s\S]{0,120}-InstanceToken\s+\$instanceToken[\s\S]{0,120}-StartedAt\s+\$injectorStartedAt' 'Foreground cleanup must save the identity-validated stop result for the complete watcher identity.'
Assert-Contains $foregroundStopBlock.Groups['body'].Value '(?s)if\s*\(\s*\$foregroundStopAccepted\s*\)\s*\{\s*\$foregroundExited\s*=\s*\$daemon\.WaitForExit\(5000\)' 'Foreground cleanup must wait up to 5000ms for an accepted watcher stop to complete.'
Assert-True (-not [regex]::IsMatch($foregroundStopBlock.Groups['body'].Value, '\bStop-Process\b')) 'Foreground cleanup must not stop the watcher PID without identity validation.'
Assert-Contains $foregroundCleanupBody '(?s)if\s*\(\s*\[int\]\$foregroundState\.injectorPid\s+-eq\s+\$daemon\.Id\s+-and\s*\[string\]\$foregroundState\.instanceToken\s+-eq\s+\$instanceToken\s*\)\s*\{\s*if\s*\(\s*\$foregroundExited\s*\)\s*\{\s*Remove-Item\s+-LiteralPath\s+\$StatePath' 'Foreground cleanup may delete state.json only after confirmed exit and matching watcher PID plus instance token.'
Assert-True ([regex]::Matches(
  $foregroundCleanupBody,
  'Remove-Item\s+-LiteralPath\s+\$StatePath'
).Count -eq 1) 'Foreground cleanup must have no unguarded secondary state.json deletion path.'
Assert-Contains $foregroundCleanupBody '(?s)if\s*\(\s*-not\s+\$foregroundExited\s*\)\s*\{\s*throw\s+"[^"\r\n]*(?:retained|retain)[^"\r\n]*"' 'Unconfirmed foreground watcher exit must throw while retaining recovery state.'
Assert-Contains $foregroundCleanupBody '(?s)finally\s*\{\s*Exit-MikuRuntimeTransition\s+-Mutex\s+\$foregroundTransition\s*\}' 'Foreground cleanup must always release its cleanup transition lock.'

$verifyCommand = [regex]::Match(
  $start,
  '(?m)^\s*&\s+\$node\s+\$Injector\s+--verify\b[^\r\n]*--timeout-ms\s+(?<timeout>\d+)\b[^\r\n]*$'
)
Assert-True $verifyCommand.Success 'Launcher verification must pass an explicit finite --timeout-ms value.'
$verifyTimeout = [int]$verifyCommand.Groups['timeout'].Value
Assert-True ($verifyTimeout -ge 250 -and $verifyTimeout -le 5000) 'Launcher verification timeout must remain within the bounded 250-5000ms retry window.'
$verifyFailureBlock = [regex]::Match(
  $start,
  '(?s)if\s*\(\s*-not\s+\$verified\s*\)\s*\{(?<body>.*?)\r?\n\s*\}'
)
Assert-True $verifyFailureBlock.Success 'Could not locate the launcher verification failure branch.'
$verifyFailureBody = $verifyFailureBlock.Groups['body'].Value
Assert-True (-not [regex]::IsMatch($verifyFailureBody, '\bStop-Process\b')) 'Verification failure must not stop the daemon PID without identity validation.'
Assert-Contains $verifyFailureBody 'Stop-MikuInjectorProcess[\s\S]{0,360}-ProcessId\s+\$daemon\.Id[\s\S]{0,120}-InjectorPath\s+\$Injector[\s\S]{0,120}-ExecutablePath\s+\$node[\s\S]{0,120}-Port\s+\$Port[\s\S]{0,120}-InstanceToken\s+\$instanceToken[\s\S]{0,120}-StartedAt\s+\$injectorStartedAt' 'Verification failure must retire only the daemon matching its complete persisted identity.'

. $storeLaunchPath
$argumentQuote = [string][char]34
$argumentSlash = [string][char]92
$plainArgument = '--remote-debugging-port=9347'
Assert-True (
  (ConvertTo-CodexWindowsArgument -Argument $plainArgument) -ceq $plainArgument
) 'Windows argument quoting must leave an ordinary CDP flag unchanged.'
$spaceArgument = '--user-data-dir=C:\Miku Stage\Profile'
$expectedSpaceArgument = $argumentQuote + $spaceArgument + $argumentQuote
Assert-True (
  (ConvertTo-CodexWindowsArgument -Argument $spaceArgument) -ceq $expectedSpaceArgument
) 'Windows argument quoting must wrap a user-data path containing spaces.'
$quotedArgument = 'say "miku"'
$expectedQuotedArgument =
  $argumentQuote +
  'say ' +
  $argumentSlash + $argumentQuote +
  'miku' +
  $argumentSlash + $argumentQuote +
  $argumentQuote
Assert-True (
  (ConvertTo-CodexWindowsArgument -Argument $quotedArgument) -ceq $expectedQuotedArgument
) 'Windows argument quoting must backslash-escape embedded quotes.'
$trailingSlashArgument = 'C:\Miku Stage\'
$expectedTrailingSlashArgument =
  $argumentQuote +
  'C:\Miku Stage' +
  $argumentSlash + $argumentSlash +
  $argumentQuote
Assert-True (
  (ConvertTo-CodexWindowsArgument -Argument $trailingSlashArgument) -ceq $expectedTrailingSlashArgument
) 'Windows argument quoting must double a trailing backslash before the closing quote.'
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
$restoreShortcut = [regex]::Match(
  $installer,
  '(?s)\$restore\s*=\s*\$shell\.CreateShortcut\(.*?\)+\s*(?<body>.*?)\$restore\.Save\(\)'
)
Assert-True $restoreShortcut.Success 'Installer must keep a separately described current-session Restore shortcut.'
$restoreShortcutBody = $restoreShortcut.Groups['body'].Value
Assert-True (-not [regex]::IsMatch($restoreShortcutBody, '-DisableAutoHook')) 'The ordinary Restore shortcut must not permanently disable the automatic hook.'
Assert-Contains $restoreShortcutBody '(?i)Description\s*=\s*''[^'']*(?:current|this) session[^'']*next[^'']*(?:launch|start)[^'']*''' 'Restore shortcut copy must state that removal lasts only for the current session and the skin returns on the next launch.'

$restorePath = Join-Path $ScriptsRoot 'restore-miku-skin.ps1'
$restore = Get-Content -LiteralPath $restorePath -Raw
Assert-Contains $restore '\[switch\]\$DisableAutoHook' 'Restore must require an explicit switch before permanently disabling the automatic hook.'
Assert-Contains $restore 'unregister-miku-hook\.ps1' 'Restore does not expose explicit automatic-hook disablement.'
Assert-Contains $restore 'if\s*\(\$Uninstall\s+-and\s+\$KeepAutoHook\)\s*\{\s*throw' 'Restore must reject -Uninstall combined with -KeepAutoHook.'
Assert-Contains $restore 'if\s*\(\s*(?:\$DisableAutoHook\s+-and\s+\$KeepAutoHook|\$KeepAutoHook\s+-and\s+\$DisableAutoHook)\s*\)\s*\{\s*throw' 'Restore must reject contradictory -DisableAutoHook and -KeepAutoHook switches.'
Assert-Contains $restore 'hook-pause\.json' 'Ordinary Restore must persist a current-session hook pause marker.'
Assert-Contains $restore 'Set-Content\s+-LiteralPath\s+\$HookPausePath' 'Ordinary Restore must write the hook pause marker instead of unregistering the hook.'
Assert-Contains $restore 'Get-AppxPackage(?:\s+-Name)?\s+OpenAI\.Codex' 'Restore must resolve the official Codex Store package before recording paused processes.'
Assert-Contains $restore '\$_\.Path' 'Restore must scope paused process IDs to the official Codex executable path.'
Assert-Contains $restore '(?m)^\s*processIds\s*=\s*@?\(' 'The hook pause marker must persist the current official Codex main process IDs as an array.'
Assert-Contains $restore '\$runtimeTransition\s*=\s*Enter-MikuRuntimeTransition' 'Restore must acquire the shared runtime transition lock before writing pause state or cleaning up the injector.'
Assert-Contains $restore '(?s)\}\s*finally\s*\{\s*Exit-MikuRuntimeTransition\s+-Mutex\s+\$runtimeTransition\s*\}\s*$' 'Restore must always release the runtime transition lock from a finalizer.'
$restoreTransitionOrder = @(
  $restore.IndexOf('Enter-MikuRuntimeTransition', [System.StringComparison]::Ordinal),
  $restore.IndexOf('Set-Content -LiteralPath $HookPausePath', [System.StringComparison]::Ordinal),
  $restore.IndexOf('Stop-MikuInjectorProcess', [System.StringComparison]::Ordinal),
  $restore.LastIndexOf('Exit-MikuRuntimeTransition', [System.StringComparison]::Ordinal)
)
Assert-True (
  $restoreTransitionOrder[0] -ge 0 -and
  $restoreTransitionOrder[0] -lt $restoreTransitionOrder[1] -and
  $restoreTransitionOrder[1] -lt $restoreTransitionOrder[2] -and
  $restoreTransitionOrder[2] -lt $restoreTransitionOrder[3]
) 'Restore must hold the shared runtime transition lock across pause persistence and injector cleanup.'
Assert-True ([regex]::Matches($restore, '\bEnter-MikuRuntimeTransition\b').Count -eq 1) 'Restore must acquire the shared runtime transition lock exactly once.'
Assert-True ([regex]::Matches($restore, '\bExit-MikuRuntimeTransition\b').Count -eq 1) 'Restore must release the shared runtime transition lock exactly once.'
$restoreTokens = $null
$restoreErrors = $null
$restoreAst = [System.Management.Automation.Language.Parser]::ParseInput(
  $restore,
  [ref]$restoreTokens,
  [ref]$restoreErrors
)
Assert-True ($restoreErrors.Count -eq 0) 'Restore script does not parse while checking the hook-disable guard.'
$unregisterCalls = @($restoreAst.FindAll({
  param($node)
  $node -is [System.Management.Automation.Language.CommandAst] -and
    [regex]::IsMatch($node.Extent.Text, '^&\s+\$unregisterHook\b')
}, $true))
Assert-True ($unregisterCalls.Count -eq 1) 'Restore must have exactly one guarded automatic-hook unregister call.'
$unregisterOwner = $unregisterCalls[0].Parent
while ($null -ne $unregisterOwner -and
       $unregisterOwner -isnot [System.Management.Automation.Language.IfStatementAst]) {
  $unregisterOwner = $unregisterOwner.Parent
}
Assert-True ($null -ne $unregisterOwner) 'Automatic-hook unregister must be owned by an explicit guard.'
$unregisterGuard = $unregisterOwner.Extent.Text
Assert-Contains $unregisterGuard '\$DisableAutoHook' 'Automatic-hook unregister must require -DisableAutoHook.'
Assert-Contains $unregisterGuard '\$Uninstall' 'Uninstall must continue to unregister the automatic hook.'
Assert-Contains $unregisterGuard '-or' 'Only -DisableAutoHook or -Uninstall may enter the automatic-hook unregister path.'
$hookPath = Join-Path $ScriptsRoot 'hook-miku-skin.ps1'
$hook = Get-Content -LiteralPath $hookPath -Raw
Assert-Contains $hook 'IgnoreExisting' 'Live hook registration cannot protect the currently running Codex process.'
Assert-Contains $hook 'controlled-restart' 'Hook does not describe the required one-time CDP restart.'
Assert-Contains $hook '-RestartProcessId' 'Hook must restart only the newly detected unskinned Codex process.'
Assert-Contains $hook 'CodexMikuSkinAutoHook' 'Hook is missing its single-instance mutex.'
Assert-Contains $hook '\$_\.Path' 'Hook must identify the official Codex executable path.'
Assert-Contains $start 'RestartProcessId' 'Launcher does not support a PID-scoped automatic restart.'
Assert-Contains $hook 'hook-pause\.json' 'Automatic hook must observe the current-session pause marker.'
Assert-Contains $hook '\.processIds' 'Automatic hook must read the paused Codex process ID array.'
Assert-Contains $hook 'Remove-Item\s+-LiteralPath\s+\$HookPausePath' 'Automatic hook must clear a pause marker after its Codex process exits.'
Assert-Contains $hook '(?s)\.processIds[\s\S]{0,520}(?:-in|-contains)[\s\S]{0,420}Count\s+-gt\s+0' 'Automatic hook must derive pause activity from the recorded Codex process IDs.'
$hookPauseTransition = [regex]::Match(
  $hook,
  '(?s)\$pauseActive\s*=\s*\$false\s*\r?\n\s*\$pauseTransition\s*=\s*Enter-MikuRuntimeTransition\s*\r?\n\s*try\s*\{(?<body>.*?)\}\s*finally\s*\{\s*Exit-MikuRuntimeTransition\s+-Mutex\s+\$pauseTransition\s*\}(?<after>\s*if\s*\(\s*\$pauseActive\s*\)\s*\{(?<activeBody>.*?)\})'
)
Assert-True $hookPauseTransition.Success 'Hook pause reconciliation must use a paired runtime transition try/finally before acting on pauseActive.'
$hookPauseTransitionBody = $hookPauseTransition.Groups['body'].Value
$hookProcessSnapshot = [regex]::Match(
  $hookPauseTransitionBody,
  '(?m)^\s*\$processes\s*=\s*@\(Get-CodexMainProcesses\s+\$CodexExe\)\s*$'
)
$hookCurrentIdsSnapshot = [regex]::Match(
  $hookPauseTransitionBody,
  '(?m)^\s*\$currentIds\s*=\s*@\(\$processes\s*\|\s*ForEach-Object\s*\{\s*\[int\]\$_\.Id\s*\}\)\s*$'
)
$hookPauseRead = [regex]::Match(
  $hookPauseTransitionBody,
  'Get-Content\s+-LiteralPath\s+\$HookPausePath'
)
Assert-True (
  $hookProcessSnapshot.Success -and
  $hookCurrentIdsSnapshot.Success -and
  $hookPauseRead.Success -and
  $hookProcessSnapshot.Index -lt $hookCurrentIdsSnapshot.Index -and
  $hookCurrentIdsSnapshot.Index -lt $hookPauseRead.Index
) 'Hook must capture processes and currentIds inside the transition lock before reading the pause marker.'
Assert-Contains $hookPauseTransitionBody 'Get-Content\s+-LiteralPath\s+\$HookPausePath' 'Hook must read the pause marker while holding the runtime transition lock.'
Assert-Contains $hookPauseTransitionBody 'Remove-Item\s+-LiteralPath\s+\$HookPausePath' 'Hook must remove a stale pause marker while holding the same runtime transition lock.'
Assert-Contains $hookPauseTransitionBody '\$pauseActive\s*=\s*\$true' 'Hook must compute pause activity while holding the runtime transition lock.'
Assert-True (-not [regex]::IsMatch(
  $hookPauseTransitionBody,
  '(?i)\bcontinue\b|Start-Sleep|Start-CodexStoreApp|&\s+\$StartScript'
)) 'Hook must release the runtime transition lock before sleeping, continuing, or launching Codex.'
$hookPauseActiveBody = $hookPauseTransition.Groups['activeBody'].Value
Assert-Contains $hookPauseActiveBody 'Start-Sleep\s+-Milliseconds\s+\$PollMilliseconds' 'An active pause must wait only after releasing the runtime transition lock.'
Assert-Contains $hookPauseActiveBody '(?m)^\s*continue\s*$' 'An active pause must continue the hook loop only after releasing the runtime transition lock.'
Assert-True ([regex]::Matches($hook, '\bEnter-MikuRuntimeTransition\b').Count -eq 1) 'Hook pause reconciliation must acquire the runtime transition lock exactly once.'
Assert-True ([regex]::Matches($hook, '\bExit-MikuRuntimeTransition\b').Count -eq 1) 'Hook pause reconciliation must release the runtime transition lock exactly once.'
$hookStartCalls = @([regex]::Matches($hook, '(?m)^\s*&\s+\$StartScript\b[^\r\n]*$'))
Assert-True ($hookStartCalls.Count -eq 2) 'Automatic hook must retain exactly its injector-start and controlled-restart launcher calls.'
foreach ($hookStartCall in $hookStartCalls) {
  Assert-Contains $hookStartCall.Value '-HookInvocation\b' 'Every launcher call originating from the hook must carry the internal -HookInvocation flag.'
}

$unregisterHookPath = Join-Path $ScriptsRoot 'unregister-miku-hook.ps1'
$unregisterHook = Get-Content -LiteralPath $unregisterHookPath -Raw
$processIdentityPath = Join-Path $ScriptsRoot 'process-identity.ps1'
Assert-True (Test-Path -LiteralPath $processIdentityPath) 'Shared persisted-PID identity helper is missing.'
$processIdentity = Get-Content -LiteralPath $processIdentityPath -Raw
$enterRuntimeTransition = Get-PowerShellFunctionText $processIdentity 'Enter-MikuRuntimeTransition'
Assert-Contains $enterRuntimeTransition 'Local\\CodexMikuSkinRuntimeTransition' 'Runtime transitions must share the exact named local mutex.'
Assert-Contains $enterRuntimeTransition '\.WaitOne\(\$TimeoutMilliseconds\)' 'Runtime transition acquisition must wait with a bounded timeout.'
Assert-Contains $enterRuntimeTransition 'AbandonedMutexException' 'Runtime transition acquisition must recover a mutex abandoned by a crashed process.'
$exitRuntimeTransition = Get-PowerShellFunctionText $processIdentity 'Exit-MikuRuntimeTransition'
Assert-Contains $exitRuntimeTransition '\.ReleaseMutex\(\)' 'Runtime transition release must relinquish the named mutex.'
Assert-Contains $exitRuntimeTransition '\.Dispose\(\)' 'Runtime transition release must dispose the mutex handle.'
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
  $storeLaunchPath,
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
  runtimeTransitionGuard = 'passed'
  verificationCleanupGuard = 'passed'
  cdpTimeoutGuard = 'passed'
  targetDiscoveryAbortGuard = 'passed'
  foregroundWatcherLifecycle = 'passed'
  windowsArgumentQuoting = 'passed'
}
$result | ConvertTo-Json
