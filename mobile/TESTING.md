# TESTING — Physical Device Test Checklist

> Target: **v1.5.5** (versionCode 13) · Android APK (`genum-solutions-1.5.5-arm64-v8a.apk`)
> Scope: primarily the **Tools screen** (IoT & Remote Controller); quick regression passes for the rest of v1.5.5.
> Companion doc: `GUIDE.md` (project root) — session log + release state.
> Status: **Pre-flight verified 2026-09-03** (no device needed — see log below). Sections A–H still require a physical phone + car hardware.

---

## Pre-flight checks (no device — verified 2026-09-03)

These were run on the build machine against the published artifact and do not need a phone:

1. ✅ **Published APK == local build** — SHA-256 of `genum-solutions-latest.apk` on Supabase matches `releases/genum-solutions-1.5.5-arm64-v8a.apk` (`f4c7cff2a94fd16f9599c2262694278dc971f2f3fb963c86a81a2bbfda3c2fd2`).
2. ✅ **Release-signed** — `apksigner verify --print-certs`: `CN=GENUM Solutions, OU=Mobile, O=GENUM Solutions Pvt Ltd, L=Kathmandu, ST=Bagmati, C=NP` (release keystore, not the Android debug cert).
3. ✅ **Final code inside the APK** — `assets/index.android.bundle` contains `1.5.5` and the `sizeLabel` fix string from commit `1525291`.
4. ✅ **Live manifest** — `release.json` reports v1.5.5 / versionCode 13 / 32.9 MB; both repos `npx tsc --noEmit` clean.

---

## Setup

- Android phone (≥ Android 9) with the v1.5.5 APK installed
- Robot car powered on and advertising BLE
- For WiFi tests: phone joined to the car's AP (`192.168.4.1`)
- Accept all Bluetooth / location permission prompts on first use

---

## A. Cold start & navigation (no crash)

1. Open the app fresh → lands on Home without crash.
2. Navigate Home → Shop → Account → Tools rapidly → no crash, no white screen.
3. Check the Tools footer reads `App v1.5.5`.

## B. BLE scan & connect (lazy BleManager crash-fix regression)

4. Open **Tools** directly from a cold start → screen renders, **no crash on import**.
5. Tap **Scan BLE** → spinner ~8 s → device list shows the car.
6. Tap **Connect** → status dot green, header shows `BLE · <name>`, OLED shows `BLE LINK`; never hangs on "Connecting…".
7. Connect to a slow/unresponsive device → fails with the **10 s timeout** message in the red banner; button re-enables.
8. **Disconnect** → controls grey out and state resets (speed 170, servo 90, telemetry cleared).

## C. D-pad driving (haptics)

9. Drive F/B/L/R/S → car responds; each press gives a light vibration tick; repeated same-direction presses don't spam (debounce).
10. **Run / Stop** vibrate and send `F` / `S`; OLED status text updates (Forward/Stop/`<mode> running|stopped`).

## D. Joystick mode (stale-closure regression — the key one)

11. Open Tools **before** connecting → toggle **Joystick** → knob does not move (correct, disabled).
12. Connect BLE **now**, then drag the left joystick → **knob moves smoothly and the car drives** (fixed bug: PanResponder now reads current `disabled`/`onMove` via refs).
13. Release → knob springs back to center and the car stops/neutralizes.
14. In 2WD1M mode: right joystick steers the servo (approx ±90° around center 90°); knob clamped to the circular boundary; no runaway command stream.

## E. WiFi WebSocket + auto-reconnect

15. Join the car's AP, enter `ws://192.168.4.1:81`, tap **Connect WiFi** → green dot, OLED shows `WiFi WS`, mode chips become usable.
16. Kill the car's power mid-session → banner shows `reconnecting (attempt 1/5)…` climbing to 5, then `WiFi connection lost — reconnection failed. Tap Connect WiFi to retry.` No crash.
17. Restore power within the reconnect window → reconnects automatically; attempt counter resets; error banner clears.
18. Tap **Disconnect WiFi** (manual) → **no** auto-reconnect attempts fire afterwards.
19. Leave the Tools screen while a reconnect is pending → return later: no stray error toast, no duplicate socket, controls clean (unmount cleanup).

## F. Telemetry, PID & sensors

20. OLED / SensorGrid update from `STATE` / `TEL` frames (speed, mode, angle, PID values) while connected.
21. PID sliders send `CFG;Kp:…;Ki:…;Kd:…;OUT:…;OFF:…`; AUTO-mode values echo back into the display.
22. Non-robocar categories (Smart Farm / Smart City / Home Automation): Relay switches toggle `OUT1–4` and show correct on/off state; live sensor cards populate from `sensors` messages.
23. **About this mode** card expands and shows token/car/wheel/steering/sensors/transport/remote-with correctly for the active mode.

## G. In-app update screen (sizeLabel fix)

24. Account → update check reports **up to date v1.5.5** on this build; on an older build it offers the download and shows the **APK size label** (e.g. `32.9 MB`) — previously missing.

## H. Drone (only if drone hardware is available)

25. Altitude + gimbal sliders stream `ALT` / `GIMBAL_PAN` / `GIMBAL_TILT`; **Take Off / Land** send their commands; **Emergency Stop** resets altitude to 0 and sends `EMERGENCY`.

---

## Broader v1.5.5 regression (quick pass)

26. **Admin Dashboard** (admin login): revenue, page views (30d + today), conversion rate, top pages, and the daily-traffic chart render real data; Finance tab shows real paid/fulfilled/cancelled counts.
27. **Error boundaries**: force-crash a screen is impractical manually — instead verify screens render normally and the Account → Theme toggle + order history still work (boundaries wrap every screen).
28. **Offline indicators**: with the device in airplane mode, open Shop / a Product detail → amber "offline/cached" badge appears; clear airplane mode and refresh → badge disappears.

---

## Pass criteria

Every step behaves as described above. No app crash or permanently dead control; the OLED/status indicators always track the real connection state. Record anything failing, plus the device model + Android version, in the next GUIDE.md session log.

## Test log

| Date | Device / Android | v1.5.5 installed | Result | Notes |
|------|------------------|------------------|--------|-------|
| 2026-09-03 | — (no device) | — | ✅ Pre-flight PASS | SHA-256 match, release signature, `1.5.5`+`sizeLabel` in bundle, manifest live. Hardware steps A–H pending. |
|      |                  |                  |        |       |
