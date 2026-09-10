# Rebuild Failsafe — Remote Screen Incremental Rebuild

## Date: 2026-09-10

## Purpose
If the rebuild goes wrong, these notes help revert or recover.

## Pre-rebuild state
- **Latest commit on main:** `1738521` (16 audit fixes)
- **All 21 fixes from this session are in main:** joystick reversal, d-pad hold-resend, mode sync, C1-C5 critical fixes, H1-H7 + M1-M10 audit fixes
- **Typecheck passes, expo-doctor 18/18**

## Files being rebuilt (and ONLY these)
1. `mobile/src/screens/RemoteControlScreen.tsx` — currently 685 lines, rebuilding to ~250
2. `mobile/src/components/tools/DriveControls.tsx` — currently 1034 lines, rebuilding to ~600

## Files NOT being touched (keep safe)
- `useControlHub.ts` (782 lines) — connection/mode/speed/servo/NAV logic
- `carProtocol.ts` — wire protocol helpers
- `types.ts` — shared type definitions
- `roboCarCatalog.ts` — mode definitions
- `controlConstants.ts` — timing constants
- `ModeChooser.tsx` — mode dropdown
- `OledDisplay.tsx` — OLED mirror
- `SensorGrid.tsx` — sensor tiles
- `DroneControls.tsx` — drone controls
- `ProjectInfo.tsx` — about card
- `ToolsScreen.tsx` — Control Panel (unchanged)
- `sppService.ts` — SPP transport
- `carModeService.ts` — mode catalogue fetch

## Revert procedure
If rebuild breaks and needs revert:
```bash
cd "E:\GENUM SOLUTIONS PVT LTD\Project\genumsolutions-app\mobile"
git log --oneline -5   # find last good commit
git revert HEAD        # revert last commit
# or for specific file:
git checkout 1738521 -- src/screens/RemoteControlScreen.tsx
git checkout 1738521 -- src/components/tools/DriveControls.tsx
```

## Phase plan
1. **Phase 1:** RemoteControlScreen shell (chrome row + layout skeleton)
   - Commit: `fix(remote,rebuild): phase 1 — clean chrome row + standard gamepad layout`
   - OTA: push immediately after typecheck passes
2. **Phase 2:** DriveControls rebuild (joystick + d-pad touch handling)
   - Commit: `fix(remote,rebuild): phase 2 — clean dual joystick + dual d-pad`
   - OTA: push immediately after typecheck passes
3. **Phase 3:** OLED + mode sync verification
   - Commit: `fix(remote,rebuild): phase 3 — OLED placement + mode sync verify`
4. **Phase 4:** Polish
   - Commit: `fix(remote,rebuild): phase 4 — settings, disconnect, E-stop polish`

## Key design decisions
- Chrome row: NO horizontal ScrollView (caused layout shift). Use flex-row with flexWrap or truncation.
- OLED: stays as `oledSlot` prop passed into DriveControls, rendered centered between joysticks/pads
- DualJoystick: one PanResponder surface, sticks at 25%/75% width, OLED at 50%
- DualDpad: one PanResponder surface, left pad F/B/L/R/C + right pad L/R/C
- Touch model: locationX/locationY (surface-local, no window math)
- Hold-resend: 30ms interval, only resend for sticks/pads with active touches
- NAV: routed through same PanResponder surface via navActiveRef
- E-stop: absolute positioned FAB, bottom-right, z-10

## What to verify after each phase
- Typecheck: `npx tsc --noEmit`
- Expo doctor: `npx expo-doctor`
- Device test: connect to car, verify joystick/d-pad sends commands, mode sync works
