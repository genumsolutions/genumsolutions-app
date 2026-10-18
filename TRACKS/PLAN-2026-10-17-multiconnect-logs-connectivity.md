# PLAN 2026-10-17 — multi-connect + bug/freeze logs + connectivity responsiveness (APP half, mirror)

> **Status: PLANNING ONLY (2026-10-17).** No app byte changed. App version stays
> **3.2.7 / versionCode 60** (all phases here are JS-only → the OTA channel; a native change
> would need a bump, none planned). This file mirrors the master in
> `Genum_4WD4M_CAR\TRACKS\PLAN-2026-10-17-multiconnect-logs-connectivity.md` — **keep both in
> sync**. Cross-repo round note stays in the root `RESUME-HERE.md`.
>
> **Builds on, and does not reopen, the 2026-10-15 round** (`PLAN-2026-10-15-dual-link-and-
> remote-ux.md`, P1–P8, source-complete). This round covers what the owner reported **after**
> testing that body.

## PROGRESS — implementation log (live; update after EACH phase)

**Status: IMPLEMENTING** (owner said go, 2026-10-17). One phase at a time; each phase ends
with **typecheck + tests + format green → commit → push `main` AND `backup`** before the next
begins. If a session is interrupted, **resume from the first phase below that is not ✅** — each
✅ names the commit that carries it.

| Phase | Scope | State | Commit |
|---|---|---|---|
| P0 | evidence captures (owner bench, no code) | ⏳ owed — no device here | — |
| P1 | [B] reconnect/restart prompt → one pure decision | ✅ | app `8b2405f` (`P1/issue B`) |
| P2 | [C] reset strip leads with the last reset | ✅ | app `P2/issue C` |
| P3 | [A] dual-link connect ordering (needs P5) | ✅ | app `b887475` |
| P4 | [F car] link admission + `LINKCAP` | ✅ | car `50e5522` (`P4/issue 6`) |
| P5 | [F app] surface `LINKCAP` (absent ⇒ capable) | ✅ | app `f5dc333` |
| P6 | [D car] bounded event log + `LOG` verbs | ✅ | car `238b7bd` |
| P7 | [D app] per-car log viewer off the car profile | ✅ | app `3823014` |
| P8 | [E] connectivity responsiveness + "Car network" | ✅ | app `2476b2e` |
| P9 | [E car] findability (conditional on P8) | ⏳ deferred — gated on the owner's P8 device pass (no bench here; F-61) | — |
| P10 | close-out (ledgers, ship, backup) | 🔧 in progress | — |

Legend: ✅ done + committed · 🔧 in progress · ⏳ todo · ⛔ blocked. The Commit column
carries each phase's **commit-subject token** (a hash for the phases already landed) — find it
with `git log --oneline --grep "<token>"`. Car-half phases (P4/P6/P9) are committed in the
**car** repo; the ✅ row is copied here so the mirror still says where to resume.

## Owner request (2026-10-17, verbatim intent — six items)

1. **Dual-link BT + Wi-Fi connect problem** — connecting both still misbehaves; the concern is
   *when* the second link is raised and how the app tells the user.
2. **Reconnect dialog** — not shown at the proper time, shows stale/unnecessary messages,
   should offer **only Reconnect + Cancel** and be more advanced (state-aware).
3. **Reset status in the control panel** — **bare minimum (last reset only)** but done
   *better*.
4. **Bug / reset / freeze log** — see and act on it, **tied to the car's unique profile**.
5. **Connectivity responsiveness** — react faster to networks/updates/changes; let the user
   **tell the app where the car's network is**, or make it **automatic** if possible.
6. **Car freeze on multi-connect** — manage heap/resources, *or* have the app know
   multi-connect cannot be made because of ESP limits.

Standing directives: **smaller phases; don't overwhelm; proper failsafe notes; push
properly; plan before implementing.**

## 0 · Current state (what already exists — do not rebuild)

- **Dual link is structurally supported since U-105**; P6/issue 1 fixed the app-side gate so
  the Bluetooth scan no longer hides behind a live Wi-Fi link (`ConnectionSection.tsx` keys
  on `btLive`; `dualLinkConnect.test.ts` pins both directions).
- **The prompts already exist** as centered opaque modals: `RemoteControlScreen.tsx`
  `renderPromptShell` (L617–655), `renderReconnectBanner` (L657–697, Reconnect + Cancel),
  `renderRestartBanner` (L699–759, Reconnect + **Leave** + Cancel). Both were hardened by
  P2/issue 14 (opaque card, state-aware copy).
- **The reset record already renders**: `ToolsScreen.tsx` L253–262 → `buildRestartField`
  (`telemetryFormat.ts` L187–247) → the `Diagnostics` disclosure `"Last restart record"`
  (L437–449). Its headline value is the **crash count**, with reason+phase in the hint.
