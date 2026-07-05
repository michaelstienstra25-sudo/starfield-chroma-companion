# Starfield Chroma Companion

Reactive Razer Chroma lighting for Starfield, powered by SFSE game events and a small Node.js companion app.

This project is currently an early PC-only prototype. It is built for players who run Starfield through SFSE and use Razer Synapse/Chroma devices.

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

## Install With Vortex

1. Download the Vortex package from Nexus Mods.
2. Install and enable it with Vortex.
3. Start the companion from your Starfield Data folder:

```cmd
Data\StarfieldChromaCompanion\start-companion.cmd
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
