@echo off
setlocal
set "STARFIELD_DIR=%~1"
if "%STARFIELD_DIR%"=="" set "STARFIELD_DIR=%ProgramFiles(x86)%\Steam\steamapps\common\Starfield"
set "PLUGIN_DIR=%STARFIELD_DIR%\Data\SFSE\Plugins"
if not exist "%PLUGIN_DIR%" mkdir "%PLUGIN_DIR%"
copy /Y "%~dp0release\StarfieldChromaCodex.dll" "%PLUGIN_DIR%\StarfieldChromaCodex.dll"
echo Installed to "%PLUGIN_DIR%\StarfieldChromaCodex.dll"
