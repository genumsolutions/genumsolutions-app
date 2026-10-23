# FAILSAFE — U-121 (owner 2026-10-23) APP ROUND

## What shipped

1. **Remote chrome: removed "This phone / Wi-Fi · name hidden" chip**
   - Owner directive: remove the whole box. Phone network is still tracked by the
     hub (`phoneNetworkLabel`) and still shown in the Connectivity panel.
   - The chip is gone from the Remote chrome row below Back.
   - FAIL-SAFE: Do NOT re-add the chip to the Remote. If it disappears and the
     owner complains, verify the Connectivity panel still shows it first.

2. **Car-network section: broadcast IP integrated beside SSID**
   - `reportedIp` (from telemetry.ip) shown when the car reports it, else
     `DEFAULT_AP_IP`. Read-only, auto-filled most of the time.
   - Same address the app dials — both connection facts live in one place.
   - FAIL-SAFE: Do NOT put the IP back into a free-text input. The car uses it
     only to look up its own WS client, not to reconfigure the network.

3. **"Other ESP / IoT projects" add card removed**
   - The in-place add form still works for the car's network manager.
   - The outside-steered entry point (`iotAddTick`, `IotEntryCard`) is removed.
   - FAIL-SAFE: If the add form stops working, check `WifiPanelProps` no longer
     has `addRequestKey`, and that `WifiPanel` no longer has the `lastAddKey`
     useEffect.

4. **Disconnect chips restructured**
   - Bluetooth: one chip, tears down BT only.
   - Wi-Fi: two variants — `Wi-Fi (hotspot)` when on own AP, `Wi-Fi` when on a
     router. Each tears down Wi-Fi only.
   - FAIL-SAFE: If a chip stops disconnecting, verify `handleBtDisconnect` /
     `handleWifiDisconnect` still work and that `onOwnHotspot` is computed
     correctly.

5. **Settings panel in Remote: arrange/fit items properly**
   - Items stacked top-to-bottom in reading order.
   - FAIL-SAFE: If a control disappears or stacks oddly, re-check the absolute/
     percentage coordinates in `styles` and the `zIndex` of the log overlay.
     Do NOT widen the panel.

6. **PhoneNetwork.ts honesty wording**
   - "Wi-Fi · network name hidden" → "Wi-Fi · name hidden".
   - FAIL-SAFE: If the wording is wrong, check `formatPhoneNetwork` in
     `phoneNetwork.ts`.

## What to watch

- The Remote chrome row height is `h-9`. If the disconnect chips or tab pills
  stop fitting, the row does NOT grow — the compact telemetry line drops first
  (Q2 default). Do NOT increase `h-9` to fit everything; instead, check the
  `max-w-[200px]` truncation on the phone-network chip (which is now gone) or
  reduce other elements first.

- The car-network broadcast IP line is conditional on `lastMethod === "wifi-sta"`.
  If it disappears, check: (a) the car reports `state.ip` during heartbeat;
  (b) `reportedIp` is non-null at render; (c) `lastMethod` is actually
  `"wifi-sta"`. A stuck `lastMethod` can hide the line.

- `DEFAULT_AP_IP` now comes from `../services/carProtocol` (not from `./index`).
  If the app cannot find it, check the import in `ConnectionSection.tsx`.

## Commit / push status

- `genumsolutions-app`: committed `4531d77` on `u120-page-serving-type-2`,
  pushed to origin.
- `Genum_4WD4M_CAR`: committed `4f0b76f` on `main`, pushed to origin.
- Twin SESSION notes: `SESSION-2026-10-23-U121.md` in both repos, updated.

## Next (not done)

- Phase E in the car repo: freeze trace (BT-up-then-STA-drop, heap 15KB),
  FW 1.3.15 → 1.3.16. See `Genum_4WD4M_CAR/TRACKS/SESSION-2026-10-23-U121.md`.
