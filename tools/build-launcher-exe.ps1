$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$inputFile = Join-Path $root "tools\starfield-chroma-tray.ps1"
$outputFile = Join-Path $root "StarfieldChromaCompanion.exe"
$iconFile = Join-Path $root "assets\starfield-chroma.ico"

Get-Process -Name "StarfieldChromaCompanion" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 300

if (-not (Get-Command Invoke-ps2exe -ErrorAction SilentlyContinue)) {
  Install-Module -Name ps2exe -Scope CurrentUser -Force -AllowClobber
}

Import-Module ps2exe -ErrorAction Stop

Invoke-ps2exe `
  -inputFile $inputFile `
  -outputFile $outputFile `
  -iconFile $iconFile `
  -title "Starfield Chroma Companion" `
  -description "Starfield Chroma Companion launcher" `
  -company "Starfield Chroma Companion" `
  -product "Starfield Chroma Companion" `
  -version "0.1.3.0" `
  -noConsole `
  -STA `
  -requireAdmin:$false

Write-Host "Built $outputFile"
