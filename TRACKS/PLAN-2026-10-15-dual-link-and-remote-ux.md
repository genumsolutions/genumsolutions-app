# PLAN 2026-10-15 — dual link + remote-screen UX + BT heap (APP half, mirror)

Status: **PHASE 0 ONLY — plan written, NO code yet.** The owner is flashing car firmware 1.3.10
and running the U-112 device rows right now; this plan is what we execute next, one phase at a
time. This file mirrors the master in `Genum_4WD4M_CAR\TRACKS\PLAN-2026-10-15-dual-link-and-remote-ux.md`
(keep both in sync); cross-repo round log stays in the root `RESUME-HERE.md`.

Owner request (2026-10-15, pasted text, verbatim intent — 13 issues):

1. **Dual link** — app+car connected over Bluetooth AND Wi-Fi at the same time. Connecting both
   fails today; owner asks whether it is possible on the ESP32 at all.
2. **Merge the two lines** on the Remote screen: the line below Back (status/disconnect) and the
   line below that (tab selector: D-pad / Joystick / Telemetry / Connectivity) → ONE line, giving
   the freed space to the content below.
3. **Conditional disconnect buttons** — BT disconnect only while linked over BT, Wi-Fi disconnect
   only while linked over Wi-Fi; each must really disconnect its own method; appear only at
   sensible times.
4. **Remove the "phone Wi-Fi off / on &lt;ssid&gt;" chip** from that line — useless.
5. **Settings dropdown too narrow** (`w-64`) — widen it and arrange the rows so content fits.
6. **MAIN issue** — Bluetooth ON collapses free heap 110 KB → ~10 KB; BT+Wi-Fi together sometimes
   &lt; 14 KB → the car resets and freezes. Fix the heap itself, not only the guards.
7. **Wi-Fi OFF must hide everything** — the phone still sees the hotspot AND its webpage; the SSID
   must disappear entirely and the page must stop being served. With BT+Wi-Fi both ON, the car
   must offer BOTH the network and the webpage.
8. **Prompt persistence + sync** — every one of these settings must store in the car AND in the
   app promptly and stay in sync.
9. **Page always up when Wi-Fi is on** — never wait for the app/remote to connect first.
10. **Top-right of Back** — drop the duplicate/gibberish label (`BT · name + WiFi · ip (AP)`);
    keep the broadcast IP there and make IT the link to the car's page; remove the now-duplicate
    page link from the tab line below; sane, standard spacing everywhere.
11. **Mode rotate button dead** — the rotate icon on the Remote screen doesn't cycle modes (sticks
    on 4WD4M); the car's physical mode button works, the app's must too.
12. **Settings audit** — remove the "auto-join last router" toggle, make the OTHER auto-join fully
    working, and audit EVERY other control on that panel; fix whatever doesn't work.
13. **Finish both projects** — every issue closed with device evidence, gates green, both repos
    pushed, CI green.

## Feasibility answer (owner asked this for issue 1)

**Yes — simultaneous BT + Wi-Fi is possible on the ESP32, and it is already half-built:**

- The radio supports Classic-BT + AP/STA coexistence (RF is time-sliced). The car ALREADY runs BT
  advertising and its own hotspot at the same time — that is the normal state of its U-79 loop.
