# TESTING — Physical Device Test Checklist

> Target: **v1.5.12** (versionCode 20) · Android APK (`genum-solutions-1.5.12-arm64-v8a.apk`)
> Scope: the v1.5.12 app+website **admin Settings tabs** + the **3 v1.5.11 UX fixes** (AppMenu modal, back-nav, pager focus re-sync) + the **Phase G swipe pager**; quick regression over the v1.5.5 Tools scope.
> Companion doc: `GUIDE.md` (project root) — session log + release state.
> Status: **Released 2026-09-04** (APK + manifest live). Device pass for the v1.5.12 Settings tabs and the v1.5.11 UX fixes still pending.

---

## v1.5.11 device checklist (the new fixes — the priority)

These verify the 3 UX bugs fixed in v1.5.11 plus the Phase G swipe pager.

1. **AppMenu Modal (was "stuck"/blocking)**
   - Tap the hamburger on Home → menu slides in over a dimmed backdrop; the rest of the screen is inert while open.
   - Tap a nav item (e.g. Services) → menu closes AND you land on Services in one tap (previously the next tap could be swallowed).
   - Open the menu, then tap the X → closes; open again quickly → works every time (never "stuck").
   - From a **deep link / pushed screen** (e.g. reach a screen, then return to Main) → the menu is reliably closed; it never stays open over the next screen.
   - Menu items on stack screens (Services/Projects/Tools/About/Contact/Journal/Printing/OpenTools) navigate to that screen; Sign in / Sign out work from the menu.

2. **Back navigation (was navigating too far)**
   - Home → Services → (push) → Tools → … press Android Back repeatedly → you step back **one screen at a time** through the exact screens you opened (previously Back could skip several).
   - Products → Product detail → back → returns to the same product list / search results.
   - Place an order → OrderSuccess → Back → returns to where the order flow started (not a far-away screen). Verify a deep-link order flow also steps back sanely (no crash, no overshoot).

3. **Pager focus re-sync (was resetting to Home)**
   - Swipe to the **Account** tab, go into **Admin** (or any pushed screen), press Back → you return to **Account** (previously reset to Home). Repeat for Shop/Cart — the tab you left is the tab you come back to.
   - Swipe between tabs → bottom bar highlights the active tab; tapping a tab animates the pager; per-tab state (scroll position / filters) is preserved across swipes and tab taps.

4. **Phase G swipe pager sanity** — swipe Home↔Shop↔Cart↔Account horizontally and via the bottom bar; both stay in sync; no crash, no stuck pager.

## Pre-flight checks (no device — verified 2026-09-03)

These were run on the build machine against the published artifact and do not need a phone:

1. ✅ **Published APK == local build** — SHA-256 of `genum-solutions-latest.apk` on Supabase matches `releases/genum-solutions-1.5.5-arm64-v8a.apk` (`f4c7cff2a94fd16f9599c2262694278dc971f2f3fb963c86a81a2bbfda3c2fd2`).
2. ✅ **Release-signed** — `apksigner verify --print-certs`: `CN=GENUM Solutions, OU=Mobile, O=GENUM Solutions Pvt Ltd, L=Kathmandu, ST=Bagmati, C=NP` (release keystore, not the Android debug cert).
3. ✅ **Final code inside the APK** — `assets/index.android.bundle` contains `1.5.5` and the `sizeLabel` fix string from commit `1525291`.
4. ✅ **Live manifest** — `release.json` reports v1.5.5 / versionCode 13 / 32.9 MB; both repos `npx tsc --noEmit` clean.

---

## Setup

- Android phone (≥ Android 9) with the v1.5.11 APK installed
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

| Date | Device / Android | Build installed | Result | Notes |
|------|------------------|-----------------|--------|-------|
| 2026-09-03 | — (no device) | v1.5.5 | ✅ Pre-flight PASS | SHA-256 match, release signature, `1.5.5`+`sizeLabel` in bundle, manifest live. Hardware steps A–H pending. |
| 2026-09-03 | Owner phone | v1.5.8-admin-fixes QA (`0dc84b44…`) | ✅ PASS (admin scope) | All 12 admin tabs scroll with no dead bottom band; Orders/Messages/Activity no longer clip; Journal Edit/New lands on the fields; ProjectPackages/RobotCarProjects edit in place with filter/page kept; product images load from Supabase only (works in airplane mode). |
| 2026-09-03 | — (no device) | v1.5.9 | ✅ Pre-flight PASS | sha256 `efe58825…`, bundle contains `1.5.9` + **0** website-URL refs + admin-fix marker, manifest live 1.5.9/17, remote Content-Length == local. v1.5.9 = the QA-passed code + version bump. |
| 2026-09-03 | — (no device) | v1.5.10 | ✅ Pre-flight PASS | sha256 `789fb692…`, bundle contains `1.5.10` + **0** website-URL refs + `grow-0`/`shrink-0` strip-fix markers, manifest live 1.5.10/18, remote Content-Length == local. v1.5.10 = v1.5.9 + tab-strip gap fix; visual device pass for the strip fix still pending. |
| 2026-09-04 | — (no device) | v1.5.11 | ✅ Build + manifest PASS | `gradlew assembleRelease` BUILD SUCCESSFUL (36,024,345 B / 34.4 MB); uploaded versioned + latest; fresh manifest 1.5.11/19/34.4 MB (cache-busted GET). Device pass for the AppMenu modal / back-nav / pager re-sync / swipe pager still pending. |
