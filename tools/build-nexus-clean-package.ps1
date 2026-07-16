$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$stage = Join-Path $root "dist\nexus-clean"
$zip = Join-Path $root "StarfieldChromaCompanion-v0.1.8-alpha-nexus-clean.zip"

Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stage | Out-Null

$packageRoot = Join-Path $stage "StarfieldChromaCompanion"
New-Item -ItemType Directory -Force -Path $packageRoot | Out-Null

foreach ($name in @("companion", "launcher", "docs", "assets")) {
  $source = Join-Path $root $name
  if (Test-Path -LiteralPath $source) {
    $copyExit = & robocopy $source (Join-Path $packageRoot $name) /E /NFL /NDL /NJH /NJS /NP
    if ($LASTEXITCODE -gt 7) {
      throw "robocopy failed for $name with exit code $LASTEXITCODE"
    }
  }
}

$toolsDest = Join-Path $packageRoot "tools"
New-Item -ItemType Directory -Force -Path $toolsDest | Out-Null
Get-ChildItem -LiteralPath (Join-Path $root "tools") -File -Filter "*.mjs" |
  Copy-Item -Destination $toolsDest -Force

foreach ($name in @("CHANGELOG.md", "LICENSE", "README.md", "mo2-start.mjs", "auto-start-sfse.mjs", "starfield-chroma.config.json")) {
  $source = Join-Path $root $name
  if (Test-Path -LiteralPath $source) {
    Copy-Item -LiteralPath $source -Destination $packageRoot -Force
  }
}

$vortexInstall = Join-Path $root "release-vortex-clean\StarfieldChromaCompanion\VORTEX-INSTALL.txt"
if (Test-Path -LiteralPath $vortexInstall) {
  Copy-Item -LiteralPath $vortexInstall -Destination $packageRoot -Force
}

$pluginSource = Join-Path $root "release-vortex-clean\SFSE"
if (Test-Path -LiteralPath $pluginSource) {
  $copyExit = & robocopy $pluginSource (Join-Path $stage "SFSE") /E /NFL /NDL /NJH /NJS /NP
  if ($LASTEXITCODE -gt 7) {
    throw "robocopy failed for SFSE plugins with exit code $LASTEXITCODE"
  }
}

Get-ChildItem -LiteralPath $stage -Recurse -File |
  Where-Object { $_.Name -match '\.(err\.log|log|exe|cmd|bat|ps1)$' } |
  Remove-Item -Force -ErrorAction Stop

$risky = Get-ChildItem -LiteralPath $stage -Recurse -File |
  Where-Object { $_.Name -match '\.(err\.log|log|exe|cmd|bat|ps1)$' }

if ($risky) {
  $names = ($risky | ForEach-Object FullName) -join [Environment]::NewLine
  throw "Nexus clean package still contains blocked file types:$([Environment]::NewLine)$names"
}

Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -Force

Write-Host "Built Nexus clean package:"
Write-Host "  $zip"
