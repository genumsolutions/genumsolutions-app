# Session Notes — Remote Screen Rebuild + UI Audit Fixes

## Date: 2026-09-10

### Summary
Complete rebuild of the remote screen from scratch, plus 21 prior fixes (joystick, d-pad, mode sync, critical UI, audit items).

### Rebuild (phases 1-4)

**Phase 1: RemoteControlScreen** (fd8ab87)
- Rebuilt from 685 lines → ~300 lines
- Chrome row: simple flex-row, NO ScrollView (fixed layout shift)
- Standard gamepad layout: chrome row → drive deck → E-stop FAB
- Kept: ValueStrip, StepperPill, NAV state machine, disconnect dialog, settings dropdown

**Phase 2: DriveControls** (94e5e41)
- Rebuilt from 1034 lines → ~650 lines
- DualJoystick: one PanResponder surface, sticks at 25%/75% width, OLED centered
- DualDpad: one PanResponder surface, left pad (F/B/L/R/C) + right pad (L/R/C)
- Touch model: locationX/Y surface-local, no window math
- Hold-resend at 30ms, NAV routing through same surface
- All prior fixes preserved: joystick reversal, d-pad hold-resend, contrast, PID headers

**Phase 3-4: Verification**
- OLED placement: centered between joysticks/pads (128×64, pointer-events=none)
- Mode sync: useControlHub.applyTelemetry mirrors mode from STATE;MODE= frames
- REQ_STATE: called 200ms after 'connected' status
- All earlier fixes intact: H1-H7, M1-M10, C1-C5

### Prior fixes included in this rebuild
- Joystick reversal (servoCenter + dev)
- D-pad hold-resend (cache last drive/servo when pad inactive)
- Mode sync (removed [activeMode] deps, added REQ_STATE on connect)
- C1-C5: chrome scroll, back label, status dot, disconnect confirm, mode chooser overlay
- H1-H7: d-pad contrast, OLED text, PID headers, SPP visibility, mode chooser colors
- M1-M10: WiFi URL hidden, trigger width, safe-area, E-stop position, disconnect title, project info collapsed, drone haptic, gimbal center markers

### Files changed
- `mobile/src/screens/RemoteControlScreen.tsx` — rebuilt
- `mobile/src/components/tools/DriveControls.tsx` — rebuilt
- `mobile/guide/REBUILD-FAILSAFE.md` — revert procedure
- `mobile/guide/SESSION-NOTES.md` — this file

### Device test checklist
- [ ] Joystick: left stick drives, right stick steers (2WD1M)
- [ ] D-pad: left pad F/B, right pad L/R, center cells stop
- [ ] Both sticks/pads work simultaneously
- [ ] Mode from car button reflects in app immediately
- [ ] OLED shows mode | speed/steer, body direction, status bar
- [ ] Chrome row: Back/Select/Mode/Speed all functional
- [ ] E-stop: stops car immediately
- [ ] Settings: steer limit + trim adjust correctly
- [ ] Disconnect: confirmation dialog, safe stop sent
