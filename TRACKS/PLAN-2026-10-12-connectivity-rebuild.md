# PLAN 2026-10-12 — Remote "Connectivity" rebuild + car-on-router reachability (APP half)

Status: **IN PROGRESS — phased.** Resume point mirrors
`Genum_4WD4M_CAR\TRACKS\PLAN-2026-10-12-connectivity-rebuild.md`.

Owner request (2026-10-12): move ALL connection UI (Bluetooth + WiFi) into the Remote
screen under one panel renamed **Connectivity**; remove the app's OLED mirror (every
usage) and place telemetry around the drive controls; remove the Remote's **Select**
button and add per-link disconnect; strip the Control Panel's top telemetry +
connection sections; enable parallel BT+WiFi with a power-saving toggle (default OFF).
Strict scope: *"dont change other thing that i havent asked to you"*.

## RESUME HERE
> **Phase 4 app half: DONE.** Committed + pushed (app code commit, docs commit). Shipped:
> - `DevicePrefs.allowParallelLinks?: boolean` (default false) in `types.ts`.
> - `useControlHub.ts`: `allowParallelLinks` state + `allowParallelLinksRef` (:241-252);
>   restored from BOTH prefs-apply sites (local memory + adopted cloud profile) into
>   `linkManager.setAllowParallel(...)`; carried in `persistPrefs` base + deps; the U-98
>   `dropBluetoothForWifi` now early-returns when ON (:1818) AND the symmetric
>   `handleConnect` WiFi-teardown is gated behind `!allowParallelLinksRef.current` (:1712);
>   `WIFICFG;PARALLEL;` parse in `handleWifiProvisionReply`; new `setCarParallelLinks` /
>   `queryCarParallel` via `sendSystemLine`; exported `allowParallelLinks` /
>   `setCarParallelLinks` / `queryCarParallel`.
> - `transports/linkManager.ts`: `allowParallel` flag + `setAllowParallel`/`isParallel`;
>   `activateWith` skips `previous.disconnect()` when ON (single `activeId` retained).
> - `RemoteControlScreen.tsx`: **Parallel BT + Wi-Fi** `Switch` in the Remote Settings
>   drawer next to Hotspot power-save; `queryCarParallel()` on link.
> - Tests: `oneActiveLink.test.ts` new "Phase 4" suite (4 rules); `linkManager.test.ts` new
>   "keeps the previous link up when parallel links are ON". 3 new source-shape rules
>   mutant-proven (guard polarity ×2, reply prefix) → red, restore → green.
> - Gates: tsc 0 · vitest **678/678** · prettier clean. Next: **Phase 5** (final sweep —
>   ledgers, cloud/car `fw_version`, root `RESUME-ME.md`).

> **Phase 3 app half: DONE — `app 5285df6` (pushed).** Committed + pushed:
> - `OledDisplay.tsx` **deleted** + `OledDisplayProps` removed from `types.ts`; `oledCommonProps` /
>   `oledSlot` and the dead `modeAvailStatus` import gone from `RemoteControlScreen.tsx`.
> - NEW `components/tools/DriveTelemetry.tsx`: the link/uptime/heap/signal readout (formatted by the
>   tested `telemetryFormat.ts` — unknown dashes, real zero shows). **compact** 2×2 grid fills the
>   gamepad's center gap (DualDpad + DualJoystick); the full row renders in the pid-auto card and the
>   hidden-mode telemetry view. The drone / non-robocar branch lost its mirror column (deck fills).
> - `oledSlot` prop renamed → `telemetrySlot` on `DriveControls` / `BalanceControls`; the telemetry
>   view's readout column dropped its now-duplicated Link row.
> - Gates: tsc 0 · vitest **673/673** · prettier clean · lint hook green. Next: **Phase 4** (parallel
>   BT+WiFi toggle — app `allowParallelLinks` default false, drop `dropBluetoothForWifi`, relax
>   linkManager one-active-link; car NVS `allow_parallel`).

> **Phase 2 app half: DONE — `app 15718a8` (pushed).** Committed + pushed:
> - Remote pill + Settings row renamed **Connectivity**; the panel now mounts the shared
>   `ConnectionSection` with `manage` (full add/edit/forget Wi-Fi manager) instead of
>   `RouterPanel`; the panel is wrapped in `KeyboardAvoidingView` + `ScrollView`
>   (`nestedScrollEnabled`) so it fits landscape.
> - Per-link disconnect: `confirmDisconnectBt` / `confirmDisconnectWifi` render one button
>   per LIVE link (`connected` → BT, `wifiConnected` → WiFi).
> - **Select** button + `handleSelect` removed; the now-dead router callbacks
>   (`routerUse`/`routerAdd`/`routerDelete`/`routerClearAll`/`routerEntries`) retired.
> - Remote Settings: new **Hotspot power-save** `Switch` → `hub.apPowerSave` /
>   `hub.setCarApPowerSave` / `hub.queryCarApPowerSave`; a `useEffect` queries the car when
>   `linked`.
> - Control Panel (`ToolsScreen.tsx`): Car card + `TelemetryStrip`, Diagnostics row, Connect
>   heading + `ConnectionSection` removed; page is catalogue + Saved settings only.
> - `ConnectionSection`: new optional `manage` prop (default false) replacing the hardcoded
>   `manage={false}`.
> - `useControlHub.ts`: `apPowerSave` state (:241), `WIFICFG;APSAVE;` parse in
>   `handleWifiProvisionReply`, and a `sendSystemLine` spp→ble→wifi fan-out +
>   `setCarApPowerSave` / `queryCarApPowerSave`, exported.
>
> Gates: `npm run typecheck` clean · `npm run test` **673/673** · `npm run format:check` clean.
> `RouterPanel.tsx` is left UNMOUNTED (its pure module + `routerPanelOutcome.test.ts` stay
> green); its deletion is deferred. Next action: **Phase 3** (remove `OledDisplay` everywhere
> + telemetry around the drive controls). NOTE: `RESUME-ME.md` at the workspace root mirrors
> this.