- **Fleet diagnostics + app logs already exist**: `crashReportService.ts` (one row per
  session → `device_crash_reports`); `appLogService.ts` (bounded local ring → `app_logs`);
  `listLocalLogs()` (L215–216) is written and **currently unused — "for any future on-device
  log viewer"**.
- **Per-car identity already exists**: `carFwId` = eFuse-MAC last-6-hex; `addressForMemory`
  (`useControlHub.ts` L715–731) → `fw:<boardId>` (preferred) → BT-MAC → `wifi:<ssid|ap|url>`;
  prefs in `deviceMemory` mirror to cloud `car_profiles` keyed `(user_id, profile_key)`.
- **Discovery already exists**: `discovery.ts` /24 sweep for the car's `/status`; NetInfo
  watcher (`useControlHub.ts` L2410–2429) → `autoDiscoverAndConnect()` (L2325–2399), 10 s
  cooldown / 15 s re-arm (max 6 ≈ 90 s).
- **No heap-based link admission and no "car cannot accept a second link" signal** exists in
  the app — the gap in item 6.

## 1 · Findings per item (source-level) — see the master for the full detail

- **A:** both links up works; the remaining gap is **ordering + honesty** — `handleConnect`
  flips `connected`/`btLinked` optimistically and there is no admission signal to distinguish
  "second link coming up" from "refused".
- **B:** `renderReconnectBanner` is gated on the single `showSppsRetry && !linked`; a
  Wi-Fi drop, a BT drop, an AP move and a restart all collapse into "nothing" or a generic
  message; the restart prompt still has **three** actions.
- **C:** the strip's value is the crash count; the owner wants the **last reset** to lead.
- **D:** no per-car viewer; the data exists in three places (car current record, app local
  ring, cloud rows) and the car has **no log-fetch verb**.
- **E:** auto-discovery only reacts to a genuine phone-network move; there is **no manual
  "car network"** control and no `isConnected`/`details` reactivity or mDNS shortcut.
- **F:** the car's guards defer telemetry / refuse scans but **never refuse a link**; the app
  has no way to know.

## 2 · Traceability — item → phase

| Item | A dual | B dialog | C reset | D logs | E connectivity | F multi-connect |
|---|---|---|---|---|---|---|
| Phase | P3 (app), P5 (app) | **P1** | **P2** | P6 (car) · P7 (app) | P8 (app) · P9 (car) | P4 (car) · P5 (app) |

## 3 · Phases (one at a time; each ends green gates + commit + push)

The app phases are P1, P2, P3, P5, P7, P8 (+ P0/P10). Car phases P4, P6, P9 and the full
acceptance/failsafe text are in the master. Device rows use a new **U-116** series in
`mobile/TESTING.md` (and `Genum_4WD4M_CAR/TRACKS/DEVICE-TESTS.md`).

- **P0 — Evidence + failsafe notes (no code):** capture M1 multi-connect soak, M2 reconnect
  timing, M3 reset strip screenshot; record the failsafe notes when P1 lands.
- **P1 — [B] Reconnect dialog (APP, JS-only OTA):** one **prompt-state decision** (pure
  function of live link facts) so Wi-Fi-drop / BT-drop / both-down / restart each get honest
  copy and a cleared cause auto-dismisses; **reduce the restart prompt to Reconnect + Cancel**;
  add a "link now / as of Ns ago" line. New `reconnectPrompt.test.ts`. Rows U-116-1..4.
- **P2 — [C] Reset status last-reset-only (APP, JS-only OTA):** lead with the last reset
  (`TASK_WDT · http-root`, heap only when small), counts secondary; keep the three honest
  states. Rows U-116-5..7.
- **P3 — [A] Dual-link connect ordering (APP, JS-only OTA):** raise the second link only
  after the first confirms; track the second link's pending/failed state; show "coming up…"
  instead of flipping `connected` early. New `dualLinkOrder.test.ts`. Rows U-116-8..9.
  Depends on P5.
- **P4 — [F car] Multi-connect budget + link admission (CAR → 1.3.13):** one
  `linkAdmission()` decision gates raising a second transport; when the budget is absent, keep
  the incumbent, don't start the second, and **report it** (`;LINKCAP=` / `/status`). Rows
  U-116-10..12. (Master detail.)
- **P5 — [F app] Surface the car's link capacity (APP, JS-only OTA):** parse the new field;
  when `LINKCAP=0` disable the second connect with a reason; **absent field ⇒ capable**
  (older firmware unchanged). New `linkCapacity.test.ts`. Row U-116-13.
- **P6 — [D car] Bounded event log the car can hand over (CAR → 1.3.13):** fixed-cap ring
  (boot / fault / low-heap / link transitions) + `LOG?` / `LOG;GET;<n>` / `LOG;CLEAR`; cleared
  by `FACTORY;RESET`. Row U-116-14..15. (Master detail.)
