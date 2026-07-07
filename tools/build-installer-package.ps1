$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$packageRoot = Join-Path $root "dist\installer"
$payload = Join-Path $packageRoot "SetupPayload"
$setupExe = Join-Path $packageRoot "StarfieldChromaCompanionSetup.exe"
$singleFileSetupExe = Join-Path $root "StarfieldChromaCompanionSetup-v0.1.4-alpha.exe"
$iconFile = Join-Path $root "assets\starfield-chroma.ico"

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

& (Join-Path $PSScriptRoot "build-launcher-exe.ps1")

Remove-Item -LiteralPath $packageRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $payload | Out-Null

foreach ($name in @("companion", "launcher", "docs", "assets", "tools")) {
  Copy-Item -LiteralPath (Join-Path $root $name) -Destination (Join-Path $payload $name) -Recurse -Force
}

Get-ChildItem -LiteralPath $payload -Recurse -File -Include *.log,*.err.log | Remove-Item -Force -ErrorAction SilentlyContinue

foreach ($file in @(
  "StarfieldChromaCompanion.exe",
  "mo2-start.mjs",
  "start-tray.cmd",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "starfield-chroma.config.json"
)) {
  Copy-Item -LiteralPath (Join-Path $root $file) -Destination (Join-Path $payload $file) -Force
}

$pluginDest = Join-Path $payload "SFSE\Plugins"
New-Item -ItemType Directory -Force -Path $pluginDest | Out-Null
foreach ($dll in @("StarfieldChromaCodex.dll", "StarfieldChromaProbe.dll")) {
  $source = Join-Path $root "release-vortex-clean\SFSE\Plugins\$dll"
  if (-not (Test-Path $source)) { $source = Join-Path $root "release\$dll" }
  if (Test-Path $source) {
    Copy-Item -LiteralPath $source -Destination (Join-Path $pluginDest $dll) -Force
  } else {
    throw "Required plugin DLL not found: $dll"
  }
}

Invoke-ps2exe `
  -inputFile (Join-Path $root "tools\starfield-chroma-installer.ps1") `
  -outputFile $setupExe `
  -iconFile $iconFile `
  -title "Starfield Chroma Companion Setup" `
  -description "Installer for Starfield Chroma Companion" `
  -company "Starfield Chroma Companion" `
  -product "Starfield Chroma Companion" `
  -version "0.1.4.0" `
  -noConsole `
  -STA `
  -requireAdmin:$false

$payloadZip = Join-Path $packageRoot "SetupPayload.zip"
Remove-Item -LiteralPath $payloadZip -Force -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $payload "*") -DestinationPath $payloadZip -Force
$payloadBase64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($payloadZip))
$embeddedInstallerScript = Join-Path $packageRoot "starfield-chroma-installer-embedded.ps1"
$installerSource = Get-Content -LiteralPath (Join-Path $root "tools\starfield-chroma-installer.ps1") -Raw
$installerSource = $installerSource.Replace("__STARFIELD_CHROMA_EMBEDDED_PAYLOAD_BASE64__", $payloadBase64)
Set-Content -LiteralPath $embeddedInstallerScript -Value $installerSource -Encoding UTF8

Remove-Item -LiteralPath $singleFileSetupExe -Force -ErrorAction SilentlyContinue
Invoke-ps2exe `
  -inputFile $embeddedInstallerScript `
  -outputFile $singleFileSetupExe `
  -iconFile $iconFile `
  -title "Starfield Chroma Companion Setup" `
  -description "Self-contained installer for Starfield Chroma Companion" `
  -company "Starfield Chroma Companion" `
  -product "Starfield Chroma Companion" `
  -version "0.1.4.0" `
  -noConsole `
  -STA `
  -requireAdmin:$false

$zip = Join-Path $root "StarfieldChromaCompanion-v0.1.4-alpha-installer.zip"
Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $packageRoot "*") -DestinationPath $zip -Force

Write-Host "Built installer package:"
Write-Host "  $setupExe"
Write-Host "  $singleFileSetupExe"
Write-Host "  $zip"
