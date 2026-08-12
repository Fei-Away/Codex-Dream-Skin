[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Root)

$ErrorActionPreference = 'Stop'
. (Join-Path $Root 'scripts\common-windows.ps1')

$stateRoot = Join-Path ([System.IO.Path]::GetTempPath()) `
  ('dreamskin-start-result-' + [guid]::NewGuid().ToString('N'))
$utf8NoBom = [System.Text.UTF8Encoding]::new($false, $true)
New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null

function Assert-StartResultRejected {
  param([Parameter(Mandatory = $true)][scriptblock]$Action, [Parameter(Mandatory = $true)][string]$Label)
  $rejected = $false
  try { $null = & $Action } catch { $rejected = $true }
  if (-not $rejected) { throw "Start result contract accepted $Label." }
}

function Write-StartResultFixture {
  param([Parameter(Mandatory = $true)][string]$Token, [Parameter(Mandatory = $true)][string]$Content)
  $path = Get-DreamSkinStartResultPath -StateRoot $stateRoot -Token $Token
  [System.IO.File]::WriteAllText($path, $Content, $utf8NoBom)
  return $path
}

try {
  $validToken = '0123456789abcdef0123456789abcdef'
  Write-DreamSkinStartResult -StateRoot $stateRoot -Token $validToken `
    -Outcome 'failure' -Category 'cdp-endpoint-unavailable' -AppearanceRecovery 'restored'
  $validPath = Get-DreamSkinStartResultPath -StateRoot $stateRoot -Token $validToken
  $valid = Read-DreamSkinStartResult -StateRoot $stateRoot -Token $validToken
  $validJson = Read-DreamSkinUtf8File -Path $validPath
  if ("$($valid.token)" -cne $validToken -or "$($valid.outcome)" -cne 'failure' -or
    "$($valid.category)" -cne 'cdp-endpoint-unavailable' -or
    "$($valid.appearanceRecovery)" -cne 'restored' -or
    $validJson.Contains($stateRoot) -or $validJson -match '(?i)message|path|pid|command|log') {
    throw 'A valid start result leaked runtime detail or did not round-trip exactly.'
  }
  Assert-StartResultRejected -Label 'an overwrite of a stale result token' -Action {
    Write-DreamSkinStartResult -StateRoot $stateRoot -Token $validToken `
      -Outcome 'success' -Category 'none' -AppearanceRecovery 'retained'
  }
  Remove-Item -LiteralPath $validPath -Force

  foreach ($invalidToken in @(
    '../outside-result.json',
    '0123456789ABCDEF0123456789ABCDEF',
    '0123456789abcdef'
  )) {
    Assert-StartResultRejected -Label "invalid token $invalidToken" -Action {
      $null = Get-DreamSkinStartResultPath -StateRoot $stateRoot -Token $invalidToken
    }
  }

  $wrongToken = '11111111111111111111111111111111'
  $otherToken = '22222222222222222222222222222222'
  $wrongTokenJson = [ordered]@{
    schemaVersion = 1; token = $otherToken; outcome = 'failure'
    category = 'cdp-launch-failed'; appearanceRecovery = 'blocked'
  } | ConvertTo-Json -Compress
  $wrongTokenPath = Write-StartResultFixture -Token $wrongToken -Content $wrongTokenJson
  Assert-StartResultRejected -Label 'a stale result with the wrong token' -Action {
    Read-DreamSkinStartResult -StateRoot $stateRoot -Token $wrongToken
  }
  Remove-Item -LiteralPath $wrongTokenPath -Force

  $unknownToken = '33333333333333333333333333333333'
  $unknownJson = [ordered]@{
    schemaVersion = 1; token = $unknownToken; outcome = 'failure'
    category = 'raw-exception'; appearanceRecovery = 'blocked'
  } | ConvertTo-Json -Compress
  $unknownPath = Write-StartResultFixture -Token $unknownToken -Content $unknownJson
  Assert-StartResultRejected -Label 'an unknown failure category' -Action {
    Read-DreamSkinStartResult -StateRoot $stateRoot -Token $unknownToken
  }
  Remove-Item -LiteralPath $unknownPath -Force

  $fieldToken = '44444444444444444444444444444444'
  $fieldJson = [ordered]@{
    schemaVersion = 1; token = $fieldToken; outcome = 'failure'
    category = 'cdp-launch-failed'; appearanceRecovery = 'blocked'; message = 'private path'
  } | ConvertTo-Json -Compress
  $fieldPath = Write-StartResultFixture -Token $fieldToken -Content $fieldJson
  Assert-StartResultRejected -Label 'an unknown result field' -Action {
    Read-DreamSkinStartResult -StateRoot $stateRoot -Token $fieldToken
  }
  Remove-Item -LiteralPath $fieldPath -Force

  $oversizedToken = '55555555555555555555555555555555'
  $oversizedPath = Write-StartResultFixture -Token $oversizedToken -Content ('x' * 4097)
  Assert-StartResultRejected -Label 'an oversized result' -Action {
    Read-DreamSkinStartResult -StateRoot $stateRoot -Token $oversizedToken
  }
  Remove-Item -LiteralPath $oversizedPath -Force

  # Exercise the real launch helper and result-category resolver together. A
  # package protocol redirect must not collapse either direct-fallback failure
  # into the generic category used before the helper knew the precise cause.
  $launcherFunctionNames = @(
    'Start-DreamSkinCodex',
    'Wait-DreamSkinCodexDebugArgumentStatus',
    'Start-DreamSkinCodexDirect',
    'Stop-DreamSkinCodex',
    'Get-DreamSkinCodexProcesses'
  )
  $originalLauncherFunctions = @{}
  foreach ($functionName in $launcherFunctionNames) {
    $originalLauncherFunctions[$functionName] =
      (Get-Command $functionName -CommandType Function).ScriptBlock
  }
  $fakeCodex = [pscustomobject]@{ Version = '26.803.5235.0' }
  try {
    Set-Item 'function:Start-DreamSkinCodex' -Value { return 101 }
    Set-Item 'function:Stop-DreamSkinCodex' -Value {
      param($Codex, [int[]]$PreserveProcessIds, [switch]$AllowForce)
    }
    Set-Item 'function:Get-DreamSkinCodexProcesses' -Value { return @() }
    Set-Item 'function:Start-DreamSkinCodexDirect' -Value { return 202 }
    $script:startResultStatusCall = 0
    Set-Item 'function:Wait-DreamSkinCodexDebugArgumentStatus' -Value {
      $script:startResultStatusCall += 1
      if ($script:startResultStatusCall -eq 1) { return 'protocol-redirected' }
      return 'not-forwarded'
    }
    $notForwardedCategory = $null
    try {
      $null = Start-DreamSkinCodexForDebugging -Codex $fakeCodex `
        -Arguments @('--remote-debugging-port=9335') -Port 9335 -PreserveProcessIds @()
    } catch {
      $notForwardedCategory = Get-DreamSkinStartFailureCategory -Exception $_.Exception
    }
    if ($notForwardedCategory -cne 'cdp-endpoint-unavailable') {
      throw 'A direct launch that dropped the CDP argument lost its bounded result category.'
    }

    Set-Item 'function:Wait-DreamSkinCodexDebugArgumentStatus' -Value {
      return 'protocol-redirected'
    }
    Set-Item 'function:Start-DreamSkinCodexDirect' -Value {
      throw [System.UnauthorizedAccessException]::new('denied')
    }
    $accessDeniedCategory = $null
    try {
      $null = Start-DreamSkinCodexForDebugging -Codex $fakeCodex `
        -Arguments @('--remote-debugging-port=9335') -Port 9335 -PreserveProcessIds @()
    } catch {
      $accessDeniedCategory = Get-DreamSkinStartFailureCategory -Exception $_.Exception
    }
    if ($accessDeniedCategory -cne 'cdp-direct-access-denied') {
      throw 'A blocked direct Store launch lost its bounded result category.'
    }
  } finally {
    foreach ($functionName in $launcherFunctionNames) {
      Set-Item ("function:$functionName") -Value $originalLauncherFunctions[$functionName]
    }
    Remove-Variable -Name startResultStatusCall -Scope Script -ErrorAction SilentlyContinue
  }

  $startSource = [System.IO.File]::ReadAllText((Join-Path $Root 'scripts\start-dream-skin.ps1'))
  $communitySource = [System.IO.File]::ReadAllText((Join-Path $Root 'scripts\apply-community-theme.ps1'))
  $commonSource = [System.IO.File]::ReadAllText((Join-Path $Root 'scripts\common-windows.ps1'))
  $readerStart = $commonSource.IndexOf('function Read-DreamSkinStartResult')
  $readerEnd = $commonSource.IndexOf('function Enter-DreamSkinOperationLock', $readerStart)
  if ($readerStart -lt 0 -or $readerEnd -le $readerStart) {
    throw 'Start result test could not isolate the bounded reader implementation.'
  }
  $readerSource = $commonSource.Substring($readerStart, $readerEnd - $readerStart)
  if ($startSource -notmatch '\[string\]\$ResultToken' -or
    $startSource -match '\[string\]\$ResultPath' -or
    -not $communitySource.Contains("' -ResultToken ' + `$resultToken") -or
    -not $communitySource.Contains('Read-DreamSkinStartResult') -or
    -not $communitySource.Contains('Remove-Item -LiteralPath $resultPath') -or
    -not $readerSource.Contains('[System.IO.FileStream]::new') -or
    -not $readerSource.Contains('[System.IO.FileShare]::Read') -or
    $readerSource.Contains('ReadAllBytes') -or $readerSource.Contains('Get-Item')) {
    throw 'Child start no longer uses the fixed-root random-token result contract and cleanup path.'
  }
} finally {
  Remove-Item -LiteralPath $stateRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output 'PASS: bounded child-start results reject unsafe data and preserve direct-fallback categories.'
