# TESTING — Physical Device Test Checklist

> Target: **v1.5.14** (versionCode 22) · Android APK (`genum-solutions-1.5.14-arm64-v8a.apk`)
> Scope: the **robot-car per-package remote (Phase A)** — Car Remote screen (Classic BT SPP + BLE + WiFi), ESP-remote 2WD1M joystick parity (signed SPD / steer limit / trim / e-stop), self-balancing PID deck, autonomous Run/Stop decks (token semantics), weblink (wireless-car WS JSON) deck, Tools-hub + website parity — on top of the v1.5.13 native UX polish and the v1.5.12/v1.5.11 fixes.
> Companion doc: `GUIDE.md` (project root) — session log + release state.
> Status: **v1.5.14 code complete + committed + pushed to `main`** (both repos; version bumped 1.5.14/22; typecheck + lint + 33/33 tests + production build + expo-doctor 18/18 all green). Physical-device pass pending; APK not yet built.

---

## 2026-09-05 device checklist (cart sync · Menu tab · compact My Account) — pending

These verify the UI fixes from the 2026-09-05 session (uncommitted at time of writing).

1. **Cart count matches the list** — add items from Product Detail / Projects (badge increments), then open the Cart tab: the badge and the sum of plus/minus quantities shown match exactly, and the list reflects the adds you made since you last opened the tab (no stale rows).
2. **Editing the cart works** — on the Cart tab, tap **+ / −** on any line → the quantity, the Total, and the badge all update immediately (list stays in step, no re-fetch). Press **−** down to 0 → the line and row disappear.
3. **Cart syncs on focus return** — add a product, leave to another tab, come back (or visit the Cart tab fresh) → the cart list is current. After a COD/paid checkout the empty state shows and the badge is 0.
4. **Menu tab (not a modal)** — bottom bar has **four** tabs (Home/Shop/Cart/Menu). Tapping Menu shows a destinations page in the normal tab area — tabs stay visible + tappable, back bar shows the page, swiping Home↔Shop↔Cart↔Menu works, and Android Back from Menu goes Home in one step. Services/Projects/Journal/3D Printing/Open Tools/Tools & IoT/About/Contact/Privacy/Terms/Admin Dashboard all navigate to their screens.
5. **My Account is short + neat** — signed in → header card (Welcome, {name}., email, log-out on My Account screen), two stat cards (Orders placed / Items in build list), Your orders, Edit profile, and a compact footer (App version+update, App theme, legal links, Sign out). No repeated account/theme/update rows anywhere in the Menu tab; the only theme control lives on My Account.
6. **Admin — Project packages tab** — the heading "Project packages (N)" renders on its own big line (no wrap/overflow) with the + New project button in the filter row below; heading font is larger than before and readable.
7. **Web-render regression** — `npm run web`: all four tab pages + Admin tabs render; Menu tab works; no modal; theme toggle on My Account works.

---

## v1.5.13 device checklist (native UX polish)

These verify the v1.5.13 polish, on top of the v1.5.12 Settings tabs and the v1.5.11 UX fixes.

1. **Menu tab (4th bottom slot)** — tap **Menu** in the bottom bar → it opens as a **normal tab page** in the same space between the top bar and the bottom tab bar as Home/Shop/Cart (no modal, no overlay, tabs stay tappable). It lists destination groups (Explore / Company / Admin) only — no duplicate account row / theme / sign-out / update (those live on **My Account**).
2. **Account in the top bar (website parity)** — top bar shows a user icon (initials when signed in). Signed in → tapping it opens **My Account** (a stack screen with back button); signed out → tapping it opens the **sign-in sheet** directly. Back from My Account returns to the tab you left.
3. **Menu is a real 4th tab** — Home / Shop / Cart / **Menu** are all swipeable pager pages; the bottom bar shows four tabs and highlights the active one. Swiping across all four stays in sync with the bottom bar.
4. **Tab-aware Android back** — from Shop/Cart/Menu press Back → lands on **Home** (one step); on Home press Back → app exits (or pops a screen beneath Main after a deep link). Never more than one step per press.
5. **Theme toggle works** — on My Account pick Light → whole app restyles light even if the OS is dark; pick Dark → restyles dark; System → follows the OS. Choice persists across app restarts. (On the web preview the same toggle must restyle the app too.)
6. **Web-render regression** — the app runs in a browser (`npm run web`): tabs, admin tabs (PlatformPager web variant), menu, theme, and navigation all render without the native-only pager crashing the bundle.

## Car Remote device checklist (per-package robot-car remote — in development, after v1.5.13)

Scope: the **Car Remote** screen for robot-car project packages, starting with the **2WD1M Basic Robot Car** paired like the ESP remote over **Classic BT (SPP)**. Same GENUM line protocol as the physical remote / MIT apps (`SPD`/`SERVO`/`STEER`/`TRIM`/`ESTOP`, `STATE;`/`TEL;` telemetry). Requires an Android phone (SPP is Android-only) and a 2WD1M car.

