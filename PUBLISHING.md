# Publishing Notes

## GitHub

Repository:

https://github.com/michaelstienstra25-sudo/starfield-chroma-companion

Release:

https://github.com/michaelstienstra25-sudo/starfield-chroma-companion/releases/tag/v0.1.0-alpha

## Nexus Mods Draft

### Name

Starfield Chroma Companion

### Short Description

Reactive Razer Chroma lighting for Starfield using SFSE game events, menu detection, scanner anomalies, powers, combat, damage, grav jumps, and level-up effects.

### Category

Utilities / User Interface / Miscellaneous

### Requirements

- Starfield for PC
- SFSE compatible with the installed Starfield version
- Node.js 20 or newer
- Razer Synapse with Chroma enabled
- Razer Chroma SDK service running locally

### Long Description

Starfield Chroma Companion adds reactive Razer Chroma lighting to Starfield. It uses SFSE game events, a CommonLibSF menu probe, and a small Node.js companion app to drive Razer Chroma devices through the local Chroma SDK.

The current alpha includes a local browser control panel for starting the companion, launching SFSE, checking Chroma SDK status, testing effects, and tuning brightness/pulse settings.

This alpha includes lighting for combat, weapon fire, reloads, damage, bleedout, O2/gas/radiation, scanner activity, scanner anomalies, temple and power moments, Powers menu, level-up, starmap, grav jump charge-up, warp/loading, takeoff, saves, loads, and ship moments.

Highlights:

- Scanner anomaly proximity sustain with stronger purple/white glitch intensity near active distortions.
- Temple, portal, and power effects through video/loading/menu patterns.
- Grav jump sequence with starmap charge-up, loading warp, and takeoff engine sweep.
- Distinct visual language for level-up, powers, damage, O2/gas/radiation, scanner, reload, combat, and ship moments.
- Configurable brightness, logging, damage thresholds, UDP port, and Chroma SDK endpoint.

This is an early alpha. It has been tuned on one local setup and needs wider testing across Starfield versions, SFSE versions, and Razer hardware.

### Install

Vortex:

1. Download the Vortex package.
2. Install and enable it with Vortex.
3. After Vortex deploys the mod, open Command Prompt and run the control panel:

```cmd
cd /d "C:\Path\To\SteamLibrary\steamapps\common\Starfield\Data\StarfieldChromaCompanion"
node ".\launcher\starfield-chroma-launcher.mjs"
```

4. Click `Start Companion + SFSE`, or start the companion first and then launch Starfield through SFSE.

Mod Organizer 2:

MO2 should work, but the companion must be launched in a way that can see its real files. Starfield and SFSE run through MO2's virtual file system, while a separately started Node.js process does not automatically see that VFS.

1. Install the clean Vortex package in MO2 and enable it.
2. Add `sfse_loader.exe` as an MO2 executable and launch Starfield through MO2.
3. Add a second MO2 executable for the companion:
   - Binary: `node.exe`
   - Start in: the mod's `StarfieldChromaCompanion` folder inside MO2's mods directory
   - Arguments: `.\launcher\starfield-chroma-launcher.mjs`
4. Open the control panel, start the companion, then launch Starfield through SFSE from MO2.

Manual:

These instructions are for a normal manual install outside Vortex/MO2.

1. Download the manual release zip.
2. Extract it outside the Starfield folder.
3. Run:

```cmd
install-plugin.cmd "C:\Path\To\SteamLibrary\steamapps\common\Starfield"
```

4. Start the control panel:

```cmd
launch-starfield-chroma.cmd
```

5. Click `Start Companion + SFSE`, or use the direct SFSE helper:

```cmd
launch-starfield-sfse.cmd "C:\Path\To\SteamLibrary\steamapps\common\Starfield"
```

Do not launch `Starfield.exe` directly, or SFSE plugins will not load.

### Files

Main file:

StarfieldChromaCompanion-v0.1.0-alpha-vortex.zip

Optional/manual file:

StarfieldChromaCompanion-v0.1.0-alpha.zip

### Compatibility

PC only. This does not work on Xbox/console. It requires SFSE, a Windows companion app, and Razer Chroma SDK.

### Tags

Razer Chroma, SFSE, lighting, RGB, utility, companion app, scanner, grav jump, immersion

## Razer Chroma Workshop Draft

Submit only after the installer and docs have had more testing.

Suggested title:

Starfield Chroma Companion

Suggested description:

Reactive Razer Chroma lighting integration for Starfield on PC, using SFSE game events and a local companion app for combat, scanner, powers, anomalies, grav jumps, and level-up effects.
