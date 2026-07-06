$ErrorActionPreference = "Stop"

$EmbeddedPayloadBase64 = "__STARFIELD_CHROMA_EMBEDDED_PAYLOAD_BASE64__"
$EmbeddedPayloadRoot = $null

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

function Test-PathSafe([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
  try {
    return [bool](Test-Path -LiteralPath $Path -ErrorAction SilentlyContinue)
  } catch {
    return $false
  }
}

function Join-PathSafe([string]$Base, [string]$Child) {
  if ([string]::IsNullOrWhiteSpace($Base)) { return $Child }
  if ([string]::IsNullOrWhiteSpace($Child)) { return $Base }
  return [System.IO.Path]::Combine($Base, $Child)
}

function Get-ExistingDriveLetters {
  [System.IO.DriveInfo]::GetDrives() |
    Where-Object { $_.IsReady } |
    ForEach-Object { $_.Name.Substring(0, 1).ToUpperInvariant() } |
    Select-Object -Unique
}

function Get-ScriptBase {
  if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) { return $PSScriptRoot }
  if (-not [string]::IsNullOrWhiteSpace([System.AppContext]::BaseDirectory)) { return [System.AppContext]::BaseDirectory }
  return (Get-Location).Path
}

function Get-PayloadRoot {
  if (
    -not [string]::IsNullOrWhiteSpace($EmbeddedPayloadBase64) -and
    $EmbeddedPayloadBase64 -ne "__STARFIELD_CHROMA_EMBEDDED_PAYLOAD_BASE64__"
  ) {
    if ($script:EmbeddedPayloadRoot -and (Test-PathSafe (Join-Path $script:EmbeddedPayloadRoot "companion\starfield-chroma-companion.mjs"))) {
      return $script:EmbeddedPayloadRoot
    }
    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("StarfieldChromaCompanionSetup-" + [System.Guid]::NewGuid().ToString("N"))
    $zipPath = Join-Path $tempRoot "payload.zip"
    $extractPath = Join-Path $tempRoot "payload"
    New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
    [System.IO.File]::WriteAllBytes($zipPath, [Convert]::FromBase64String($EmbeddedPayloadBase64))
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $extractPath)
    $script:EmbeddedPayloadRoot = $extractPath
    return $extractPath
  }

  $base = Get-ScriptBase
  $payload = Join-Path $base "SetupPayload"
  if (Test-PathSafe (Join-Path $payload "companion\starfield-chroma-companion.mjs")) { return $payload }
  $parent = Split-Path -Parent $base
  if (Test-PathSafe (Join-Path $parent "companion\starfield-chroma-companion.mjs")) { return $parent }
  if (Test-PathSafe (Join-Path $base "companion\starfield-chroma-companion.mjs")) { return $base }
  throw "SetupPayload was not found next to the installer."
}

function Get-SteamRoots {
  $roots = New-Object System.Collections.Generic.List[string]
  foreach ($key in @(
    "HKCU:\Software\Valve\Steam",
    "HKLM:\SOFTWARE\WOW6432Node\Valve\Steam",
    "HKLM:\SOFTWARE\Valve\Steam"
  )) {
    try {
      $path = (Get-ItemProperty -Path $key -ErrorAction Stop).SteamPath
      if ($path -and (Test-PathSafe $path)) { $roots.Add($path) }
      $install = (Get-ItemProperty -Path $key -ErrorAction Stop).InstallPath
      if ($install -and (Test-PathSafe $install)) { $roots.Add($install) }
    } catch {}
  }
  foreach ($drive in Get-ExistingDriveLetters) {
    foreach ($path in @("$drive`:\Steam", "$drive`:\SteamLibrary")) {
      if (Test-PathSafe $path) { $roots.Add($path) }
    }
  }
  return $roots | Select-Object -Unique
}

