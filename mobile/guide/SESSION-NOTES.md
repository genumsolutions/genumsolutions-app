# Device Test Checklist — Remote Screen

## Remote screen (v2.0.6)
- [ ] Joystick: left stick drives, right stick steers (2WD1M)
- [ ] D-pad: all 5 cells visible, correct cross shape
- [ ] D-pad: left pad F/B, right pad L/R, center cells stop
- [ ] Both sticks/pads work simultaneously
- [ ] Mode from car button reflects in app immediately
- [ ] OLED shows mode | speed/steer, body direction, status bar
- [ ] Chrome row: Back/Select/Mode/Speed all functional
- [ ] E-stop: stops car immediately
- [ ] Settings: steer limit + trim adjust correctly
- [ ] Disconnect: confirmation dialog, safe stop sent

## Round-5 device tests (A-25..A-28, 2026-09-16)

Device round-5 run sheet: `guide/DEVICE-ROUND-5-2026-09-16.md` (repo root).
App changes delivered as a **v2.0.6 JS-only OTA** (no versionCode bump).

### A-25 — friendly BT name in header
- [ ] Header shows the car's friendly BT name right of "Remote" (`_` → space,
      e.g. `WIRELESS_CAR` → `WIRELESS CAR`)
- [ ] Never a raw hex MAC — a MAC-shaped scan name renders as `ESP32 Car`
- [ ] No standalone IP chip in the top chrome row anymore
- [ ] ESP_SER mode: sub-header row below chrome shows the name + tappable IP
      chip (opens the car's web page in the default browser)
- [ ] `192.168.4.1 (AP)` shown when the car is in its own AP mode

### A-26 — single "WiFi & Router" panel
- [ ] Hide hides BOTH drives (D-pad + joystick) and shows the WiFi & Router panel
- [ ] The old WeblinkControls card and the "Pad hidden" placeholder are gone
- [ ] The Settings gear no longer contains a WiFi provisioning card
- [ ] Panel shows: active SSID + AP name (tappable IP), LINK state, saved router
      list, and the Add form

### A-27 — saved-router add / switch / delete over WS
- [ ] RouterPanel list entries re-sync from the car's `networks` (WS JSON) within
      ~1-2 s after any change
- [ ] Add: saves on the car (`ROUTERS;ADD;<ssid>;<pass>`), appears in the list,
      persist across app restarts (car NVS is the source of truth)
- [ ] Switch (Switch on): sets active router (`ROUTERS;USE;<ssid>`), car rejoins
      over WiFi when reachable; app returns to BT fallback until then
- [ ] Delete: removes from the car registry (`ROUTERS;DEL;<ssid>`)
- [ ] Per-car: each vehicle keeps its own saved list (fleet parity)
- [ ] Passwords are NEVER sent by the app back to the hub/panel (W-14)

### A-28 — keyboard never covers inputs
- [ ] Add-form inputs sit above the soft keyboard (resize + KeyboardAvoidingView)
- [ ] Focused input scrolls into view; no obscured TextInput

## Round-6 device tests (A-29..A-34, 2026-09-17)

Device round-6 run sheet: `guide/DEVICE-ROUND-6-2026-09-17.md` (repo root).
App changes are part of the same **v2.0.6 JS-only OTA** (no versionCode bump).

### A-29 — RouterPanel only in the ESP32 (Webserver) mode
- [ ] Selecting ESP32 (Webserver) + Hide shows the WiFi & Router panel
- [ ] Every other mode + Hide shows the "Pad hidden" placeholder (no router controls)
- [ ] Switching modes while hidden swaps panel/placeholder correctly

### A-30 — saved networks survive an app power cycle
- [ ] Add routers, force-quit the app, reopen: the saved list + device name return
- [ ] Cold start with the car NOT linked still pre-fills the last device + its routers
- [ ] Switching devices loads that device's own saved list

### A-31 — fixed-height layout band
- [ ] Step through robocar modes: the joystick/deck never shifts vertically
- [ ] The IP chip appears only in the webserver mode; lamp + name always present

### A-32 — readability / literal characters
- [ ] Router-panel footer shows a real em dash (—) and apostrophe (’) at legible size
- [ ] No `\u2014` / `\u2019` artifacts anywhere in the panel

### A-33 — Dark-theme toggle + skin
- [ ] Remote Settings → "Dark theme" switch flips the chrome (screen/sub-header/
      dropdown/RouterPanel); drive deck stays dark-tuned
- [ ] Reopening the app preserves the chosen appearance

### A-34 — no duplicate fixed header icon
- [ ] Control-Panel header has no fixed remote icon; the big CTA is the only entry

## Round-12 device tests (A-48..A-51, 2026-09-17) — IMPLEMENTED (typecheck + doctor PASS), OTA + verify pending

Device round-12 run sheet: `guide/DEVICE-ROUND-12-2026-09-17.md` (repo root).
App changes delivered as the same **v2.0.6 JS-only OTA** (no versionCode bump), auto-run
by `ota-only.yml` on push to `main` (the push touches `mobile/src/*`; `global.css`
rides the same bundle via `App.tsx:19`). Owner: close + reopen the app to receive.

### A-48 — theme token refresh (whole app, subtle)
- [ ] Remote screen, **light**: background no longer pure white — screens/panels separate clearly
- [ ] Remote screen, **dark**: soft navy midnight (not pitch black); text/cards readable
- [ ] Home/Shop/Account/Menu/Tools still look consistent with the refresh

### A-49 — OLED data font standardized + fit
- [ ] Compact OLED mirror (Remote): every readout in ONE consistent mono scale (no mixed sizes)
- [ ] AUTO rows (Angle / P / D / OUT / I / OFF) fit the 160×80 slot with no clipping
- [ ] Long mode names/directions truncate cleanly (no overflow)

### A-50 — "Hide" → "Telemetry" control pill
- [ ] Third pill reads **Telemetry**, SAME row as D-pad and Joystick
- [ ] Webserver mode + Telemetry → WiFi & Router panel; PID-auto + Telemetry → balance controls
- [ ] Any OTHER robocar mode + Telemetry → useful telemetry (full OLED mirror), NOT "Pad hidden"

### A-51 — add-router card overflow
- [ ] "Add a router" card: helper sentences stay INSIDE the rounded card (light AND dark)
- [ ] "No saved routers yet…" and the Active-connection helper text also stay inside

<!-- ag>tip: append per-round device checklists above this marker
