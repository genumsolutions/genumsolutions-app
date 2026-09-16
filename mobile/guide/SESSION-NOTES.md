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

<!-- ag>tip: append per-round device checklists above this marker
