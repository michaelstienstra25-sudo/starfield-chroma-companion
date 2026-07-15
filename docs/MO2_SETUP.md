# Mod Organizer 2 Setup

MO2 works best when Starfield itself is launched through MO2, while the Chroma companion runs from the real mod folder.

The SFSE plugin sends game events to the companion over localhost/UDP, so the companion does not need to see MO2's virtual `Data` folder at runtime. It only needs its own files and config.

## Recommended MO2 Flow

1. Install the clean Vortex-style package in MO2 and enable it.
2. Add `sfse_loader.exe` as a normal MO2 executable for Starfield.
3. Add a second MO2 executable:
   - Title: `Starfield Chroma Companion`
   - Binary: `node.exe`
   - Start in: the mod's real `StarfieldChromaCompanion` folder inside MO2's `mods` directory
   - Arguments: `.\mo2-start.mjs`
4. Run `Starfield Chroma Companion` from MO2.
5. The control panel opens in your browser. Click `Start Companion`.
6. Launch Starfield through your MO2 `sfse_loader.exe` executable.

## Vortex/Direct Auto-Start Helper

The package also includes `auto-start-sfse.mjs` for Vortex or direct non-MO2 setups. It starts the companion and launches `sfse_loader.exe` in one step.

For MO2, the split flow above is still recommended because it keeps Starfield/SFSE inside MO2's virtual file system. Only use `auto-start-sfse.mjs` from MO2 if you have tested that your MO2 setup keeps child processes inside the VFS.

## Important

Do not use the control panel's `Start SFSE` button for an MO2-managed playthrough. That button launches `sfse_loader.exe` directly and will not use MO2's virtual file system.

For MO2, use the control panel only to start the Chroma companion. Launch the game itself from MO2.

If MO2 shows that it is locked after opening the companion, unlock MO2 and then launch SFSE from MO2. The `mo2-start.mjs` helper is designed to start the control panel in the background and then exit, so MO2 should usually stay usable.

## Troubleshooting

- If the control panel does not open, make sure Node.js 20 or newer is installed and that `node.exe` works from Command Prompt.
- If the companion starts but there are no effects, make sure Razer Chroma Apps is enabled and Starfield was launched through SFSE from MO2.
- If the panel cannot find Starfield, set the Starfield folder manually in Settings. This should be the real folder containing `sfse_loader.exe`.
