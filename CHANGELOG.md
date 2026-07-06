# Changelog

## Unreleased

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
- Documented that keyboard effects are currently the primary supported path while mouse/Naga-class device support needs broader testing.

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