- **P7 — [D app] Per-car log viewer under the car profile (APP, JS-only OTA):** new panel off
  the car profile (Q6), fed by `LOG;GET` + the local ring scoped to the car + cloud rows;
  newest-first, level chips, **refresh / copy-share / upload / clear-on-car**; offline shows a
  labelled cached view. New `carLogViewer.test.ts`. Rows U-116-16..18.
- **P8 — [E] Connectivity responsiveness + "where is the car" (APP, JS-only OTA):** react to
  `isConnected`/`details`, shorten the settle bound, add a per-car **"Car network"**
  (SSID/subnet) probed **first**, try mDNS `genum-car.local` before the sweep; manual override
  wins. New `connectivityResponsiveness.test.ts`. Rows U-116-19..20.
- **P9 — [E car] Make the car easy to find (CAR → 1.3.13, conditional):** only if P8's device
  pass shows discovery is still unreliable; no new wire field without a same-commit app
  consumer.
- **P10 — Close-out:** all gates green; ledgers/records updated; ship 1.3.13 + the JS-only OTA
  (**3.2.7/60 unchanged**); both CIs green; `backup` re-snapshotted.

## 4 · Failsafe notes (to record when the owning phase lands)

Extends `guide/FAILSAFES.md` (next free number **F-85**). Full text in the master; the app-side
shapes:

- **F-85 — a prompt is a claim about the present.** Derive the prompt from live link facts each
  tick; dismiss when the cause clears. (P1)
- **F-86 — the headline row is the fact the owner acts on.** Last reset leads; counts are
  secondary. (P2)
- **F-88 — capability absent ≠ capability denied.** Only an explicit `LINKCAP=0` disables the
  second connect; a missing field means "capable". (P5)
- **F-90 — logs are per-device or they are rumours.** Key events to `fw:<boardId>`. (P7)
- **F-91 — a user can always say where the car is.** Manual "Car network" override persists
  and wins. (P8)

Car-side shapes (F-87, F-89) live in the master. Carried review gates: **F-61** (device
truth ≠ green gates) on every phase; **F-79** (three distinguishable dash states) in P2;
invariants **1** (non-blocking boot) and **2** (silence → stop) in P4/P6.



## P11 — webpage view power toggle (app only, 2026-10-19, JS-only OTA 3.2.7/60 unchanged)

Owner: add an independent "Webpage view" on/off switch that mutes the car's built-in
web page server (:80) without touching the Wi-Fi / Bluetooth transport layer or Bluetooth —
i.e. "wifi on/off AND webpage on/off" both present, both work.

### Implementation

- `mobile/src/components/tools/useControlHub.ts`:
  - new `pageOff` state + `setPageOff` callback;
  - `transportToggleRef`, `toggleCommitRef` and `toggleChangeProtected` extended with
    `pageOff`;
  - `setPageOff` sends `WIFICFG;WIFI;PAGE;ON|OFF` and persists the app device-prefs copy.
- `mobile/src/components/tools/types.ts`:
  - `pageOff?: boolean` added to `DevicePrefs`.
- `mobile/src/screens/RemoteControlScreen.tsx`:
  - "Webpage view" Switch in the Remote settings panel (`hub.pageOff` / `hub.setPageOff`).

### Gates

- `tsc --noEmit` 0
- `npm test` 813/821 (8 pre-existing failures in `connectivityResponsiveness.test.ts` +
  2 other files, unrelated to this change)

### Commit

`6ec2887`. Pushed to `main` + `backup` on all three repos (app, website, car).## 5 · Open questions for the owner (defaults chosen — say the word to change)

- **Q4 (items 1/6):** when the car cannot host a second link, should the app **(a) disable the
  second connect with a reason** (default) or (b) allow it and let the car refuse live?
- **Q5 (item 6):** acceptable fix = "manage the heap and keep both" **or** "refuse honestly"?
  Default = do both (keep both when the budget exists, refuse honestly when not).
- **Q6 (item 4):** where does the per-car log live — a **new per-car screen** off the car
  profile (default) or folded into the Control Panel `Diagnostics` disclosure?
- **Q7 (item 4):** auto-upload the car's event log to Supabase (fleet diagnostics, default
  yes, deduped) or only on an explicit **share** tap?
- **Q8 (item 5):** is a manual **"Car network" (SSID/subnet)** field acceptable in the
  connection panel (default yes)? (R-16a still forbids silent *router* auto-join — this is
  discovery only.)

## 6 · Definition of done

All six items closed with **device evidence** attached to their U-116 rows; every phase's gates
green including mutation proof; both repos pushed with clean trees; CI green on both;
**1.3.13** flashed and the app OTA published; `backup` updated. F-61 honesty applies: a green
gate is not device evidence.