- The app already keeps both links: `src/transports/linkManager.ts` L289 (U-105: *"no teardown of
  the previously active link — both transports may…"*), `parallelBoth = connected && wifiConnected`
  (`src/screens/RemoteControlScreen.tsx` L323), `sendCommand` fans out to every live transport
  (`src/components/tools/useControlHub.ts` L2617), `sendSystemLine` targets spp → ble → wifi
  (L2652).
- What is MISSING is (a) the connect sequence that gets the SECOND link up (P6) and (b) enough
  heap on the car to survive both (issue 6 / car-side P4) — at &lt;14 KB a second link is a crash.

## Traceability — issue → phase

| Issue | 1 dual | 2 merge | 3 cond-disc | 4 phone-chip | 5 width | 6 heap | 7 wifi-off | 8 sync | 9 page-up | 10 IP-link | 11 rotate | 12 settings | 13 finish |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Phase | P6 | P2 | P2 | P2 | P3 | P4 (car) | P5 (car) | P7 | P5 (car) | P2 | P1 | P3 | P8 |

## Phase 0 — evidence from the owner's current flash + device test (NO code)

The owner is tethered and testing 1.3.10 now. Captures (mostly car-side serial via
`python tools/serial_capture.py COMx <secs> <out.log>`) turn each symptom into a named cause
before any code is touched — full capture table is in the master plan; the app-relevant ones are
E2 (mode rotate — does the token leave the app?), E5 (dual connect — which link refuses?) and the
P3 settings audit pass/fail log.

## Phases (one at a time; each ends green gates + commit + push, per the owner's standing ruling)

### P1 — Issue 11: mode rotate cycles again (APP, JS-only OTA; car only if evidence says so)

- Suspect **H1 (routing drops the token):** `selectMode` calls `setActiveMode(m)` then
  `sendCommand(m.token)` (`useControlHub.ts` L3253) — `sendCommand`'s closure still holds the OLD
  `activeMode`, so the token is routed by the OLD mode's `transport` list; if that list excludes
  the live radio, `routeCommand` returns neither bt nor ws and the token is silently dropped
  (L2617-2646).
- Suspect **H2 (echo revert):** the A-37 commit-grace window flips the optimistic pick back on a
  stale MODE echo; or the car NACKs (`NACK;E=UNKNOWN_MODE`).
- Evidence E2 decides the suspect. Fix, extend the vitest (`roboCarCatalog.test.ts` /
  `carProtocol.test.ts` already cover `nextRemoteModeToken`), device row U-113-1.

### P2 — Issues 2, 3, 4, 10: Remote screen chrome rebuilt (APP, JS-only OTA)

All in `src/screens/RemoteControlScreen.tsx`:

- **Merge** the disconnect row (L868-921, `h-7`) and the tabs row (L924-999, `h-7`) into ONE
  constant-height row: `[BT-disc?] [WiFi-disc?] · telemetry … · [D-pad][Joystick][Telemetry][Connectivity]`.
  The content area below gains ~28 px. Narrow-screen priority if it overflows: disconnect chips >
  tab pills > telemetry fields (final say with the owner, see Open Questions).
- **Conditional chips (issue 3):** today `connected` is a SHARED flag — the Wi-Fi status handler
  sets it true (`useControlHub.ts` L1745) and `handleWifiDisconnect` never clears it (L2324-2348),
  so the BT chip shows on a Wi-Fi-only link and survives its own disconnect. Introduce an explicit
  `btLinked = sppService.isConnected || bleService.isConnected` (mount reconcile L1266-1276 too),
  drive the BT chip from it, and make each chip disconnect ONLY its own transport
  (`handleWifiDisconnect` already does; give BT its own safe-stop that leaves Wi-Fi up).
- **Remove the phone-net chip** (L906-921, `testID="phone-net"`) and its now-unused selectors —
  the NetInfo discovery itself stays (smart-link uses it).
- **IP as THE link (issue 10):** chrome row right of Back keeps the broadcast IP, rendered as the
  tappable link (`handleOpenWebPage`); the long `deckLinkLabel` (L570-577) collapses to the short
  form (`BT+WiFi` / `Bluetooth` / `WiFi` + IP), and the duplicate page-link chip in the tabs row
  (L940-966) is removed. Keep the one link-status dot (U-108 ruling: ONE status).
- Acceptance: one row below Back; chips only for live methods and each disconnects just itself;
  no phone-net chip; IP chip opens the page; no duplicate link below; device rows U-113-2..4 with
  before/after screenshots.

### P3 — Issues 5, 12: Settings panel widened + fully audited (APP, JS-only OTA)

- Widen the dropdown (`absolute right-3 w-64`, L1307) to fit content (e.g. `w-80` / %-based with
  a max), re-lay the rows so labels + switches + helper text all fit without truncation, keep
  `maxHeight` scrolling behaviour.
- **Remove the "auto-join last router" toggle** (= "Boot auto-join (car)", L1391-1421 — its helper
  text literally says *"rejoins its last router"*). Open Question Q1 decides how deep the removal
  goes (UI only vs firmware default too).
- **Make the other auto-join fully working** ("Auto-join saved router (app)", `autoJoinRouter`):
  walk the smart-link path (`useControlHub.ts` L2945-3042, `carProfileService`) end-to-end on
  device; fix what's broken.
- **Audit EVERY control on the panel** and log pass/fail in the device rows: Wi-Fi toggle,
  BT toggle, Reset car data, Steering/Trim steppers (2WD1M gate), mode chooser + rotate (see P1),
  speed strip, the four tab pills, settings open/close, Back (navigate-without-disconnecting),
  reconnect/restart prompts, floating button drag. Fix the failures.
- Acceptance: `mobile/TESTING.md` checklist + device rows U-113-5..7; vitest green.

### P4 — Issue 6: BT heap diet (CAR firmware → 1.3.11) — THE main thing

- Measure first (heap waterfall per stage), fix per measurement (prime suspects: unused BLE
  controller memory, default ACL buffers, BT-restart-watchdog fragmentation), new contract rule
  `bt-heap` + mutants. **Re-tune the U-112 floors afterwards** — at 10-14 KB the 49152 B status
  floor defers telemetry to 1 attempt/4 s AND the 65536 B scan floor refuses every scan, i.e.
  today BT ON ≈ router list permanently busy. Details + acceptance in the master plan.

### P5 — Issues 7, 9: transport policy made honest (CAR firmware → rides the 1.3.11 flash)

- Wi-Fi OFF must drop the beacon AND the page (find why `stop()`/`softAPdisconnect` misses:
  `apRunning_` desync vs never reached vs cached phone scan); page must come up with NO client
  attached; both ON ⇒ hotspot + page + BT simultaneously. New gates `wifi-off-hides-ap` and
  `page-always-on` + mutants. Details in the master plan.

### P6 — Issue 1: dual BT+Wi-Fi link, end to end (APP + car)

- Depends on **P4** (heap headroom) — do not attempt both links at <14 KB.
- Reproduce from E5, then close the gap in the app's CONNECT sequence so the second link comes up
  while the first is live (the keep-both plumbing already exists — see Feasibility above).
- Confirm command fan-out is safe when both are live (`sendCommand` L2617: mode-based routing;
  `EVERY_LINK_COMMANDS` broadcast set) — no double-apply on the car; define which link is primary
  for commands (Q3).
- Extend `oneActiveLink.test.ts` / `linkManager.test.ts` (their current job is proving NO
  teardown) with the both-up connect path; device rows U-113-12..14: connect both, status shows
  `BT+WiFi`, disconnect each independently, commands work over each.

### P7 — Issue 8: prompt persistence + sync sweep (APP + car)

- Table every setting from P2/P3 (Wi-Fi, BT, auto-join, mode, speed, trim, steering, per-car
  prefs): source of truth → car NVS reply → DevicePrefs → cloud profile, with latency and failure
  mode. Owner's bar: "store in the car and app **pronto**".
- Fix the gaps found (e.g. `toggleCommitRef` grace, `queryCarTransportToggle` refresh on focus,
  cloud write batching); extend `carProfileService.test.ts` / `deviceProfileRegistryService`
  tests. Device row U-113-15: toggle → kill app → reopen → car reboot → still in sync.

### P8 — Issue 13: close-out

- All gates green: app (vitest, typecheck, lint) + car (syntax, webpage-js, firmware-contract,
  **mutate-gates clean-tree run**).
- Ledgers: app `mobile/TESTING.md`, both `TRACKS/NEXT-SESSION.md`, car `TRACKS/CHANGELOG.md` +
  `TRACKS/DEVICE-TESTS.md` (U-113-1..15), root `RESUME-HERE.md`, `TRACKS/RUNSHEET.md`.
- Ship: owner flashes 1.3.11 (huge_app, 115200), app publishes the JS-only OTA (3.2.7/60
  unchanged unless a native change sneaks in — none planned), both CIs green, `backup` branches
  re-snapshotted.

## Open questions for the owner (defaults chosen — say the word to change them)

- **Q1 (issue 12):** how deep does "remove auto join last router" go? Default = remove the toggle
  from the Remote settings AND stop the firmware boot-hop (so only the app's smart-link
  auto-joins). Alternative = hide the toggle only, firmware behaviour untouched.
- **Q2 (issue 2):** if the merged single row overflows on a narrow phone, may we shrink/drop the
  telemetry fields FIRST and keep disconnect chips + tab pills always visible? Default = yes.
- **Q3 (issue 1):** with both links live, should drive commands go over BOTH (current fan-out,
  idempotent on the car) or over one primary with the other as status-only? Default = both, since
  `EVERY_LINK_COMMANDS` already assumes it.

## Definition of done (issue 13)

All 13 issues closed with device evidence attached to their U-113 rows; every phase's gates green
including mutation proof; both repos pushed with clean trees; CI green on both; 1.3.11 flashed and
the app OTA published; `backup` updated. Device-verified means the owner's own captures, not our
gates (F-61 honesty rule).
