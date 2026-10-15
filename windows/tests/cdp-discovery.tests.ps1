function Invoke-DreamSkinCdpDiscoveryContractTest {
  param([Parameter(Mandatory = $true)][string]$NodePath)

  $projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
  $fixturePath = Join-Path $projectRoot 'runtime\fixtures\cdp-discovery-cases.json'
  $serverPath = Join-Path $projectRoot 'tools\cdp-discovery-fixture-server.mjs'
  $fixture = (Get-Content -LiteralPath $fixturePath -Raw -Encoding UTF8) | ConvertFrom-Json
  if ($fixture.schema -cne 'codex-dream-skin-cdp-discovery/1' -or
    $fixture.maxBytes -ne 262144 -or $fixture.maxTargets -ne 128 -or
    $fixture.maxTargetIdLength -ne 200 -or $fixture.maxUrlLength -ne 2048) {
    throw 'CDP discovery fixture contract metadata is invalid.'
  }

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $NodePath
  $startInfo.Arguments = '"' + $serverPath + '" --fixture "' + $fixturePath + '"'
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $serverProcess = [System.Diagnostics.Process]::new()
  $serverProcess.StartInfo = $startInfo
  [void]$serverProcess.Start()
  try {
    $readyTask = $serverProcess.StandardOutput.ReadLineAsync()
    if (-not $readyTask.Wait(10000)) { throw 'CDP fixture server did not become ready.' }
    $ready = $readyTask.Result
    if (-not $ready) { throw 'CDP fixture server exited before publishing its ports.' }
    $ports = ($ready | ConvertFrom-Json).ports
    $expectedCodes = @{
      'root-type' = 'CDP_DISCOVERY_ROOT_TYPE'
      'missing-field' = 'CDP_DISCOVERY_FIELD'
      'invalid-field' = 'CDP_DISCOVERY_FIELD'
      'too-many-targets' = 'CDP_DISCOVERY_TOO_MANY_TARGETS'
      'too-large' = 'CDP_DISCOVERY_RESPONSE_TOO_LARGE'
      'redirect' = 'CDP_DISCOVERY_REDIRECT'
      'http-status' = 'CDP_DISCOVERY_HTTP_STATUS'
      'invalid-utf8' = 'CDP_DISCOVERY_INVALID_UTF8'
      'malformed-json' = 'CDP_DISCOVERY_MALFORMED_JSON'
      'timeout' = 'CDP_DISCOVERY_TIMEOUT'
    }
    foreach ($testCase in $fixture.cases) {
      $portProperty = $ports.PSObject.Properties[$testCase.name]
      if ($null -eq $portProperty) { throw "CDP fixture server did not publish port: $($testCase.name)" }
      $value = $null
      $errorMessage = $null
      $elapsed = [System.Diagnostics.Stopwatch]::StartNew()
      try {
        $value = Invoke-DreamSkinCdpJsonRequest -Port ([int]$portProperty.Value) -Resource $testCase.resource
      } catch {
        $errorMessage = $_.Exception.Message
      } finally {
        $elapsed.Stop()
      }
      if ($testCase.expect -eq 'ok') {
        if ($null -ne $errorMessage) { throw "CDP discovery fixture failed: $($testCase.name): $errorMessage" }
        if ($testCase.resource -eq '/json/list' -and $value -isnot [array]) {
          throw "CDP discovery fixture lost its root array: $($testCase.name)"
        }
        $expectedCount = $testCase.PSObject.Properties['count']
        if ($null -ne $expectedCount -and $value.Count -ne [int]$expectedCount.Value) {
          throw "CDP discovery fixture returned the wrong target count: $($testCase.name)"
        }
      } else {
        $expectedCode = $expectedCodes[$testCase.expect]
        if (-not $errorMessage -or -not $errorMessage.StartsWith($expectedCode + ':', [System.StringComparison]::Ordinal)) {
          throw "CDP discovery fixture accepted or misclassified $($testCase.name): $errorMessage"
        }
        if ($testCase.expect -eq 'timeout' -and $elapsed.ElapsedMilliseconds -ge $fixture.timeoutMs + 3000) {
          throw "CDP discovery fixture exceeded deadline tolerance: $($testCase.name)"
        }
      }
    }
  } finally {
    if (-not $serverProcess.HasExited) {
      $serverProcess.Kill()
      [void]$serverProcess.WaitForExit(10000)
    }
    $serverProcess.Dispose()
  }
  Write-Host 'PASS: Windows PowerShell CDP discovery contract uses bounded native byte streaming.'
}
