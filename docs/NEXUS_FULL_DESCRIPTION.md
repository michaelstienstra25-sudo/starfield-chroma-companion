Source code and releases:
https://github.com/michaelstienstra25-sudo/starfield-chroma-companion

The source code is public on GitHub for transparency. The clean Vortex package contains SFSE plugin DLLs because they are required for Starfield event detection. It does not include .cmd, .bat, or .ps1 helper scripts.

What this mod does:

Starfield Chroma Companion adds reactive Razer Chroma lighting to Starfield on PC. It is not a gameplay/content mod. It is an immersion/RGB companion for players who use Starfield with SFSE and Razer Chroma hardware.

It makes supported Razer Chroma devices react to in-game moments such as scanner anomalies, combat, weapon fire, reloads, damage, O2/gas/radiation warnings, grav jumps, level-up/power moments, menus, saves, loads, and ship moments.

The alpha includes a local browser control panel for starting the companion, launching SFSE, checking Chroma SDK status, testing effects, and tuning brightness/pulse settings.

The manual/local package also includes an optional Windows tray helper. The clean Vortex package avoids .cmd/.bat/.ps1 helper scripts to reduce false-positive quarantine risk.

Required software:

- Starfield for PC
- SFSE compatible with your installed Starfield version
- Node.js 20 or newer
- Razer Synapse
- Razer Chroma / Chroma SDK enabled

Installation instructions

Vortex:

1. Download the Vortex package.
2. Install and enable it with Vortex.
3. After Vortex deploys the mod, open Command Prompt and run:

```cmd
cd /d "C:\Path\To\SteamLibrary\steamapps\common\Starfield\Data\StarfieldChromaCompanion"
node ".\launcher\starfield-chroma-launcher.mjs"
```

4. In the control panel, click Start Companion + SFSE.

Mod Organizer 2:

MO2 can work, but the companion must be launched from the real mod folder or through MO2. Starfield/SFSE run under MO2's virtual file system, while a normal external Node.js process does not automatically see that virtual Data folder.

Suggested MO2 setup:

1. Install the clean Vortex package in MO2 and enable it.
2. Add sfse_loader.exe as an MO2 executable.
3. Add a second MO2 executable:
   - Binary: node.exe
   - Start in: the mod's StarfieldChromaCompanion folder inside MO2's mods directory
   - Arguments: .\launcher\starfield-chroma-launcher.mjs
4. Start the control panel, start the companion, then launch Starfield through SFSE from MO2.

Manual:

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

5. Click Start Companion + SFSE.

Do not launch Starfield.exe directly, or SFSE plugins will not load.

Note: Nexus may still flag DLL-based SFSE mods as suspicious until scanned/reviewed. The source code is available on GitHub for transparency.

Looking for testers with different Razer Chroma setups. Feedback, bug reports, device compatibility notes, and gameplay clips are welcome.
