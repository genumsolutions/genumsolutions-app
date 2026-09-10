# Session Notes — UI Audit Fixes (H1–H7, M1–M10)

## Date: 2026-09-10

### What was done

16 visual/UX fixes across 6 files, addressing contrast, readability, consistency, and polish issues found in the full Control Panel + Remote audit.

### High priority fixes

| Fix | File | Change |
|-----|------|--------|
| **H1** | DriveControls.tsx | D-pad active cell: `bg-navy border-blue-400` → `bg-blue-600 border-blue-300` |
| **H2** | OledDisplay.tsx | Compact text bumped: `9px→10px`, `10px→11px` for all OLED labels |
| **H3** | OledDisplay.tsx | Bottom bar: `(driveStatus \|\| '').toUpperCase()` → `(driveStatus \|\| 'READY').toUpperCase()` |
| **H4** | DriveControls.tsx | PID card headers: all "PID Tuning" → unique "Kp" / "Ki" / "Kd" / "OUT" / "OFF" |
| **H5** | ToolsScreen.tsx | SPP "Not supported": muted text → amber banner with border |
| **H6** | ModeChooser.tsx | Cycle button: `bg-navy` → `border-white/15 bg-white/10` (matches trigger weight) |
| **H7** | ModeChooser.tsx | Dropdown inactive text: `text-white` → `text-slate-300` (active stays white) |

### Medium priority fixes

| Fix | File | Change |
|-----|------|--------|
| **M1** | ToolsScreen.tsx | WiFi URL TextInput hidden when `wifiConnected` (saves vertical space) |
| **M2** | ModeChooser.tsx | Trigger max-width: `180px` → `220px` (less truncation on long mode names) |
| **M3** | RemoteControlScreen.tsx | Settings dropdown `top: 76` → `Math.max(insets.top, 8) + 48` (safe-area aware) |
| **M4** | RemoteControlScreen.tsx | E-stop FAB: `bottom: 8` → `bottom: 16`, added `zIndex: 10` |
| **M5** | RemoteControlScreen.tsx | Disconnect modal: "Disconnected. Exit remote?" → "Disconnect and exit?" |
| **M7** | ProjectInfo.tsx | Default expanded: `useState(true)` → `useState(false)` (connection card above fold) |
| **M9** | DroneControls.tsx | Added `Vibration.vibrate()` to Take Off (10ms), Land (10ms), Emergency (50ms) |
| **M10** | DroneControls.tsx | Added "90° center" text below gimbal Pan and Tilt sliders |

### Skipped
- **M6** (scroll-to-active in ModeChooser): Only 9 items, always visible
- **M8** (CAPABILITY_LABELS duplication): Small map, low change frequency

### Files changed
- `mobile/src/components/tools/DriveControls.tsx` — H1, H4
- `mobile/src/components/tools/OledDisplay.tsx` — H2, H3
- `mobile/src/components/tools/ModeChooser.tsx` — H6, H7, M2
- `mobile/src/components/tools/ProjectInfo.tsx` — M7
- `mobile/src/components/tools/DroneControls.tsx` — M9, M10
- `mobile/src/screens/ToolsScreen.tsx` — H5, M1
- `mobile/src/screens/RemoteControlScreen.tsx` — M3, M4, M5
- `mobile/guide/SESSION-NOTES.md` — this file

### Verification
- `npx tsc --noEmit` — passed clean
- `npx expo-doctor` — 18/18 checks passed

### Device test checklist (owner)
- [ ] H1: D-pad active cell clearly visible (bright blue on dark)
- [ ] H2: OLED text readable in compact mode (especially AUTO dashboard)
- [ ] H3: OLED bottom bar shows "READY" when no drive status
- [ ] H4: PID cards show Kp/Ki/Kd/OUT/OFF as headers
- [ ] H5: iOS users see amber "Bluetooth SPP not supported" banner
- [ ] H6: ModeChooser cycle button same visual weight as trigger
- [ ] H7: Inactive mode names dimmer than active in dropdown
- [ ] M1: WiFi URL field hides when connected
- [ ] M2: Long mode names less truncated in trigger
- [ ] M3: Settings dropdown not overlapping chrome row on notch devices
- [ ] M4: E-stop FAB not overlapping d-pad cells
- [ ] M5: Disconnect modal says "Disconnect and exit?" (not "Disconnected")
- [ ] M7: "About this project" collapsed by default on first load
- [ ] M9: Drone buttons vibrate on press
- [ ] M10: Gimbal sliders show "90° center" reference
