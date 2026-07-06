# Promotion Drafts

## Short Tagline

Reactive Razer Chroma lighting for Starfield, powered by SFSE game events.

## Nexus Description Add-On

Source code and releases:
https://github.com/michaelstienstra25-sudo/starfield-chroma-companion

The source code is public on GitHub for transparency. The Vortex package contains SFSE plugin DLLs because they are required for Starfield event detection. It does not include `.cmd`, `.bat`, or `.ps1` helper scripts.

The alpha now includes a local browser control panel for starting the companion, launching SFSE, testing effects, checking Chroma SDK connectivity, and tuning brightness/pulse settings.

Looking for testers with different Razer Chroma setups. Feedback, bug reports, device compatibility notes, and short gameplay clips are welcome.

## Nexus Pinned Comment

Thanks for checking out Starfield Chroma Companion.

This is an early alpha for PC players using Starfield through SFSE and Razer Chroma devices. The current Vortex package installs the SFSE plugins and companion files, but you still need Node.js and Razer Synapse/Chroma running.

Looking for testers with different keyboards, mice, mousepads, headsets, Starfield versions, and SFSE versions. If something works or breaks, please include your device model, Starfield/SFSE version, and what happened in-game.

Source code is available on GitHub:
https://github.com/michaelstienstra25-sudo/starfield-chroma-companion

## Nexus Reply: Mod Organizer 2

Yes, MO2 support should be possible, but the setup is different from normal manual/Vortex installs.

You are right about the virtual file system point. Under MO2, SFSE and Starfield see enabled mod files through MO2's VFS, while a separately started Node.js process may not see that same virtual Data folder unless it is launched through MO2 or pointed directly at the real MO2 mod folder.

The companion does not need to share Starfield's virtual Data folder at runtime. The SFSE plugin sends events to the companion over localhost/UDP. The companion mainly needs its own script and config file.

The likely MO2 flow is:

1. Install the clean Vortex package in MO2 and enable it.
2. Add `sfse_loader.exe` as an MO2 executable and launch Starfield through MO2.
3. Add a second MO2 executable for the control panel:
   - Binary: `node.exe`
   - Start in: the mod's `StarfieldChromaCompanion` folder inside MO2's mods directory
   - Arguments: `.\launcher\starfield-chroma-launcher.mjs`
4. Open the control panel, start the companion, then launch Starfield through SFSE from MO2.

I have updated the description/docs to make this clearer.

## Reddit / Discord Post

I released an early alpha of Starfield Chroma Companion, a PC mod that adds reactive Razer Chroma lighting to Starfield using SFSE game events and a small local Node.js companion app.

It reacts to combat, reloads, damage, oxygen/gas/radiation warnings, scanner activity, scanner anomalies, grav jump charge-up/warp, temple/power moments, level-up screens, saves, loads, and ship moments.

Nexus Mods:
https://www.nexusmods.com/starfield/mods/

Source code / releases:
https://github.com/michaelstienstra25-sudo/starfield-chroma-companion

It is an alpha and I am looking for testers with different Razer Chroma setups. If you try it, please share your keyboard/mouse model, Starfield/SFSE version, and which effects worked or failed.

## Demo Video Shot List

Record 30-60 seconds showing:

1. Keyboard idle/exploration lighting.
2. Scanner open and scanner anomaly effect.
3. Weapon fire/reload/combat flash.
4. Damage or oxygen/gas warning.
5. Grav jump charge-up and warp.
6. Level-up or Powers/temple effect.

Use the title:

Starfield Chroma Companion - Reactive Razer Chroma SFSE Mod

Suggested YouTube description:

Reactive Razer Chroma lighting for Starfield on PC, powered by SFSE game events and a local companion app. Early alpha, looking for testers.

GitHub:
https://github.com/michaelstienstra25-sudo/starfield-chroma-companion
