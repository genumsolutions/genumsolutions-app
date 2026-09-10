# Rebuild Failsafe — Remote Screen Rebuild (Completed)

## Date: 2026-09-10

## Branch Policy
- **`backup`** — Dedicated backup branch. Frozen at round 2 baseline (`a23ec3b`). Used for full revert only.
- **`main`** — Testing branch. All rebuild work lands here first.
- **`dev`** — Development branch. **NOT a backup branch.** Do not use for backup or revert.

## Revert procedure (full)
If the entire rebuild needs to be discarded:
```bash
cd "E:\GENUM SOLUTIONS PVT LTD\Project\genumsolutions-app\mobile"
git checkout main
git reset --hard backup    # reset main to the pre-rebuild backup state
git push origin main --force
```

## Revert procedure (partial — specific files)
```bash
# Restore files from the backup branch
git checkout backup -- src/screens/RemoteControlScreen.tsx
git checkout backup -- src/components/tools/DriveControls.tsx
```

## Revert procedure (single commit)
```bash
git revert HEAD           # revert the last commit
```

## Rebuild state
- **Phase 1 complete:** RemoteControlScreen rebuilt (685→300 lines) — commit `fd8ab87`
- **Phase 2 complete:** DriveControls rebuilt (1034→699 lines) — commit `94e5e41`
- **Phase 3 complete:** OLED + mode sync verified
- **Phase 4 complete:** Polish verified, all fixes intact
- **D-pad fix:** Standard 3×3 cross grid layout — commit `999ad93`
- **Typecheck passes, expo-doctor 18/18**

## Files rebuilt
1. `mobile/src/screens/RemoteControlScreen.tsx` — chrome row, gamepad layout, disconnect dialog
2. `mobile/src/components/tools/DriveControls.tsx` — DualJoystick + DualDpad, standard cross layout

## Files NOT touched
- `useControlHub.ts` — connection/mode/speed/servo/NAV logic
- `carProtocol.ts` — wire protocol helpers
- `types.ts` — shared type definitions
- `roboCarCatalog.ts` — mode definitions
- `controlConstants.ts` — timing constants
- `ModeChooser.tsx` — mode dropdown
- `OledDisplay.tsx` — OLED mirror
- `SensorGrid.tsx` — sensor tiles
- `DroneControls.tsx` — drone controls
- `ProjectInfo.tsx` — about card
- `ToolsScreen.tsx` — Control Panel
- `sppService.ts` — SPP transport

## Key design decisions
- Chrome row: NO horizontal ScrollView (caused layout shift)
- OLED: `oledSlot` prop passed into DriveControls, centered between joysticks/pads
- DualJoystick: one PanResponder surface, sticks at 25%/75% width, OLED at 50%
- DualDpad: standard 3×3 cross grid (56px cells), all 5 cells always visible
- Touch model: locationX/Y surface-local, no window math
- Hold-resend: 30ms interval, only resend for sticks/pads with active touches
- NAV: routed through same PanResponder surface via navActiveRef
- E-stop: absolute positioned FAB, bottom-right, z-10

## Device test checklist
- [ ] Joystick: left stick drives, right stick steers (2WD1M)
- [ ] D-pad: all 5 cells visible, correct cross shape, correct icons
- [ ] D-pad: left pad F/B, right pad L/R, center cells stop
- [ ] Both sticks/pads work simultaneously
- [ ] Mode from car button reflects in app immediately
- [ ] OLED shows mode | speed/steer, body direction, status bar
- [ ] Chrome row: Back/Select/Mode/Speed all functional
- [ ] E-stop: stops car immediately
- [ ] Settings: steer limit + trim adjust correctly
- [ ] Disconnect: confirmation dialog, safe stop sent
