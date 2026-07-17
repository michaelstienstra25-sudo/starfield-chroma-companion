# Starfield Chroma Companion

[![Latest release](https://img.shields.io/github/v/release/michaelstienstra25-sudo/starfield-chroma-companion?include_prereleases&label=latest%20release)](https://github.com/michaelstienstra25-sudo/starfield-chroma-companion/releases)
[![Nexus Mods](https://img.shields.io/badge/Nexus%20Mods-Starfield%20Chroma%20Companion-orange)](https://www.nexusmods.com/starfield/mods/17645)
[![License](https://img.shields.io/github/license/michaelstienstra25-sudo/starfield-chroma-companion)](LICENSE)

![Starfield Chroma Companion banner](docs/images/starfield-chroma-header.png)

Reactive Razer Chroma lighting for Starfield, powered by SFSE game events and a small Node.js companion app.

[Download on Nexus Mods](https://www.nexusmods.com/starfield/mods/17645) · [GitHub releases](https://github.com/michaelstienstra25-sudo/starfield-chroma-companion/releases) · [Video preview](https://youtu.be/IV01W_cuL2M) · [Report an issue](https://github.com/michaelstienstra25-sudo/starfield-chroma-companion/issues)

This project is currently an early PC-only prototype. It is built for players who run Starfield through SFSE and use Razer Synapse/Chroma devices.

![Starfield Chroma Companion preview](docs/images/starfield-chroma-gallery.png)

## Choose Your Download

| Use case | Recommended file | Where | Notes |
| --- | --- | --- | --- |
| Vortex, MO2, or manual mod-manager install | `StarfieldChromaCompanion-v0.1.9-alpha-nexus-clean.zip` | [Nexus Mods](https://www.nexusmods.com/starfield/mods/17645) | Clean package without `.exe`, `.cmd`, `.bat`, `.ps1`, or log files. |
| Guided Windows setup | `StarfieldChromaCompanionSetup-v0.1.9-alpha.exe` | [GitHub releases](https://github.com/michaelstienstra25-sudo/starfield-chroma-companion/releases) | Optional installer build for users who prefer a setup assistant. |
| Source, release notes, issues, and transparency | Repository source code | GitHub | Use GitHub for development notes, issue reports, and source review. |

The Nexus file is the recommended clean mod-manager package. GitHub is used for source code, issue tracking, release notes, development transparency, and the optional installer build.

## Quick Start

The easiest way to run the alpha after installation is through the desktop launcher app:

```cmd
StarfieldChromaCompanion.exe
```

The launcher gives you:

- One `START STARFIELD` button.
- Companion and Starfield status.
- Settings for effect presets, brightness, pulse strength, device intensity, damage thresholds, logging, and your Starfield folder.
- A Razer Chroma shortcut for checking the required Chroma Apps setting.
- An Advanced Panel for Chroma SDK checks, effect previews, and multi-device focus tests.

The companion must keep running while Starfield is active. If you launch only `Starfield.exe` or only `sfse_loader.exe`, the RGB effects will not start unless the companion is already running.

## Installation Overview

| Method | Best for | Steps |
| --- | --- | --- |
| Nexus/Vortex | Most users who use Vortex | Download the Nexus-clean package, install with Vortex, then run `auto-start-sfse.mjs` with Node.js or use the control panel. |
| Mod Organizer 2 | MO2 users | Install the clean package in MO2, add a companion executable using `node.exe` and `.\mo2-start.mjs`, then launch SFSE through MO2. |
| GitHub setup assistant | Users who want a guided app install | Run the optional setup assistant from GitHub releases. |
| Manual/dev | Testers and contributors | Clone or extract the repository, start the launcher with Node.js, and configure paths manually. |

## Optional GitHub Setup Assistant

The GitHub release includes an optional single-file setup assistant:

```text
StarfieldChromaCompanionSetup-v0.1.9-alpha.exe
```

1. Run `StarfieldChromaCompanionSetup-v0.1.9-alpha.exe`.
2. The setup assistant searches Steam libraries and common install paths for Starfield.
3. If Starfield is not detected, browse to the folder that contains `sfse_loader.exe`.
4. Click `Install`.

The setup assistant installs the companion app to:

```text
%LOCALAPPDATA%\StarfieldChromaCompanion
```

It installs the SFSE plugin DLLs to:

```text
<Starfield folder>\Data\SFSE\Plugins
```

It can create optional Desktop and Windows Start Menu shortcuts. The selected Starfield folder is saved in `starfield-chroma.config.json`, so the launcher works even when Starfield is installed outside the default Steam folder.

The browser control panel is also available as the advanced/debug view:

```cmd
node ".\launcher\starfield-chroma-launcher.mjs"
```

To rebuild the Windows launcher executable after changing the tray app:

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File ".\tools\build-launcher-exe.ps1"
```

## Why Use It?

Starfield Chroma Companion turns your Razer Chroma setup into a reactive cockpit, scanner, combat, and exploration lighting layer. It is tuned around real gameplay moments such as scanner anomalies, damage, oxygen warnings, grav jumps, temple/power moments, and level-up screens.

This is an unofficial community project and is not affiliated with Bethesda, Razer, or Nexus Mods.

## Features

- Reactive keyboard zones for movement, sprint, jump, scanner, interact, reload, quickslots, menus, ship controls, and systems.
- Game-event lighting for weapon fire, reloads, ammo changes, combat, hits, damage, bleedout, radiation/gas, O2 danger, loading, saving, and UI menus.
- Scanner anomaly proximity effect with sustained purple/white glitch lighting while the scanner is active.
- Temple, portal, power, Powers menu, and level-up effects with distinct visual styles.
- Multi-device Chroma support for keyboard, mouse, mousepad, headset, and chromalink devices.
- Custom 9x7 mouse effects for combat, damage, scanner anomalies, grav/power moments, O2/gas warnings, rewards, menus, and idle state.
- Stronger headset, mousepad, and chromalink pulses for damage, combat, scanner, ship, menu, power, and exploration moments.
- Effect presets for balanced, subtle, combat-heavy, or more readable key lighting.
- Per-device intensity controls for mouse, mousepad, headset, and Chroma Link accents.
- Starfield-styled desktop launcher with one `START STARFIELD` button, tray status, settings, and advanced test panel.
- Single-file setup assistant that detects Starfield, installs the companion, installs SFSE plugin DLLs, and creates optional Desktop/Start Menu shortcuts.
- Visible Chroma confirmation pulses when the companion starts or stops.
- A dedicated `Test Effects` readiness sequence for confirming keyboard, mouse, mousepad, headset, and Chroma Link takeover.
- Configurable presets, brightness, device intensity, damage thresholds, logging, Chroma SDK URL, UDP port, and stale timeout.

## Requirements

- Starfield for PC
- SFSE compatible with your installed Starfield version
- Razer Synapse with Razer Chroma installed
- Razer Chroma Apps enabled in Razer Chroma
- Local Razer Chroma SDK REST service
- Node.js 20 or newer

## Razer Chroma Apps Setup

Razer Chroma must allow Chroma Apps to take over device lighting. If this is off, the SDK can still answer successfully while the keyboard stays on a normal Quick Effect such as Spectrum Cycling.

1. Open `Razer Chroma`.
2. Go to `CHROMA APPS`.
3. Turn the global `CHROMA APPS` toggle on.
4. Make sure `Starfield Chroma Companion` is enabled in the app list.
5. In the companion control panel, click `SDK Check` or `Test Effects`.
6. Razer Chroma should show `App in use: Starfield Chroma Companion (Chroma Apps)`.

The control panel includes an `Open Razer Chroma` button and repeats these steps. `SDK Check` only verifies that the local Razer SDK can be reached. `Test Effects` sends real companion events and should visibly pulse supported devices. The app does not modify Razer's internal settings directly because Razer documents Chroma Apps as a user-controlled Synapse/Chroma setting.

## Looking For Testers

This alpha has been tuned on one local setup and needs testing on more Razer Chroma keyboards, mice, mousepads, headsets, and Starfield/SFSE versions. Feedback, bug reports, feature ideas, and short gameplay clips are welcome.

Useful reports include:

- Starfield version and SFSE version.
- Razer device model(s).
- Whether Synapse/Chroma SDK was already running.
- Which in-game effect worked or did not work.
- Screenshots of errors, logs, or quarantine messages.

## Install With Vortex

1. Download the Vortex package from Nexus Mods.
2. Install and enable it with Vortex.
3. For a one-step launch flow, add a Vortex tool:
   - Target/Binary: `node.exe`
   - Start in: your deployed `Data\StarfieldChromaCompanion` folder
   - Arguments: `.\auto-start-sfse.mjs`
4. Run that tool when you want to play.

The auto-start helper starts the local launcher service if needed, starts the Chroma companion, launches Starfield through `sfse_loader.exe`, and lets the existing watchdog shut the companion down when Starfield closes.

You can also start the control panel manually from your Starfield Data folder with Node.js:

```cmd
cd /d "C:\Path\To\SteamLibrary\steamapps\common\Starfield\Data\StarfieldChromaCompanion"
node ".\launcher\starfield-chroma-launcher.mjs"
```

Then click `Start Companion + SFSE`, or start the companion first and then launch Starfield through SFSE.

The Vortex package installs the SFSE plugins to:

```text
Data\SFSE\Plugins\
```

It also installs the companion app to:

```text
Data\StarfieldChromaCompanion\
```

The Vortex/Nexus-clean package intentionally does not include Windows `.exe`, `.cmd`, `.bat`, or `.ps1` helper files, because those file types are more likely to trigger moderation or antivirus reputation checks on mod-hosting platforms.

## Install With Mod Organizer 2

MO2 should work, but it needs a slightly different setup because of MO2's virtual file system. Starfield and SFSE see enabled mod files through MO2's VFS. A separately started Node.js process does not automatically see that same virtual `Data` folder unless you launch it through MO2 or point it at the real MO2 mod folder.

The companion does not need to share Starfield's virtual `Data` folder at runtime. The SFSE plugin sends events to the companion over localhost/UDP. The companion mainly needs its own script and config file.

Suggested MO2 flow:

1. Install the clean Vortex package in MO2 and enable it.
2. Add `sfse_loader.exe` as an MO2 executable and launch Starfield through MO2.
3. Add a second MO2 executable for the companion:
   - Binary: `node.exe`
   - Start in: the mod's `StarfieldChromaCompanion` folder inside MO2's mods directory
   - Arguments: `.\mo2-start.mjs`
4. Run the companion entry from MO2.
5. In the control panel, click `Start Companion`.
6. Launch Starfield through SFSE from MO2.

The MO2 helper asks Windows to open the control panel automatically. If MO2 or a Windows security policy suppresses that browser handoff, open or bookmark the local panel directly:

```text
http://127.0.0.1:47322/
```

If that page loads, the launcher is running correctly; only the automatic browser-open action was blocked.

Do not use the control panel's `Start SFSE` button for an MO2-managed playthrough. That button launches `sfse_loader.exe` directly and will not use MO2's virtual file system.

If you launch the companion outside MO2, use the real path to the installed MO2 mod folder, not the virtual Starfield `Data` path. See [docs/MO2_SETUP.md](docs/MO2_SETUP.md) for the shorter MO2-specific setup guide.

## Virus Scan Notes

The Vortex package contains SFSE plugin DLLs. Some antivirus tools and mod managers may flag DLL-based game mods as suspicious until the files gain more reputation or are rescanned. The Vortex package does not include `.cmd`, `.bat`, or `.ps1` helper scripts.

The source code is public in this repository for transparency. If a file is quarantined, review the warning carefully and only restore or allowlist it if you are comfortable running SFSE plugin mods.

## Troubleshooting

| Problem | Check |
| --- | --- |
| Keyboard stays on Spectrum Cycling | Open Razer Chroma, go to `CHROMA APPS`, turn the global Chroma Apps toggle on, and enable `Starfield Chroma Companion`. |
| No effects in game | Make sure Starfield is launched through SFSE and the companion is running before or during gameplay. |
| Vortex users want one launch action | Add a Vortex tool that runs `node.exe` with `.\auto-start-sfse.mjs` from `Data\StarfieldChromaCompanion`. |
| Vortex install works but the companion does not start | Open Command Prompt in `Data\StarfieldChromaCompanion` and run `node ".\launcher\starfield-chroma-launcher.mjs"`. |
| MO2 panel does not open automatically | Open the bookmarked local panel at `http://127.0.0.1:47322/`. If it loads, the launcher is running and only the browser handoff was suppressed. |
| MO2 install does not react | Start the companion from the real MO2 mod folder or through an MO2 executable using `node.exe` and `.\mo2-start.mjs`. Launch SFSE through MO2. |
| Effects work once but stop later | Restart the companion, then use the Advanced Panel to run `Register/Test Chroma App`. |
| GitHub installer is blocked by Windows | Use the Nexus-clean package, or review the source/build yourself before choosing whether to allow the installer. |

## Manual Install From A Release

These instructions are for a normal manual install outside Vortex/MO2. They are not the recommended path for MO2 because MO2 uses a virtual file system.

1. Download the latest release zip.
2. Extract it somewhere outside your Starfield folder.
3. Install the SFSE plugins:

```cmd
install-plugin.cmd "C:\Path\To\SteamLibrary\steamapps\common\Starfield"
```

If Starfield is installed in the default Steam location, you can try:

```cmd
install-plugin.cmd
```

4. Start the control panel:

```cmd
launch-starfield-chroma.cmd
```

5. Click `Start Companion + SFSE`, or use the old direct SFSE helper:

```cmd
launch-starfield-sfse.cmd "C:\Path\To\SteamLibrary\steamapps\common\Starfield"
```

Do not launch `Starfield.exe` directly, or SFSE plugins will not load.

The installer copies both `StarfieldChromaCodex.dll` and `StarfieldChromaProbe.dll` when they are present in the release folder. The probe is used for menu-aware effects such as starmap, powers, temple transitions, and level-up screens.

## Configuration

Edit `starfield-chroma.config.json`:

```json
{
  "brightness": 1,
  "forceRefreshMs": 1000,
  "pulseBoost": 1.45,
  "logEvents": false,
  "accentDevices": true,
  "starfieldDir": "",
  "damageThresholds": {
    "chip": 1,
    "heavy": 25,
    "critical": 150
  }
}
```

Set `logEvents` to `true` only when debugging. `logHeartbeats` is intentionally off by default because it is noisy.

## Current Status

This is not an official Bethesda or Razer project. It is a community-built integration and may need updates when Starfield, SFSE, Synapse, or the Chroma SDK changes.

Known limitations:

- PC-only.
- Requires SFSE.
- Requires the companion app to keep running while the game is active.
- Some game moments are detected through reliable event patterns rather than direct official Starfield APIs.
- This alpha has been tuned on one local setup and still needs broader hardware/game-version testing.
- Multi-device Chroma support is now active for keyboard, mouse, mousepad, headset, and chromalink devices. Hardware behavior can still vary by device model, so reports from Naga-class mice, Razer headsets, mousepads, and Chroma Link setups are especially useful.

## Alpha Highlights

- Scanner anomaly proximity sustain with stronger intensity near active distortions.
- Temple, portal, and power effects through video/loading/menu patterns.
- Grav jump sequence: starmap charge-up, loading warp, and takeoff engine sweep.
- Distinct visual language for level-up, powers, damage, O2/gas, radiation, scanner, reload, combat, and ship moments.

## Build

The repository contains:

- `sfse-plugin/`: main SFSE plugin source.
- `commonlibsf-probe/`: experimental CommonLibSF event probe source.
- `companion/`: Node.js Chroma companion.
- `tools/`: local test event helpers.

Build setup is still being cleaned up for public contributors. For now, release packages are the recommended way to use the project.

The CommonLibSF probe expects `COMMONLIBSF_ROOT` to point to a local CommonLibSF checkout, or a `commonlibsf` folder next to `commonlibsf-probe`.

## License

GPL-3.0-or-later. See `LICENSE`.
