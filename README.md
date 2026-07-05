# Starfield Chroma Companion

![Starfield Chroma Companion banner](docs/images/starfield-chroma-header.png)

Reactive Razer Chroma lighting for Starfield, powered by SFSE game events and a small Node.js companion app.

[Download on Nexus Mods](https://www.nexusmods.com/starfield/mods/) · [GitHub releases](https://github.com/michaelstienstra25-sudo/starfield-chroma-companion/releases) · [Report an issue](https://github.com/michaelstienstra25-sudo/starfield-chroma-companion/issues)

This project is currently an early PC-only prototype. It is built for players who run Starfield through SFSE and use Razer Synapse/Chroma devices.

![Starfield Chroma Companion preview](docs/images/starfield-chroma-gallery.png)

## Why Use It?

Starfield Chroma Companion turns your Razer Chroma setup into a reactive cockpit, scanner, combat, and exploration lighting layer. It is tuned around real gameplay moments such as scanner anomalies, damage, oxygen warnings, grav jumps, temple/power moments, and level-up screens.

This is an unofficial community project and is not affiliated with Bethesda, Razer, or Nexus Mods.

## Features

- Reactive keyboard zones for movement, sprint, jump, scanner, interact, reload, quickslots, menus, ship controls, and systems.
- Game-event lighting for weapon fire, reloads, ammo changes, combat, hits, damage, bleedout, radiation/gas, O2 danger, loading, saving, and UI menus.
- Scanner anomaly proximity effect with sustained purple/white glitch lighting while the scanner is active.
- Temple, portal, power, Powers menu, and level-up effects with distinct visual styles.
- Optional accent colors for mouse, mousepad, headset, and chromalink devices.
- Configurable brightness, damage thresholds, logging, Chroma SDK URL, UDP port, and stale timeout.

## Requirements

- Starfield for PC
- SFSE compatible with your installed Starfield version
- Razer Synapse with Chroma enabled
- Local Razer Chroma SDK REST service
- Node.js 20 or newer

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
3. Start the companion from your Starfield Data folder with Node.js:

```cmd
cd /d "C:\Path\To\SteamLibrary\steamapps\common\Starfield\Data\StarfieldChromaCompanion"
node ".\companion\starfield-chroma-companion.mjs"
```

4. Launch Starfield through SFSE.

The Vortex package installs the SFSE plugins to:

```text
Data\SFSE\Plugins\
```

It also installs the companion app to:

```text
Data\StarfieldChromaCompanion\
```

The Vortex package intentionally does not include Windows `.cmd` helper scripts, because some antivirus tools and mod managers flag script files more aggressively. The manual package still includes helper scripts for users who prefer them.

## Virus Scan Notes

The Vortex package contains SFSE plugin DLLs. Some antivirus tools and mod managers may flag DLL-based game mods as suspicious until the files gain more reputation or are rescanned. The Vortex package does not include `.cmd`, `.bat`, or `.ps1` helper scripts.

The source code is public in this repository for transparency. If a file is quarantined, review the warning carefully and only restore or allowlist it if you are comfortable running SFSE plugin mods.

## Manual Install From A Release

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

4. Start the companion:

```cmd
start-companion.cmd
```

5. Launch Starfield through SFSE:

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
  "pulseBoost": 1.45,
  "logEvents": false,
  "accentDevices": true,
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
