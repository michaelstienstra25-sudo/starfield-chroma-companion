$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $root "launcher\starfield-chroma-launcher.mjs"
$node = "node.exe"
$url = "http://127.0.0.1:47322/"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Test-LauncherRunning {
  try {
    Invoke-RestMethod -Uri "$url/api/status" -Method Get -TimeoutSec 1 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Start-Launcher {
  if (Test-LauncherRunning) { return }
  Start-Process -FilePath $node -ArgumentList "`"$launcher`" --no-open" -WorkingDirectory $root -WindowStyle Hidden
  Start-Sleep -Milliseconds 900
}

function Invoke-LauncherAction([string]$Action) {
  Start-Launcher
  try {
    Invoke-RestMethod -Uri "$url/api/$Action" -Method Post -ContentType "application/json" -Body "{}" -TimeoutSec 5 | Out-Null
  } catch {
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "Starfield Chroma Companion") | Out-Null
  }
}

function Get-StatusText {
  Start-Launcher
  try {
    $status = Invoke-RestMethod -Uri "$url/api/status" -Method Get -TimeoutSec 2
    $companion = if ($status.companionRunning) { "Companion: running" } else { "Companion: stopped" }
    $game = if ($status.starfieldRunning) { "Starfield: running" } else { "Starfield: stopped" }
    return "$companion | $game"
  } catch {
    return "Control panel unavailable"
  }
}

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = [System.Drawing.SystemIcons]::Application
$notify.Text = "Starfield Chroma Companion"
$notify.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$openItem = $menu.Items.Add("Open Control Panel")
$openItem.add_Click({
  Start-Launcher
  Start-Process $url
})

$startAllItem = $menu.Items.Add("Start Companion + SFSE")
$startAllItem.add_Click({ Invoke-LauncherAction "start-all" })

$startCompanionItem = $menu.Items.Add("Start Companion")
$startCompanionItem.add_Click({ Invoke-LauncherAction "start-companion" })

$stopCompanionItem = $menu.Items.Add("Stop Companion")
$stopCompanionItem.add_Click({ Invoke-LauncherAction "stop-companion" })

$menu.Items.Add("-") | Out-Null

$exitItem = $menu.Items.Add("Exit Tray")
$exitItem.add_Click({
  $notify.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})

$notify.ContextMenuStrip = $menu
$notify.add_DoubleClick({
  Start-Launcher
  Start-Process $url
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.add_Tick({
  $text = Get-StatusText
  if ($text.Length -gt 63) { $text = $text.Substring(0, 63) }
  $notify.Text = $text
})
$timer.Start()

Start-Launcher
[System.Windows.Forms.Application]::Run()
