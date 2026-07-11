$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$stage = Join-Path $root "dist\nexus-clean"
$zip = Join-Path $root "StarfieldChromaCompanion-v0.1.5-alpha-nexus-clean.zip"

Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stage | Out-Null

$sourceRoot = Join-Path $root "release-vortex-clean"
$copyExit = & robocopy $sourceRoot $stage /E /NFL /NDL /NJH /NJS /NP
if ($LASTEXITCODE -gt 7) {
  throw "robocopy failed with exit code $LASTEXITCODE"
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
