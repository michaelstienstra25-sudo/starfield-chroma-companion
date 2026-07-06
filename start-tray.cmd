@echo off
setlocal
cd /d "%~dp0"
if exist ".\StarfieldChromaCompanion.exe" (
  start "" ".\StarfieldChromaCompanion.exe"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File ".\tools\starfield-chroma-tray.ps1"