## Phases
- [x] **Phase 1 — car-on-router reachability (app half).** No code change: `findCarForUser`
      (:1756) + the NetInfo watcher (:2030-2044) already exist (U-80b); the fix is the car's
      always-on hotspot (U-100). NOTE: `findCarForUser` does NOT yet try the remembered
      `lastRouterIp` first despite its doc comment (it only sweeps the phone's /24) — low
      value to change (the sweep covers it); left as-is.
- [x] **Phase 2 — Remote UI restructure.** DONE (`app 15718a8`).
      - Renamed → **Connectivity**: Remote Router pill + Settings row.
      - Moved the BT+WiFi connection layer (`ConnectionSection`, `manage`) into the Remote's
        Connectivity panel (landscape-adapted via `KeyboardAvoidingView`+`ScrollView`);
        the duplicate router management (`RouterPanel` mount) is retired (module left unused).
      - Removed the **Select** button and its handler.
      - Added per-link disconnect (BT + WiFi) replacing the single `Disconnect`.
      - Stripped Control Panel (`ToolsScreen.tsx`): Car card + `TelemetryStrip`, Diagnostics
        block, `ConnectionSection`.
      - **U-100: "Hotspot power-save" toggle** in the Connectivity settings — sends
        `WIFICFG;APSAVE;ON|OFF`, reflects the car via the reply, defaults OFF.
- [x] **Phase 3 — remove OLED mirror + telemetry around drive controls.** DONE (`app 5285df6`).
      `OledDisplay.tsx` + `OledDisplayProps` deleted; the `oledSlot` plumbing/prop renamed →
      `telemetrySlot`; new `DriveTelemetry.tsx` (link/uptime/heap/signal) fills the gamepad's center
      gap, the pid-auto card and the hidden-mode telemetry view; the drone/non-robocar mirror column
      is gone (deck fills the row).
- [x] **Phase 4 — parallel BT+WiFi toggle.** DONE. App half: persisted
      `allowParallelLinks` (default false) + Remote Settings toggle; `dropBluetoothForWifi`
      and the symmetric `handleConnect` WiFi-teardown both gated on the flag; `linkManager`
      one-active-link relaxed when ON (skips `previous.disconnect()`); `oneActiveLink.test.ts`
      + `linkManager.test.ts` updated. Car half: `WIFICFG;PARALLEL;ON|OFF` + NVS
      `botcfg/allow_parallel`, U-79 loop parallel branch (car `1cfc913`).
- [ ] **Phase 5 — final sweep** (ledgers, `RESUME-ME.md`).

## Gates to run (app, from `genumsolutions-app\mobile`)
```
npm run typecheck
npm run test          # vitest run
npm run format:check
```

## Key file map
- `screens/RemoteControlScreen.tsx` (1452 ln): chrome :754-873, Select :774-796,
  sub-header :875-951, pills :953-1025, content :1027-1309, RouterPanel mount
  :1166-1184, settings drawer :1312-1443.
- `screens/ToolsScreen.tsx`: Car card + TelemetryStrip :405-446, Diagnostics
  :452-461, Connect heading + ConnectionSection :474-493.
- `components/tools/connection/ConnectionSection.tsx` (BT/WiFi/Internet methods,
  `manage` flag at :606), `WifiPanel.tsx`, `dial.ts` (`CAR_AP_GATEWAYS` :36),
  `discovery.ts` (`findCarOnNetwork` :169, `looksLikeOurCar` :141),
  `routerList.ts`, `effectiveMethod.ts`, `commands.ts`.
- `components/tools/RouterPanel.tsx`, `OledDisplay.tsx`, `TelemetryStrip.tsx`,
  `telemetryFormat.ts`, `useControlHub.ts` (`findCarForUser` :1756,
  `handleWifiConnect` :1816, `dropBluetoothForWifi` :1786, `isCarApGateway` use
  :1254-1258), `commandRouting.ts` (`routeCommand`).
- `transports/linkManager.ts` ("one active link"), `oneActiveLink.test.ts`.

## Constraints / invariants
- `192.168.4.x` is FORBIDDEN fleet-wide (FIN-48); `dial.ts CAR_AP_GATEWAYS` stays
  without `.4.x` deliberately.
- Keep `wifiPanelShape.test.ts` / `dial.test.ts` / `commandRouting.test.ts` green.
- F-61: green gates are not device evidence.
