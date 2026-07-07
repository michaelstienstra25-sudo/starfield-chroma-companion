$ErrorActionPreference = "Stop"

$scriptBase = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($scriptBase)) {
  $scriptBase = [System.AppContext]::BaseDirectory
}
if ([string]::IsNullOrWhiteSpace($scriptBase)) {
  $exeArg = [Environment]::GetCommandLineArgs()[0]
  if (-not [string]::IsNullOrWhiteSpace($exeArg)) {
    $scriptBase = [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($exeArg))
  }
}
if ([string]::IsNullOrWhiteSpace($scriptBase)) {
  $scriptBase = (Get-Location).Path
}
if (Test-Path (Join-Path $scriptBase "launcher\starfield-chroma-launcher.mjs")) {
  $root = $scriptBase
} else {
  $root = Split-Path -Parent $scriptBase
}
$launcher = Join-Path $root "launcher\starfield-chroma-launcher.mjs"
$headerImagePath = Join-Path $root "docs\images\starfield-chroma-header.png"
$appIconPath = Join-Path $root "assets\starfield-chroma.ico"
$node = "node.exe"
$url = "http://127.0.0.1:47322"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class StarfieldChromaWindow {
  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

function Show-ExistingAppWindow {
  try {
    $currentId = $PID
    $existing = Get-Process -Name "StarfieldChromaCompanion" -ErrorAction SilentlyContinue |
      Where-Object { $_.Id -ne $currentId -and $_.MainWindowHandle -ne 0 } |
      Select-Object -First 1
    if ($existing) {
      [StarfieldChromaWindow]::ShowWindowAsync($existing.MainWindowHandle, 9) | Out-Null
      [StarfieldChromaWindow]::SetForegroundWindow($existing.MainWindowHandle) | Out-Null
    }
  } catch {
    # The second instance should still exit even if Windows refuses focus stealing.
  }
}

$createdNew = $false
$appMutex = New-Object System.Threading.Mutex($true, "Global\StarfieldChromaCompanion.App", [ref]$createdNew)
if (-not $createdNew) {
  Show-ExistingAppWindow
  return
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

function Start-Launcher {
  if (Test-LauncherRunning) { return }
  Start-Process -FilePath $node -ArgumentList "`"$launcher`" --no-open" -WorkingDirectory $root -WindowStyle Hidden
  Start-Sleep -Milliseconds 900
}

function Test-LauncherRunning {
  try {
    Invoke-RestMethod -Uri "$url/api/status" -Method Get -TimeoutSec 1 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Invoke-Api([string]$Path, [string]$Method = "Get", $Body = $null) {
  Start-Launcher
  $params = @{
    Uri = "$url$Path"
    Method = $Method
    TimeoutSec = 6
  }
  if ($null -ne $Body) {
    $params.ContentType = "application/json"
    $params.Body = ($Body | ConvertTo-Json -Depth 8)
  }
  return Invoke-RestMethod @params
}

function Get-Status {
  try {
    return Invoke-Api "/api/status"
  } catch {
    return $null
  }
}

function Show-Error([string]$Message) {
  [System.Windows.Forms.MessageBox]::Show($Message, "Starfield Chroma Companion", "OK", "Error") | Out-Null
}

function New-Label([string]$Text, [int]$X, [int]$Y, [int]$W, [int]$H, [int]$Size = 10, [System.Drawing.Color]$Color = [System.Drawing.Color]::Gainsboro) {
  $label = New-Object System.Windows.Forms.Label
  $label.Text = $Text
  $label.Location = New-Object System.Drawing.Point($X, $Y)
  $label.Size = New-Object System.Drawing.Size($W, $H)
  $label.Font = New-Object System.Drawing.Font("Segoe UI", $Size, [System.Drawing.FontStyle]::Regular)
  $label.ForeColor = $Color
  $label.BackColor = [System.Drawing.Color]::Transparent
  return $label
}

function New-HelpLabel([string]$Text, [int]$X, [int]$Y, [int]$W, [int]$H = 34) {
  return New-Label $Text $X $Y $W $H 8 ([System.Drawing.Color]::FromArgb(157, 167, 188))
}

function New-Button([string]$Text, [int]$X, [int]$Y, [int]$W, [int]$H) {
  $button = New-Object System.Windows.Forms.Button
  $button.Text = $Text
  $button.Location = New-Object System.Drawing.Point($X, $Y)
  $button.Size = New-Object System.Drawing.Size($W, $H)
  $button.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
  $button.FlatStyle = "Flat"
  $button.FlatAppearance.BorderSize = 0
  $button.BackColor = [System.Drawing.Color]::FromArgb(24, 215, 232)
  $button.ForeColor = [System.Drawing.Color]::FromArgb(0, 16, 20)
  return $button
}

function New-AccentPanel([int]$X, [int]$Y, [int]$W, [int]$H) {
  $panel = New-Object System.Windows.Forms.Panel
  $panel.Location = New-Object System.Drawing.Point($X, $Y)
  $panel.Size = New-Object System.Drawing.Size($W, $H)
  $panel.BackColor = [System.Drawing.Color]::FromArgb(21, 24, 36)
  $panel.add_Paint({
    param($sender, $eventArgs)
    $g = $eventArgs.Graphics
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $cyan = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(70, 24, 215, 232), 2)
    $gold = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(95, 242, 180, 61), 2)
    $dark = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 44, 50, 68), 1)
    $g.DrawRectangle($dark, 0, 0, $sender.Width - 1, $sender.Height - 1)
    $g.DrawLine($cyan, 12, 10, $sender.Width - 14, 10)
    $g.DrawLine($gold, 12, $sender.Height - 11, [Math]::Min($sender.Width - 14, 180), $sender.Height - 11)
    $cyan.Dispose()
    $gold.Dispose()
    $dark.Dispose()
  })
  return $panel
}

function Show-SettingsWindow {
  $status = Get-Status
  if ($null -eq $status) {
    Show-Error "The local launcher is not responding yet."
    return
  }

  $config = $status.config
  $settings = New-Object System.Windows.Forms.Form
  $settings.Text = "Starfield Chroma Companion - Settings"
  $settings.Size = New-Object System.Drawing.Size(640, 690)
  $settings.StartPosition = "CenterParent"
  $settings.FormBorderStyle = "FixedDialog"
  $settings.MaximizeBox = $false
  $settings.MinimizeBox = $false
  $settings.BackColor = [System.Drawing.Color]::FromArgb(13, 16, 25)
  $settings.ForeColor = [System.Drawing.Color]::Gainsboro
  if (Test-Path $appIconPath) {
    $settings.Icon = New-Object System.Drawing.Icon($appIconPath)
  }

  $title = New-Label "Settings" 24 20 480 34 18 ([System.Drawing.Color]::White)
  $settings.Controls.Add($title)

  $settings.Controls.Add((New-Label "Starfield folder" 24 72 520 20))
  $settings.Controls.Add((New-HelpLabel "The Starfield install folder that contains sfse_loader.exe. Used by the one-click START STARFIELD button." 24 92 560 34))
  $starfieldDir = New-Object System.Windows.Forms.TextBox
  $starfieldDir.Location = New-Object System.Drawing.Point(24, 126)
  $starfieldDir.Size = New-Object System.Drawing.Size(560, 28)
  $starfieldDir.Text = if ($config.starfieldDir) { $config.starfieldDir } else { $status.starfieldDir }
  $settings.Controls.Add($starfieldDir)

  $settings.Controls.Add((New-Label "Brightness" 24 176 160 20))
  $settings.Controls.Add((New-HelpLabel "Overall RGB strength. Lower this if effects are too bright in a dark room." 24 200 170 44))
  $brightness = New-Object System.Windows.Forms.NumericUpDown
  $brightness.Location = New-Object System.Drawing.Point(24, 244)
  $brightness.Size = New-Object System.Drawing.Size(140, 28)
  $brightness.DecimalPlaces = 2
  $brightness.Increment = 0.05
  $brightness.Minimum = 0.10
  $brightness.Maximum = 1.00
  $brightness.Value = [decimal]$config.brightness
  $settings.Controls.Add($brightness)

  $settings.Controls.Add((New-Label "Pulse boost" 224 176 160 20))
  $settings.Controls.Add((New-HelpLabel "How strongly hit, heal, level-up, and power pulses jump above the base lighting." 224 200 170 44))
  $pulseBoost = New-Object System.Windows.Forms.NumericUpDown
  $pulseBoost.Location = New-Object System.Drawing.Point(224, 244)
  $pulseBoost.Size = New-Object System.Drawing.Size(140, 28)
  $pulseBoost.DecimalPlaces = 2
  $pulseBoost.Increment = 0.05
  $pulseBoost.Minimum = 1.00
  $pulseBoost.Maximum = 2.00
  $pulseBoost.Value = [decimal]$config.pulseBoost
  $settings.Controls.Add($pulseBoost)

  $settings.Controls.Add((New-Label "Frame ms" 424 176 160 20))
  $settings.Controls.Add((New-HelpLabel "Animation update speed. Lower is smoother, higher is lighter on the system." 424 200 170 44))
  $frameMs = New-Object System.Windows.Forms.NumericUpDown
  $frameMs.Location = New-Object System.Drawing.Point(424, 244)
  $frameMs.Size = New-Object System.Drawing.Size(140, 28)
  $frameMs.Minimum = 40
  $frameMs.Maximum = 250
  $frameMs.Increment = 5
  $frameMs.Value = [decimal]$config.frameMs
  $settings.Controls.Add($frameMs)

  $settings.Controls.Add((New-Label "Chip damage" 24 304 160 20))
  $settings.Controls.Add((New-HelpLabel "Minimum damage that creates a small feedback pulse." 24 328 170 34))
  $damageChip = New-Object System.Windows.Forms.NumericUpDown
  $damageChip.Location = New-Object System.Drawing.Point(24, 366)
  $damageChip.Size = New-Object System.Drawing.Size(140, 28)
  $damageChip.Minimum = 0
  $damageChip.Maximum = 9999
  $damageChip.Value = [decimal]$config.damageThresholds.chip
  $settings.Controls.Add($damageChip)

  $settings.Controls.Add((New-Label "Heavy damage" 224 304 160 20))
  $settings.Controls.Add((New-HelpLabel "Damage value where the stronger full-keyboard hit warning starts." 224 328 170 34))
  $damageHeavy = New-Object System.Windows.Forms.NumericUpDown
  $damageHeavy.Location = New-Object System.Drawing.Point(224, 366)
  $damageHeavy.Size = New-Object System.Drawing.Size(140, 28)
  $damageHeavy.Minimum = 0
  $damageHeavy.Maximum = 9999
  $damageHeavy.Value = [decimal]$config.damageThresholds.heavy
  $settings.Controls.Add($damageHeavy)

  $settings.Controls.Add((New-Label "Critical damage" 424 304 160 20))
  $settings.Controls.Add((New-HelpLabel "Damage value for the most urgent critical warning effect." 424 328 170 34))
  $damageCritical = New-Object System.Windows.Forms.NumericUpDown
  $damageCritical.Location = New-Object System.Drawing.Point(424, 366)
  $damageCritical.Size = New-Object System.Drawing.Size(140, 28)
  $damageCritical.Minimum = 0
  $damageCritical.Maximum = 9999
  $damageCritical.Value = [decimal]$config.damageThresholds.critical
  $settings.Controls.Add($damageCritical)

  $accentDevices = New-Object System.Windows.Forms.CheckBox
  $accentDevices.Text = "Accent devices enabled"
  $accentDevices.Location = New-Object System.Drawing.Point(24, 424)
  $accentDevices.Size = New-Object System.Drawing.Size(240, 26)
  $accentDevices.Checked = [bool]$config.accentDevices
  $accentDevices.ForeColor = [System.Drawing.Color]::Gainsboro
  $accentDevices.BackColor = [System.Drawing.Color]::Transparent
  $settings.Controls.Add($accentDevices)
  $settings.Controls.Add((New-HelpLabel "Also sends simplified mood colors to other Chroma devices such as mouse, mousepad, or headset." 48 450 520 34))

  $logEvents = New-Object System.Windows.Forms.CheckBox
  $logEvents.Text = "Log events for debugging"
  $logEvents.Location = New-Object System.Drawing.Point(24, 496)
  $logEvents.Size = New-Object System.Drawing.Size(240, 26)
  $logEvents.Checked = [bool]$config.logEvents
  $logEvents.ForeColor = [System.Drawing.Color]::Gainsboro
  $logEvents.BackColor = [System.Drawing.Color]::Transparent
  $settings.Controls.Add($logEvents)
  $settings.Controls.Add((New-HelpLabel "Writes extra event details to the log. Useful for testing new effects, but normally leave it off." 48 522 520 34))

  $hint = New-Label "Restart the companion after changing render settings so the running effect engine reloads the config." 24 574 560 34 9 ([System.Drawing.Color]::FromArgb(242, 180, 61))
  $settings.Controls.Add($hint)

  $save = New-Button "Save Settings" 344 612 140 36
  $cancel = New-Button "Cancel" 494 612 100 36
  $cancel.BackColor = [System.Drawing.Color]::FromArgb(43, 49, 68)
  $cancel.ForeColor = [System.Drawing.Color]::White
  $settings.Controls.Add($save)
  $settings.Controls.Add($cancel)

  $cancel.add_Click({ $settings.Close() })
  $save.add_Click({
    try {
      $body = @{
        starfieldDir = $starfieldDir.Text.Trim()
        brightness = [double]$brightness.Value
        pulseBoost = [double]$pulseBoost.Value
        frameMs = [int]$frameMs.Value
        accentDevices = [bool]$accentDevices.Checked
        logEvents = [bool]$logEvents.Checked
        damageThresholds = @{
          chip = [int]$damageChip.Value
          heavy = [int]$damageHeavy.Value
          critical = [int]$damageCritical.Value
        }
      }
      Invoke-Api "/api/config" "Post" $body | Out-Null
      [System.Windows.Forms.MessageBox]::Show("Settings saved. Restart the companion for render changes to apply.", "Starfield Chroma Companion", "OK", "Information") | Out-Null
      $settings.Close()
    } catch {
      Show-Error $_.Exception.Message
    }
  })

  $settings.ShowDialog($mainForm) | Out-Null
}

$mainForm = New-Object System.Windows.Forms.Form
$mainForm.Text = "Starfield Chroma Companion"
$mainForm.Size = New-Object System.Drawing.Size(980, 640)
$mainForm.MinimumSize = New-Object System.Drawing.Size(980, 640)
$mainForm.StartPosition = "CenterScreen"
$mainForm.BackColor = [System.Drawing.Color]::FromArgb(6, 8, 14)
$mainForm.ForeColor = [System.Drawing.Color]::White
if (Test-Path $appIconPath) {
  $mainForm.Icon = New-Object System.Drawing.Icon($appIconPath)
}
$mainForm.add_Paint({
  param($sender, $eventArgs)
  $g = $eventArgs.Graphics
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $starBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 180, 220, 255))
  foreach ($point in @(
    @(38, 36), @(120, 84), @(612, 42), @(860, 108), @(82, 520), @(780, 500), @(900, 300),
    @(418, 64), @(302, 540), @(690, 346), @(188, 426), @(252, 46), @(920, 520), @(540, 90)
  )) {
    $g.FillEllipse($starBrush, $point[0], $point[1], 2, 2)
  }
  $cyan = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(70, 24, 215, 232), 2)
  $purple = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(70, 142, 70, 220), 2)
  $g.DrawCurve($cyan, [System.Drawing.Point[]]@(
    (New-Object System.Drawing.Point(20, 205)),
    (New-Object System.Drawing.Point(260, 160)),
    (New-Object System.Drawing.Point(560, 215)),
    (New-Object System.Drawing.Point(940, 170))
  ))
  $g.DrawCurve($purple, [System.Drawing.Point[]]@(
    (New-Object System.Drawing.Point(18, 250)),
    (New-Object System.Drawing.Point(280, 275)),
    (New-Object System.Drawing.Point(610, 225)),
    (New-Object System.Drawing.Point(940, 265))
  ))
  $starBrush.Dispose()
  $cyan.Dispose()
  $purple.Dispose()
})

if (Test-Path -LiteralPath $headerImagePath) {
  $headerImage = [System.Drawing.Image]::FromFile($headerImagePath)
  $headerBox = New-Object System.Windows.Forms.PictureBox
  $headerBox.Location = New-Object System.Drawing.Point(120, 24)
  $headerBox.Size = New-Object System.Drawing.Size(740, 160)
  $headerBox.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
  $headerBox.Image = $headerImage
  $headerBox.BackColor = [System.Drawing.Color]::FromArgb(6, 8, 14)
  $mainForm.Controls.Add($headerBox)
} else {
  $header = New-Label "STARFIELD" 60 32 560 44 24 ([System.Drawing.Color]::White)
  $sub = New-Label "CHROMA COMPANION" 60 76 560 36 19 ([System.Drawing.Color]::FromArgb(24, 215, 232))
  $mainForm.Controls.Add($header)
  $mainForm.Controls.Add($sub)
}

$statusBox = New-AccentPanel 60 220 860 136
$mainForm.Controls.Add($statusBox)

$statusTitle = New-Label "SYSTEM STATUS" 24 20 240 24 10 ([System.Drawing.Color]::FromArgb(157, 167, 188))
$companionLabel = New-Label "Companion: ..." 24 56 260 28 11
$gameLabel = New-Label "Starfield: ..." 24 88 260 28 11
$sfseLabel = New-Label "SFSE: ..." 430 56 220 28 11
$chromaTitle = New-Label "Chroma Apps required" 430 84 360 22 9 ([System.Drawing.Color]::FromArgb(242, 180, 61))
$chromaLabel = New-Label "Enable this in Razer Chroma or your keyboard can stay on Spectrum Cycling." 430 106 390 24 8 ([System.Drawing.Color]::FromArgb(242, 180, 61))
$statusBox.Controls.Add($statusTitle)
$statusBox.Controls.Add($companionLabel)
$statusBox.Controls.Add($gameLabel)
$statusBox.Controls.Add($sfseLabel)
$statusBox.Controls.Add($chromaTitle)
$statusBox.Controls.Add($chromaLabel)

$startButton = New-Button "START STARFIELD" 60 395 860 72
$startButton.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 16, [System.Drawing.FontStyle]::Bold)
$settingsButton = New-Button "Settings" 60 500 190 44
$openRazerButton = New-Button "Enable Chroma Apps" 270 500 210 44
$advancedButton = New-Button "Advanced Panel" 500 500 210 44
$exitButton = New-Button "Exit" 730 500 190 44

$settingsButton.BackColor = [System.Drawing.Color]::FromArgb(43, 49, 68)
$settingsButton.ForeColor = [System.Drawing.Color]::White
$openRazerButton.BackColor = [System.Drawing.Color]::FromArgb(242, 180, 61)
$openRazerButton.ForeColor = [System.Drawing.Color]::FromArgb(31, 19, 0)
$advancedButton.BackColor = [System.Drawing.Color]::FromArgb(43, 49, 68)
$advancedButton.ForeColor = [System.Drawing.Color]::White
$exitButton.BackColor = [System.Drawing.Color]::FromArgb(255, 90, 107)
$exitButton.ForeColor = [System.Drawing.Color]::White

$mainForm.Controls.Add($startButton)
$mainForm.Controls.Add($settingsButton)
$mainForm.Controls.Add($openRazerButton)
$mainForm.Controls.Add($advancedButton)
$mainForm.Controls.Add($exitButton)

$notify = New-Object System.Windows.Forms.NotifyIcon
if (Test-Path $appIconPath) {
  $notify.Icon = New-Object System.Drawing.Icon($appIconPath)
} else {
  $notify.Icon = [System.Drawing.SystemIcons]::Application
}
$notify.Text = "Starfield Chroma Companion"
$notify.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$showItem = $menu.Items.Add("Show App")
$startItem = $menu.Items.Add("Start Starfield")
$settingsItem = $menu.Items.Add("Settings")
$openRazerItem = $menu.Items.Add("Open Razer Chroma")
$advancedItem = $menu.Items.Add("Open Advanced Panel")
$menu.Items.Add("-") | Out-Null
$exitItem = $menu.Items.Add("Exit")
$notify.ContextMenuStrip = $menu

function Update-StatusUi {
  $status = Get-Status
  if ($null -eq $status) {
    $companionLabel.Text = "Companion: unavailable"
    $companionLabel.ForeColor = [System.Drawing.Color]::FromArgb(255, 90, 107)
    $gameLabel.Text = "Starfield: unknown"
    $sfseLabel.Text = "SFSE: unknown"
    $notify.Text = "Starfield Chroma: launcher unavailable"
    return
  }

  $companionLabel.Text = if ($status.companionRunning) { "Companion: running" } else { "Companion: stopped" }
  $companionLabel.ForeColor = if ($status.companionRunning) { [System.Drawing.Color]::FromArgb(75, 227, 139) } else { [System.Drawing.Color]::FromArgb(255, 90, 107) }

  $gameLabel.Text = if ($status.starfieldRunning) { "Starfield: running" } else { "Starfield: stopped" }
  $gameLabel.ForeColor = if ($status.starfieldRunning) { [System.Drawing.Color]::FromArgb(75, 227, 139) } else { [System.Drawing.Color]::FromArgb(157, 167, 188) }

  $sfseLabel.Text = if ($status.sfseLoaderFound) { "SFSE: found" } else { "SFSE: missing" }
  $sfseLabel.ForeColor = if ($status.sfseLoaderFound) { [System.Drawing.Color]::FromArgb(75, 227, 139) } else { [System.Drawing.Color]::FromArgb(255, 90, 107) }

  $tip = "Companion: " + $(if ($status.companionRunning) { "running" } else { "stopped" }) + " | Starfield: " + $(if ($status.starfieldRunning) { "running" } else { "stopped" })
  if ($tip.Length -gt 63) { $tip = $tip.Substring(0, 63) }
  $notify.Text = $tip
}

$startButton.add_Click({
  try {
    $startButton.Enabled = $false
    $startButton.Text = "Starting..."
    Invoke-Api "/api/start-all" "Post" @{} | Out-Null
  } catch {
    Show-Error $_.Exception.Message
  } finally {
    $startButton.Text = "START STARFIELD"
    $startButton.Enabled = $true
    Update-StatusUi
  }
})

$settingsButton.add_Click({ Show-SettingsWindow; Update-StatusUi })
$openRazerButton.add_Click({ try { Invoke-Api "/api/open-razer-chroma" "Post" @{} | Out-Null } catch { Show-Error $_.Exception.Message } })
$advancedButton.add_Click({ Start-Launcher; Start-Process "$url/" })
$exitButton.add_Click({ $notify.Visible = $false; [System.Windows.Forms.Application]::Exit() })

$showItem.add_Click({ $mainForm.Show(); $mainForm.WindowState = "Normal"; $mainForm.Activate() })
$startItem.add_Click({ $startButton.PerformClick() })
$settingsItem.add_Click({ Show-SettingsWindow; Update-StatusUi })
$openRazerItem.add_Click({ try { Invoke-Api "/api/open-razer-chroma" "Post" @{} | Out-Null } catch { Show-Error $_.Exception.Message } })
$advancedItem.add_Click({ Start-Launcher; Start-Process "$url/" })
$exitItem.add_Click({ $notify.Visible = $false; [System.Windows.Forms.Application]::Exit() })
$notify.add_DoubleClick({ $mainForm.Show(); $mainForm.WindowState = "Normal"; $mainForm.Activate() })

$mainForm.add_FormClosing({
  param($sender, $eventArgs)
  if ($eventArgs.CloseReason -eq [System.Windows.Forms.CloseReason]::UserClosing) {
    $eventArgs.Cancel = $true
    $mainForm.Hide()
  }
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 3000
$timer.add_Tick({ Update-StatusUi })
$timer.Start()

Start-Launcher
Update-StatusUi
try {
  [System.Windows.Forms.Application]::Run($mainForm)
} finally {
  if ($notify) {
    $notify.Visible = $false
    $notify.Dispose()
  }
  if ($appMutex) {
    $appMutex.ReleaseMutex()
    $appMutex.Dispose()
  }
}
