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
> Phase 1 not started. Next action: auto-discovery on the phone's network change
> (`connection/discovery.ts` + `useControlHub.ts` `findCarForUser`), paired with the
> car-side `updateApPowerPolicy()` change. Then app gates.

## Phases
- [ ] **Phase 1 — car-on-router reachability (app half).**
      `useControlHub.ts:1756` `findCarForUser` (remembered `lastRouterIp` first, then
      bounded /24 sweep); trigger on a NetInfo network change so the app re-finds the
      car after the phone joins the car's router; `connection/discovery.ts`
      `looksLikeOurCar` identity = board-id first, AP-name second.
- [ ] **Phase 2 — Remote UI restructure.**
      - Rename → **Connectivity**: `RouterPanel.tsx:185` header, Remote Router pill
        (`RemoteControlScreen.tsx:1003-1023`), Settings row (`:1360-1384`).
      - Move the BT+WiFi connection layer (`ConnectionSection`, `manage={true}`) into
        the Remote's Connectivity panel (landscape-adapted); retire the duplicate
        router management.
      - Remove the **Select** button (`:774-796`) and its handler.
      - Add per-link disconnect (BT + WiFi) replacing the single `Disconnect`
        (`:929-949`), wired to `handleDisconnect`/`handleWifiDisconnect`.
      - Strip Control Panel (`ToolsScreen.tsx`): Car card + `TelemetryStrip`
        (`:405-446`), Diagnostics block (`:452-461`), `ConnectionSection` (`:474-493`).
- [ ] **Phase 3 — remove OLED mirror + telemetry around drive controls.**
      Delete `OledDisplay.tsx` + usages: `RemoteControlScreen.tsx:685` (compact slot),
      `:1046` (drone/non-robocar column), `:1213` (hidden-mode mirror); `types.ts:223`;
      the `oledSlot` prop on `DriveControls`/`BalanceControls`. Replace with a compact
      link/uptime/heap/signal readout around the drive buttons.
- [ ] **Phase 4 — parallel BT+WiFi toggle** (app half: persisted `allowParallelLinks`
      default false + Remote Settings toggle; stop `dropBluetoothForWifi`
      (`useControlHub.ts:1786`) and relax `linkManager` one-active-link
      (`transports/linkManager.ts:237-291`) when ON; update `oneActiveLink.test.ts`).
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
