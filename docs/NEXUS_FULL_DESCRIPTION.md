Source code and releases:
https://github.com/michaelstienstra25-sudo/starfield-chroma-companion

The source code is public on GitHub for transparency. The current Nexus/Vortex package contains SFSE plugin DLLs because they are required for Starfield event detection. The clean Nexus package does not include .exe, .cmd, .bat, or .ps1 helper scripts.

What this mod does:

Starfield Chroma Companion adds reactive Razer Chroma lighting to Starfield on PC. It is not a gameplay/content mod. It is an immersion/RGB companion for players who use Starfield with SFSE and Razer Chroma hardware.

It makes supported Razer Chroma devices react to in-game moments such as scanner anomalies, combat, weapon fire, reloads, damage, O2/gas/radiation warnings, grav jumps, level-up/power moments, menus, saves, loads, and ship moments.

The alpha includes a Starfield-styled launcher/control panel with status display, Settings, a Razer Chroma shortcut, and an Advanced Panel for Chroma SDK checks, effect previews, multi-device focus tests, and visible start/stop confirmation pulses.

Architecture note: the SFSE plugin DLLs do not talk to Razer directly. They detect Starfield/SFSE events and send them locally to the Node.js companion. The companion talks to the local Razer Chroma SDK and drives keyboard, mouse, mousepad, headset, and Chroma Link effects.

Multi-device Chroma support is now active for keyboard, mouse, mousepad, headset, and chromalink devices. Mouse devices use custom action accents for combat, damage, scanner anomalies, grav/power moments, O2/gas warnings, rewards, menus, and idle state. Headset, mousepad, and chromalink devices receive state-aware pulses. The Settings and Advanced Panel now include effect presets and per-device intensity controls, so users can choose a calmer, more readable, or more combat-heavy feel. Hardware behavior can still vary by device model, so I am still looking for reports from Naga-class mice, Razer headsets, mousepads, and Chroma Link setups.

Required software:

- Starfield for PC
- SFSE compatible with your installed Starfield version
- Node.js 20 or newer
- Razer Synapse
- Razer Chroma / Chroma SDK enabled
- Chroma Apps enabled in Razer Chroma

Installation instructions

Vortex:

1. Download the Vortex package.
2. Install and enable it with Vortex.
3. Optional one-step Vortex tool:
   - Target/Binary: node.exe
   - Start in: your deployed Data\StarfieldChromaCompanion folder
   - Arguments: .\auto-start-sfse.mjs
4. Run that Vortex tool to start the companion and launch Starfield through SFSE.

The auto-start helper starts the local launcher service if needed, starts the Chroma companion, launches Starfield through sfse_loader.exe, and lets the existing watchdog shut the companion down when Starfield closes.

Manual control panel option:

```cmd
cd /d "C:\Path\To\SteamLibrary\steamapps\common\Starfield\Data\StarfieldChromaCompanion"
node ".\launcher\starfield-chroma-launcher.mjs"
```

Then click Start Companion + SFSE.

Use SDK Check only to verify that the local Razer SDK is reachable. Use Test Effects to confirm the actual companion pipeline and device takeover. If devices stay on Spectrum Cycling, open Razer Chroma, go to Chroma Apps, enable the global Chroma Apps toggle, and enable Starfield Chroma Companion.

Mod Organizer 2:

MO2 can work, but the companion must be launched from the real mod folder or through MO2. Starfield/SFSE run under MO2's virtual file system, while a normal external Node.js process does not automatically see that virtual Data folder.

Suggested MO2 setup:

1. Install the clean Vortex package in MO2 and enable it.
2. Add sfse_loader.exe as an MO2 executable.
3. Add a second MO2 executable:
   - Binary: node.exe
   - Start in: the mod's StarfieldChromaCompanion folder inside MO2's mods directory
   - Arguments: .\mo2-start.mjs
4. Run the companion entry from MO2.
5. In the control panel, click Start Companion.
6. Launch Starfield through SFSE from MO2.

Do not use the control panel's Start SFSE button for an MO2-managed playthrough. That button launches sfse_loader.exe directly and will not use MO2's virtual file system.

Do not launch Starfield.exe directly, or SFSE plugins will not load.

Optional GitHub setup assistant:

GitHub releases may also include an optional Windows setup assistant for users who prefer a guided install. Nexus/Vortex users should use the clean Nexus package.

Note: DLL-based SFSE mods can be scrutinized by antivirus tools or mod-hosting scanners. The current Nexus-clean package removes helper executables and command/PowerShell scripts. The source code is available on GitHub for transparency.

Looking for testers with different Razer Chroma setups. Feedback, bug reports, device compatibility notes, and gameplay clips are welcome.
