@echo off
setlocal
set "STARFIELD_DIR=%~1"
if "%STARFIELD_DIR%"=="" set "STARFIELD_DIR=%ProgramFiles(x86)%\Steam\steamapps\common\Starfield"
set "PLUGIN_DIR=%STARFIELD_DIR%\Data\SFSE\Plugins"
if not exist "%PLUGIN_DIR%" mkdir "%PLUGIN_DIR%"
copy /Y "%~dp0StarfieldChromaCodex.dll" "%PLUGIN_DIR%\StarfieldChromaCodex.dll"
if exist "%~dp0StarfieldChromaProbe.dll" copy /Y "%~dp0StarfieldChromaProbe.dll" "%PLUGIN_DIR%\StarfieldChromaProbe.dll"
echo Installed Starfield Chroma plugins to "%PLUGIN_DIR%"
