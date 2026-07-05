@echo off
setlocal
set "STARFIELD_DIR=%~1"
if "%STARFIELD_DIR%"=="" set "STARFIELD_DIR=%ProgramFiles(x86)%\Steam\steamapps\common\Starfield"
cd /d "%STARFIELD_DIR%"
start "" "%STARFIELD_DIR%\sfse_loader.exe"
