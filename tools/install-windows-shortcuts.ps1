param(
  [string]$TargetFolder = "$env:USERPROFILE\Desktop\Games"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $root "launch-starfield-chroma.cmd"
$trayLauncher = Join-Path $root "start-tray.cmd"

if (-not (Test-Path -LiteralPath $launcher)) {
  throw "Launcher not found: $launcher"
}

New-Item -ItemType Directory -Force -Path $TargetFolder | Out-Null

$shell = New-Object -ComObject WScript.Shell
$shortcutPath = Join-Path $TargetFolder "Starfield Chroma Control Panel.lnk"
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $launcher
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,167"
$shortcut.Description = "Start the Starfield Chroma Companion control panel"
$shortcut.Save()

Write-Host "Created shortcut: $shortcutPath"

if (Test-Path -LiteralPath $trayLauncher) {
  $trayShortcutPath = Join-Path $TargetFolder "Starfield Chroma Tray.lnk"
  $trayShortcut = $shell.CreateShortcut($trayShortcutPath)
  $trayShortcut.TargetPath = $trayLauncher
  $trayShortcut.WorkingDirectory = $root
  $trayShortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,167"
  $trayShortcut.Description = "Start the Starfield Chroma Companion tray helper"
  $trayShortcut.Save()
  Write-Host "Created shortcut: $trayShortcutPath"
}
