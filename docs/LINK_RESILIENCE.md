# Link resilience — why the 4WD4M link drops and what the app does about it

The car and the app talk over three local links: classic Bluetooth (SPP), BLE
(registered, waiting on firmware), and the car's Wi-Fi WebSocket. This note is
about the drop behaviour — the field report "it works, but resets or aborts
sometimes" — and where to look when it happens again.

## What can break a working link

| Cause                                        | Where it shows                      | What the app does                                            |
| -------------------------------------------- | ----------------------------------- | ------------------------------------------------------------ |
| Phone leaves the car's AP / router           | `socket.onclose`, code 1006         | Announces the drop, raises the reconnect dialog naming Wi-Fi |
| Car reboots (brownout, watchdog)             | Socket closes, car re-advertises    | Same dialog; no auto-redial (owner decision U-120)           |
| ESP32 heap exhausted by WebSocket handshakes | Closes right after connect          | Connection churn is now impossible — see below               |
| App backgrounded                             | Android kills the socket            | Dialog on return, user reconnects                            |
| Signal/hold loss                             | Car's own 2 s failsafe stops motors | App shows "car silent" after 8 s without a frame             |

## The churn fix (U-LINK1, 2026-11-09)

`wifiService` is a singleton shared by both hub instances (the Control Panel and
the Remote window), and the reconnect dialog can fire while an attempt is
already running. `connect()` used to close any existing socket and dial again —
including a socket still in `CONNECTING` — so a second caller tore down a
healthy handshake and started another. Every collision cost the car a full
WebSocket handshake, and the 4WD4M firmware documents free heap collapsing to
~15 KB in exactly that window, which is when a "working" link dies.

`connect()` now joins an in-flight dial to the same car instead of restarting
it (`src/services/wifiService.ts`). A dial to a _different_ URL still replaces
the old socket, and after a timeout the socket is nulled, so an explicit retry
still dials fresh. Pinned by `wifiService.test.ts`.

## Reading a drop after the fact

Unexpected Wi-Fi drops are written to `app_logs` (`scope = link/wifi`) with the
socket's own closing facts:

```json
{
  "code": 1006,
  "reason": "abnormal",
  "wasClean": false,
  "uptimeMs": 4210,
  "frames": 2
}
```

Read them in the admin **Logs → Fleet diagnostics** panel. How to interpret:

- **`uptimeMs` < 2 s, `frames` 0** — the handshake itself failed: wrong IP, car
  not on that network, or the car's web layer is down. Not a mid-session reset.
- **`uptimeMs` seconds–minutes, `frames` > 0, code 1006** — the link was real and
  then died: power, range, or the car rebooted.
- **code 1000 / `wasClean: true` without user action** — the car closed on
  purpose (mode/transport switch, web page toggle).

Manual disconnects and connect timeouts are deliberately not logged: they carry
no information about the car.
