$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$inputFile = Join-Path $root "tools\starfield-chroma-tray.ps1"
$outputFile = Join-Path $root "StarfieldChromaCompanion.exe"
$iconFile = Join-Path $root "assets\starfield-chroma.ico"

Get-Process -Name "StarfieldChromaCompanion" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 300

function Import-Ps2Exe {
  $module = Get-Module -ListAvailable ps2exe | Sort-Object Version -Descending | Select-Object -First 1
  if ($module) {
    Import-Module $module.Path -ErrorAction Stop
    return
  }

  $knownPath = Join-Path $HOME "Documents\PowerShell\Modules\ps2exe\1.0.18\ps2exe.psd1"
  if (Test-Path -LiteralPath $knownPath) {
    Import-Module $knownPath -ErrorAction Stop
    return
  }

  Install-Module -Name ps2exe -Scope CurrentUser -Force -AllowClobber -Confirm:$false
  Import-Module ps2exe -ErrorAction Stop
}

Import-Ps2Exe

Invoke-ps2exe `
  -inputFile $inputFile `
  -outputFile $outputFile `
  -iconFile $iconFile `
  -title "Starfield Chroma Companion" `
  -description "Starfield Chroma Companion launcher" `
  -company "Starfield Chroma Companion" `
  -product "Starfield Chroma Companion" `
  -version "0.1.8.0" `
  -noConsole `
  -STA `
  -requireAdmin:$false

Write-Host "Built $outputFile"