1. **Reach the remote** — on Projects, tap **Control** on the 2WD1M Basic Robot Car package card (or "Control this car" on its product page) → the Car Remote opens preconfigured for 2WD1M (steer-limit/trim/e-stop card present, OLED + drive deck visible). No mode picker detour.
2. **SPP pairing + connect** — pick **Classic BT (SPP)**, tap **Scan cars (SPP)** → the car appears (show a "Paired" tag when the phone already knows it). Tap Connect → header shows **Connected · <car name>**, and the OLED chip reads **SPP LINK**. If the car asks for a PIN at pairing time, `1234`.
3. **Left stick = signed speed** — with the car powered and connected, push the left stick forward → car drives forward and the deck sends signed `SPD+n`; pull back → reverse (`SPD−n`); release/center → `SPD0` stop. Speed grows with deflection (5-unit steps, up to ±255) — the ESP-remote transient-drive mapping, not the letter commands.
4. **Right stick = steering within the limit** — right stick left/right steers the servo around center 90 and never exceeds the **Steer limit** shown on the card (default 90 = full lock-to-lock). Lower the limit (e.g. 45) → full stick deflection only reaches 90±45.
5. **ESP-remote extras** — Trim ±1 adjusts `TRIM`; **Emergency stop** sends `ESTOP` + `SPD0` and the car halts; the OLED status tracks Forward/Backward/Stop from `STATE;` feedback.
6. **Disconnect is safe** — tap Disconnect → the app sends neutral `SPD0`/`SERVO90` before dropping the link, like the ESP remote; reconnecting re-syncs state via `REQ_STATE`.
7. **Other links (same protocol)** — WiFi WebSocket cars connect via `ws://192.168.4.1:81` and BLE cars via the BLE scan; whichever link is used, the same deck + OLED apply (label changes to WiFi WS / BLE LINK).

## Car Remote — remaining modes (self-balancing PID deck + per-mode decks, in development)

1. **Self-Balancing Robot Car package** (Projects → Control, or the product page) opens the **self-balancing deck**, not the generic joystick deck: a live **ANGLE** readout on a dark tile (status pill BALANCING / CORRECTING / TILT! / NO TELEMETRY) fed by the car's `TEL;…ANGLE` frames, plus full PID sliders **Kp / Ki / Kd / OUT / OFF** that send the `CFG;…` line.
2. **Enter AUTO** chip — with the car connected, tap **Enter AUTO** → the car switches to AUTONOMOUS mode (token `AUTO`) and starts balancing; the angle readout goes live and the status pill reacts to tilting the bot by hand.
3. **PID live tuning** — drag Kp/Ki/Kd/OUT/OFF while the bot balances: it should visibly react (stiffer/looser), and the value shown under the slider matches what the car echoes in `TEL;…`. Release at sensible values so the bot doesn't oscillate.
4. **Obstacle / path packages get an autonomous deck (firmware-exact Run/Stop)** — Obstacle-Avoidance (US / IR) and Path-Following packages open the **AutonomousControls** card instead of the joystick deck. Semantics verified against the modular token firmware (`UNO_Base_project_V2.0.1_MOD` `Bluetooth.cpp`/`ModeManager.cpp`): **Run** sends the mode token (`OBS_US`/`OBS_IR`/`PATH`) — the car switches mode and its routine runs continuously from `loop()`; **Stop** sends `BT` — back to manual, motors halt, routine stops (letters `F`/`S` only act in BT mode and can't stop a routine, so they're not used). Device test: tap **Run** → the car (token-capable build) starts avoiding/following; raise the **Run speed (SPD 110–250 / 5-step)** slider and hear the pace change; tap **Stop** → motors stop and the car answers to letters again. On switch-wired (non-token) builds, the panel explains that tokens are ignored and the physical mode switch rules. The **Thresholds on this car** panel documents firmware constants per mode.
5. **Other packages now say what they are** — 4WD and website packages show an **Enter <token> mode** chip once connected (switches the car into that package's mode, mirroring the ESP remote's mode select) above the normal drive deck; the **RF Manual Robot Car** shows an informational card (RF handset only — no app link) instead of a dead connection panel.
6. **Tools hub parity** — the shared Tools hub PID grid gained the missing **OFF** slider (same `CFG;…` line), matching the remote's AUTO dashboard P/D/I/OUT/OFF set.
7. **Hub 2WD1M + autonomous parity** — in the Tools hub, switch the mode to **2WD1M** and the joysticks behave like the Car Remote (left stick = signed SPD, right stick clamped to the Steer limit card that now appears above the controls, plus Trim and Emergency stop — same shared card component as the Car Remote). Switch the hub to an obstacle/path mode and Run now enters the mode token while Stop returns to `BT` (manual), matching the verified firmware semantics; the website `/tools` deck does the same.
8. **Multimode wireless-car (weblink) deck** — open the Website-Server Robot Car package → connect over WiFi to the car's WS (`ws://<ip>:81`; AP fallback 192.168.4.1) → the **Car status (WS)** tile shows live `M:ESP_SER` / status / SPD / RSSI / IP streamed as JSON from the car's WebServerComm; **Open car web page** opens `http://<ip>/` (the car's own `WebPage.h` UI) in the browser; Enter ESP_SER/ESP_CLI switches modes over the same link; letters + SPD drive from the deck below. Repeat with the Website-Client package: the card explains the car is the client (use the website /tools as the server; the app connects directly only in ESP_SER/AP mode).

## v1.5.12 device checklist (adds the v1.5.12 Settings tabs, on top of the v1.5.11 fixes)

These verify the Settings tabs added in v1.5.12 (app + website admins), plus the 3 UX bugs fixed in v1.5.11 and the Phase G swipe pager.

1. **AppMenu Modal (historical — the menu is now a 4th tab page, not a Modal; see the 2026-09-05 checklist)**
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