function Get-SteamLibraries {
  $libraries = New-Object System.Collections.Generic.List[string]
  foreach ($root in Get-SteamRoots) {
    $libraries.Add($root)
    $vdf = Join-PathSafe $root "steamapps\libraryfolders.vdf"
    if (Test-PathSafe $vdf) {
      $content = Get-Content -LiteralPath $vdf -Raw
      foreach ($match in [regex]::Matches($content, '"path"\s+"([^"]+)"')) {
        $path = $match.Groups[1].Value -replace "\\\\", "\"
        if (Test-PathSafe $path) { $libraries.Add($path) }
      }
    }
  }
  return $libraries | Select-Object -Unique
}

function Find-StarfieldDirs {
  $dirs = New-Object System.Collections.Generic.List[string]
  foreach ($library in Get-SteamLibraries) {
    $candidate = Join-PathSafe $library "steamapps\common\Starfield"
    if (Test-PathSafe (Join-PathSafe $candidate "Starfield.exe")) { $dirs.Add($candidate) }
  }
  foreach ($drive in Get-ExistingDriveLetters) {
    foreach ($candidate in @(
      "$drive`:\SteamLibrary\steamapps\common\Starfield",
      "$drive`:\Steam\steamapps\common\Starfield",
      "$drive`:\XboxGames\Starfield\Content"
    )) {
      if (Test-PathSafe (Join-PathSafe $candidate "Starfield.exe")) { $dirs.Add($candidate) }
    }
  }
  return $dirs | Select-Object -Unique
}

function Copy-DirectoryContents([string]$Source, [string]$Destination) {
  if (-not (Test-PathSafe $Source)) { return }
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  Copy-Item -LiteralPath (Join-Path $Source "*") -Destination $Destination -Recurse -Force
}

function Save-StarfieldConfig([string]$InstallRoot, [string]$StarfieldDir) {
  $configPath = Join-Path $InstallRoot "starfield-chroma.config.json"
  $config = if (Test-PathSafe $configPath) {
    Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  } else {
    [pscustomobject]@{}
  }
  $config | Add-Member -NotePropertyName starfieldDir -NotePropertyValue $StarfieldDir -Force
  $config | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $configPath -Encoding UTF8
}

function New-Shortcut([string]$Path, [string]$Target, [string]$WorkingDirectory, [string]$Icon, [string]$Description) {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($Path)
  $shortcut.TargetPath = $Target
  $shortcut.WorkingDirectory = $WorkingDirectory
  if (Test-PathSafe $Icon) { $shortcut.IconLocation = "$Icon,0" }
  $shortcut.Description = $Description
  $shortcut.Save()
}

function Install-StarfieldChroma([string]$StarfieldDir, [string]$InstallRoot, [bool]$CreateDesktopShortcut, [bool]$CreateStartMenuShortcut) {
  if (-not (Test-PathSafe (Join-Path $StarfieldDir "Starfield.exe"))) {
    throw "This does not look like a Starfield folder: $StarfieldDir"
  }
  if (-not (Test-PathSafe (Join-Path $StarfieldDir "sfse_loader.exe"))) {
    throw "sfse_loader.exe was not found in the selected Starfield folder. Install SFSE first."
  }
  if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    throw "Node.js was not found. Install Node.js 20 or newer first, then run this installer again."
  }

  $payload = Get-PayloadRoot
  New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null

  foreach ($name in @("companion", "launcher", "docs", "assets", "tools")) {
    Copy-DirectoryContents (Join-Path $payload $name) (Join-Path $InstallRoot $name)
  }
  foreach ($file in @("StarfieldChromaCompanion.exe", "start-tray.cmd", "README.md", "CHANGELOG.md", "LICENSE", "starfield-chroma.config.json")) {
    $source = Join-Path $payload $file
    if (Test-PathSafe $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $InstallRoot $file) -Force }
  }

  Save-StarfieldConfig $InstallRoot $StarfieldDir

  $pluginSource = Join-Path $payload "SFSE\Plugins"
  if (-not (Test-PathSafe $pluginSource)) { $pluginSource = $payload }
  $pluginDest = Join-Path $StarfieldDir "Data\SFSE\Plugins"
  New-Item -ItemType Directory -Force -Path $pluginDest | Out-Null
  foreach ($dll in @("StarfieldChromaCodex.dll", "StarfieldChromaProbe.dll")) {
    $source = Join-Path $pluginSource $dll
    if (Test-PathSafe $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $pluginDest $dll) -Force }
  }

  $exe = Join-Path $InstallRoot "StarfieldChromaCompanion.exe"
  $icon = Join-Path $InstallRoot "assets\starfield-chroma.ico"
  $desktop = [Environment]::GetFolderPath("Desktop")
  $startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Starfield Chroma Companion"
  if ($CreateDesktopShortcut) {
    New-Item -ItemType Directory -Force -Path $desktop | Out-Null
    New-Shortcut (Join-Path $desktop "Starfield Chroma Companion.lnk") $exe $InstallRoot $icon "Launch Starfield with Starfield Chroma Companion"
  }
  if ($CreateStartMenuShortcut) {
    New-Item -ItemType Directory -Force -Path $startMenu | Out-Null
    New-Shortcut (Join-Path $startMenu "Starfield Chroma Companion.lnk") $exe $InstallRoot $icon "Launch Starfield with Starfield Chroma Companion"
  }

  $uninstall = @"
