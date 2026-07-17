function ConvertTo-CodexWindowsArgument {
  param(
    [AllowEmptyString()]
    [string]$Argument
  )

  if ([string]::IsNullOrEmpty($Argument)) { return '""' }
  if ($Argument -notmatch '[\s"]') { return $Argument }

  $builder = [System.Text.StringBuilder]::new()
  [void]$builder.Append('"')
  $backslash = [char]92
  $backslashCount = 0
  foreach ($character in $Argument.ToCharArray()) {
    if ($character -eq $backslash) {
      $backslashCount++
      continue
    }
    if ($character -eq [char]34) {
      if ($backslashCount -gt 0) {
        [void]$builder.Append([string]::new($backslash, $backslashCount * 2))
      }
      [void]$builder.Append($backslash)
      [void]$builder.Append($character)
      $backslashCount = 0
      continue
    }
    if ($backslashCount -gt 0) {
      [void]$builder.Append([string]::new($backslash, $backslashCount))
      $backslashCount = 0
    }
    [void]$builder.Append($character)
  }
  if ($backslashCount -gt 0) {
    [void]$builder.Append([string]::new($backslash, $backslashCount * 2))
  }
  [void]$builder.Append('"')
  return $builder.ToString()
}

function Initialize-CodexStoreActivationBridge {
  if ('CodexMikuSkin.PackagedAppLauncher' -as [type]) { return }

  Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace CodexMikuSkin
{
    [ComImport]
    [Guid("2E941141-7F97-4756-BA1D-9DECDE894A3D")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IApplicationActivationManager
    {
        [PreserveSig]
        int ActivateApplication(
            [MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
            [MarshalAs(UnmanagedType.LPWStr)] string arguments,
            uint options,
            out uint processId);
    }

    [ComImport]
    [Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
    internal class ApplicationActivationManager
    {
    }

    public static class PackagedAppLauncher
    {
        public static uint ActivateApplication(string appUserModelId, string arguments)
        {
            var manager = (IApplicationActivationManager)new ApplicationActivationManager();
            uint processId;
            var result = manager.ActivateApplication(appUserModelId, arguments, 0, out processId);
            Marshal.ThrowExceptionForHR(result);
            return processId;
        }
    }
}
'@
}

function Start-CodexStoreApp {
  [CmdletBinding()]
  param(
    [object]$Package,
    [Parameter(Mandatory)]
    [string]$ExecutablePath,
    [string[]]$Arguments = @()
  )

  if (-not $Package) {
    $Package = Get-AppxPackage OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
  }
  if (-not $Package) { throw 'The OpenAI.Codex Store package is not installed.' }

  $installRoot = [System.IO.Path]::GetFullPath([string]$Package.InstallLocation).TrimEnd('\') + '\'
  $resolvedExecutable = [System.IO.Path]::GetFullPath($ExecutablePath)
  if (-not $resolvedExecutable.StartsWith(
      $installRoot,
      [System.StringComparison]::OrdinalIgnoreCase
    )) {
    throw "Codex executable is outside the installed Store package: $resolvedExecutable"
  }

  $relativeExecutable = $resolvedExecutable.Substring($installRoot.Length).Replace('\', '/')
  $manifest = Get-AppxPackageManifest -Package $Package
  $applications = @($manifest.Package.Applications.Application)
  $application = @($applications | Where-Object {
    ([string]$_.Executable).Replace('\', '/') -ieq $relativeExecutable
  })
  if ($application.Count -ne 1 -or [string]::IsNullOrWhiteSpace([string]$application[0].Id)) {
    throw "Expected one Store application for $relativeExecutable, found $($application.Count)."
  }

  $appUserModelId = [string]$Package.PackageFamilyName + '!' + [string]$application[0].Id
  $argumentString = (@($Arguments) | ForEach-Object {
    ConvertTo-CodexWindowsArgument -Argument ([string]$_)
  }) -join ' '

  Initialize-CodexStoreActivationBridge
  $processId = [CodexMikuSkin.PackagedAppLauncher]::ActivateApplication(
    $appUserModelId,
    $argumentString
  )
  if ($processId -le 0) {
    throw "Store activation returned an invalid Codex process ID for $appUserModelId."
  }

  $deadline = (Get-Date).AddSeconds(5)
  do {
    $process = Get-Process -Id ([int]$processId) -ErrorAction SilentlyContinue
    if ($process) { return $process }
    Start-Sleep -Milliseconds 100
  } while ((Get-Date) -lt $deadline)

  return [pscustomobject]@{ Id = [int]$processId }
}
