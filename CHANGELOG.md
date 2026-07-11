# Changelog

## Unreleased

- Added automatic full app shutdown after a Starfield session ends: when Starfield closes, the desktop app now stops the companion and launcher server and exits itself.

## v0.1.5-alpha

- Added `mo2-start.mjs`, a Mod Organizer 2 helper that opens the control panel from the real mod folder without keeping MO2 unnecessarily locked.
- Added a dedicated MO2 setup guide and clarified that MO2 users should start the Chroma companion from the panel but launch Starfield/SFSE from MO2.
- Added a keyboard/device demo reel script for filming all major Chroma effects in one pass.
- Added a Nexus-clean package build that excludes setup executables, command scripts, PowerShell scripts, and logs.
- Added effect presets (`immersive`, `subtle`, `combatHeavy`, and `readable`) for easier user tuning.
- Added per-device intensity controls for mouse, mousepad, headset, and Chroma Link accents.
- Added the new preset and multi-device controls to both the desktop Settings window and the Advanced Panel.
- Added a dedicated takeoff preview button to the Advanced Panel.
- Improved planet takeoff detection by handling launch/takeoff events and inferring takeoff from loading-to-ship transitions.

## v0.1.4-alpha

Multi-device Chroma support and setup polish.

- Added a Razer Chroma Apps setup panel to the control panel.
- Added an `Open Razer Chroma` action so users can quickly enable the required global Chroma Apps toggle.
- Clarified that the Chroma SDK can return success while Spectrum Cycling remains active if Razer Chroma Apps is disabled.
- Standardized the Chroma SDK app registration name to `Starfield Chroma Companion`.
- Fixed the control panel `Heavy Hit` test button so it triggers the heavy damage lighting effect.
- Changed the control panel `Scanner` button to a short preview instead of a sustained anomaly effect.
- Added separate `Anomaly` and `Clear` test buttons for safer effect testing.
- Fixed the control panel `Grav` and `Power` buttons so they trigger reliable preview effects.
- Reworked the tray helper into a Starfield-styled desktop launcher app with one `START STARFIELD` button, live status, Settings, Razer Chroma shortcut, Advanced Panel shortcut, and tray status menu.
- Added a compiled `StarfieldChromaCompanion.exe` launcher with a custom Starfield Chroma icon.
- Made the desktop launcher warning clearer when Razer Chroma Apps must be enabled for effects to take over from Spectrum Cycling.
- Enlarged and rescaled the desktop launcher window, settings explanations, and advanced panel help text for clearer first-time use.
- Added a single-file setup assistant that auto-detects Starfield installs, installs SFSE plugin DLLs, installs the companion app to LocalAppData, writes the Starfield folder to config, and creates Desktop/Start Menu shortcuts.
- Added safer setup drive detection for missing or disconnected Steam library drives.
- Updated MO2 documentation with the extra unlock step after starting the companion.
- Started a balanced feedback pass based on early tester input: calmer idle lighting, WASD-focused breathing, radar-style scanner sweeps, and more deliberate combat/damage feedback.
- Added true multi-device Chroma accent support for mouse, mousepad, headset, and chromalink devices.
- Added custom 9x7 mouse matrix effects for damage, combat, scanner anomalies, grav/power moments, oxygen warnings, rewards, menus, and idle state.
- Strengthened headset, mousepad, and chromalink pulses while keeping headset output broad-compatible for devices that only support static effects.
- Added Advanced Panel device focus tests for all-device, combat-device, and exploration-device previews.
- Improved artifact/power pickup detection using the captured artifact form ID.

## v0.1.2-alpha

- Fixed launcher status detection so only the real Node companion process counts as running.
- Fixed duplicate companion startup from the control panel.
- Added retry handling to the Chroma SDK test button for Razer's delayed per-session app port startup.
- Improved companion logging when started from the launcher.
- Added periodic keyboard frame refresh so Synapse profiles cannot silently leave the device on Spectrum Cycling after the SDK session is active.

## v0.1.1-alpha

- Added a local browser control panel for companion status, SFSE launch, Chroma SDK checks, effect tests, and config tuning.
- Added a one-click Windows launcher and optional Windows tray helper for the control panel.
- Added a shortcut installer for `Desktop\Games`.
- Updated Vortex, MO2, manual install, and Nexus text around the new launch flow.

## v0.1.0-alpha

Initial private alpha release.

- Added SFSE event bridge for Starfield gameplay/input events.
- Added CommonLibSF probe for menu-aware Chroma effects.
- Added Razer Chroma companion app using the local Chroma SDK REST service.
- Added reactive effects for combat, weapon fire, reload, damage, bleedout, O2/gas/radiation, scanner, scanner anomalies, temple/power moments, level-up, starmap, grav jump, and takeoff.
- Added install/start/launch helper scripts.
- Added configurable brightness, logging, damage thresholds, UDP port, and Chroma SDK endpoint.