`$ErrorActionPreference = "Stop"
Remove-Item -LiteralPath "$InstallRoot" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "$desktop\Starfield Chroma Companion.lnk" -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "$startMenu" -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Starfield Chroma Companion user app files removed."
Write-Host "SFSE plugin DLLs are left in Starfield\Data\SFSE\Plugins so mod managers do not lose ownership unexpectedly."
"@
  Set-Content -LiteralPath (Join-Path $InstallRoot "Uninstall-StarfieldChromaCompanion.ps1") -Value $uninstall -Encoding UTF8

  return [pscustomobject]@{
    installRoot = $InstallRoot
    starfieldDir = $StarfieldDir
    pluginDir = $pluginDest
    launcher = $exe
    desktopShortcut = $CreateDesktopShortcut
    startMenuShortcut = $CreateStartMenuShortcut
  }
}

function New-Label([string]$Text, [int]$X, [int]$Y, [int]$W, [int]$H, [int]$Size = 10, [System.Drawing.Color]$Color = [System.Drawing.Color]::Gainsboro) {
  $label = New-Object System.Windows.Forms.Label
  $label.Text = $Text
  $label.Location = New-Object System.Drawing.Point($X, $Y)
  $label.Size = New-Object System.Drawing.Size($W, $H)
  $label.Font = New-Object System.Drawing.Font("Segoe UI", $Size)
  $label.ForeColor = $Color
  $label.BackColor = [System.Drawing.Color]::Transparent
  return $label
}

function New-Button([string]$Text, [int]$X, [int]$Y, [int]$W, [int]$H, [System.Drawing.Color]$BackColor, [System.Drawing.Color]$ForeColor) {
  $button = New-Object System.Windows.Forms.Button
  $button.Text = $Text
  $button.Location = New-Object System.Drawing.Point($X, $Y)
  $button.Size = New-Object System.Drawing.Size($W, $H)
  $button.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
  $button.FlatStyle = "Flat"
  $button.FlatAppearance.BorderSize = 0
  $button.BackColor = $BackColor
  $button.ForeColor = $ForeColor
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
    $line = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 44, 50, 68), 1)
    $g.DrawRectangle($line, 0, 0, $sender.Width - 1, $sender.Height - 1)
    $g.DrawLine($cyan, 18, 14, $sender.Width - 18, 14)
    $g.DrawLine($gold, 18, $sender.Height - 14, 220, $sender.Height - 14)
    $cyan.Dispose()
    $gold.Dispose()
    $line.Dispose()
  })
  return $panel
}

$payloadRoot = Get-PayloadRoot
$iconPath = Join-Path $payloadRoot "assets\starfield-chroma.ico"
$headerImagePath = Join-Path $payloadRoot "docs\images\starfield-chroma-header.png"
$form = New-Object System.Windows.Forms.Form
$form.Text = "Starfield Chroma Companion Setup"
$form.Size = New-Object System.Drawing.Size(860, 650)
$form.StartPosition = "CenterScreen"
$form.BackColor = [System.Drawing.Color]::FromArgb(8, 10, 18)
$form.ForeColor = [System.Drawing.Color]::White
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
if (Test-PathSafe $iconPath) { $form.Icon = New-Object System.Drawing.Icon($iconPath) }
$form.add_Paint({
  param($sender, $eventArgs)
  $g = $eventArgs.Graphics
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $starBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 180, 220, 255))
  foreach ($point in @(@(40,42),@(146,82),@(782,64),@(812,220),@(90,530),@(720,500),@(390,90),@(534,540),@(650,350))) {
    $g.FillEllipse($starBrush, $point[0], $point[1], 2, 2)
  }
  $cyan = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(70, 24, 215, 232), 2)
  $purple = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(70, 142, 70, 220), 2)
  $g.DrawCurve($cyan, [System.Drawing.Point[]]@(
    (New-Object System.Drawing.Point(24, 186)),
    (New-Object System.Drawing.Point(250, 150)),
    (New-Object System.Drawing.Point(520, 198)),
    (New-Object System.Drawing.Point(820, 164))
  ))
  $g.DrawCurve($purple, [System.Drawing.Point[]]@(
    (New-Object System.Drawing.Point(24, 232)),
    (New-Object System.Drawing.Point(280, 268)),
    (New-Object System.Drawing.Point(560, 224)),
    (New-Object System.Drawing.Point(820, 258))
  ))
  $starBrush.Dispose()
  $cyan.Dispose()
  $purple.Dispose()
})

if (Test-PathSafe $headerImagePath) {
  $headerImage = [System.Drawing.Image]::FromFile($headerImagePath)
  $headerBox = New-Object System.Windows.Forms.PictureBox
  $headerBox.Location = New-Object System.Drawing.Point(90, 22)
  $headerBox.Size = New-Object System.Drawing.Size(680, 145)
  $headerBox.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
  $headerBox.Image = $headerImage
  $headerBox.BackColor = [System.Drawing.Color]::FromArgb(8, 10, 18)
  $form.Controls.Add($headerBox)
} else {
  $title = New-Label "Starfield Chroma Companion Setup" 42 34 720 34 18 ([System.Drawing.Color]::White)
  $form.Controls.Add($title)
}

$introPanel = New-AccentPanel 42 185 776 74
$introTitle = New-Label "INSTALLER" 22 18 160 22 9 ([System.Drawing.Color]::FromArgb(157,167,188))
$introText = New-Label "Installs the companion app, SFSE plugin DLLs, config, and shortcuts. Starfield is detected automatically where possible." 22 40 720 24 9 ([System.Drawing.Color]::Gainsboro)
$introPanel.Controls.Add($introTitle)
$introPanel.Controls.Add($introText)
$form.Controls.Add($introPanel)

$form.Controls.Add((New-Label "Starfield folder" 42 282 250 22 10))
$starfieldBox = New-Object System.Windows.Forms.ComboBox
$starfieldBox.Location = New-Object System.Drawing.Point(42, 308)
$starfieldBox.Size = New-Object System.Drawing.Size(640, 30)
$starfieldBox.DropDownStyle = "DropDown"
foreach ($dir in Find-StarfieldDirs) { [void]$starfieldBox.Items.Add($dir) }
if ($starfieldBox.Items.Count -gt 0) { $starfieldBox.SelectedIndex = 0 }
$form.Controls.Add($starfieldBox)

$browse = New-Button "Browse" 700 307 118 32 ([System.Drawing.Color]::FromArgb(43, 49, 68)) ([System.Drawing.Color]::White)
$form.Controls.Add($browse)

$form.Controls.Add((New-Label "Install app to" 42 356 250 22 10))
$installBox = New-Object System.Windows.Forms.TextBox
$installBox.Location = New-Object System.Drawing.Point(42, 382)
$installBox.Size = New-Object System.Drawing.Size(776, 28)
$installBox.Text = Join-Path $env:LOCALAPPDATA "StarfieldChromaCompanion"
$form.Controls.Add($installBox)

$shortcutDesktop = New-Object System.Windows.Forms.CheckBox
$shortcutDesktop.Text = "Create desktop shortcut"
$shortcutDesktop.Location = New-Object System.Drawing.Point(42, 424)
$shortcutDesktop.Size = New-Object System.Drawing.Size(240, 26)
$shortcutDesktop.Checked = $true
$shortcutDesktop.ForeColor = [System.Drawing.Color]::Gainsboro
$shortcutDesktop.BackColor = [System.Drawing.Color]::Transparent
$form.Controls.Add($shortcutDesktop)

$shortcutStartMenu = New-Object System.Windows.Forms.CheckBox
$shortcutStartMenu.Text = "Create Start Menu shortcut"
$shortcutStartMenu.Location = New-Object System.Drawing.Point(304, 424)
$shortcutStartMenu.Size = New-Object System.Drawing.Size(260, 26)
$shortcutStartMenu.Checked = $true
$shortcutStartMenu.ForeColor = [System.Drawing.Color]::Gainsboro
$shortcutStartMenu.BackColor = [System.Drawing.Color]::Transparent
$form.Controls.Add($shortcutStartMenu)

$reqPanel = New-AccentPanel 42 458 776 64
$requirements = New-Label "Checks: Node.js 20+, sfse_loader.exe in the selected Starfield folder, and Razer Chroma Apps enabled after launch." 22 28 720 24 9 ([System.Drawing.Color]::FromArgb(242,180,61))
$reqTitle = New-Label "REQUIREMENTS" 22 10 180 18 8 ([System.Drawing.Color]::FromArgb(157,167,188))
$reqPanel.Controls.Add($reqTitle)
$reqPanel.Controls.Add($requirements)
$form.Controls.Add($reqPanel)

$log = New-Object System.Windows.Forms.TextBox
$log.Location = New-Object System.Drawing.Point(42, 538)
$log.Size = New-Object System.Drawing.Size(522, 44)
$log.Multiline = $true
$log.ReadOnly = $true
$log.BackColor = [System.Drawing.Color]::FromArgb(13,16,25)
$log.ForeColor = [System.Drawing.Color]::Gainsboro
$log.Text = "Ready."
$form.Controls.Add($log)

$install = New-Button "INSTALL" 584 538 112 44 ([System.Drawing.Color]::FromArgb(24,215,232)) ([System.Drawing.Color]::FromArgb(0,16,20))
$form.Controls.Add($install)

$close = New-Button "Close" 706 538 112 44 ([System.Drawing.Color]::FromArgb(43, 49, 68)) ([System.Drawing.Color]::White)
$form.Controls.Add($close)

$browse.Add_Click({
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "Select the Starfield folder that contains sfse_loader.exe"
  if ($dialog.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {
    $starfieldBox.Text = $dialog.SelectedPath
  }
})

$install.Add_Click({
  try {
    $install.Enabled = $false
    $log.Text = "Installing..."
    $result = Install-StarfieldChroma $starfieldBox.Text.Trim() $installBox.Text.Trim() $shortcutDesktop.Checked $shortcutStartMenu.Checked
    $log.Text = "Installed app:`r`n$($result.installRoot)`r`n`r`nInstalled plugins:`r`n$($result.pluginDir)"
    [System.Windows.Forms.MessageBox]::Show("Install complete. Use the created shortcut or run StarfieldChromaCompanion.exe from the install folder.", "Starfield Chroma Companion Setup", "OK", "Information") | Out-Null
  } catch {
    $log.Text = $_.Exception.Message
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "Install failed", "OK", "Error") | Out-Null
  } finally {
    $install.Enabled = $true
  }
})

$close.Add_Click({ $form.Close() })

[System.Windows.Forms.Application]::Run($form)
