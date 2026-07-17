[CmdletBinding(DefaultParameterSetName = 'Install')]
param(
  [Parameter(Mandatory = $true, Position = 0, ParameterSetName = 'Install')]
  [string]$PackagePath,
  [Parameter(Mandatory = $true, ParameterSetName = 'Remove')]
  [string]$Remove,
  [string]$PetsRoot,
  [Parameter(ParameterSetName = 'Install')]
  [switch]$Replace
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'pet-package-windows.ps1')

if ($PSCmdlet.ParameterSetName -eq 'Remove') {
  $result = Remove-DreamSkinPetPackage -PetId $Remove -PetsRoot $PetsRoot
  Write-Host "Removed Codex pet '$($result.Id)' from $($result.Path)"
  Write-Host 'Open Codex Settings > Pets and select another pet if the removed pet was active.'
  exit 0
}

$result = Install-DreamSkinPetPackage -PackagePath $PackagePath -PetsRoot $PetsRoot -Replace:$Replace
$verb = if ($result.Replaced) { 'Installed or updated' } else { 'Installed' }
Write-Host "$verb Codex pet '$($result.DisplayName)' at $($result.Path)"
Write-Host 'Open Codex Settings > Pets, choose Refresh, then select the pet.'
