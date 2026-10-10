# NEXT SESSION — genumsolutions-app (updated 2026-10-10: the WiFi section is one action, a lost link is noticed, and a dead address is no longer retried forever)

## This session (2026-10-10) — the app stopped noticing a dead link, and kept the WiFi section honest

Owner: *"the car has changed the network through the browser control of its own hotspot and also
through the app also but the app is still in the old state on that network part … the app wait
for the same network to connect with previous state of the visual of the data and state.
Following this i have to manualy disconnect previous connection and rejoin again or go back
outside from the control pane and again enter inside."* Plus: *"the connection method is still
confusing specially for the wifi method … it show multiple things like connect and find the car
on the network … and the list of the available network without their caption heading. Also i dont
want subtitle texts at all."*

Two earlier commits (`a8b335d`, `60dfe69`) had already landed the NetInfo watcher and removed the
phone-switch prompt — but left the two real defects below, plus a pile of unused destructures.

- **THE STALE-VISUAL HALF.** `wifiService.onStatus`'s `disconnected` and `error` cases never
  cleared `linkVerified`, so a dropped link kept the OLD truth and the next paint could read
  live before any car had answered. Both now clear it.
- **THE "I HAVE TO REJOIN BY HAND" HALF — the real one.** `wifiService.scheduleReconnect(url)`
  re-dials the **same url** `MAX_RECONNECTS` times, then emits `error` and stops. When the car
  moved routers that address is dead *by definition*, so every retry can only fail — and then
  the app sat there until the user disconnected and rejoined, or left and re-entered the Control
  Panel. The `error` case now hands off to `autoDiscoverAndConnect()`, which already exists and
  is already guarded (inflight + 10 s cooldown + `manualClose` + a "does this phone have any
  Wi-Fi history with this car" test), and which runs the same remembered-lease + bounded /24
  sweep. It is read through `autoDiscoverRef` because that subscription is created with **empty
  deps** and cannot close over a callback defined further down; the ref is published by a
  `useEffect`, not a render-phase write.
- **The WiFi section is now ONE action.** "Connect to the car (`<ip>`)" and "Find the car on this
  network" were **redundant, not extra capability**: `handleWifiConnect` already runs the same
  sweep on *both* failure paths (refused and half-open), and `resolveDial` already dials the
  car-reported lease. `connectRouterLease()` and `findCarOnThisNetwork()` are deleted, along with
  their props — and `findCarOnThisNetwork` was a second copy of the hub's `findCarForUser` (same
  NetInfo read, same /24 sweep, same `/status` probe), so the deletion also removes the
  duplicate. Seven imports went with it (`NetInfo`, `CAR_WS_URL`, `CAR_STATUS_URL`,
  `PROBE_TIMEOUT_MS`, `findCarOnNetwork`, `probeCarStatus`, `subnetCandidates`) — all still used
  elsewhere in the repo, none orphaned by this.
- **"Available networks" now labels the list it names.** `60dfe69` had replaced "Connect to your
  car" with that caption at the **top** of the section — where it labelled the status card —
  while the actual list rendered below with no heading at all (the owner's *"the list of the
  available network without their caption heading"*). The caption moved down to sit directly
  above `WifiPanel`.
- **No guidance subtitles.** The switch prompt in `WifiPanel` was a two-line paragraph; it is now
  the single imperative line `Join <ssid> on this phone`. Android will not join silently, so it
  stays — it is an action the user must take, not narration.
- **Residue `60dfe69` left behind, removed:** `showSppsRetry`, `handleSppsRetry`,
  `handleReconnectPromptCancel`, `lastRouterIp`, `routerSwitchNotice`,
  `dismissRouterSwitchNotice` (all destructure-only), a `console.log("[W5] …")`, and a doc
  comment above `disconnect()` describing a `/status` probe that is not what that function does.
- **Phone-network detection already worked, verified not assumed:** `phoneNetworkKey` uses the
  SSID when Android grants it (both location permissions are in `app.json`) and otherwise falls
  back to the phone's /24 — the right granularity for "did this phone move".

**Gate.** `oneActiveLink.test.ts` (the comment-stripped source reader, per its own header — this
repo has no component harness) gains three rules: every WiFi status case that ends the link must
clear `linkVerified`; the `error` case must hand off to `autoDiscoverRef.current?.()`; and the
ref must be published inside a `useEffect`. **Proven in BOTH directions** — each was mutated in
turn, each failed by name, restore verified byte-exact. (First attempt at mutant 1 was a false
negative: vitest exited 1 on "No test files found" because the run was launched from the wrong
cwd. Re-run correctly, it fails on the rule as intended. Recorded so the same trap is not
mistaken for a pass again.)

**Gates:** tsc 0 · prettier clean · vitest **664/664** (45 files, was 660). JS-only → same-version
OTA 3.2.7/60, no APK.

**NOT device-verified (F-61).** The reconnect-refinds-the-car path needs the owner's bench: switch
the car's router from its own page while the app is connected, and confirm the app re-finds it
without a manual disconnect.

## This session (2026-10-09) — no source change; main verified, backup refreshing records

- **main is pushed and up to date.** The auth keep-signed-in fix (`0d6604d`) from the
  previous session is on origin: local `main` == `origin/main` == GitHub
  `refs/heads/main` == `0d6604d`, 0 ahead/0 behind, clean tree, no stashes. There was
  nothing forgotten — confirmed by fetch + `ls-remote`.
- **The `backup` branch was refreshed to `0d6604d`** on origin (was `d630122`), so the
  app repo's backup snapshot now matches `main`. Dated snapshots
  (`backup-2026-09-25-round`, `backup-2026-09-27-pre-bump`) are untouched.
- The car-side partner work this session was the 4WD4M OLED network lines
  (`Genum_4WD4M_CAR` v1.2.4, commits `7731f2b`+`0285eee`, backup branch added) — **still
  not flashed**, and the app's device pass (`mobile/TESTING.md` U-93-1..5, U-98
  one-active-link checks) still awaits that flash.

Gates/state unchanged from `d495839` round: tsc 0 · vitest 660/660 · prettier clean;
JS-only, no OTA published this session.

> **READ FIRST (2026-10-08, U-98 — the last thing worked on, and the reason it mattered).**
> The app kept BOTH transports connected at once: a Wi-Fi connect left the Bluetooth SPP socket
> open (and `routeCommand` kept sending drive letters to it), a Bluetooth connect left the Wi-Fi
> socket reachable, and each transport's status handler cleared the OTHER one's link truth. Three
> defects, one round:
>
> - **Bluetooth never verified.** Only the Wi-Fi paths set `linkVerified`, so a Bluetooth connect
>   left the Control Panel's Connection card on **"Connecting…" with the gold dot forever** while
>   the Remote deck already said Connected. Now the SPP `connected` event sets it.
> - **The teardown clobbered the survivor.** `dropBluetoothForWifi()` (the new helper that makes the
>   picked method the ONLY live one) did `setConnected(false)` *after* `sppService.disconnect()` —
>   which fires the status handler that clears `linkVerified` — on a Wi-Fi socket that was up and had
>   just answered the car. Net result of a successful Wi-Fi connect: `connected=false` → the 2 s
>   REQ_STATE poll (keyed on `connected`) stopped with a live link, and the status card read
>   "Connecting…". **This was found by reading the WIP, not by a red gate.** Fixed twice over: the
>   helper now hands `connected` to the surviving Wi-Fi socket
>   (`setConnected(wifiService.isConnected)`), and the SPP handler only clears
>   `connected`/`linkVerified` **when Bluetooth is the link it owns** (`!wifiService.isConnected`) —
>   which also fixes a *failed* Bluetooth attempt un-verifying a working Wi-Fi link.
> - **Disconnect was a loose button** under the status text. `ConnectionCard` gained a `right`
>   title-row slot (+ `ActionButton compact`, same tokens/press rules, `h-7`/11px), and the
>   Connection card owns its own Disconnect there. `testID` `conn-disconnect` is unchanged.
>
> **Regression net:** `src/components/tools/oneActiveLink.test.ts` (5 rules). It reads the **raw
> `useControlHub.ts` source with comments stripped** — stated in the file header because this repo
> has no component harness — and it was proven **both directions**: four mutations (helper claims no
> link · clears unguarded · one teardown call dropped · stale `linkVerified` kept), each caught by
> ITS OWN named rule, plus a wrong-anchor run that failed the "has sources" vacuity net rather than
> passing silently. Restore → 5/5 green.
>
> **Gates:** tsc 0 · vitest **659/659** (45 files) · prettier clean. **JS-only → same-version OTA
> 3.2.7/60, no APK.** Not device-verified: connect by Bluetooth, confirm the status card goes LIVE
> (not stuck "Connecting…"), connect by Wi-Fi with Bluetooth up (the two must never be live
> together), disconnect from the card header.

## 1. U-98 — one active link at a time (2026-10-08, this session)

What shipped, in code terms:

- **`components/tools/useControlHub.ts`**
  - SPP status `connected` → `setLinkVerified(true)` (the Bluetooth half of the card's truth).
  - SPP status `disconnected`/`error` → clear `connected`/`linkVerified` **only if
    `!wifiService.isConnected`**; `setDeviceName("")` stays unconditional (it is the BT name).
  - New `dropBluetoothForWifi()` — BLE + SPP down, `manualClose` on both so neither auto-reconnects,
    then `setConnected(wifiService.isConnected)`. Called from all **three** Wi-Fi success paths
    (user address, stale-lease find, refused-connection find) — only on success, so a failed Wi-Fi
    attempt never destroys a working Bluetooth link.
  - `handleWifiDisconnect` → `setLinkVerified(false)` (one live link: dropping it leaves nothing
    verified).
- **`connection/ConnectionCard.tsx`** — `right` slot on the title row; `ActionButton` gains
  `compact` (h-7 / px-2.5 / 11px, same variants and disabled rule — a compact SHAPE, not a new one).
- **`connection/ConnectionSection.tsx`** — the status card renders Disconnect in `right` and no
  longer carries it as a full-width body button.

Deliberately NOT done: no `setLinkVerified` change in the **Wi-Fi** status handler (a Wi-Fi
`disconnected` arriving during a Bluetooth session must not un-verify the Bluetooth link — the same
defect, mirrored) and BLE is untouched (gated "Coming Soon", no dial path).

## 2. U-97 — the restart record now goes to the fleet, not just the dash

> **READ FIRST (2026-10-08).** U-95's restart record now leaves the phone: on connect the app
> uploads it to Supabase so faults are tracked fleet-wide. Plus the Control Panel's connection
> methods became three equal cards.

U-95/U-95b got the car's restart record (reset reason, boot/crash counts, last crash phase + heap)
onto the phone and into the Restarts row. That is still a copy that dies with the phone. **U-97
uploads it.**

- **New table** `public.device_crash_reports` — migration
  `genumsolutions-website/supabase/migrations/20261008180000_device_crash_reports.sql`. One row per
  connection session snapshot. RLS: signed-in users read/insert their own; `is_staff()` manages all;
  anon may insert (honest diagnostics, no account required). `device_id` is resolved (best-effort)
  from the board id to `devices.unique_id = 'fw:<boardId>'`; `user_id` is null for anon.
- **New service** `services/crashReportService.ts` — pure `buildCrashReport` / `crashReportKey` /
  `shouldSendReport`, plus `syncCrashReport` / `flushCrashReports`. Offline-first: a failed push
  queues in AsyncStorage (`genum.crashReports.queue`, cap 50) and flushes on the next connect. The
  last-synced key (`genum.crashReports.last`) dedupes so the looping `/status` frames cannot
  re-report — **one row per restart record**, a new boot/crash/reason is a new row. Missing fields
  stay `null`; `has_crash` is derived from a real `crashCount`, never defaulted. Pinned by
  `crashReportService.test.ts` (19 tests).
- **Wiring** `components/tools/useControlHub.ts` — one effect keyed on link-up + the restart fields;
  fires once per distinct record per session. Missing board id or a pre-1.2.0 car → nothing sent.
- **✅ Migration APPLIED 2026-10-08** to project `bkylfnlybtsujwzropru` via the Supabase Management API
  (CLI not installed). Verified: table exists, 4 indexes, 3 RLS policies, empty (0 rows). Anon INSERT
  confirmed working through RLS. No flash needed — this is app + website only.
- **How to apply future migrations without the CLI:** PUT the SQL via
  `POST https://api.supabase.com/v1/projects/bkylfnlybtsujwzropru/database/query` with
  `Authorization: Bearer <access token>`. The personal access token lives in `C:\bs\.env.local`
  (`SUPABASE_ACCESS_TOKEN`, gitignored, added 2026-10-08, **expires ~2026-11-07** — rotate before
  then). The endpoint takes one query string; this migration was sent statement-by-statement because
  a single multi-statement body returns 413.

## 3. U-97 — three equal method cards (owner 2026-10-08)

Owner: *"show connection methods as three equal cards"*. `ConnectionSection`'s U-69 method dropdown is
replaced by three equal, always-visible cards (Bluetooth / Wi-Fi / Internet) with a section heading
("Connect to your car"). Internet stays rendered but visibly disabled with its reason. Choosing a
card swaps the setup card below exactly as the dropdown did. `methods.ts` gains real blurbs for
Wi-Fi and Internet. Contrast guard still passes (tokens only).

---

> **READ FIRST (2026-10-06).** Two things closed the loop between this app and the 4WD4M car, plus a
> dead-code pass. The firmware was **not compiling** at the start of that session — the car repo's own
> syntax gate had been reporting `PASS 9/9` while skipping the `.ino`, which is where the break was.
> That is fixed (`Genum_4WD4M_CAR e457393`). If you read only one thing here, read #1 and #2.

## 1. U-95's restart record now actually reaches the owner

The car has persisted *why* it rebooted since U-95 — boot count, crash count, reset reason, boot heap,
the phase it was executing — and ships all of it on `/status`. **This app parsed `free_heap` out of that
same JSON object and silently discarded every restart field.** U-95's entire premise was that the only
copy of the diagnostic was a Serial line printed at the instant of the fault, on a wire nobody was
attached to; the record had to go where the owner already is. The owner was on their phone. It did not
get there.

- `services/carProtocol.ts` — `CarTelemetry` gains `resetReason`, `bootCount`, `crashCount`,
  `lastCrashPhase`, `lastCrashHeap`, parsed beside `free_heap`. **`phase` is deliberately NOT mapped**:
  it is the *live* phase and changes every frame, which would turn a record of something that happened
  into a permanently-true value. Pinned by a test so nobody adds it back.
- `components/tools/telemetryFormat.ts` — `buildRestartField()`. Kept OUT of `buildCarTelemetry` so the
  fixed six-reading strip keeps its shape and its tested ordering. It separates three states that look
  identical on a dash:
  - `crash_count: 0` → **"None"** — a real reading. Dashing it would be a lie.
  - field absent (pre-1.2.0) → **no row at all**. A dash would imply all-clear from a car that never
    checked.
  - offline → dash. The record describes the last car we saw, not this one.
  On a real crash the hint names reason **and** phase — `TASK_WDT during http-root` — which is the
  difference between "it resets again and again" and a bug report. Heap is mentioned only below 64 kB.

**First thing to do after flashing the car:** the Restarts row on the Tools panel. If `crash_count`
climbs, it names the operation.

## 2. Two dead deep links / routes corrected

`App.tsx` linked `CarRemote: "car/:productId"`. **No route named `CarRemote` exists** — the screen is
registered as `RemoteControl`, whose only param is `category`, not `productId`. So that link pointed at a
route that does not exist *and* carried a param it never had. Now `RemoteControl: "car"`. Nothing in
`src` generated such a link, which is why nobody noticed.

## 3. Dead-code sweep (2026-10-06) — what went, what stayed

**Removed (provably zero references, verified by grep before deleting):**
- `transports/linkManagerHooks.ts` — **6 dead exports**: `useActiveTransport`, `useTransportList`,
  `useSelectedTransport`, `useActiveTelemetry`, `useActivateTransport`, `__resetRegistrationForTests`.
  Not one screen imported any of them, and the "test-only" reset had no test either. Three comments
  (`ToolsScreen`, `useControlHub`, `linkManager`) nonetheless described screens as *using* two of them —
  which is how six dead hooks sat there looking load-bearing. Those comments are fixed too. The file is
  now registration-only, so its **name over-promises**; left as-is because a rename touches the two live
  importers and is a bigger diff than the dead code it removes.
- `useControlHub` — `setSensorData` (bound but never called; `sensorData` itself is live and still
  returned), `smartLinkScanTimerRef` (declared, never read/written/cleared), and a second
  `showSettings`/`setShowSettings` pair that was **never returned** and is not the one
  `RemoteControlScreen` uses — those two were never connected and looked accidental.

**Two vacuous tests made real.** Both could not fail as written:
- `catalogFilters.test.ts` "sort option type safety" built a *local* array of 4 literals and asserted
  its own length — `SORT_OPTIONS` was never imported. Now asserts the real constant.
- `roboCarCatalog.planned.test.ts` asserted `typeof isCarModeBuilt(...) === "boolean"`, a compile-time
  fact. Now pins the actual contract: planned → `false`, live → `true`, **unknown → `true`** (a
  catalogue miss must never hide a working mode). *(First attempt at this asserted planned → `true` and
  failed: the function returns `!isPlanned`. The failed version is the honest record of the trap.)*

**Stale comments corrected (documentation only, zero behaviour change):** 7 files referenced design docs
that **are not in the repo** (`ARCHITECTURE.md` and 6 `guide/*.md`) — marked as absent rather than
pointed at an unrelated surviving file. `AdminScreen` claimed "6 tabs" (there are 8, Catalog split into
three). `navigation/types.ts` said the bottom bar was "Home/Shop/Cart/Menu" — Cart moved to the stack.
`MainTabPager.tsx` described keeping Cart mounted in the pager "so existing call sites work"; there are
**zero** such call sites. `RemoteControlScreen`'s layout diagram showed an `[E-STOP]` FAB that is not
rendered (`handleEStop` is returned by the hub and consumed by nobody, and the firmware has **no ESTOP
handler at all** — car FAILSAFE #11). `ProductDetailScreen` + `App.tsx` referenced a `CarRemote` route
that does not exist. `deckkit.ts` claimed step ① shipped one deck; step ② shipped all five.

---

# (earlier session notes follow)

**U-93 (2026-10-04) - THE CONTROL PANEL'S ROUTER ACTIONS, HONESTLY.** Owner: _"the router select
is not working sometime, even if the app and the car is the same network the connect device button
doesnt work and also the list of the available save networks deleted button is not working and
also not able to edit those … complete those things … make that control panel page more smooth
and userfriendly … remove the duplicates things, residues, bugs, and discrepancies … make note of
things so that you dont miss a thing."_ Full diagnosis + owner decisions (ask_user: auto-find +
honest states; **internet methods DEFERRED** to their own gated plan; Edit = set a new password)
in `guide/PLAN-2026-10-04-U93-CONTROL-PANEL-ROUTER-ACTIONS.md`.

1. **THE DELETE BUTTON NEVER REALLY WORKED — TWO STACKED BUGS.** The hub's `routerDelete` sent
   the DEL line RAW and persisted an OPTIMISTIC local list (no ack, no timeout, no error — the
   exact F-62 pattern U-71's ledger condemned); and the section's `deleteRouter` went through
   the ack path FIRST, so the car received the same DEL TWICE — the second answering
   `ROUTERS;ERROR;Not saved:<ssid>`, a working delete reporting failure (car U-88 measured
   exactly this shape for a double DEL). **Now: one command, one answer** — `requestRouter` is
   the only sender, `consumeRouterAnswer` derives the mirror from the CONFIRMED answer, and
   `routerDelete` is a pure confirmed-mirror helper (no wire access).
2. **THE CONNECT BUTTON'S STALE ADDRESS.** `handleWifiConnect` dials the car's LAST reported
   address — dead after every router switch — and the U-80 auto-find rescue ran only on the
   socket-REFUSED path. A HALF-OPEN connect (socket opens, car silent — the classic
   stale-address shape) gave up with no search. **Now both failure paths look** (remembered
   lease probe, then the bounded /24 sweep), and the honest error names the real suspect: the
   car's address may have changed.
3. **EDIT EXISTS AT LAST.** Saved rows gained an Edit affordance (pencil, `wifi-edit-<ssid>`):
   it opens the form with the name fixed and asks for the NEW password (never prefilled — the
   car never echoes one, W-14). Submit runs the switch plan with a password: the ADD step is an
   upsert by SSID (U-88 bench: "ADD again → ADDED") followed by the USE confirmation. No
   firmware change needed.
4. **HONEST DISABLED STATES.** The scan button now says "Connect to the car to search" instead
   of silently doing nothing without a link — the "router select not working sometimes" was
   mostly this plus the stale address above.
5. **Residues:** row keys now SSID+index (an SSID can appear as active AND nearby); the edit
   form title (`wifi-edit-title`) and submit label change; `planSwitch` for an edit reuses the
   add path by design (one grammar).

Gates: tsc 0 · vitest **615/615** (42 files) · prettier clean. Device rows **U-93-1..5** in
`mobile/TESTING.md` — ALL UNTICKED. Next up after the owner's pass: the Internet-method plan
(deferred by owner decision this round), then the round-end app/car/website hygiene sweep.

**U-94 DESIGN WRITTEN (2026-10-04, no code).** The Internet-method gated design is at
`guide/PLAN-2026-10-04-U94-INTERNET-METHOD-DESIGN.md`: WSS relay, both ends dial OUT, pairing
by the car's board id, the SAME locked byte grammar over the relay (no new grammar), the W-14
analog for relay credentials, four sequential phases (relay service → car firmware on the
TESTBED only → app flip → device round on a DIFFERENT network). Owner questions Q1 (relay
implementation — Supabase-based recommended), Q2 (claim model — device-registry claim
recommended), Q3 (timing — after the U-90/U-92/U-93 device pass) await answers before ANY
build. MQTT/BLE/mDNS/ESP-NOW rows unchanged (roadmap untouched).

**U-91 (2026-10-04) - THE ONE RESPONSIVE IDIOM: no screen derives its own viewport facts any
more.** Owner: _"Untangle the app's legacy viewport/responsive CSS debt before the next UI
round"_ (picked the shared-JS-hook option). Pairs with car U-90 (pushed first, per "fix these
first and push properly").

1. **NEW `src/lib/viewport.ts`** — `useViewport()` (live width/height + `isLandscape` +
   `isWide`), ONE breakpoint (`WIDE_BREAKPOINT = 640`, RouterPanel's existing `sm` — semantics
   unchanged), the U-47v5 home-strip rule (`homeCardWidth` + `HOME_CARD_GAP`), and the
   no-frozen-reads rule pinned by `viewport.test.ts` (8 tests: breakpoint boundary, the square-
   counts-as-portrait landscape rule, the card formula, and a source check that the module
   itself never calls `Dimensions.get`).
2. **THE ACTUAL BUG FIXED — HomeScreen's module-load constant.** `HOME_CARD_W =
(Dimensions.get("window").width - 40 - 12) / 2` was computed ONCE at import; the app ships
   `"orientation": "default"` AND a web build, so after a rotation or window resize both home
   carousels kept portrait-width cards and a wrong snap interval forever. Now derived from the
   live viewport every render; the U-47v5 two-cards-per-viewport rule is unchanged (pinned).
3. **MIGRATED to the shared hook** (semantics identical, verified by tsc + 615 tests):
   RouterPanel (`isWide`), RemoteControlScreen (`isLandscape`), AccountSheet (card sizing),
   ModeChooser (dropdown height budget). **FloatingRemoteButton deliberately NOT migrated** —
   its drag-time `Dimensions.get` reads are EVENT-time (correct: avoids re-render churn
   mid-drag) and the component is device-proven (2026-09-29 round); do not "migrate" it.
4. **Why JS-side and not Tailwind variants:** NativeWind compiles `sm:`-style classes at BUILD
   time (no runtime media query on native), and the codebase uses zero breakpoint classes —
   the JS hook IS the responsive layer.

Gates: tsc 0 · vitest **615/615** (42 files, +8) · prettier clean · eslint clean (pre-commit
hook). CI/OTA verified from the GitHub API at `35aaa24`: CI ✓ #253 · OTA Only ✓ #218 · OTA Guard
✓ #21, and the LIVE manifest carries this build ("OTA · Short update (35aaa24…)" at 3.2.7/60) —
the owner's next close+reopen installs it. NOT yet seen by the owner on a phone (rotation on the
Home tab is the visible check — mobile/TESTING.md U-91-1..2).

**U-92 APP CHECK (2026-10-04, no app change needed).** Owner asked whether the app has the same
own-hotspot problems the car's webpage had. Verified in source, no fix required: `routerList.ts`
already dedupes the car's list by normalized name ("the user must not see two rows that are one
router") and `switchableRouters()` excludes the own AP entirely — so the double entry the
poisoned car registry produced never reached the app's switch UI; the app's hotspot switch
sends the same `ROUTERS;USE;<ownAP>` that car U-92 makes actually leave the router; and the
U-80 phone-switch prompt still fires on the `ROUTERS;USED;` answer. All fixes live in the car
repo (firmware 1.0.5, `d325884`).

**U-86…U-89 (2026-10-03, backfilled 2026-10-04) - THE FOUR ROUNDS AFTER U-80, RECOVERED FROM THE
COMMIT BODIES.** This ledger was not written while the rounds happened — the git commits
(`23524c0`, `e4a9132`) are the primary record and everything below is condensed from them. Gates
re-verified 2026-10-04 at `e4a9132`: tsc 0 · vitest **607/607** (41 files) · prettier clean.

1. **U-86 (`23524c0`) — one Wi-Fi target, the hotspot reachable again, page retitled.** Owner,
   four things at once. ① Switching back to the car's own hotspot was REFUSED in `planSwitch` —
   now allowed as a USE-only step (T-66: clearing the ACTIVE pair never touches the saved
   registry; the AP has no password and must never enter it). ② "The car's hotspot" + "Your home
   router" merged into ONE `car-wifi` target — the split described how the phone reaches the car,
   not anything the user chooses; network names come from the car's own NETW line, and
   `resolveDial` uses whatever address the car reports (AP constant only as fallback). ③ The
   useless subtitle texts are gone: method blurbs, per-target requirement paragraphs, the two
   explanatory blocks under Connect/Find, the "The car is answering on this link" line; the
   router-switch prompt is now the one instruction to act on. ④ The page title moved to a FIXED
   header OUTSIDE the ScrollView (it used to scroll away and compete with the first card); the
   dashboard starts directly beneath a title that never moves. Two tests that PINNED the old
   two-target design were rewritten to assert the opposite: no method may offer a target choice
   again. Gates at the time: 593/593.
2. **U-89 (`e4a9132`) — the Wi-Fi controls were hidden on a working connection.** Owner: _"the
   wifi method is not built well and complete, not everything works"_ and _"the car is at
   nijandangal_2.4 and the app is also at the same, there proper response while clicking
   connect"_ — connected, responding, and NO configuration UI. Cause: the Wi-Fi panel (saved
   routers, tap-to-switch, search, add form) renders only when the selected method is "wifi", and
   that was set ONLY by tapping the dropdown. Automatic discovery, the Connect button, and an
   already-up link never set it. `effectiveMethod()` now falls back to the link actually in use;
   an explicit choice still wins. NO firmware change was needed — driving the car directly
   showed every operation answers exactly once (U-88 landed first; what remained was the app
   never asking). **Harness corrections, recorded so they are not re-investigated:** twice this
   session "the car sends no answer" was WRONG — the reply rides inside `STATE;…;REPLY=…` and the
   filter looked for a line STARTING with `ROUTERS`. `realCarBytes.test.ts` now pins the parsers
   against the bytes the car ACTUALLY sends (the pre-existing tests used a hand-written STATE
   line with `CONNECTED=1;CAP=LIVE` the real car never emits).
   **⚠ CORRECTED 2026-10-04 — a THIRD claim was the same harness fault, and the open decision is
   resolved:** the original round noted _"ROUTERS;USE on an SSID the car does not have does NOT
   answer"_. False — read in the firmware (WebServerComm.cpp, the `;USE;` handler), EVERY branch
   answers: `USED;<ssid>` (own AP / saved / added-on-the-fly) or `ERROR;SSID length` /
   `ERROR;Password too long` / `ERROR;Reserved` / `FULL`. What is true: USE on an unknown SSID
   ADDS it and switches instead of refusing — deliberate, shipped by T22 (`cd3158f`) to fix
   USE-on-unknown REBOOTING the car, with its own device row (T22, car DEVICE-TESTS). Ruling:
   the behavior STAYS (it is the car's "type a new network and join it" path) and it is fully
   standard for the app — the answer is the same `REPLY=ROUTERS;USED;<ssid>` byte shape (pinned
   in realCarBytes.test.ts) and the U-71 routerMemory already records a USED name it did not
   previously know. No code change; only this record.

**CI/OTA verified 2026-10-04 from the GitHub API:** `e4a9132` → CI ✓ #249 · OTA Only ✓ #217 ·
OTA Guard ✓ #20, and the LIVE manifest carries _"OTA · Short update (e4a91324…)"_ at 3.2.7/60 —
**the U-89 build is the currently published OTA**; the owner's next close+reopen installs it.
`23524c0` → CI ✓ #248 · OTA Only ✓ #216 · OTA Guard ✓ #19. This backfill's own run: CI ✓ #250.
The car repo's CI could NOT be re-checked (private repo, unauthenticated API 404) — treat
`5e04df7`'s Arduino CI as last-seen-green from the previous session.

**U-80 (2026-10-03) - THE CAR SWITCHED NETWORKS → THE PHONE IS TOLD, AND THE APP FINDS THE CAR
ITSELF. Owner: _"prompt the user to switch the phones network router too when the car switches the
network but simply"_ · _"the car app doesnt show where the car is for the new routers"_ ·
_"all the networks at one place ... the default hotspot is the last option"_ · **fleet ruling:
old cars KEEP ESP_SER/ESP_CLI — the app must not break for them.** Pairs with car firmware U-79
(Genum_4WD4M_CAR `abb7297`, webserver mode deleted, transport power policy).

1. **PHONE-SWITCH PROMPT (simple, as asked).** The moment the car answers `ROUTERS;USED;<ssid>` on
   ANY transport, the hub sets `routerSwitchNotice` (auto-expires 4 min, dismissible) and the
   Control Panel shows ONE card: "The car switched networks — Join <ssid> on this phone, then
   reconnect here", with one button ("I joined — find the car" → the U-74b sweep) + Dismiss. This
   is the surface the owner never had: the AP link drop during a switch is EXPECTED (one radio,
   one channel — U-74), and until now the app went silent exactly when the user needed telling.
2. **AUTOMATIC DISCOVERY (owner picked "Automatic").** `handleWifiConnect`'s failure path now runs
   `findCarForUser()` BEFORE reporting failure: remembered lease / bounded /24 sweep of the
   phone's own subnet (the U-68/U-74b pure engine, no new APK), then dials the found car and
   reports "Car found automatically at <ip>". A phone that followed the car onto a new router now
   reconnects WITHOUT the user hunting for an address.
3. **FLEET SAFETY (the constraint that shaped the round).** No mode list was hardcoded anywhere:
   the app already renders availability from each car's own CAPS map (parseCapsBody →
   carStubMap/carAvailMap → modeAvailStatus), and `roboCarCatalog.ts` intentionally keeps the
   ESP_SER/ESP_CLI tokens for the older cars (a new-firmware car NACKs those tokens and stays
   put — no harm). `nextRemoteModeToken` keeps the fleet order for old cars. Result: the 4WD4M
   car (U-79 firmware) simply never advertises those tokens; old cars keep theirs; one APK
   serves both.
4. **Residue:** the stale "switching to Webserver/join mode" provisioning toast now says what
   actually happens ("it is joining that network — join it on this phone too").

Gates: tsc 0 · vitest 543/543 · prettier clean. `probeCarStatus` moved to connection/discovery.ts
(pure module — the hub shares it). OTA publishes automatically on push (runtime unchanged).

CLEANUP ROUND 2026-10-03 (U-78, paired with car firmware U-77): repo hygiene audited end to end —
tsc 0 errors, **543/543 vitest tests pass**, prettier --check clean, git side clean (android/,
keystores/, releases/, dist/ all correctly gitignored — signing material stays local only).
Residue removed: **`src/services/wifiDiagnostics.ts` + its test deleted** — the engine had ZERO
runtime importers; the UI half was already removed by the owner's U-64 ruling ("panel simplified,
handoff confirms, diagnostics gone"), so the module was dead weight kept alive only by its own test
(553 → 543 tests, the delta is exactly its 10). Orphan sweep over 129 src files: everything else is
reachable (App.tsx imports RootNavigator/SignInSheet/analyticsService; `.web.tsx` files resolve via
Metro platform selection; `adminTabs.ts` is the B-6 parity fixture pinned by `admin-parity.test.ts`).
No console.logs, no TODO/FIXME debt, no stale files in src/.

FIXED 2026-10-02 (U-71) - THE OWNER ASKED WHETHER THE PREVIOUS ROUND WAS INTERRUPTED. IT WAS:
U-70 deferred only WiFi.begin(); the boot auto-join and the last-good persistence had not been
started. All of it is now finished, plus the settings-in-the-database request.

FIRMWARE 7ba6152 (Arduino CI 37035295780, SRAM 69,764 B / 21%, +112 B):

1. THE RESTART - the strongest explanation yet, and a REAL defect. WiFi.mode() and softAP() were
   still running synchronously inside rejoinNetwork(), which is called from ModeManager::run()
   INSIDE loop(). On ESP32 WiFi.mode() RESTARTS the WiFi driver; a driver restart plus softAP() plus
   begin() can occupy loop() long enough to trip the 5 s task watchdog - and the WDT's action IS a
   reboot (F-24). That fits the report exactly: the switch churns the radio in the command path and
   the very next thing to arrive is an HTTP request served by that same driver. rejoinNetwork() now
   does NO RADIO WORK AT ALL - it only arms a state machine that handle() advances with ONE radio
   call per loop pass (MODE -> AP -> BEGIN). loop() returns between steps, the WDT is fed, and the
   web server can ANSWER a request in between - exactly the window that used to be missing. U-70's
   staBeginPending_ flag is REMOVED, not layered on: U-71 supersedes it. Not claimed as fixed until
   U-70-4 is run - but it is now a mechanism with an explanation, and the reset-reason line will
   confirm or refute it.

2. THE CAR REMEMBERS THE ROUTER THAT WORKED, NOT THE ONE IT WAS ASKED FOR. storedSsid_ is written to
   NVS the moment ROUTERS;USE stores the pair - BEFORE any association is attempted - so a FAILED
   switch overwrote a working router with a broken one, and a boot would retry the router that had
   just failed. New lastGoodSsid_/lastGoodPass_ (NVS last_ok_ssid/last_ok_pass) are written ONLY from
   the connect-success path. "What we tried" and "what worked" are separate facts; only the second
   survives a power cycle.

3. BOOT AUTO-JOIN, DELIBERATELY BOUNDED. armBootAutoJoin() runs at the end of beginAlwaysOn().
   WARNING - THIS REVERSES R-16/T-64 ("the own AP is THE default network; a stored router is joined
   ONLY on explicit request"). The owner has overridden that ruling and it is recorded here rather
   than quietly done. The reason the rule existed still stands, so the override is BOUNDED: the boot
   attempt gets BOOT_STA_TIMEOUT_MS (6 s) and BOOT_STA_MAX_RETRIES (1), then settles AP-only
   immediately. The full retry budget stays reserved for an EXPLICIT user switch, where the user is
   watching. An unreachable router therefore cannot keep the car off its own hotspot for more than a
   few seconds - and the hotspot is the only way in when the router is absent. A router that has never
   once connected is never auto-joined, so the boot window is never spent on something already known
   to fail. Budget is per-attempt state and restores to normal the instant an association succeeds.

APP d495839 - a REAL gap I introduced in U-68, and it hit the user's most common action. The old
routerUse/routerAdd persisted an optimistic list, so a switch WAS remembered. The ack-consuming path
(requestRouter / runSwitchPlan) only persisted on a `list` answer - so adding or SWITCHING a router
updated the car and the screen and wrote NOTHING to AsyncStorage or to the Supabase car_profiles row.
Now every CONFIRMED change is remembered and the list is derived from the car's ANSWER, never from
what the app hoped would happen: ADDED adds that name, USED adds it and records it as lastWifiSsid
(so the field pre-fills and the smart-link's recency pick starts from the truth), DELETED removes it,
CLEARED empties it, a list replaces wholesale. A REFUSED answer (FULL / Reserved / Password too long
/ SSID length / Syntax / Not saved) changes NOTHING - which is the entire reason the reply is consumed
at all (F-62). Persisted BEFORE resolving, so a caller reacting to the outcome cannot race the save.
Pinned by connection/routerMemory.test.ts (9 tests).

Device rows: mobile/TESTING.md U-71-1..3. U-71-1/2 need the flash; U-71-3 is app-only. Gates:
tsc 0 - vitest 536/536 (35 files) - prettier clean.
FIXED 2026-10-02 (U-70) - THE OWNER'S THIRD REVIEW: the car shows a router it never joined, and the
scan list is a page-ful. ONE APP FIX, TWO FIRMWARE FIXES, ONE NOT-YET-DIAGNOSABLE RESTART.

1. BT SCAN LIST ("the list of the bluetooth device found while scanning are too long, please keep all
   those in a scrolling window. and also the list shoulnt be displayed when connected to any one of
   those devices") - app `b21fed5`. The list was UNBOUNDED: it lived inside the page's own
   ScrollView, so a nested vertical list of unbounded height never scrolls, it just grows and pushes
   the page off the screen. Now a BOUNDED window (maxHeight 260, ~5 rows) with its own nested
   ScrollView and a visible scrollbar. And the scan button plus the entire result list are now
   HIDDEN whenever any link is up (Bluetooth OR WiFi) - a scan list next to a live connection is not
   information, it is a way to connect a SECOND car to a session that already has one.

2. THE CAR LIES ABOUT ITS NETWORK - car `13a406f`, and this is the reason symptom (3) below was
   invisible. `storedSsid()` is written the moment `ROUTERS;USE` stores the pair - BEFORE any
   association is attempted - and both the STATE line's `SSID=` and the JSON `ssid` used it. So a
   FAILED switch announced the new router while the car sat on its own hotspot, and nothing in the
   system could tell the difference: the app read "on HomeNet", the phone looked for it on a network
   the car had never reached. **The owner's own words - "the car is displaying the new router in its
   oled" - were the LIE, not the success they looked like.** Note the OLED itself was already
   truthful (it reads `WiFi.SSID()` through extraInfo); it was the APP-FACING fields that lied,
   which is exactly why the two disagreed. Now `SSID=` / `ssid` is `joinedSsid()` (joined STA SSID,
   else its own broadcast id, else empty), and the requested target ships SEPARATELY as
   `WANT=` / `"want"` so a switch in progress is visible instead of indistinguishable from a
   finished one. "Which router did the user ask for" and "which router are we on" are different
   questions and must stop sharing one field.

3. THE JOIN STARTED IN THE SAME TICK AS A MODE CHANGE - car `13a406f`. `rejoinNetwork()` did
   mode(WIFI_AP_STA) -> softAP() -> WiFi.begin() inside ONE call. On ESP32 `WiFi.mode()` RESTARTS
   the WiFi driver, so a softAP() and a WiFi.begin() in the same tick race a driver that is still
   initialising: the STA fails to associate while the softAP still comes up. That is precisely
   "accepted and displayed the new router, never actually joined it, still reachable only on its own
   hotspot". Fixed conservatively: `WiFi.mode()` only when the radio is NOT already AP_STA (the
   common case - switching routers - no longer restarts the driver at all), and `WiFi.begin()` is
   handed to handle() on the NEXT pass (`staBeginPending_` / `beginStaIfArmed()`). Retry budget, the
   AP itself, safe-stop and the protocol are untouched.

4. "the car restarts when the app directs to cars webpage" - **NOT YET DIAGNOSABLE, and I am not
   going to pretend otherwise.** A watchdog abort, a stack smash, a brownout and an intentional reset
   are indistinguishable from the outside, and I cannot reproduce it on the bench. So instead of
   guessing, setup() now prints `esp_reset_reason()` on every boot and shouts when the reason was
   NOT power-on/external/deep-sleep. **That is the one thing that turns the next occurrence into an
   answer: TASK WATCHDOG means loop() blocked, PANIC means a crash, BROWNOUT means undervoltage.**
   The owner should read the serial line (115200) at the moment of the next restart and paste it.

Ship evidence - app `b21fed5`: CI ✓ `37033854684` - OTA Guard ✓ `37033854572` - OTA ✓ `37033854580`,
live manifest = `Short update (b21fed5...)`. Car `13a406f`: **Arduino CI ✓ `37033364835`**, SRAM
69,772 B (21%, -8 B). Gates app-side: tsc 0 - vitest 527/527 (34 files) - prettier clean. **The car
half needs a FLASH.** Device rows: mobile/TESTING.md U-70-1..3.
FIXED 2026-10-02 (U-69) - THE OWNER'S SECOND REVIEW. THREE ITEMS; THE FIRST WAS A REAL BUG THAT
MADE BLUETOOTH LOOK BROKEN WHEN IT WAS ONLY BEING _REPORTED_ AS SUCCESSFUL.

1. "the bluetooth is not build in the app and i am not able to connect the device to the app to
   test the device. fix this first" - root cause found, and it was NOT a missing permission and NOT
   a missing native module. react-native-bluetooth-classic is a real dependency, BLUETOOTH_SCAN +
   BLUETOOTH_CONNECT are declared in app.json and requested at runtime, and sppService is correct.
   The actual defect: handleConnect and handleWifiConnect stored their failure in the hub's `error`
   state and RETURNED NORMALLY, and the only thing that ever rendered that state was
   ConnectionBanner - which U-68 deleted. With nothing to await and nothing to read, a FAILED
   connect resolved exactly like a successful one, so ConnectionSection announced "Connected to
   <car>" and no link existed. The tester was sent hunting for a connection that was never made.
   Both handlers now return a ConnectOutcome ({ok:true,message} | {ok:false,reason} - additive, so
   the callers that ignore it are unaffected), the section reports the real outcome, and the hub's
   own `error` is rendered in the status card so NO FAILURE CAN BE SILENT AGAIN. The Bluetooth card
   also names the truth when classic BT genuinely is not in the build (it needs an APK; an OTA
   cannot add a native module). A fake success is worse than no success - it sends the tester
   looking for a link that does not exist (F-61/F-62). This is the fourth round in a row whose only
   evidence was tsc 0 / vitest N/N / CI green; four rounds of that produced four rounds of
   "nothing is fixed".

2. "connections methods are scattered all over the page... only show one method at a time and use
   the drop down menu... dont populate contents unnecessary" + "use the drop down menu where ever
   the things are overly populated." The three always-visible method cards are GONE. There is now
   ONE SelectRow dropdown showing the current method, and ONLY that method's setup card renders - so
   the page stops growing with the number of methods. The same rule is applied wherever a choice is
   crowded, not just to methods: switching the car to a saved router (up to six) is a dropdown, the
   car-scan result list is a dropdown, and edit/remove/clear sit behind a single "Manage saved
   routers" action with the add form behind one button. SelectRow shows the current value when
   closed and renders a disabled row WITH its reason rather than hiding the control.

3. "the text and the background are merging... please fix the contrast too for once and for all."
   Fixed at the TOKEN level, because a one-off patch is exactly what "for once and for all" is
   warning against. Diagnosis: this app's palette is a set of semantic tokens (ink/navy/sky/card/
   muted/line/...) and it defined NO error, success or "selected" pair, so every failure surface
   reached for an OFF-PALETTE Tailwind colour (text-red-600, bg-emerald-500/10, bg-sky-500/5,
   text-sky-900). Off-palette colours do NOT flip with the theme - red-600 on a white card is
   perfectly readable and red-600 on the dark card (#16223a) is very nearly invisible. It looked
   fine in Light, broke in Dark, and read as random text merging into its background. Added
   danger / danger-soft / success / success-soft / select-bg / select-ink to ALL THREE theme blocks
   in global.css and to tailwind.config.js. The third block matters: the manual Dark pick
   (html[data-theme="dark"]) OUTRANKS :root, so without it a user who chose Dark by hand kept the
   LIGHT foregrounds on the dark card - the same merge, for a subset of users only. Foregrounds are
   contrast-checked against the card in both schemes (danger 6.6:1 light / 8.1:1 dark; success
   5.3:1 / 9.4:1; selected 8.4:1 both). The selected state is now a FILLED pair instead of a
   5%-alpha tint, and primary buttons are navy+white in both themes rather than off-palette
   sky-700.
   And the rule is now ENFORCED, not merely documented: connection/contrast.guard.test.ts reads the
   real sources and fails on (a) any off-palette colour in a className, (b) any `dark:` override -
   the tokens already flip, and a dark: override is precisely how a foreground drifts out of sync
   with its background in one theme only - and (c) any token missing from one of the three theme
   blocks or from tailwind.config.js. PROVEN TO FIRE, NOT ASSUMED: injecting
   `text-red-600 dark:text-sky-300` fails both (a) and (b); reverting passes.

Ship evidence (app, JS-only -> same-version OTA 3.2.7/60, no bump): 53ee045. Gates: tsc 0 - vitest
527/527 (34 files) - prettier clean. Device rows: mobile/TESTING.md U-69-1..3, and U-69-3 must be
checked in BOTH Light and Dark, which is the entire point of item 3. App-only: no flash needed for
any of this round. Firmware is unchanged by U-69 and still needs the one flash for ROUTERS;SCAN
(U-68-4) and U-67's reset/retry fixes.
**✅ U-68 PHASES 1-4 COMPLETE 2026-10-02 — the Control Panel connection layer is REBUILT. All four
phases shipped; every gate green; the car still needs a FLASH for two of the fixes.**

| Phase | What                                                                                | Commit(s)                             | Gate                                                                       |
| ----- | ----------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------- |
| 0     | the plan + the diagnosis, **before** any code                                       | `815573c`                             | —                                                                          |
| 1     | the pure model (`methods` / `routerList` / `commands` / `dial`), 78 tests           | `257c8f0`                             | tsc 0 · 542/542                                                            |
| 2b    | the ack consumer in the hub + `NETW;` over Bluetooth                                | `77321f8`                             | tsc 0 · 552/552                                                            |
| 2     | the uniform `ConnectionSection`, replacing banner + handoff + picker + router panel | `3cfd4b7`                             | tsc 0 · 552/552                                                            |
| 3     | the car's network layer (`ROUTERS;SCAN`, reply buffer, ack redaction)               | car `39c96ab` + `46186a9` + `7cb409f` | **Arduino CI ✓ `37012141471`** — 1,748,602 B (55% of `huge_app`), SRAM 21% |
| 4     | residue sweep + the F-41 guard re-expressed + device rows                           | 318565c + 3f469ed                     | tsc 0 · **518/518** (33 files) · prettier clean                            |

**D1–D8, the eight defects behind "nothing is fixed":** D1 the own AP was list[0] so the switch
reverted the car to itself — closed in `switchableRouters`/`defaultRouterSsid`/`planSwitch`/`pickBestRouter`
· D2 every `ROUTERS` answer was discarded — closed by `requestRouter`/`runSwitchPlan` + a visible
timeout · D3 `ROUTERS;SCAN` did not exist — implemented (car, needs a flash) · D4 STA-with-no-link
blind-dialled the car's AP — closed by `resolveDial` returning null · D5 the handoff could never
complete over Bluetooth — moot, the handoff is gone and Bluetooth is a first-class method · D6 the
router list did not exist over Bluetooth — closed by the `NETW;` parser · D7 the reply truncated at
63 chars — closed (car) · D8 router management existed on one method only — now on every method.

**Residue removed (and why it was residue):** `TransportPicker.tsx` + `transportPickerFlow.ts`
(the old connection UI, fully superseded — and `transportPickerFlow` carried the **D4** default
address, so resurrecting it would have reintroduced the bug) · `transportGate.ts` (the F-41 gate
was enforced _only inside the picker_, i.e. only while that component was mounted) ·
`ConnectionBanner.tsx` · `staHandoff.ts` (its rules now live in `connection/dial.ts` +
`connection/commands.ts`; keeping it would have left TWO implementations of "never dial the own
AP", which is the duplication trap F-64 came from). **F-41's INTENT is preserved and re-tested**:
`methods.test.ts` now pins that every offered target is backed by a registered, non-parked
transport. **KEPT deliberately:** `RouterPanel.tsx` (RemoteControlScreen still mounts it — it is
not residue, and the Remote screen was out of scope by the owner's instruction) · the whole
`transports/` layer (live; the hub registers and adopts through it) · `commandRouting.ts` (the hub
routes every command through it).

**⚠ THE HONEST STATUS (F-61).** This round is **shipped, device-unverified**. tsc/vitest/CI prove
the code compiles and the app's own rules agree with each other; they cannot prove the car changed
state. Every previous round was marked done on exactly that evidence and the owner came back with
"nothing is fixed". **Until someone runs `mobile/TESTING.md` U-68-1..4 against a real car, treat
this as not verified** — and U-68-4 additionally needs the firmware flashed, because
`ROUTERS;SCAN` is new firmware and the old binary answers `ROUTERS;ERROR;Syntax`.

**Owner actions:** (1) flash the 4WD4M `main` (USB, 115200, `huge_app`) — this one flash also
carries U-67's reset/retry fixes and T21–T26; (2) close + reopen the app ×2 and confirm
Menu → Update shows the new `Short update (…)`; (3) run **U-68-1..4** first, then the rest of the
⭐ BENCH MASTER RUN.

**Known, recorded, NOT fixed (out of scope this round):** the Remote screen's `RouterPanel` still
fires `ROUTERS;*` on the press with no confirm and no ack — the same class of defect U-67 fixed on
the Control Panel. The owner said not to change the Remote screen, so it is left alone and needs
its own go. Also `linkManager.loadSelection()` is still write-only (the persisted selection is
never restored), and `DeviceConnectionScreen` is still a dead parallel connection surface in the
route table.

**🚧 IN PROGRESS 2026-10-02 (evening) — CONTROL-PANEL CONNECTION REBUILD, owner out of hours with
full authority. PHASE 0 = the note, DONE. Read `guide/PLAN-2026-10-02-CONTROL-PANEL-CONNECTION-REBUILD.md`
FIRST — it holds the verbatim directive, the scope (in/out), the eight diagnosed defects D1–D8, the
design, the phases and the new failsafes F-61…F-69.** This entry is the app-side pointer; the plan
is the source of truth.

**Why this round exists: the owner came back from the bench with "nothing is fixed".** U-64…U-67
each fixed one narrow symptom and every one of them verified only that a command was SENT and the
UI RENDERED — never that the CAR changed state (now **F-61**). The audit behind this round found
**eight live defects across both repos**, several of which actively fight the fixes already
shipped. The three that most directly match the owner's words:

- **D1 — the car's own hotspot is element `[0]` of the saved-router list.** The handoff card's
  "Yes, join it" used `carNetworks[0]` and fired `ROUTERS;USE;4WDCar_Wifi`, which the firmware
  answers by **erasing the stored credentials and reverting the car to its own AP**. The user asks
  to switch to the router; the app switches the car back to itself. **This is the most likely
  cause of "the car not switching to next router"** and it survived every round because each round
  assumed `[0]` meant "the most recently saved router" (now **F-63**).
- **D2 — every `ROUTERS;*` reply is thrown away.** The car answers `ADDED` / `USED` / `DELETED` /
  `CLEARED` / `FULL` / `ERROR;…`; the app parses `REPLY=` and discards it (only `WIFICFG;*` is
  handled). So _"adding a new router is not working"_ has no feedback and no error — success and
  `ROUTERS;FULL` look identical. This is why U-64's confirm could not detect a failed add (now
  **F-62**).
- **D3 — `ROUTERS;SCAN` does not exist in the firmware.** The app sends it and expects a `"scan"`
  array; the car replies `ROUTERS;ERROR;Syntax`. _"Selecting of the network is not proper"_ —
  there is nothing to select from.

Also live: D4 STA-with-no-link blind-dials the car's AP address · D5 the handoff can never
complete over Bluetooth (`connected` exists only in the WS JSON) · D6 the saved-router list does
not exist over Bluetooth (the firmware's `NETW;` line is never parsed) · D7 the reply buffer
truncates at 63 chars · D8 router management is mounted for exactly one method, so **on Bluetooth
or the car hotspot there is no way to add or switch a router at all**.

**The method model the rebuild lands (owner-specified, verbatim "keep only these method for now,
Bluwtooth, Wifi(LAN), Internet"):** **Bluetooth — SPP only.** · **WiFi (LAN) — the car's own
ESP32 hotspot** (the provisioning surface: add / edit / delete / switch the router from there) and
**the home router** (dialled only from the IP the car reports, never a default). · **Internet** —
offered honestly as unavailable, because no relay or broker exists; it must never appear to work.

**Scope discipline (owner was explicit):** the Control Panel's connection layer ONLY. **Drive decks
and the Remote screen are NOT touched.** Because `RouterPanel.tsx` is also mounted by the Remote
screen, the rebuild adds NEW components and stops mounting `RouterPanel` from the Control Panel —
so `RouterPanel` stays alive for the Remote screen and is **not** residue. The Remote screen's
unconfirmed Switch/Add is **recorded, not fixed** (needs its own owner go).

**Phase gates:** Phase 0 the note (this + the plan + F-61…F-69) → Phase 1 the pure model in
`src/components/tools/connection/` (methods · routerList · commands-with-ack-matching · dial),
every rule test-pinned → Phase 2 the uniform `ConnectionSection` on the Control Panel → Phase 3
the car's network layer (`ROUTERS;SCAN`, reply buffer, ack password hygiene) → Phase 4 residue +
gates + push. **Each phase commits and pushes on its own; the app rides same-version OTA
(3.2.7/60, no bump), firmware needs the owner's flash.**

**✅ FIXED 2026-10-02 (U-67) — OWNER BENCH: "THE CAR RESETTS WHEN I SWITCH THE WIFI ROUTER FROM
THE APP AND THE CAR IS NOT ALWAYS SWITCHING PROPERLY… THE APP STILL DOESN'T HAVE SWITCH UI UX
STANDARDLY, N MISSING OK OR CONFIRM BUTTONS WHILE SWITCHING ROUTERS."** Three reports, **TWO were
real cross-repo bugs and NEITHER was the one we already knew about** (`cd3158f`/`02548b2` are real
fixes, but for DIFFERENT defects — see "not this" below).
**THE RESET — ROOT CAUSE FOUND, and it was the BT watchdog, not `ROUTERS;USE`:**
`Genum_4WD4M_CAR/BluetoothComm.cpp` `restart()` ended a failed re-init with **`ESP.restart()`**,
and `Genum_4WD4M_CAR.ino` armed that watchdog on **"no BT client"** rather than on "a client that
dropped". Switching the car to the home router takes the phone OFF the car's BT — so
`hasClient()` goes false and STAYS false, the watchdog fired after `BT_HARD_RESTART_MS` (120 s),
tore bluedroid down, and the escalation REBOOTED THE CAR mid-handoff. It came back on its own AP
and the switch never completed — exactly the reported symptom. Worse than a switch bug: the
throttle is 60 s, so an **unattended car parked on the router rebooted on a loop**. Fixed (car
repo, NEEDS A FLASH): no `ESP.restart()` from the BT path ever again (a failed re-init is reported
and the car KEEPS RUNNING on AP/router), and the watchdog arms only on a link that was CONNECTED
and then dropped — "never had a client since boot" is idle, not wedged. **FAILSAFES F-60: a
transport failure must never take down the whole car.** Flashing the already-committed firmware
does NOT fix this — `cd3158f` never touched this path.
**"NOT ALWAYS SWITCHING / DOESN'T DO IT IN ONE GO" — also firmware, also a real bug:**
`WebServerComm::handle()` treated `WIFI_STA_TIMEOUT_MS` (8 s) as the WHOLE switch: on timeout it
cleared `pendingRejoin_` and set `startedAsAP`, which made the retry branch (`else if
(pendingRejoin_ || !startedAsAP && …)`) **unreachable** — so `STA_MAX_RETRIES` never ran and ONE
flaky association failed the switch **permanently**, the car silently left on its own AP. Fixed:
the timeout hands OFF to that existing capped budget (up to 6 more attempts) and only the spent
budget settles AP-only (the cap still holds, so the softAP beacon is never blanked forever). Each
retry also re-arms `connectingPending_` for its own 8 s window — without that, a successful retry
was invisible (no `updateExtraInfo`/`sendState`, so the app sat on "getting an address" while the
car was already on the router) and `pendingRejoin_` stayed set, so the branch kept yanking a
WORKING association down every 10 s.
**"MISSING OK OR CONFIRM BUTTONS" — app, real, and it was THREE switch UIs where only one asked.**
The picker's STA pick opened the F-59 card with a real "Yes, join it" / Cancel. But the Home
router settings panel's per-row **Switch fired `ROUTERS;USE` on the press itself**, and its
**"Add + switch" button fired `ROUTERS;ADD` on the press itself** — no confirm, no way to back
out, one logical action in three different UIs. Now there is exactly ONE confirm: new pure
`switchConfirm(intent, ownApName)` in `staHandoff.ts` (+8 tests) resolves any entry point to
`switch` (USE only), `save-and-switch` (ADD then USE — the button says so), or `none`; the
panel's Switch/Add **stage the intent and open the card instead of sending**, and the card's
single yes runs the same `confirmStaSwitch` the step-1 offer uses — no second, quieter path. A
blank SSID and the car's OWN AP collapse to `none` (the firmware reserves the own AP; "switch to
it" is staying put, not a switch). Gates: tsc 0 · vitest **464/464** (32 files) · prettier
clean. Device rows: `mobile/TESTING.md` **U-67-1..4**. **The app half needs an OTA on the device;
the reset + retry fixes need a firmware FLASH — until then U-67-3/4 still reproduce.**
**Ship evidence (app, JS-only → same-version OTA 3.2.7/60, no bump):** `bfe1cda` (code) ·
`7919d5c` (ledgers, the pushed tip); CI ✓ `37000785055` · OTA Guard ✓ `37000784997` · OTA Only
✓ `37000785239` published, update group `75dc154a-dc16-4944-babf-8dda508d1c7b`, live manifest
= `Short update (7919d5c…)`. **Firmware (car repo):** `26d41d5` (fix) · `3f080c2` (TRACKS) —
owner go given, pushed `030726f..3f080c2`, **Arduino CI ✓ `37001533166`** (1,746,294 B / 55% of
`huge_app`, SRAM 21%). Car bench rows for the two firmware fixes: **`Genum_4WD4M_CAR/TRACKS/
DEVICE-TESTS.md` T24–T26** (Round 3 — T24/T25 are the reported bug, run them FIRST; they are the
same single flash as T21–T23). **T22 is NOT this bug** — `cd3158f` was the unknown-router
`ROUTERS;USE` path, and the reset reported here was a different one that was still live.
**NOT THIS (already-committed fixes, different defects — do not re-report as new):** `cd3158f` =
`ROUTERS;USE` on an UNKNOWN router rebooting the car (the panel's Add path). `02548b2` = the F-59
card's missing confirm for the PICKER path only. Neither covers a panel-row Switch, and neither
covers the BT watchdog.

**✅ FIXED 2026-10-02 (night, part 2) — U-66: THE INTEGRATION BUG BEHIND ④ ("the home-router
deck is dull / not usable") IS FOUND AND FIXED, PLUS THE AUTO-JOIN REVIEW + THE OTA GUARD.**
Owner asked whether both 4WD4M and the app had been analysed and whether everything is
integrated. Reading the CAR side (`WebServerComm.cpp`) against the app's handoff found a
REAL cross-repo mismatch: `currentIp()` deliberately reports the **softAP gateway
(192.168.245.1)** while the car sits on its own AP (R-13: JSON `ip` never empty — the app
deck + tap-to-open depend on that), and `"connected"` = **ANY** transport up. So with a
router STORED but the car still ON its AP, the JSON reads `ssid=<router>, connected=true,
ip=192.168.245.1` — and `staPhase`'s ip-presence check declared **ready**, offering the
car's own hotspot as the "home router" dial. The phone stayed on the AP; the banner said
verified; every tile below starved. Fixed app-side (the firmware behaviour is CORRECT and
load-bearing): `ready` now requires a **non-gateway** IP (a reported gateway drops the card
back to Step 1 — re-offer the join, which also catches a wrong password; an absent IP still
waits at step 2), and `staDialUrl` refuses the gateway outright, even behind an explicit
`ws://`. 4 new tests (457/457). **Auto-join review (owner ask): NO confirm — the feature IS
the owner's 2026-09-30 "auto-join on selection" decision, gated by the per-car Auto-join
toggle, once per link session, and it only fires when the car sits on its own AP with saved
routers.** But the toast now says the join is AUTOMATIC and names the off-switch (the old
`Smart-link: joining …` read as an unexplained switch — the same narration-hides-action
failure F-59 fixed, in automation form; on the old binary this auto-fire was very likely
the "car reset during connect" trigger). **OTA Guard (owner ask):** new workflow
`ota-guard.yml` — on every push touching mobile/src|assets it fetches release.json, pulls
the commit hash from the `notes` line, and FAILS unless it is an ancestor of the pushed
tip: red means "JS exists but no device will load it" (the F-1/F-2 class that CI never
gated). First run green. Ship evidence: `dad5c0c` (gateway fix) · `eb7d436` (toast) ·
`ba3cf36` (guard) — CI ✓ `36976974146` · OTA Guard ✓ `36976974081` · OTA Only ✓
`36976974078` (this bundle carries U-66; devices verify via the Update screen `Short
update (ba3cf36…)`). Device rows: `mobile/TESTING.md` **U-66-1..3**.

**✅ FIXED 2026-10-02 (night) — THE REST OF THE QUEUE: ④b ROUTING TIE-BREAK · F-46 REGRESSION
PINNED · ⑤ CHROME JUMP SMOOTHED.** Owner: "go ahead do all the coding side things and i will
test later." **④b — the both-links-live hazard is closed:** new pure `commandRouting.ts`
(`routeCommand`, 11 CI tests). The rule: broadcast → every live link; ONE live link → it wins
regardless of mode (unchanged); BOTH live → mode parity still decides AND the user's CHOSEN
method (the LinkManager's active radio, read LIVE at call time per F-12) is ADDED as a
carrier — a stale secondary link can never strand a drive command while the phone sits on
the router. Parity is preserved exactly (BT-transport mode + chosen BT still does not blast
WS; no chosen link known → previous behavior). `sendCommand` now calls the pure rule.
**F-46 — the skipped regression test is BACK and not brittle:** `adapters.test.ts` swaps
each service mock's `onStatus` for the REAL services' `this`-reading shape
(`statusCallbacks`) and pins that all three live adapters (SPP / BLE / WiFi) invoke it ON
the object — it would fail on the old detached-reference code. **⑤ — the picker's
post-connect chrome jump:** App.tsx enables Android's layout-animation experimental flag
(guarded; no-op on Fabric) and TransportPicker asks for ONE ease-in-ease-out pass on
exactly the down→live / live→down transitions (configureNext during the transition render,
consumed by that very commit). Cosmetic-only and revertible in two hunks if it ever
glitches on a device. Gates: tsc 0 · vitest **453/453** (32 files) · prettier clean.
**Ship evidence:** commits `ce6a507` (routing) · `6e01c37` (F-46 pin) · `1a0b6be` (⑤) ·
`b93740d` (ledgers), pushed `af31aab..b93740d`; CI ✓ `36972177622` · OTA Only ✓
`36972177611` — JS-only → same-version OTA 3.2.7/60. Devicerows: `mobile/TESTING.md` **U-65-1..2**. **Remote-window audit (same day, no code needed):**
the Remote screen runs its OWN `useControlHub` instance — the same hook the Control Panel
uses — so the ④b fix applies there automatically (`hub.sendCommand` IS the routeCommand
path; every drive handler and the decks' `onCommand` end at it, and the screen has zero
direct service sends). The only direct `sendLine` calls in the hub are the DISCONNECT
safe-stops (`S`/`SPD0`/`SERVO90` over each live service before closing it) — those are
correctly direct: a teardown must neutralize every transport it closes, not only the
active one. ④a/④c remain bench-discriminated (need the flashed car).
**OTA content verification (owner ask):** the U-65 OTA run (`36972177611`) published with
`eas update --branch main --message "OTA-only push (b93740d…)"` — Expo accepted android+ios,
update group `174fa093-1c5e-4157-909e-fb58a1b42777`. `b93740d` contains ALL U-64 + U-65 code
(only the post-publish commits are docs). A direct curl of the served manifest 404s —
the endpoint requires the expo-updates client protocol, so the on-device proof is the
Update screen showing `Short update (b93740d…)` after close+reopen ×2 (TESTING.md pre-flight
row added).

**✅ FIXED 2026-10-02 (evening) — OWNER BENCH FEEDBACK ROUND: PANEL SIMPLIFIED (①),
HANDOFF NOW CONFIRMS (②), WIFI DIAGNOSTICS REMOVED (③); ④ QUEUED (needs the flashed car).**
Owner: "the control panel page is too confusing and shows unnecessary datas too much" +
"no yes or confirm button, only cancel" on the home-router switch + "remove the wifi test
thing" + the STA deck "not usable and dull". ①②③ coded the same evening (owner chose the
full simplification plan); ④ needs the bench with a flashed car to discriminate its three
candidates. Gates: tsc 0 · vitest **439/439** (31 files) · prettier clean. **Ship evidence:**
commits `02548b2` (②+① code) · `1ccf24d` (ledgers) — plus the same round's diagnostics
removal — pushed `d863013..1ccf24d`; CI ✓ `36969793907` · OTA Only ✓ `36969793890` —
JS-only → same-version OTA 3.2.7/60.

**① CONTROL PANEL SIMPLIFIED (full plan, owner-approved).** Was a 12-block stack; now:
the category detail card leads COMPACT (icon · name · tagline · hardware chips) with
description + capability checklist behind a **Details** toggle (resets per category), the
picker's teaching subtitle and the two duplicate helper lines are GONE (the per-method ⓘ
windows carry the how-to), and **Saved settings** (CarProfileCard) + **About this project**
(ProjectInfo) fold behind `SectionDisclosure` header rows — the page leads with control,
not reading material. The Connections header keeps its name only (subtitle gone); the
Home-router settings subtitle is one short line now.

**② THE HANDOFF CARD NOW ASKS — AND SURVIVES A CAR DROP.** **(a) Confirm fixed:**
`startStaHandoff` no longer fires anything; the card shows "Join \"<ssid>\" now?" with a
real **Yes, join it** / **Cancel** — `ROUTERS;USE` fires ONLY on Yes (the card never
narrates a command that already went out). No saved router = inline **Add form** (name +
password + **Save & join**) right on the card, never "add it below". **(b) The car RESET is
the UNFLASHED firmware fix** — `ROUTERS;USE` on an unknown router reboots the flashed
binary; fixed in `Genum_4WD4M_CAR` `cd3158f` (CI green, **NOT on the board**). **Flash
`main` before this round can pass** (T21–T23). NOTE the smart-link auto-join can fire
`ROUTERS;USE` on link-verify when autoJoinRouter is on — on the old binary that means
surprise resets during ANY connect. **(c) New `car-dropped` phase:** a link drop before
the dial flips the card to honest text ("the car dropped the link while switching — it may
have rebooted") + a **Got it** button, instead of claiming "a few seconds" forever;
`ready` deliberately SURVIVES a link drop (the phone leaving the car's AP at step 3 is
expected). 5 new phase tests. **Rule candidate (record with the fix): a prompt that
describes an action must BE the confirm for that action — never narrate a command that
already went out.**

**③ REMOVED THE WIFI TEST THING.** `WifiDiagnosticsPanel` deleted — render block + import

- the component file (single call site, zero tests; F-45 deletion recorded here, not left
  dangling). The method chip + footer + error card already say everything it said.

**⏳ ④a/④c STILL QUEUED (need the flashed car on the bench): HOME-ROUTER DRIVE DECK IS DULL /
UNUSABLE.** ④b (the routing hazard) is FIXED — see the top entry. Remaining candidates, to be
discriminated with a VERIFIED STA link: **(a)** downstream of ② — no verified STA link →
`canControl=false` → the deck is dim BY DESIGN (F-34 note); fix ② first and re-observe.
**(b) REAL APP HAZARD — both-links-live routing:** `sendCommand` routes non-broadcast
lines by the ACTIVE MODE's transport; with a stale BT link + STA WS both live, drive
letters can route BT-only while the phone sits on the router (mode-dependent) — deck looks
alive, car never moves. Needs a one-live-link-wins audit (R-4 extension) with tests.
**(c)** firmware: if STATE frames never arrive over STA on the flashed binary the deck is
alive-looking but empty (dull); the unflashed `64c2781` (web page no longer force-sets
`MODE_ESP_SERVER`) + OLED v1.0.1 are relevant. Next-session diagnostic: with a verified
STA link, record `canControl` / `linkVerified` / whether STATE arrives, then fix per
finding. Also verify the robocar deck over STA after ② lands.

**✅ FIXED 2026-10-02 (later same day) — AUDIT OPS-3: A BT CONNECT IS NAMED BY THE ROW THE
USER JUST TAPPED, NEVER BY A STALE SCREEN-LEVEL SCAN ROW (`toolsScreenFlow.ts`
`resolveBtConnectDevice`, 6 CI tests).** The one ⑧-class defect the U-61 audit round left
open ("BT→AP→BT re-pick could hit the direct-MAC fallback with a stale name — silent"). Root cause: the hub's `sppDevices` screen state survives a method switch un-cleared
(the picker's scan writes `sppService.scan()` results into PICKER state, never back into
the hub), so after BT → Car-AP → BT the ToolsScreen bridge could `find()` a row from the
EARLIER session — most visibly a MAC-shaped fallback name an old scan recorded when the
device name was unresolved — and prefer it wholesale over the fresh `options.name` the
picker passed with the connect request. The connect worked; the label lied (F-52's
family: judge the whole surface). Fix: the resolution is now a PURE, CI-pinned rule —
request name → screen row name → the MAC; the screen row still contributes identity
(bonded, lastMode/lastSpeed) but can never relabel; F-40's never-refuse contract is
pinned too (empty screen list still dials direct by MAC). Ledger written AS the work
landed (the U-60 round's retroactive-ledger lesson applied). Gates: tsc 0 · vitest
**434/434** (31 files) · prettier clean. **Ship evidence:** commits `0b73887` (fix) +
`2ffcb0a` (ledger), pushed `3f7619a..2ffcb0a`; CI ✓ `36967886971` · OTA Only ✓
`36967886987` — JS-only → same-version OTA 3.2.7/60. Device rows:
`mobile/TESTING.md` **U-63-1..2**.
**OPEN from the audit, deliberately NOT coded:** ⑤ post-connect chrome jump in the
picker — diagnosed (the address/scan card is removed on `link.id` per the owner's
2026-10-01 parity decision, and the footer appears in the same commit, so the content
below jumps by that card's height). A LayoutAnimation fix would be GLOBAL on Android
and risky on a control surface two stability rounds in — needs an owner decision:
animate the collapse, or accept the jump. Not queued anywhere else.

**✅ FIXED 2026-10-02 (bench feedback, same day) — THE HOME-ROUTER SWITCH IS A GUIDED HANDOFF,
NOT A TEARDOWN (`staHandoff.ts`, F-59).** Owner at the bench: picking Home router while
connected showed the switch prompt "but no confirm button or anything to initiate", and "the
car doesn't seem to initiate the switch". Root cause: the F-58 round routed the STA pick
through the teardown-then-default-dial path — but the car joins the router only when told
(`ROUTERS;USE`) and that command needs the link the teardown destroyed; the default dial
presupposed the end state. Now: the STA pick while live opens a step card (between banner and
picker) driven by PURE CAR TRUTH — ① the car is told to join the most recently saved router
over the LIVE link (or pointed at the Add form when none saved), ② the card waits for the
car's STATE broadcast, ③ the dial unlocks using ONLY the IP the car reported (`staDialUrl`),
phone joins the same router and connects. The picker delegates via `onStaHandoffRequest`
(other methods keep the confirm strip); no default address is EVER dialled as a consequence
of a state change (9 CI tests pin the phase machine + dial). Rules = **F-59** (root
FAILSAFES): order steps by what each command needs; UI reads car-reported truth only; never
dial a default after a state change; a pick that re-networks the CAR is provisioning, not a
transport switch. Gates: tsc 0 · vitest **428/428** (31 files) · prettier clean. Device
rows: `mobile/TESTING.md` **U-62-1..4**. NOTE: step 1's on-car proof needs firmware `main`
flashed (T21/T22).

**✅ FIXED 2026-10-02 — CONTROL PANEL AUDIT ROUND: FIVE DEFECTS (UI/UX + OPERATIONS), TESTS
FIRST, JS-only → same-version OTA 3.2.7/60.** Owner: "the control panel page is not working
properly." The audit (screen + picker + hub + car web page read end to end) found two defect
families. **UI/UX:** ① the deck-open button was a dead end on the first tap (the 150 ms
debounce created its timer inside onPress and returned the cleanup from the same callback —
React consumed it immediately); ② every BT connect failure displayed TWICE (banner error +
toast); ③ the F-57 category reset fired on mount/refresh, snapping a chosen pill back to the
first; ④ two disconnect flows disagreed (picker footer = immediate; the F-47 confirm dialog
was unreachable dead state); ⑤ cosmetic: post-connect chrome jump in the picker (noted,
NOT fixed). **Operations:** ⑥ the confirmed method switch dialled the LEFT method's `url`
state (stale closure — AP→router dialled the car's AP address on the home router); ⑦ the
ToolsScreen bridge `setWifiUrl(options.url)` then called the handler reading `wifiUrl` in
the SAME tick — first connect dialled the bundled default; ⑧ BT→AP→BT re-pick could hit the
direct-MAC fallback with a stale name (silent, noted). Fixed ①–④+⑥–⑦ with tests written
FIRST (owner go): pure CI-pinned modules `toolsScreenFlow.ts` (3 tests) +
`transportPickerFlow.ts` (7 tests, `planSwitch` takes the registry's OWN `scan` truth —
F-51 rule 2), explicit-URL parameter on `handleWifiConnect`, one toast removed,
`onDisconnectRequest` unifying BOTH disconnect surfaces behind the F-47 dialog (WiFi now
confirms too), touched-flag guarding the selection reset. Disconnect semantics: user-facing
disconnect ALWAYS confirms; the method-switch teardown stays immediate (its strip already
confirmed). Rules recorded as **F-58** (root `guide/FAILSAFES.md`). Gates: tsc 0 · vitest
**419/419** (30 files) · prettier clean. Device rows: `mobile/TESTING.md` **U-61-1..5**.
Car side of the audit: web page + hub send-path verified healthy; the OLED/ROUTERS fixes
still need the bench flash (Round 2, T21–T23).

---

**✅ SHIPPED 2026-10-01→02 (late session) — 4WD4M LIVE-LINK INTEGRATION ROUND: METHOD SWITCHING
WHILE CONNECTED + CONNECT-FLOW SNAGS, JS-only → same-version OTA 3.2.7/60 (8 app commits
`edb3fd7`→`f3223ce`, one revert mid-round, all pushed; CI ✓ `36911189810` · OTA ✓ `36911189952`
PUBLISHED, 3.2.7 android+ios).** The integration thread driven by the owner's bench session.
**App:** ① **R4-2 revised — the method dropdown is no longer LOCKED while a link is live.**
Picking a DIFFERENT method shows an inline confirm (names the target + what will drop), then
tears the old link down FIRST and dials the new one — two transports never live at once;
re-picking the already-live method is a no-op that never drops a working connection; the F-41
PRIMARY gate runs BEFORE the live-link branch so a "Coming Soon" row can never tear a working
link (`f3223ce`). The first attempt (`e29c478`, a modal in ToolsScreen) was REVERTED
(`c44802a`) and rebuilt properly inside `TransportPicker` — the surface that owns the method
choice. The confirm is an inline strip, not an inset-0 overlay: the card renders inside the
Control Panel ScrollView where such an overlay centers below the fold (F-47 lesson).
② **150 ms debounce** before RemoteControl navigation kills the connect-flicker (`49add08`).
③ **Connect-flow cleanup:** duplicate header disconnect button removed (`a908282`) · selected
category resets to the first pill on disconnect (`b78ac71`) · 48 dp touch targets + per-row
Connect buttons (`845d802`). ④ **All six unbuilt modes badged planned** (`edb3fd7`).
**Car firmware side of the same session** (committed + CI green there, NOT yet flashed):
OLED directive v1.0.1 fixes, `ROUTERS;USE` on-the-fly add/switch, web page no longer
force-sets `MODE_ESP_SERVER` — bench rows **T21–T23 (Round 2)** in that repo's
`TRACKS/DEVICE-TESTS.md`. Gates at close: tsc 0 · vitest **409/409** (28 files) · CI green on
every push. Device rows: `mobile/TESTING.md` **U-60-1..5**. ⚠ Ledger-discipline note: this
round landed with NO ledger entries (written retroactively the next session) — the
"write entries as you go" rule was broken; do not repeat.

**✅ 2026-09-30 — ALL CODE WORK IS DONE; THE BENCH IS ONE CONSOLIDATED ROUND AT THE END.** Owner
instruction was to finish the code first and test on hardware last, so the four scattered device
rounds are now a single **⭐ MASTER RUN** table at the top of
`Genum_4WD4M_CAR/TRACKS/DEVICE-TESTS.md`, ordered **safety rows first** (A = Bluetooth + e-stop,
B = speed/`SPD0`-must-stop), with an explicit _needs the car?_ column. **T18b no longer needs the
car** — see F-53 below; the gate is proved in CI. Everything genuinely left is blocked on the owner,
not on code: the bench round, the BLE firmware+flash, and the MQTT broker decisions.

**✅ FIXED 2026-09-30 — THE F-41 GATE IS NOW PROVED IN CI, NOT ON A DEVICE (`f13c2bb`, FAILSAFES
F-53).** `isSelectable()` lived inside `TransportPicker.tsx`, so "only bt-classic / wifi-ap-ws /
wifi-sta-ws may ever be picked" was verified _only_ by device row T18 — by a person, with hardware.
A gate deciding whether the app may send drive commands to a car cannot rest on a manual check.
Moved to `transportGate.ts` (both halves required: the owner-approved PRIMARY set **and** the
adapter's own `isSupported()`), with `transportGate.test.ts` asserting it against the **real**
registry via the new `buildAllTransports()` export. The assertion that matters is the negative one:
**HTTP stays parked even though its adapter now reports supported** — F-51 fixed it, and _fixed is
not proven_ — plus nothing carrying a `roadmapNote` is ever selectable. Also removed a false claim
from the Home-router help window: it told the owner to check the router SSID "**and signal**", but
no firmware in the fleet answers `ROUTERS;SCAN` (checked 4WD4M + donor + 2WD1M), so a signal
strength never exists. F-53 rule 3: every capability named in owner-facing text must be one some
firmware actually delivers.

**✅ FIXED 2026-09-30 — A `NACK` IS NOT ALWAYS A MODE REJECTION: E-STOP RAISED A FALSE ERROR ON
THE LIVE TRANSPORTS (`79ac4ab`, FAILSAFES F-52).** Having applied F-51's lesson to HTTP, I
applied it to the transports people actually drive — Bluetooth SPP and WebSocket — and found the
same class of defect on the live path. The firmware's `handleCommand()` **ends with
`setModeFromString(cmdBuf)` as a catch-all** (`ModeManager.cpp:436`), so ANY line it doesn't handle
is answered `NACK;E=UNKNOWN_MODE;ARG=<token>` (`:798`) — the wire cannot tell "unknown MODE" from
"no such COMMAND", and the error code lies. `handleEStop()` sends `ESTOP` + `SPD0` + `SERVO90`, and
**no firmware in the fleet implements `ESTOP`** (verified across all six repos). So **every
EMERGENCY STOP press** produced a red toast _"ESTOP is not supported by this car"_, overwrote the
EMERGENCY STOP status with "Not supported by car", and parked a phantom `ESTOP` stub — on the one
control that must never look broken. Same on every trim / steering-limit edit (`TRIM<n>`, `STEER<n>`
are 2WD1M-only; the 4WD4M is differential drive). **The car did stop** — `SPD0` is the real stop and
was the second line in the batch — so the round read as PASS; that is F-52's sharpest rule: judge a
control by its whole surface, not only the motion. Fix: `isModeToken()` derived from
`REMOTE_MODE_ORDER` (not hand-written) and `handleNack` returns early for non-mode tokens. The
E-stop lines stay on purpose — `SERVO90` centring is real on 2WD1M/self-balance, so the correction
belongs at the interpreter, not by deleting commands the fleet may honour. Gates: tsc 0 · vitest
**348/348** · prettier clean. Bench rows **T19–T20** (Round N), incl. a must-still-work 2WD1M
cross-check.

**✅ AUDITED 2026-09-30 — THE REMAINING GATED METHODS, AND TWO ROADMAP CLAIMS CORRECTED.** F-51's
rule is "a registered but non-selectable method is not a verified one", so I checked the rest rather
than trusting the labels. **BLE: app side genuinely real** (`bleService` + `createBleTransport()` do
scan/connect/GATT write/`requestState`) **but the 4WD4M firmware has NO BLE server at all** — zero
hits for `BLEDevice`/`BLEServer`/`NimBLE`. So BLE is a _firmware_ round (NimBLE UART: write →
`handleCommand`, notify → STATE), not an app flip. Flash headroom is fine — this car runs a **3 MB
`app0` partition** — and the roadmap's "huge_app at 55%" note belonged to a different car. **mDNS
and MQTT app rows checked out as honest placeholders** (they already say "needs the car to advertise
it" / "no broker exists"). Nothing shipped for these three: they need owner go + a flash, and MQTT
is still blocked on the broker/credential decisions. Roadmap §5 rewritten so the next session
doesn't inherit the overstated claims.

**✅ FIXED 2026-09-30 — HTTP/REST ADAPTER WAS BROKEN IN TWO WAYS (`163adea`, FAILSAFES F-51).**
Auditing Phase C item 2 (the roadmap called HTTP "already implemented end-to-end; cheapest win;
do first") against the firmware found it was **not**: ① the adapter emitted `/f /b /l /r` while
the car registers `/forward /backward /left /right` (`WebServerComm.cpp`, identical on the donor
and the 4WD4M testbed) → **every direction command 404'd** while `/status` kept the link looking
healthy; ② **SAFETY: `SPD0`** (a neutral stop line on BT/WS) mapped to `/speed?val=0`, but the
firmware clamps with `constrain(val, MIN_SPEED=100, …)` → a **stop became speed 100 and the car
drove**. Fixed both: routes named from the firmware, and any sub-floor `SPD` routes to `/stop`.
Why it hid so long: HTTP is F-41-gated so nobody could drive it, **and the existing test asserted
the same wrong routes** — test and bug agreed. New rules in **F-51**: a gated method is not a
verified one; a test asserting a hand-written literal is not evidence; one logical command must
mean the same thing on every transport. Pinned with negative assertions (`/f`, `/b`, `/l`, `/r`,
`/speed?val=0` must never appear). Gates: tsc 0 · vitest **344/344** · prettier clean. Bench rows
**T15–T18** (`Genum_4WD4M_CAR/TRACKS/DEVICE-TESTS.md` Round H); the F-41 flip waits on them.
**Ship evidence:** `163adea` (fix) + `f54f7b2` (ledger), pushed `fb50d56..f54f7b2`; CI ✓
`36761236003` · OTA ✓ `36761236227` published; live manifest = `OTA · Short update (f54f7b2…)`,
3.2.7 unchanged (JS-only, F-32). Car repo `Genum_4WD4M_CAR` `6e0d5ac` (Round H rows).

**✅ BUILT 2026-09-30 — CONNECTION-MANAGER PHASE B: ENVELOPE WIRING (GATE STILL OFF
— activation needs the owner's bench round).** Phase A built the translation layer; Phase B puts it
on the live path without changing what the user sees. Three changes, no screen touched:
① **NEW `transports/envelopeWiring.ts`** — the ONE canonical binding of the real `carProtocol`
builders into the envelope's injected deps + the gate (`ENVELOPE_INTAKE_ENABLED`, default **off**,
in-memory only). Phase A injected the deps so the layer could never fork the grammar; this file
guarantees there is exactly ONE place they are bound, so no call-site can quietly drop a builder.
② **`LinkManager.sendEnvelope(input)`** — decode → encode → the existing `sendLine`. Resolves
`{ok}` / `{ok:false,error}` (no throw) so a caller can render the reason; fails CLOSED on both
counts (malformed envelope → translation error before any I/O; transport failure → the manager's
own reason). ③ **`useControlHub.sendEnvelopeCommand(input)`** — ONE flag-gated intake so both
dialects coexist. It encodes to a line and then calls the **existing** `sendCommand` fan-out:
deliberate, because `sendCommand` is where **R-4 fleet parity** lives (mode-based transport routing

- the `EVERY_LINK_COMMANDS` broadcast set) and `linkManager.sendLine` is NOT on that path — routing
  envelopes through `linkManager` would have silently bypassed R-4. Encoding first also makes "no wire
  line differs from the pre-envelope path" true **by construction**, not by test.
  **W-14:** a success result carries **no line** on purpose — for `ROUTERS;ADD` / `WIFICFG` the line
  IS the password, and an echoed string is exactly how a credential lands in a log or crash report.
  **F-41:** the gate ships OFF and no UI calls it, so on the shipped build this round is invisible.
  Gates: tsc 0 · vitest **343/343** (24 files) · prettier clean. New tests pin byte parity for EVERY
  envelope type over BOTH BT and WS in CI (so the acceptance criterion can't regress between device
  rounds), fail-closed on malformed input, gate-default-off, and the no-echo rule.
  **Bench rows:** `Genum_4WD4M_CAR/TRACKS/DEVICE-TESTS.md` **T11–T14** (Round E — that car is the only
  permitted test target); app regression rows `mobile/TESTING.md` **U-59-1..3**. To run: flip
  `setEnvelopeIntakeEnabled(true)` in a scratch build. Roadmap: §4 done, §4b = remaining gate.
  **Ship evidence:** commits `2d659e5` (wiring) + `730cc4c` (ledger), pushed `3160826..730cc4c`;
  CI ✓ `36759054003` · OTA Only ✓ `36759054023` (release-guard passed, metadata PUBLISHED); live
  `release.json` = `OTA · Short update (730cc4c1…)`, **3.2.7 unchanged** (correct — JS-only, F-32).
  Car repo: `Genum_4WD4M_CAR` `c8771da` (Round E rows). ⚠ **This OTA is behaviourally IDENTICAL to the
  previous one** — the gate is OFF and no screen calls the intake. Do not expect the app to _look_
  different; that is the round working as designed.
  **✅ PHASE A (previous step) — CONNECTION-MANAGER: JSON COMMAND ENVELOPE
  (`commandEnvelope.ts` + 13 tests, INTENTIONALLY DORMANT — zero live call-sites).** Owner:
  "dont wait for me do what you need to until this session ends; study properly the existing
  architecture and build what you need to properly." Architecture study done (transports/
  linkManager + types + adapters + carProtocol read end to end — the brief's ~70% exists).
  Built the SAFE form of the brief's "unified JSON schema": a pure, versioned (`v: 1`)
  translation layer that accepts friendly JSON and emits ONLY the locked wire grammar via the
  REAL carProtocol builders (injected as deps — the envelope cannot fork the grammar). Refuses
  unknown versions, free-text mode names (`"obstacle_avoid"` → error; FIN-23 registry is the
  only vocab; the ONE legacy alias BT→4WD4M applies), and out-of-window values with readable
  errors. NOT wired into the live path — the hub/transports still speak wire lines; activation
  is Phase B of `guide/PLAN-2026-09-30-CONNECTION-MANAGER-ROADMAP.md` (owner go + F-41
  discipline, acceptance on the 4WD4M testbed). Dormancy recorded here + root `CONTINUITY.md`
  per the U-25/F-45 dead-code liability rule. Gates: tsc 0 · vitest **330/330** (23 files).
  Roadmap doc: `guide/PLAN-2026-09-30-CONNECTION-MANAGER-ROADMAP.md` (Phase B wiring, Phase C
  unlock order HTTP→BLE→mDNS→MQTT each behind its own device round; ESP-NOW out of scope).
  Mid-session handoff for the next AI: root **`CONTINUITY.md`**.

**✅ SHIPPED 2026-09-30 (later) — U-58: DECK LANDSCAPE LAYOUT FIX (JS-only → same-version OTA
3.2.7/60, COMMITTED + PUSHED + OTA PUBLISHED + VERIFIED LIVE).** Owner: the per-category
drive decks "merge and overlap everything together in the landscape view" while the robocar
deck is proper. Root causes: ① the non-robocar branch's row had NO bounded height (the OLED's
`max-h-[55%]` resolved against an indefinite parent → ignored) and the deck card overflowed
the screen bottom, clipped by `overflow-hidden` → "merged"; ② decks drew their own DeckCard
INSIDE the screen's card (double borders); ③ tile classes `w-[47%] flex-1 min-w-[120px]`
fought each other → unpredictable wraps. Fix (robocar branch + DroneControls untouched):
`RemoteControlScreen` deck branch rebuilt on the robocar telemetry-view idiom — flex-1
min-h-0 row · fixed 2:1 OLED column (30% width, max 280 px, self-start, overflow-hidden) ·
the deck's OWN DeckCard fills the bounded column (screen no longer wraps decks in a second
card; DroneControls/SensorGrid keep their screen-level card) · `shared.tsx` DeckCard defaults
`flex={1}` + min-h-0; DeckGrid replaced the percentage tiles with explicit 2-up rows (odd
count pads the empty half). Gates: tsc 0 · vitest **317/317**. **Ship evidence:** commits
`4a4e87c` (fix) + `3d9b488` (ledger), pushed `a39a758..3d9b488`; CI ✓ `36752541275` · OTA
Only ✓ `36752541302` (release-guard passed, bundle PUBLISHED 2m43s); live `release.json` =
`OTA · Short update (3d9b4889…)`, version 3.2.7/60 unchanged. Device rows: `mobile/TESTING.md`
**U-58-1..4** — owner device queue: **U-58 + still-open U-51..U-57** (close+reopen the app ×2).

**✅ DOCS 2026-09-30 — CONNECTION-MANAGER PROMPT ANALYZED (docs-only, no code) + SCOPE
RULING.** The outside AI's "Connection Manager" design brief was analyzed against the repo:
~70% already built (LinkManager/registry/`CommInterface`), and its two headline ideas
(first-handshake auto-selection; a new unified JSON schema `{"mode":"obstacle_avoid",…}`)
CONFLICT with locked rules (F-38/F-41/R-16a; FIN-23/24 + F-21/F-23 protocol locks; D-1
parking; flash budgets 86%/89%). Full record + verbatim prompt:
`guide/SESSION-2026-09-30-CONNECTION-MANAGER-PROMPT.md` · one-page summary: root
`RESUME-ME.md` (new root resume note). **OWNER SCOPE RULING recorded: the new Connection
Manager design will be TESTED IN THE APP AND THE `Genum_4WD4M_CAR` TESTBED ONLY** — donor
cars (wireless/2WD/balance/remote) and no-firmware projects are not test targets; the
ESP-NOW-via-remote-bridge spike is out of scope (it would touch the excluded remote repo).
Nothing implemented.

**✅ SHIPPED 2026-09-30 (latest) — DECKS STEPS ②+③: ALL FIVE CATEGORY DECKS + KIND HEADERS,
JS-only → same-version OTA 3.2.7/60 (`c40e3be` + `f05cdaf`).** Owner approved the Smart Home
pilot screenshot → ② SmartFarmDeck (Pump Room/Solenoid Valve live relays, Soil Wetness gauge,
Soil Temp, honest "Ready for firmware" Irrigation Plan), SmartCityDeck (Street Lamps/Parking
Slots relays, AQ (ppm) gauge, Daylight %), SmartDustbinDeck (Fill % gauge, Lid Open/Compactor
Run relays, Last Empty placeholder), HandheldDeck (Battery %, RSSI (dBm), Ch1/Ch2 relays,
throttle-curve placeholder) — RemoteControlScreen maps slug→deck via an IIFE switch; the
shared SensorGrid fallback is FULLY RETIRED. ③ ToolsScreen pill row grouped under two static
kind headers (KIND_GROUPS in project-catalog.ts): "Devices that drive" / "Devices that monitor
& switch" — same 7 pills, same order, nothing merges (owner decision ①). Tile labels were
disambiguated (Pump→Pump Room, Solenoid→Solenoid Valve, Soil Moisture→Soil Wetness, Schedule→
Irrigation Plan, Street Light→Street Lamps, Parking→Parking Slots, Air Quality→AQ (ppm),
Ambient Light→Daylight %, Fill Level→Fill %, Lid→Lid Open, Compactor→Compactor Run, Last
Emptied→Last Empty, Battery→Battery %, Signal (RSSI)→RSSI (dBm)) so the parity test's
pairwise-disjoint rule holds across shipped labels AND the reserved vocabulary. Gates: tsc 0
· vitest **317/317** (8 parity + 4 kind-group tests) · prettier clean. Device rows:
`mobile/TESTING.md` **U-57-1..4**. Per-category decks round COMPLETE (steps ①②③ done) —
remaining: owner device passes (U-51..U-57) + FIN-36 re-stage.

**✅ SHIPPED 2026-09-30 (latest) — PER-CATEGORY DECKS STEP ①: Smart Home deck pilot,
JS-only → same-version OTA 3.2.7/60 (`9570187`).** The approved plan
(`guide/PLAN-2026-09-29-CONTROL-PANEL-KINDS.md`) is now started: new
`components/tools/decks/` — `deckkit.ts` (pure-TS per-category tile manifests + reserved
step-② vocab + `hasDeck()` routing helper + PILOT_DECK_SLUGS tripwire) and `shared.tsx`
(DeckCard/DeckSwitch/DeckValue/DeckGauge/DeckPlanned/DeckGrid chrome, robocar-card family
styling). RemoteControlScreen's non-robocar branch renders the **SmartHomeDeck** for any
category with a manifest — Smart Home shows ONLY its own tiles: Light/Fan/Socket relay wall
(LIVE `OUT<i>:n` writes via the hub's toggleRelay, canControl-gated), Temperature/Humidity
readouts (live sensorData placeholders, U-47 pattern), and an honest **"Ready for firmware"
Motion/IR tile** (disabled, never fakes success). Farm/City/Dustbin/Handheld stay on the
shared SensorGrid until owner screenshot approval (step ②); robocar + drones untouched
(gold standard). Parity test `deckkit.test.ts` (8) pins zero cross-category tile-label
overlap (incl. the reserved vocab) and the step-② tripwire. Gates: tsc 0 · vitest
**313/313** · prettier clean. Device rows: `mobile/TESTING.md` **U-56-1..4**. REMAINING:
step ② (four decks after owner approval) → step ③ (ToolsScreen kind headers).

**✅ FIXED 2026-09-30 — WEBSITE CI REPAIR (`a8f72f7` + ledger `22b14b3`, website repo).**
The owner reported red runs: `tests/car-profiles.test.ts` indexed `body.profiles[0]`
without the optional chain → TS2532 under `noUncheckedIndexedAccess` → ci.yml red AND every
scheduled sync-app-fallback run failed its typecheck gate (no fallback auto-commit could
land while red). One-line optional-chain fix; website gates: tsc 0 · vitest **164/164** ·
prettier clean · CI ✓ (36700664286) · Sync app fallback ✓ (36700664409). App repo was and
stayed fully green throughout.

**✅ SHIPPED 2026-09-30 (later) — R4-7: USER PREFERENCES HUB, JS-only → same-version OTA
3.2.7/60.** Menu group "Robot Settings" → **"User Settings"**, item "Robot preferences" →
**"User preferences"**; route `RobotPreferences` → `UserPreferences` (screen renamed via git mv,
robotSettingsService untouched). The screen is now the USER hub: ① **My devices** — every
car/device ever connected through ANY transport, listed ONCE (union of cloud `car_profiles` +
local deviceMemory records + the last-device spill, keyed by the stable profile key
fw:<id> | MAC | wifi:<identity>; mirrored rows flagged; local-only rows badged "this phone");
per device **Set name · Auto-join on/off · Forget** (forget = app memory + cloud row, NEVER the
car). ② **Robot profiles** — the existing robot_user_settings scope, unchanged. New
`deviceProfileRegistryService.ts` (union + actions + `pushLocalDevicesToCloud` offline-first
spill: locally-known devices land in the DB automatically once online; factory-fresh stubs are
never pushed). Hub writes now call `rememberDeviceKey()` so the registry index never misses a
device. No new table (owner rule) — car_profiles already stores everything; F-45 probe rule
not triggered. 9 new registry tests (vitest **305/305**). Device rows: TESTING.md
**U-55-1..6**. REMAINING round-4 item: none in code — R4-1..R4-7 all shipped; next queued
design round = per-category decks (PLAN-2026-09-29-CONTROL-PANEL-KINDS.md).

**✅ SHIPPED 2026-09-30 — ROUND 4 CORE (R4-1b · R4-4 · R4-5), JS-only → same-version OTA
3.2.7/60, one concern per commit.** ① R4-1b: ConnectionBanner's Signal row is method-flavored
— "Router signal · car to your router" on a home-router link, "Car AP signal · phone to the
car's hotspot" on an AP link (the dBm is always the car's own radio; only the wording follows
the method — owner: "when the car is the AP, show that, not home-router dBm"). ② R4-4:
TransportPicker publishes the chosen method via `onPickedChange`; ToolsScreen hosts the
**Home router settings** section ONLY for `wifi-sta-ws` — the same RouterPanel the remote's
webserver mode uses, plus a per-row **Edit** (re-ADD upsert, T-48a) — AP/BT never see it. ③
R4-5: the WIP `deviceProfileService.ts` (broken: duplicate export, dead effect guard, second
`device_profiles` table = data-mixing risk) was DISCARDED; the U-52 `car_profiles` engine now
also syncs `last_wifi_ssid` + restores it on adopt (recency seed + STA address prefill).
WIP commit rule violated by the leftover WIP — see FAILSAFES **F-49**. Gates: tsc 0 · vitest
**296/296** · prettier clean. Device rows: `mobile/TESTING.md` **U-54-1..6**. Next queued:
**R4-7** (User preferences hub; rides the existing engine).

**PLANNED (owner decisions captured 2026-09-29) — CONTROL PANEL PER-CATEGORY DECKS, UI-first.
Plan: `guide/PLAN-2026-09-29-CONTROL-PANEL-KINDS.md`.** Owner: the 7 categories stay SEPARATE
(kinds are visual labels only) · robocar deck untouched (gold standard) · every OTHER category
gets its OWN landscape-only deck in the Remote window showing only its own things (never the
shared SensorGrid fallback) · build the full UI/display now, operations later. Design covers:
kind headers (Vehicles & Controllers / Stations & Environments), five dedicated decks
(SmartHome/Farm/City/Dustbin/Handheld) on a shared deck kit, honest "Ready for firmware" chips
for not-yet-wired controls, parity tests pinning zero cross-category leakage. Rollout: deck kit

- SmartHomeDeck pilot → owner screenshot approval → remaining decks → kind headers. Owner open
  checks in plan §6 (label wording, tile defaults, chip wording). **Step ① SHIPPED 2026-09-30
  (see top banner) — steps ②–③ remain.**
  **2026-09-29 (LATEST) — CONTROL PANEL ROUND 3: FALSE CONNECT ERROR KILLED, PORTRAIT BANNER
  FIXED, DIALOG CENTERS ON THE PHONE (`2a8b406` `ca5822d` `f890a2e`, JS-only → same-version OTA
  3.2.7/60, run `36593994243` green).** Owner: red `Cannot read properties of undefined (reading
'statusCallbacks')` under the verified line while the car answered fine on BT + WiFi; the
  Linked / "Network on the car · own access point" lines broken in portrait only; disconnect
  dialog centered on the page not the phone. ① F-46: `adapters.ts` passed `onStatus` as a bare
  method reference — detached `this` threw on every linkManager adopt/activate subscription (the
  direct hub paths always bound, which is why driving worked); arrow wrappers now bind the call.
  ② F-48: ConnectionBanner `Row` rendered body text as a second flex column — portrait crushed
  the long lines, landscape masked it; body text lives in the text column, signal bars are a
  `trailing`. ③ F-47: the disconnect confirm rendered INSIDE the ScrollView so `inset-0` covered
  the scrollable PAGE; it is now a sibling of the ScrollView under a screen-wide root.
  Gates: tsc 0 · vitest 292/292 · prettier clean. F-46 regression test skipped (shared-mock
  typing made it brittle) — rule recorded in FAILSAFES F-46. Owner also asked for the Control
  Panel re-organized per project kind (robo cars, smart home, city…) — NOT started; queued as
  the next design round after the device passes. Device rows: `mobile/TESTING.md` **U-53-1..4**.

**2026-09-29 (LATEST) — CAR PROFILES EVERYWHERE: DB APPLIED LIVE, APP SYNC-ON-CONNECT WIRED,
WEBSITE ACCOUNT SURFACE (`fb7d1c3` `a2e08cb` `a40be3d`, ALL JS-ONLY → SAME-VERSION OTA
3.2.7/60).** Owner: "car profiles and their data to the database from all app and websites… gets
sync with the device as soon as everything gets connected… save the last save things… ready for
4wd4m, 2wd1m, selfbalance… make note of this session for security." ① The `car_profiles` table
was committed rounds ago but **never applied** — live probe PGRST205; ran the project's own
`npm run db:apply` → probe `200 []` (owner RLS verified). ② The app's cloud profile service was
**dead code** — now wired: `persistPrefs` stamps `savedAt` + mirrors every save to the user's row;
on profile-key focus the hub pulls and ADOPTS the cloud row when newer (or local factory-fresh),
else PUSHES the newer local save; merge helpers sanitize + clamp (speed 100..255, servo/steer
0..180, trim ±100). F-44: narrow persist patches were wiping `wifiHistory`/`fullscreen` — fixed
(base carries them forward). ③ Car Profile card elaborated: last-saved drive readout (mode name,
speed n/255, steer°, ±trim, control style), sync badge (synced · restored · saved-on-phone),
sign-in hint. ④ Website: `/api/user/car-profiles` GET/PATCH/DELETE + account **Car Profiles**
panel (rename/remove; web never writes drive settings). Security notes in `GUIDE.md` session log

- FAILSAFES **F-44/F-45**. Gates: mobile tsc 0 · vitest **292/292**; website tsc 0 · lint 0 ·
  vitest **164/164**. **Next: owner device round = `mobile/TESTING.md` U-52-1..5 (sign-in → link →
  synced badge → second-device restore → web rename/remove) + U-51-1..5 from the earlier round
  still pending.**

**2026-09-29 — CONTROL PANEL SNAG ROUND 2: SIX FIXES COMMITTED (`cc8f671`→`fdb0941`), ONE
CONCERN PER COMMIT, ALL JS-ONLY → SAME-VERSION OTA (3.2.7/60 stays, no APK).** Owner snags
fixed: ① "Every way the car can be controlled" teaching card removed (`cc8f671`,
`ConnectionsTeaching.tsx` deleted — the per-method ⓘ windows carry that content; stale U-50
rows superseded). ② SPP false-error killed (F-40, `7f3420f`): the bridge no longer throws
"That car is no longer in the scan list. Rescan." — it resolves the scanned device when still
listed, else dials directly by MAC with the scanned name (`name?` added to
`TransportConnectOptions`). ③ Primary-method gate (F-41, `6034eaf`): only **SPP + Car access
point** selectable; the other six rows dimmed **"Coming Soon"**, dial-proof, ⓘ windows intact;
STA/home-router unlocks after SPP + AP device-verify. ④ Speed fixed (F-42, `90b29ca`): the
telemetry STATE echo no longer overwrites the user's speed edit (change-guarded via `speedRef`,
range-clamped 100..255, NAV-aware); strips linear 100→255, `DriveControls` imports `SPEED_MIN`
from the shared protocol — shown = sent `SPD<n>`. ⑤ FAB rotation fix (F-43, `a967513`):
persisted slot re-clamped into the visible window on every `useWindowDimensions()` change — a
portrait-dragged slot can no longer park the FAB off-screen in landscape. ⑥ Control Panel
polish (`fdb0941`): hub connect errors render with the connection feedback cluster above the
picker; About spacing matches section rhythm. Gates: tsc 0 · vitest **285/285** · prettier +
lint-hook clean. `app.json` untouched. **Next: OTA Only run green (release-guard checked first:
live manifest 3.2.7/60 == `app.json`) → owner device round = `mobile/TESTING.md` U-51-1..5**
(paired-car connect · Coming-Soon rows · speed holds mid-drive · FAB survives rotation · error
placement). U-49/U-50 device rows still open.

**Previous round — U-48 FINAL SNAG ROUND: COMMITTED (`d148457`), PUSHED, CI GREEN, OTA PUBLISHED. One owner
action left — the device pass.**

1. ~~`supabase functions deploy site-content`~~ — **DONE.** Deployed to v4 and verified live
   (`get` no auth → 200, `upsert` no auth → 401, `upsert` bad token → 401), so the app's admin
   "save site content" works end to end. **Must use `--no-verify-jwt`** (public `get` + privileged
   `upsert` in one function; a plain deploy resets `verify_jwt` to true and breaks the app's
   unauthenticated hero read). Full note in the website `TRACKS/INDEX.md`.
   `payment-khalti` is committed but **intentionally NOT deployed** — the owner owns the payment
   side, so it was left alone on purpose; it must also keep `--no-verify-jwt`.
2. ~~Review + commit + push both repos~~ — **DONE.** app `d148457`, website `9b23f8b`, both on
   `main`, both CI green, no version bump (JS-only).
3. `ota-only.yml` auto-fired on the `mobile/src/**` push and **published the bundle** (run
   36334108319, 2m40s). `release.json` shows `"OTA — Short update (d148457…)"`, `updated_at`
   2026-09-27T16:43Z. App stays **3.2.6 / 59** — no APK rebuild needed.
4. **Owner device pass** (the only remaining item): pull-to-refresh on Home/Printing/Tools ·
   double-tap on "Add to build list" adds exactly once · cart "+" lands on the right quantity ·
   admin site-content save succeeds.
   Detail: `guide/PLAN-2026-09-27-U48-FINAL-SNAGS.md` §6–§7 + `guide/SESSION-2026-09-27-U48-FINAL-SNAGS.md`.
   Gates at handoff: app tsc 0 · vitest 205/205 · prettier clean · web tsc/lint/vitest 151/151/build.

**DONE 2026-09-27 — U-45 PHASE 2 APP LINKER + U-47 OWNER ROUNDS v1→v7 (app `fb3d118` → `4f8ed03`; all pushed).**
Full logs: `guide/SESSION-2026-09-27-U47-OWNER-ROUND.md` (per-version detail + do-not-regress list)

- `guide/NEXT-SESSION-2026-09-27.md` (carry-over queue). Shipped app-side: project↔component linker
  mirror (detail strips + ProjectTab linker card via the `save_project_components` RPC, vitest 203/203
  at that point); U-47 six-category Control Panel + remotes (Smart Dustbin Fill/Lid, Remote Controller
  RSSI — placeholder sensorData until a real firmware protocol exists), app-wide CollectionContext +
  collectionService hearts, minimal square ProductCards + `productMedia` fallback imagery, shared
  `applyComponentsScope` (+ regression tests), admin single-row tabs + swipe-sync guard + overflow
  sweeps, home snap carousels + electronic-only Shop strip, PrintingScreen store + filter stack,
  CartHeader + cart web-parity rebuild, menu cleanup, biometric re-arm guard + auto-heal (v7) with the
  Security switch always rendered for staff. Gates every round: tsc 0 · vitest 205/205 · prettier ✓.
  Version 3.2.5→3.2.6 (58→59) bump pushed via release.yml.

**DEVICE-VERIFY (owner — the FIN-36 gate; pairs with the web menu checks):** reopen the app ×2 on
3.2.6/59: ① biometric toggle switchable + no card deflect on resume; ② admin tabs single-row, no
flicker; ③ minimal cards + hearts → profile collection sync; ④ six-category Projects filter;
⑤ Smart Dustbin / Remote Controller remote windows render; ⑥ cart header + qty controls at 320–360px;
⑦ bottom nav 4 tabs. On PASS → re-stage FIN-36 targets to the 3.2.6/59 release chain
(`guide/FIN-36-TAGS.sh --dry-run`) → cut tags.

**DONE 2026-09-25 — PERF BATCH (JS-only → rides the next OTA, no version bump).**
Queued at the end of U-31 and executed after the U-37 mirror:

- **HomeScreen progressive render** (`screens/HomeScreen.tsx`): the old render
  gated EVERY band behind a full-screen spinner until the SLOWEST of four
  fetches settled (services + catalog + site content + programs). The hero now
  paints instantly on the bundled fallbacks; services / featured products /
  programs+curriculum+pilot bands each appear as their OWN promise resolves
  (`servicesReady` / `featuredReady` / `programsReady`), with one small inline
  spinner while a band is in flight. One slow read can no longer blank the
  whole home screen. Bands sharing one read (curriculum + training + pilot)
  gate together on `programsReady` — the bundled fallbacks mean they are
  always populated by the time it flips.
- **CartScreen focus re-resolve dedupe** (`screens/CartScreen.tsx`):
  `resolveCart` still runs on catalog change / qty edit / focus, but the
  `setLines` update is skipped when the resolved lines are identical
  (productId+quantity sequence). Tab swipes through the pager previously
  re-rendered the whole list on every focus with zero changes.
- **Single launch OTA check** (`context/AppContext.tsx`):
  `runLaunchUpdateCheck` is now a one-flight-per-launch shared promise. The
  effect re-fires on every AppContext remount (error-boundary recoveries,
  dev StrictMode double-invoke) and each run hits BOTH the OTA server and
  the release manifest — remounts now await the same flight (one network
  check per launch, not N).
- **Memoized ProductCard** (`components/ProductCard.tsx`): wrapped in
  `React.memo` (primitives-only props → default shallow compare). The Shop
  FlatList re-renders on every search keystroke, page flip, and focus
  refresh; individual cards now skip re-render unless their product or
  layout props changed. Used by Shop/Projects/Home/related/recently-viewed
  rows, so all of them benefit.

Gates: app tsc 0 · vitest **189/189** · prettier clean on all four touched
files. No behavior changes beyond render timing; no version bump.
**COMMITTED + PUSHED 2026-09-25 (`f569b0a`)** — CI ✓ (run 36155292738) ·
OTA Only ✓ (run 36155292713, bundle **published**, update group
`f50d69aa-d955-4b71-aa92-fe4867f9e935`) → device-verify checklist below.

**DEVICE-VERIFY (owner, next app open on a 3.2.5/58 device):** ① cold-open
Home: hero paints immediately (no full-screen spinner), bands fill in
progressively; ② Shop: typing in search stays smooth (memoized cards);
③ Cart: swipe Home→Shop→Cart repeatedly — list stays put (no re-render
flicker) and badge still matches; ④ no spurious "update available" pill on
launch (the single-check guard must not change update UX); ⑤ Menu →
Update screen still reports the correct 3.2.5 (58). **Full sheet:
`guide/DEVICE-RERUN-PERF-OTA-2026-09-25.md`** (pre-flight server-side
checks pre-verified: manifest live, update group `f50d69aa…` = newest on
branch `main`, runtime 3.2.5, android+ios).

**DONE 2026-09-25 — U-37 MIRROR + WEBSITE ROUND CLOSED (app-side bookkeeping).**
The website's 2026-09-25 owner UX revision round (`guide/SESSION-2026-09-25-UX-REVISION.md`)
is fully executed + live-verified: U-35 link-import (edge redeployed,
`verify-link-import.mjs` **40/40**), U-36 project categories, U-37 admin 12→6 tabs
(web `b592627`/`15a0192`; **app mirror = `8b9b8c9`** — adminTabs, parity test,
AdminScreen merged panels), U-38a–d public design (fonts/density/5-up cards/footer),
U-38e home printing + pilot showcase (web `7f877dd`), `staff-access-e2e.mjs`
**ALL PASSED (31)**, web TRACKS U-34 flipped **DONE** (`4dc8a97`), final prod
ux-audit 60 loads · **0 hard** (only pre-existing 32px "View" pill softs on
/3d-printing + /tools — candidate min-h-9 bump next snag round). App side needs
nothing further this round; owner's app-side + mobile-browser snag lists arrive
in the next round.

**DONE 2026-09-24 — U-24 OWNER MULTI-FRONT REVISION ✓ COMMITTED + PUSHED (app `4e3e5fd` ·
web `b0aacfc`; CI + OTA green).** Full plan/root-causes/progress in
`guide/SESSION-2026-09-24-OWNER-REVIEW.md`; web ledger: web TRACKS `U-24`. **P1** owner admin
access (web role plumbing — owner role no longer collapses to customer; app unchanged).
**P2 GHOST-CART FIX (app):** `cartService.pruneOrphanLines(lines, validIds)` keeps only
active-product ids (no-op offline), memoized `productService.listActiveProductIds()`,
`refreshCartCount` prunes + re-persists, sign-in merge prunes merged lines, `signOut` →
`cart.clearCart()` + badge 0 → the "6 items while logged out" phantom is gone; cartService
tests extended (prune block; **31/31**, suite **189/189**). **P3 import/extract:** app
`AdminScreen` import-by-link now uses a real cross-platform URL Modal
(`importLinkOpen`/`importLinkDraft`, confirm→preview→seed editor→Products tab) — replaces the
iOS-only `Alert.prompt` that silently died on Android; web AdminProducts save/toggle try/catch;
edge link-import honors reviewed image/gallery overrides. **P4** MakerWorld-standard extraction:
canonical `makerworldStructuredSpecs` (Compatible / Dimensions W×D×H mm / Weight / Materials /
Filament types by name / Print time — instance titles dropped), description cap 420 + stat-noise
strip, category hint → live 10-category taxonomy, `import_meta.structuredSpecs`/`subcategory`;
credit UI: app ProductDetail credit block (Design by / License / Source) + **Specifications**
section from `structuredSpecs` (fallback: parsed specs). **P5** whole-image cards (app
`resizeMode="contain"`). **P8** organized detail sections app-side (Description → credit →
price/CTA → info grid → Audience/Warranty → Color/Delivery → Specifications → Project info →
related). **P7** app admin parity verified (import modal compiles, tab parity test green).
Gates: app tsc 0 · vitest **189/189** · prettier clean; web tsc 0 · lint 0 · vitest **123/123**
· build green. Live: `verify-link-import` **40/40 ×2**; post-deploy UX audit 60 loads ·
**0 hard failures** at 320/360/768/1440. JS-only round — rides the next OTA, no version bump.

**DONE 2026-09-24 — U-23 GALLERY · PROJECTS RESTORE · ADMIN STANDARDIZATION · UX,
executed (rides the next JS-only OTA — no version bump).** Full plan + decisions in
`guide/PLAN-2026-09-24-GALLERY-PROJECTS-ADMIN.md`; web-side ledger: web TRACKS/INDEX
`U-23`. App work executed + gated: **MenuScreen redesign** (unified `MenuItem` row for
nav + toggle variants, `MenuGroup` cards, 48pt rows, icon chips, hints, Pro chip, Dark
theme / biometric admin lock / haptics switches), **ProductDetail sticky CTA bar**
(pinned bottom bar with safe-area padding; qty stepper now 44pt buttons +
`accessibilityRole`; keeps Control-this-car + Request-quote), Shop/Projects/Home/admin
consume the shared `ProductCard` (gallery-aware covers, spec chips), ProductEditor +
ProjectsScreen gallery-aware media, restored 5 firmware projects editable in admin
(`4wd4m-basic` / `2wd1m-basic` / `self-balancing-basic` / `esp32-remote` /
`smart-dustbin`, `productType:'Project package'`, category `Robot Cars`, quote-only),
adminTabs reordered to the grouped contract (12 tabs — parity pinned), owner
full-access verified. Edge `link-import` re-deployed + schema (`gallery`/`import_meta`)
applied live by the website side. Gates: app tsc 0 · vitest **185/185** · prettier
clean; web tsc · lint · vitest **123/123** · `npm run build` ✓ · prettier clean; live
harnesses 40/40 + 9/9 + 10/10 + 15/15 + 11/11 + staff-access-e2e **28/28** (new
disposable-owner path). **COMMITTED + PUSHED 2026-09-24 (`f101b06`, main) — CI ✓ · OTA
Only ✓ (bundle published, v3.2.5, no version bump/APK).** This commit also landed the
U-22 unification-round app work that was still "awaiting owner go" (C7/C5/A-screens).
Web side `536ab13`; post-push prod re-verify 27 PASS · 0 SNAG · 0 FAIL · 2 DEFER.

**PLANNED 2026-09-24 — U-23 GALLERY · PROJECTS RESTORE · ADMIN STANDARDIZATION · UX
(planned scope — executed above).** Owner-agreed plan in
`guide/PLAN-2026-09-24-GALLERY-PROJECTS-ADMIN.md` (Q&A answered 2026-09-24); decisions:
① restore ONLY the 5 GENUM firmware projects from the workspace root — skip Robo Cars/
tutorials; ② admin tabs grouped (Dashboard/Orders/Products/Projects/Services | Journal/
Content | Users/Messages | Finance | Activity | Settings) + parity; ③ full gallery cap ~8 +
backfill existing products from saved source links; ④ image-led taller cards + spec chips;
⑤ light/non-invasive staff extras; ⑥ source credit line. App work: `MenuScreen.tsx` redesign
(single MenuItem row for nav+toggles, professional grouping, kill double-padded row),
ProductDetail gallery + sticky CTA + get quantity buttons, Shop card/touch pass,
app import-by-link MUST send the previewed image + gallery on save (fix "extraction not
working / no photo after save"), Projects restore surfacing (`ProjectsScreen.tsx:82-90`,
`projectService.ts:29-32`), adminTabs reorder (`src/config/adminTabs.ts`) + parity test,
owner full-access verification. Rides the next JS-only OTA — no version bump. Execution
starts in a later session on owner go.

**LATEST (2026-09-24, rides the next OTA — JS-only):** **C5 CLOSED + C7 + UNIFICATION
ROUND PLANNED (owner: "mirror everything except Remote, through Supabase").** Read
`guide/SESSION-2026-09-24-UNIFICATION.md` FIRST — it is the authoritative log for this
round. Done 2026-09-24: ① **C7 — biometrics + haptics:** `expo-local-authentication` +
`expo-haptics` (SDK-54), `services/biometricsService.ts` (local opt-in
`genum-biometrics-admin`, default OFF, enable-requires-passing-prompt, PIN fallback kept),
`services/hapticsService.ts` (tap/impact/success/warning/selection; toggle
`genum-haptics` default ON; never throws; Vibration fallback) replacing ~20 raw
`Vibration.vibrate` call sites (Remote ×7, Tools ×4, Drive/Drone/ModeChooser,
AccountSheet, FloatingRemoteButton); Menu → Security (staff-only biometric admin-lock
switch) + Menu → Feedback (haptics); AdminScreen biometric lock overlay re-arms on every
foreground via AppState. +20 tests. ② **C5 app surface:** `config/socials.ts` (pure
helper mirroring web lib/socials 1:1) + `components/SocialsRow.tsx` (Feather chip row,
empty=hidden) in ContactScreen; scaffolding (schema cols, helpers, editors both clients)
verified complete — WhatsApp/socials are admin-editable in the SHARED company_info row.
③ **A1 PENDING (bug):** Control Panel category tagline/description render EMPTY —
`projectCategoryService.mapRow()` hardcodes "" (DB has no such columns, live-probed) and
ToolsScreen renders them directly; fix = bundled-catalog fallback by slug + thread DB
capability_labels. Gates: app tsc 0 · vitest **178/178** · prettier clean.

**UPDATE 2026-09-24 (later same session) — round COMPLETED + C7 SAFETY REVISION.**
⚠️ **Do-not-regress lesson (native deps + OTA):** release.yml's paths filter watches
`mobile/package.json`/`package-lock.json`, so adding expo-haptics +
expo-local-authentication (C7) correctly triggered an APK rebuild — same 3.2.5/58
labels, new bytes. The CI OTA bundle (runtime 3.2.5) can therefore run on devices with
the PREVIOUS 3.2.5 APK that lacks those native modules. Fix shipped: `safeNative.ts`
(cached lazy require + test injection); haptics degrades to the raw Vibration API and
biometrics reports "unsupported" (Menu row hidden, gate fails closed) when the native
side is absent — static imports of the native modules are gone. **Rule: any new native
dep must degrade gracefully in JS until its first APK ships.** App vitest now
**180/180** (native-absent degrade paths pinned). CI after the pushes: app CI ✓ · OTA
Only ✓ (bundle published for 3.2.5) · Release APK ✓; web CI ✓ · Sync app fallback ✓.
W1 live probe `scripts/web-save-image-parity.mjs` **6/6 vs prod** (staff save with a
foreign image URL → storage URL stored → next/image serves it → public catalog carries
it), committed `1935bad` → rebased over bot `7dd7c04` → pushed `dd7a5e6`.

**UPDATE 2026-09-24 (earlier) — round COMPLETED.** Full detail in
`guide/SESSION-2026-09-24-UNIFICATION.md`; parity matrix
`guide/UNIFICATION-AUDIT-2026-09-24.md`. **A1 fixed:** mapRow falls back to the bundled
catalog's tagline/description by slug (DB columns don't exist), and DB
`capability_labels` now thread through `ProjectCategory.capabilityLabels` with
ToolsScreen rendering admin labels → static map → raw key. **A3 done:**
`services/newsletterService.ts` + Account Newsletter card (required-consent checkbox,
same wording as web) → new edge `newsletter-subscribe` (deployed + live-verified:
validation, 20/min rate limit, idempotent upsert with source refresh, staff/admin
gated GET/DELETE; uses the service role after root-causing that the anon upsert
violates the staff-only RLS UPDATE policy on conflict). **A6 done:** PrintingScreen now
renders the live "Models we print" strip (category `3D Models` from the shared products
table — same rows as the website) routing to ProductDetail. **A7 done:**
OrderSuccessScreen gained the WhatsApp nudge ("I just placed an order.") + SocialsRow
from the shared company row, mirroring web checkout-success. Parity status: every
customer/admin surface is mirrored through Supabase except the documented intentional
divergences (web-push settings card = web-only; app update screen = app-only; Remote =
app-only per owner D-1). Gates: app tsc 0 · vitest **178/178** · prettier clean; web
tsc 0 · lint 0 · vitest **118/118** · build green; harnesses 9/9 + 27/27 (link-import
extended) + 10/10 + staff-e2e ALL + stock 15/15 + newsletter 11/11. **Nothing committed
yet — owner go needed.**

**LATEST (2026-09-23, rides the next OTA — JS-only):** **C3 — RELATED PRODUCTS +
RECENTLY VIEWED (website U-20).** Both clients now share the same discovery helpers,
mirrored 1:1 (`productService.ts` ← web `lib/catalog.ts`):
`relatedProducts(all, current, limit=4)` — same category first ordered by price
proximity, then same-type active items — and `pushRecentlyViewed` /
`resolveRecentlyViewed` (most-recent-first, deduped, capped at 8, active-only, current
product excluded). App surfaces: **ProductDetail** records views to AsyncStorage and
renders "Related products" + "Recently viewed" horizontal strips (4-up cards matching
the Home grid idiom); **Shop** gains a "Recently viewed" strip above the grid, re-read
on every focus via `useFocusEffect` (navigation.push keeps Shop mounted, so a
mount-only effect would go stale). Storage is best-effort — disabled storage just hides
the rows. 5 new tests in `catalogFilters.test.ts` (ordering, cap, dedupe,
inactive-skip, no-mutation), identical to the web suite. Gates: app tsc 0 · vitest
**155/155**; web tsc 0 · lint 0 · vitest **106/106** · build green.

**LATEST (2026-09-23, rides the next OTA — JS-only):** **C8 — APP POLISH: SKELETONS,
PULL-TO-REFRESH, LOGGER WIRING.** ① Shop loading state is now a skeleton grid
(`components/SkeletonCard.tsx` — 2-column card-shaped placeholders with an opacity
pulse, `ShopSkeletonGrid`) instead of a bare spinner, so the grid doesn't jump when
data arrives. ② Account tab gained pull-to-refresh AND stopped clipping: the root is
now a `ScrollView` (+`RefreshControl`) instead of a plain `View`; both orders and
messages reload via one shared `reload()` used by the initial effect and the pull.
③ Silent catch blocks now log through `services/logger.ts` (error = all builds, warn =
dev only): AccountScreen (order/message loads + profile save — was a `// no-op` that
made Save look dead), ContactScreen (company-info fallback + send failure),
AppContext (session restore, server cart push, cart merge on sign-in), and
productService's live→cache fallbacks. Intentional-quiet catches (BLE/control hot
paths, AsyncStorage cache writes, `setColorScheme` platform guard) were left alone.
Gates: app tsc 0 · vitest **150/150**.

**LATEST (2026-09-23, rides the next OTA — JS-only):** **C2 — SHOP SORT + PRICE/STOCK
FILTERS (website U-18, app parity `f058200`).** The Shop tab now has: sort (Featured /
Price low-high / Price high-low / Name A–Z), a max-price ceiling picker (500–10,000 NPR
buckets; quote-only rows never match a ceiling), and an in-stock-only toggle — mirroring
the website's `/products` 1:1 (shared helper names/behavior in `productService.ts`:
`sortProducts`/`withinPrice`/`inStockOnly`, tests in `catalogFilters.test.ts`). UI reuses
`CategoryDropdown` for both pickers + a checkbox-style toggle; empty state gains a
"Clear filters" button. Web side: URL-shareable state (`?sort=&maxPrice=&inStock=`) and
the same params accepted by `GET /api/products`. Gates: web tsc 0 · lint 0 · vitest
**101/101** · build green; app tsc 0 · vitest **150/150**.

**LATEST (2026-09-23, rides the next OTA — JS-only):** **C1 — STOCK DECREMENT ON PAID
ORDERS (website U-17).** Stock now leaves the shelf exactly once per order, at the
pending→paid moment, and comes back on cancel — enforced in the DATABASE, not the
clients. Three SECURITY DEFINER RPCs in the shared `supabase/schema.sql`:
`adjust_order_stock(items, direction)` (decrement clamps at 0 / restore),
`mark_order_paid(order_id, provider_ref)` (row-locked + idempotent: decrements items and
flips status→paid in ONE transaction; a webhook/redirect race can never double-decrement),
`restore_order_stock(order_id, expect_status)` (restore + atomic flip→cancelled, guarded
so a retry can never double-restore). Server side: website confirm routes + admin PATCH
(`lib/orders.ts` transition-aware: pending→paid decrement, paid/fulfilled→cancelled
restore, cancelled→paid re-decrement, paid→fulfilled no-op) and edge fns
`payment-esewa`/`payment-khalti`/`payment-webhook` (redeployed ACTIVE). **App side:
`adminService.updateOrderStatus` mirrors the same transitions via `supabase.rpc(...)` —
the stock RPCs re-verify staff+ server-side, so a customer token is rejected.** Buyer
flows need no change (pay path is the edge fns). Schema applied live; new harness
`genumsolutions-website/scripts/verify-stock-rpc.mjs` **15/15 PASS** vs prod. **IMPORTANT
for app checkout: the shared edge payment functions had never actually worked** — they
boot-crashed in prod (missing `NEXT_PUBLIC_*` env fallbacks) and the ESEWA/KHALTI secrets
were never set. Now fixed + live-verified (web `a2c97e2`). NOTE for future deploys: the
three payment fns MUST be deployed with `--no-verify-jwt` (the app initiates payments with
bare fetches; a plain deploy 401s every app checkout). Gates:
web tsc 0 · lint 0 · vitest **92/92**; app tsc 0 · vitest **140/140**; live harnesses
9/9 + 25/25 + 10/10 + 25/25.

**LATEST (2026-09-23, rides the next OTA — JS-only):** **RICHER LINK-IMPORT EXTRACTION
(website U-16) — "make the extraction better so manual input may not be required."** The
shared `link-import` edge function now extracts MakerWorld **specs** (print profile,
weight, materials, filament types, compatible printer/nozzle), a **full gallery** of
images, an **enriched description** (clean summary + `Printed N times · N likes · N
collected · License:`), and pricing/category metadata in `extra`; the generic path picks
up multiple og:image/itemprop images + JSON-LD `additionalProperty` specs. App side:
`LinkPreview` gained `specs`/`priceLabel`/`extra`, **import-by-link seeds the editor with
`specs`**, and `createLinkImport` sends `specs` so the created row stores them (web
`AdminProducts.tsx` does the same). Edge fn deployed live (**verified 22/22** incl. 9-image
gallery + 5 spec lines). App tsc clean, vitest **140/140**. NOTE: the website harness
gained a cleanup guard (never deletes pre-existing/curated rows on upsert-collide) after a
harness run overwrote+deleted a live sample row — restored on the website side. Website gates:
tsc clean, lint 0, vitest **92/92**.

**LATEST (2026-09-23, rides the next OTA — JS-only):** **link-based product import round
(arrived with website U-14).** The app admin Products tab now has **"Import by link"** next
to "+ New product": prompt → paste any product URL → the shared `link-import` edge function
extracts details (MakerWorld via anonymous Bambu design API; OpenGraph/JSON-LD fallback for
other shops) → the editor opens pre-seeded (name/description/image/category hint) → staff
fine-tunes → **Save routes through the same create flow** (image downloaded SSRF-safe →
uploaded to the `product-images` bucket → products upsert with `documentation_url` = source
link). Also this round: product writes go through `supabase.functions.invoke('admin-products')`
with real error surfacing + `Alert` toasts into `handleSaveProduct`/`handleDeleteProduct` —
the old raw-fetch + silent anon-key fallback was the root cause of the "saved product never
showed" bug (the edge fn was never deployed). New service functions in `adminService.ts`:
`previewLinkImport`, `createLinkImport`. Related deploy docs: `genumsolutions-website`
SUPABASE_ACCESS_TOKEN restored by owner for 1 week (2026-09-23) for the U-14 edge-fn deploys
(`admin-products` + `link-import` both ACTIVE and live-verified 9/9 + 15/15). App vitest
**140/140**, app tsc clean, web vitest 71/71 + tsc + lint all green.

**LATEST (2026-09-23, rides the next OTA — JS-only):** **admin-services write-path parity +
security fix.** `upsertAdminService`/`deleteAdminService` now go through
`supabase.functions.invoke('admin-services')` (JWT attached, real error surfacing + Alert
toasts in save/delete/toggle) instead of the old bare-`fetch` to the edge URL with a direct
anon-key fallback. **The old target was an UNGATED service-role function** — anyone who knew
the URL could create/update/delete services (fixed at the source: the edge fn now re-verifies
the caller role staff+/admin+ exactly like `admin-products`). `EDGE_BASE` removed from
adminService (it was only used by that one call). Service ops UX now mirrors products:
save/delete/show-hide failures surface an alert, never silently drop. App tsc clean, vitest
**140/140**. Related: website has `scripts/verify-admin-services.mjs` (**10/10** live).

**Current state (2026-09-27):** **3.2.6 / versionCode 59** (`4f8ed03`) — released via CI
(bump push → release.yml built + uploaded the APK; website fallback synced by bot).
3.2.6 carries the U-47 v1→v7 app line (see the DONE block at the top of this file) on top of
the 3.2.5/58 round (tiers + robot preferences, isPro, pro-gated Remote, residue cleanup,
P6 role-revoke/icon) — historical release chain: 3.2.3/56 → 3.2.4/57 (2026-09-21) →
3.2.5/58 (`5fd10b1`, 2026-09-22) → 3.2.6/59 (2026-09-27). Vitest **205/205**, CI green.
Owner device pass pending — the FIN-36 gate.

**Theme parity pushed 2026-09-22 (`78e10f9`, rides the next OTA — JS-only):** the owner's
2-mode decision (website theme → Light/Dim, System removed). The app's **shared**
preference now stores canonical `'light'|'dim'` only; AppContext restore maps a legacy
`'system'`/`'dim'` cloud value → dark, else light, and writes the migrated value back.
**Latent bug fixed:** `saveThemePreference` was writing the canonical `'dim'` into the
`genum-theme-mode` AsyncStorage cache key the restore effect never recognized → dark never
survived restarts; the cache now holds the app mode (light/dark), canonical only the DB
(site + app agree on one `profiles.theme_preference`). The app's OWN native Settings theme
switch keeps its OS option (native OS-follow is by design; the web System state was the
one removed). OTA run for `78e10f9` needs a green confirmation.

**Server side of the tier/robot flow is DONE + VERIFIED:** schema (`profiles.tier` +
`robot_user_settings`, RLS + `protect_tier_column`) applied to the live DB 2026-09-22;
website gates (registered-only /app download) + admin tier toggle + per-user robot-settings
manager shipped; **`genumsolutions-website/scripts/tier-robot-e2e.mjs` = 23/23 PASS vs
production** (tier lifecycle, admin cross-user access, pro gate, 401/403/405 negatives).
Re-verified 23/23 + 6/6 + p3-review 27 PASS/0 SNAG/0 FAIL/2 DEFER after the 2-mode deploy.

## Open items

0. ✅ **DONE (long since) — RBAC levels + Admin Settings→Content reorg: shipped 2026-09-22/23.** Phases B+C landed in BOTH repos on 2026-09-22 (web `0bc4d2d`+`8cdbe8f`, app `b8a87bf` RBAC + `862d1c7` phase-C Content reorg — verified in git history 2026-09-26); U-15 gap-close web-only 2026-09-23 (`lib/roles.ts` ladder, AdminRows Hide/Show, admin-roles tests). This entry previously said "PLANNED" — stale ledger prose, the round was never logged app-side. **Re-verified live 2026-09-26: `staff-access-e2e.mjs` ALL PASSED vs prod** (staff read/edit 200 + deletes/role-change/robot-settings-delete 403 · admin user-delete 403 · customer 401 ×3 · owner full incl. user-delete 200; disposable probes cleaned up). App state today: `AppContext` isStaff/isOwner ✓ · AdminScreen owner gating ✓ · Content tab holds the 3 editors (training/pilot/curriculum) with Settings Company-only ✓. No code work outstanding; see web TRACKS U-10/U-15 for the full record.

1. ⏳ **OWNER: the device round — but the CURRENT target is 3.2.7/60, not 3.2.5/58.**
   _This entry was written 2026-09-22 and left stale; corrected 2026-10-02._ 3.2.5/58 was
   superseded by **3.2.6/59 (2026-09-27)** and then **3.2.7/60 (2026-09-28, U-49, `5c99357`)**
   — 3.2.7 is a **new APK, not an OTA** (it carried the WiFi manifest change; F-30: a LAN
   feature can never ship over OTA), so the in-app updater will NOT offer it and the web
   `/app` download is the route (registered-only). Everything since 3.2.7 is same-version JS
   OTA, so after the APK: close + reopen the app ×2 and confirm Menu → Update shows
   `Short update (7919d5c…)` (the U-67 bundle; see the U-67 entry at the top).
   **The 4WD4M firmware must ALSO be flashed (USB, 115200, `huge_app`) — see §0/T24–T26.**
   After install verify:
   - App sections show the **native installed version 3.2.7 (60)**.
   - **Launcher icon = the company stamp.**
   - **§5B device rows E-1..E-7** in `guide/DEVICE-RERUN-2026-09-21.md` — the new
     tier/robot-preference checks (download gate, remote pro gate, tier flip, preferences
     CRUD + web mirror + admin reach, downgrade behaviour).
   - Prior P6 checks still apply: admin role grant/revoke works; no stale "update
     available"; R-20 drive changes; 2WD1M editor stays gone.
   - Then the car/app rows that matter now: `Genum_4WD4M_CAR/TRACKS/DEVICE-TESTS.md`
     **T24–T26** + `mobile/TESTING.md` **U-67-1..4** (run these FIRST), then the rest of the
     `mobile/TESTING.md` ⭐ BENCH MASTER RUN.
2. ✅ **RELEASE-NOTES-DRAFT.md** (FIN-35) — refreshed to the released **3.2.5/58**
   2026-09-22 (tier + robot-preference bullets added on top of the P6 bullets).
   _⚠ Stale since: the released version is 3.2.7/60 and U-63…U-67 are not in it. Refresh it
   during FIN-35, not before the device gate passes._
3. 🔜 **FIN-36:** version-defining commits — **STALE at 3.2.5 (2026-09-22 staging), and the
   text below is stale twice over. Re-stage to the CURRENT release, 3.2.7/60:** app
   **`v3.2.7` → `5c99357`** (the U-49 bump commit), website **`website-v3.2.7` → the current
   fallback-sync bot commit**, then `guide/FIN-36-TAGS.sh --dry-run` before cutting. Firmware
   targets unchanged (v1.6.6 / v1.0.10 / v1.8.3 / v1.2.5).
   Re-staging before cutting is allowed; **never move a tag that was already pushed.** Cut ONLY
   after the device gate passes (i.e. after T24–T26 + U-67-1..4 are recorded).
4. 🌉 **ECOSYSTEM UNIFICATION:** P1–P5 DONE + pushed (see guide/ARCHITECTURE.md);
   W-6 + W-3 live; P3 machine review 27 PASS · 0 SNAG · 0 FAIL · 2 DEFER (owner visual
   pass still open — `guide/P3-REVIEW-CHECKLIST-2026-09-21.md`). **2026-09-22 adds the
   account/permission layer**: tiers + per-user robot prefs are now a shared, admin-
   managed store across app + web (one table, one API contract, both UIs).
5. 🧹 **Residue cleanup (2026-09-22) — DONE this round:** removed
   `AutonomousControls.tsx`, `WeblinkControls.tsx` (both retired by `RouterPanel`),
   `ModeInfo.tsx`, `deviceMemoryService.ts`, `carModeStorage.ts` + their dead prop types.
   Website removed unreferenced `ProjectCard.tsx`. No other orphans found (`.web.tsx`
   platform files and vitest-discovered tests are false positives — verified).
6. 🌗 **Theme parity `78e10f9` (2026-09-22):** ✅ **CONFIRMED 2026-09-23 — OTA run
   35709327384 GREEN.** CI is fully green back to the bump (the only red runs —
   M3 `add unit tests`/`update audit` CI+OTA — were repaired by the 2026-09-23
   test-fix push `ea4d07e`, CI 35818092418 + OTA 35818092425). Flag to the owner:
   the app's own native Settings theme switch still offers its **System/OS-follow**
   option (kept by design, native OS-follow); the website System state was the one
   removed per owner decision #1 — if the app Settings control should also drop
   System, that is a small follow-up.

## Do-not-regress (the R-20a lessons)

- NEVER pass `idempotent: true` for the APK download target, and never use a
  fixed filename — cache poisoning was the entire "old version forever" bug.
- NEVER hardcode `runtimeVersion` again — `appVersion` policy keeps OTA
  bundles pinned to their own native release.
- Version LABELS use `installedAppVersion()` (expo-constants), not
  `APP_VERSION` — the JS constant drifts after installs/OTAs.
- OTA push discipline unchanged: JS-only pushes ride ota-only.yml; version
  bumps always ride the APK (release.yml skips OTA on bump pushes — correct).
- NEW (2026-09-22): tier checks live in AppContext (`isPro`) — never read
  `profiles.tier` ad hoc from screens; the pro gate on RemoteControlScreen is an
  early return BEFORE any transport UI mounts.

## 2026-09-23 — advanced round (Phases A/B/C)

**Commits:** app `87ff579` (C9 hygiene).

**Phase A:** app `ProductsTab` gains `fromLink` prop; `ProductEditor` label becomes **"Save imported product"** while `pendingImportUrl` set; extracted-image thumbnail shown above the Image URL input; `createLinkImport` path unchanged (edge `action: create` still supported).

**Phase B:** app admin mirrors web admin anatomy (parity test `tests/admin-parity.test.ts` pins `TABS` order+IDs — web tab strip grouped with icons + ARIA). App side: no structural change needed beyond the Phase A `fromLink` support.

**Phase C9:** `mobile/package.json` gains `lint:check` (`tsc --noEmit`), `format`/`format:check` (`prettier`) scripts; `prettier`/`husky`/`lint-staged` added to devDeps; `.husky/pre-commit` (`npx --prefix mobile lint-staged`) + `.lintstagedrc` at repo root; `mobile/package.json` has `"prepare": "husky"` so `npm install` creates `.git/hooks/pre-commit` for new contributors; stale `mobile/.husky/pre-commit` removed. Keystore (`mobile/keystores/keystore.properties`, `genum-release.jks`) confirmed gitignored (`/keystores/`) with `plugins/with-release-signing.js` reading from `../keystores/keystore.properties` and falling back to debug signing.

**Gates:** app tsc 0 · vitest 140/140. Live harnesses green.

## 2026-09-24 — R6 UX audit round (code-path walkthrough)

**Fixed:** Journal "Get in touch about this" was a dead button (`onPress={}`) —
now pushes Contact (mirrors web `/contact` CTA); trend-brief WEF/IFR/UNESCO
links were inert text — now open via Linking (mirrors web). CartScreen no
longer shows "Your cart is empty" when the catalog fetch fails — honest
offline/can't-verify state instead.

**Fixed (deployed edge fns, shared with web):** `contact` + `site-content` were
never deployed (404) and then crashed on `NEXT_PUBLIC_*` env names — app
contact submissions now persist + succeed; home hero loads from `site_content`
DB row with bundled fallback. Lesson (repeat of C1): edge functions must fall
back to standard `SUPABASE_URL`/`SUPABASE_ANON_KEY` names AND must be in the
deploy list for every release.

**Verified:** navigation graph covers every web destination; cart→checkout→
success guards sound; payment deep-link states present.

**Gates:** tsc 0 · vitest 180/180 · prettier clean.

## U-25 audit (2026-09-25) �?" today's work: app cleanup (from both-repo audit)

Read-only audits done. App-side actions for today:

**DEAD (remove, 0 importers verified by audit):**
src/components/AppUpdateCard.tsx ; src/components/tools/Joystick.tsx
src/services/orderService.ts:196/208/220/232 (admin fns dup of adminService
394/403/522/531 �?" delete dup set, keep adminService)
src/services/settingsService.ts:58/93/104/141/147 orphans
Dead env EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID refs; unused
EXPO_PUBLIC_EAS_PROJECT_ID refs.

> **✅ CLOSED by U-48 (2026-09-27).** Every item above was re-verified to have zero references
> (tests included) immediately before deletion, then deleted. Gates after: tsc 0 · vitest 205/205 ·
> prettier clean. One correction to the original audit:
>
> **⚠ `EXPO_PUBLIC_EAS_PROJECT_ID` was listed as an unused ref but is NOT dead** — it is a live
> documented fallback in `src/config/push.ts` (alongside `app.json` `extra.eas.projectId`) and is
> named in the error text in `src/services/pushService.ts`. It was deliberately **kept**; removing
> it would break push on builds where the env var is the only source. The other two env items are
> genuinely gone (`EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` has no reference anywhere).

**PARITY (align with web card a9dd8b5):** ProductCard media root was already
square (aspect-[] / aspect-square, pushed 76a2327) �?" no rework needed; price
label/CTS unchanged this round.

**Keep hermetic:** no UI/dispatch changes until owner signs off batch.

**Gates each batch:** tsc --noEmit + prettier + vitest �?" update this ledger + app
INDEX per step.

## U-30a (2026-09-25) — shared-Supabase ledger (mirror of web U-30; see web TRACKS for full read-only audit)

DB audit ran READ-ONLY against the SHARED project via SUPABASE_DB_URL
(24 public tables / 45 indexes / RLS on all; page_views = 15k rows / 2.8MB
is the only MB-scale grower, no retention). Storage census on the same
project: product-images bucket = 634 MB (329 objects), app-releases =
1,576 MB (44 objects) — combined ~2.2 GB against the free-tier 1 GB
storage cap ⇒ that is what the Supabase "limit" email is about. NO
mutations performed. Cleanup is QUEUED (page_views retention batch +
confirmed-orphan image deletion after backup) and needs owner go — see
web TRACKS/INDEX.md U-30 for the exact safe-ordered plan + SQL.

## U-31 (2026-09-25) — storage cleanup EXECUTED + release-path prune so it can't rebuild

Owner authorized the queued cleanup. Executed against the shared project
(full detail + per-bucket numbers in web TRACKS/INDEX.md U-31):
app-releases 44 -> 5 objects (1,576 -> 162 MB) and product-images 329 -> 72
(634 -> 104 MB); total 2,210 -> 266 MB, i.e. back under the free-tier 1 GB
storage cap that triggered the Supabase limit email. page_views needed no
retention: all 16,229 rows are dated within 2026-08-25..2026-09-25 (2.8 MB),
and `created_at` was already `NOT NULL DEFAULT now()` — no schema bug.

CODE (this repo) — `mobile/scripts/upload-release.mjs` now prunes superseded
versioned APKs after the manifest is published, so the 1.5 GB cannot silently
rebuild with every release:

- New `--keep <n>` flag (default 3). `pruneOldReleases()` lists the bucket via
  the Storage REST API (plain fetch, no new dependency — the script is
  self-contained by design), keeps the newest N `genum-solutions-<semver>.apk`
  by `created_at`, and removes the rest in one batched DELETE.
- SAFETY: `release.json`, `genum-solutions-latest.apk` and the CURRENT
  `genum-solutions-<version>.apk` are in a protected set and can never be
  pruned at any `--keep` value, so the manifest, the website `/app` page and
  the in-app updater can never be pointed at a deleted APK.
- A prune failure only warns — it never fails an already-published release.
- Verified: 10/10 assertions on the real function (mocked fetch, no live
  calls) covering the no-op case, correct oldest-first removal, and the
  protected-set guarantees at keep=3 and keep=1; REST list+delete shapes
  probed against the live bucket; prettier + `tsc --noEmit` clean; vitest
  189/189.

NEXT: perf batch (HomeScreen progressive render, CartScreen/ShopScreen mount
dedupe, single OTA check, memoized list items) and the admin dashboard uplift.

# NEXT SESSION — genumsolutions-app (session close 2026-09-29: round 4 queued; current release 3.2.7/60)

## ⚠️ READ THIS FIRST — session continuity for the next AI

This session is ending; a DIFFERENT AI continues. Trust order: **git + `sed`/`grep` on disk are
the ONLY ground truth.** Late in this session the tool layer intermittently returned
fabricated/contradictory file echoes (nonexistent paths, phantom listings, edit confirmations
against files never targeted). Known-good anchors if echoes look wrong:
`git -C genumsolutions-app log --oneline -1` (expect `3493eda` or later), clean `git status`,
and the files verified in this session's early, reliable reads:
`mobile/src/screens/ToolsScreen.tsx` (572 lines pre-F-47), `mobile/src/components/tools/
ConnectionBanner.tsx`, `mobile/src/transports/adapters.ts`, `mobile/src/components/tools/
types.ts` (`SensorGridProps` at ~line 338, `SensorData` at ~line 8), `mobile/src/services/
carProtocol.ts` (CarTelemetry ~line 35: rssi/signal/ssid/ap/uptimeMs/freeHeap), `mobile/src/
components/tools/useControlHub.ts` (activeCategory ~189, relays ~280, toggleRelay ~1922,
hub return block ~2148), `mobile/src/screens/RemoteControlScreen.tsx` (landscape lock ~467-490,
deck branch ~804, hub destructure ~276-292). Re-verify line numbers — files shifted with F-47.

## RELEASED THIS SESSION (all verified: CI + OTA green, release.json confirmed)

1. **Car-profiles round pushed + published** (`fb7d1c3`→`648ed6a`, OTA `36590526975`, manifest
   → `648ed6a…`). DB `car_profiles` live, app sync-on-connect, website account panel. Device
   rows: TESTING.md **U-52-1..5** (owner, still open).
2. **Control Panel round 3** (`2a8b406` F-46 · `ca5822d` F-48 · `f890a2e` F-47, OTA
   `36593994243`, manifest → `f890a2e…`): false `statusCallbacks of undefined` connect error
   killed (adapters passed service methods DETACHED — arrow-wrapper fix); banner rows keep body
   text inside the text column (portrait split); disconnect dialog centers on the PHONE
   (sibling of ScrollView). Gates: tsc 0 · vitest 292/292 · prettier clean. Device rows:
   TESTING.md **U-53-1..4** (owner, still open).
3. Docs: FAILSAFES **F-46/F-47/F-48** · GUIDE session log · TRACKS INDEX + NEXT-SESSION
   (`8b6e6c7`).

## PLANNED — approved design, NOT started in code

**A. Per-category decks (owner-approved plan: `guide/PLAN-2026-09-29-CONTROL-PANEL-KINDS.md`).**
7 categories stay separate; robocar + drones decks untouched; five dedicated landscape-only
decks (SmartHome/Farm/City/Dustbin/Handheld) replace the shared SensorGrid fallback; shared
deck kit (DeckCard/DeckSwitch/DeckSensor/DeckPlanned/DeckGrid); honest "Ready for firmware"
chips for unwired controls; parity test = every deck's tile labels disjoint (pure-data
manifest, vitest-safe). Rollout: kit + SmartHome pilot → owner screenshot approval → rest.

**B. ROUND 4 (owner, final message of the session — queued NEXT, nothing built):**

> "using the car access point wifi method, the control panel is showing less-used things about
> other router things like home router and its signal dbm. this should be about the car's AP.
> Same things displayed the car's profile is ok but unnecessary messages and sections totally
> unrelated to the current connection method should be removed. Also start integrating home
> router wifi, and allow the user to add/delete/edit profiles for the wifi routers saved in the
> car or the remote etc that after being connected to the app, and both app and car should be
> in sync. and initially while connecting, such info about the car should be shared to the
> app's memory and then to the database. if the user changes things for the car, that car
> should also save all those things like profile, settings, data, presets etc. Also some
> sections should not be displayed/allowed to open unless the connection is disconnected (like
> the connection methods dropdown) to avoid confusion. The wifi test is good but not properly
> UI/UX designed and stays there even after the work is done. Study the control panel more and
> resolve this."

Broken into buildable items (each = one commit, one concern, like rounds 2-3):

- ✅ **R4-1 SHIPPED (`3a9d2c5`).** CarProfileCard: Saved-routers + Wi-Fi history sections now
  render ONLY while the car is actually on a router (`onRouter`) or nothing is known yet —
  on an AP/Bluetooth link they no longer show "other router things". Smart-link toggle stays
  in every state (it controls what the car does NEXT). ConnectionBanner already split
  `networkKind` correctly; hub strings untouched (carSsid/carApName are car-truth, correctly
  gated by telemetry.connected).
- **R4-1b (remaining, folded into R4-3 scope): on an AP link the banner shows the car-AP
  signal of the PHONE↔CAR link (`telemetry.rssi`/`signal`) — verify this reads as AP signal
  to the owner, not "home router dBm"; the banner Row copy may need "AP signal" wording.
- ✅ **R4-2 SHIPPED (`c029b3e`).** TransportPicker: while `link.id` is set the dropdown chip
  is read-only (press does nothing, combobox→text role, a11y disabled, menu cannot open) and
  `onSelect` refuses to dial — the Disconnect capsule is the one way to change methods.
  Remaining audit (scan/wifi-config sections mid-link) queued with R4-3.
- ✅ **R4-3 SHIPPED (`0e9349c`, 2026-09-29).** Home-router (STA) method unlocked: the gate's
  own condition (SPP + AP device-verified in U-51) was met and the `wifi-sta-ws` transport +
  adapter already existed; `wifi-sta-ws` joined PRIMARY_METHODS in TransportPicker. Also
  **R4-1b/R4-4/R4-5 SHIPPED 2026-09-30** (see the round ledger at the top of this file).
- ✅ **R4-4 SHIPPED (2026-09-30, two commits).** ① TransportPicker gained `onPickedChange` —
  the screen learns which method the user chose (pickedId, null on disconnect; effect-published,
  never render-phase). ② ToolsScreen renders the **Home router settings** section ONLY when the
  chosen method is `wifi-sta-ws`: the same `RouterPanel` the remote's webserver mode hosts
  (Active connection + tappable IP, own network pinned Default, saved list, Add form) PLUS a
  per-row **Edit** action — RouterPanel gained `onStartEdit`/`editingSsid`; the car stores ONE
  password per SSID and ADD is an upsert (T-48a), so edit = pre-filled form → re-ADD; AP/BT
  methods never render it (no method mixing).
- ✅ **R4-5 SHIPPED (2026-09-30, on the existing U-52 engine — NO new table).** The WIP
  `deviceProfileService.ts` found at session start was DISCARDED: it duplicated the
  `car_profiles` store as a second `device_profiles` table (cross-method mixing risk + broken:
  duplicate `upsertDeviceProfile`, missing export, dead effect guard). Instead `car_profiles`
  now also carries `last_wifi_ssid` (name only, never passwords) alongside the existing
  `last_wifi_url`; on adopt the hub restores it — smart-link recency seed + STA address
  prefill. Everything the user changes still lands in deviceMemory first, then mirrors to the
  DB on save (offline-first, unchanged). 4 new engine tests (34/34 in the file).
- ✅ **R4-6 SHIPPED (`fe2e909`).** WifiDiagnosticsPanel: after a run the panel now shows ONE
  summary row (pass/fail tinted, per-verdict count) + a Details chip; the full verdict list +
  probe line collapse until tapped; re-running re-collapses. Panel framing already matched the
  deck family (rounded-xl border-line bg-mist); deep-link from the banner deferred — the panel
  only mounts for WiFi methods (`isWifi && !compact`), so it no longer appears for BT links.

Order for next session: R4-1..R4-7 are ALL SHIPPED (see the two ledgers above); owner device
rounds **U-54-1..6 + U-55-1..6** are the gate. Next queued design round: per-category decks
(PLAN-2026-09-29-CONTROL-PANEL-KINDS.md). R4-1/R4-2/R4-6 shipped 2026-09-29, OTA
`36603138203` green.

- **R4-7 — Menu: "Robot preferences" → "User preferences" + connected-device hub (owner,
  latest message).** Rename the Menu → Robot Settings group item (MenuScreen.tsx ~line 132:
  currently `label="Robot preferences"`, pushes `RobotPreferences`, Pro chip) to **User
  preferences**. The screen becomes the USER hub: ① all user settings + preferences (existing
  robot_user_settings scopes stay), PLUS ② every car/device the user has EVER connected through
  ANY transport (BLE / SPP / WiFi-AP / WiFi-STA / future ones) with main controlling actions:
  set · edit · delete per device, easily, from one place. Data model: extend the existing
  `robot_user_settings` (per user × robot) + the U-52 `car_profiles` engine rather than a new
  table if the shapes fit — the device list is the union of car_profiles rows (fw:<id>/MAC
  keys) and locally-known transports. ③ OFFLINE-FIRST SYNC RULE: every device talks to the app
  over its own media and its data lands in local memory FIRST; the moment the app has internet,
  everything mirrors to the database automatically (same pattern as carProfileService
  push-on-save + pull-on-link; apply the F-45 rule if any schema change is needed — apply DB
  live + probe 200 before claiming done). Owner: "make the database according to that as we did
  in the previous days." Scope note: the car side of R4-4/R4-5 (router profiles + car-side
  persistence) and R4-7 share the same sync engine — build the engine ONCE in R4-5 and reuse.

Order for next session: R4-1 + R4-2 first (pure UI truth fixes, ship as one OTA), then R4-6,
then R4-3→R4-5 (car+DB round; needs firmware/car verify + possibly a new table → F-45 rule:
apply DB live and probe 200 before claiming done), R4-7 rides the same engine once it exists.

## OWNER DEVICE ROUNDS STILL OPEN

`mobile/TESTING.md`: **U-51-1..5** (round 2) · **U-52-1..5** (car profiles) · **U-53-1..4**
(round 3). FIN-36 tag re-stage waits on the device pass (stale at 3.2.7 staging).

## Do-not-regress additions this session

- F-46: NEVER pass `obj.method` as a bare callback — detached `this` throws "Cannot read
  properties of undefined" at runtime while tests pass. Wrap: `(cb) => obj.method(cb)`.
- F-47: Screen-centering overlays render OUTSIDE the ScrollView (sibling under a flex-1 root).
- F-48: Row body text lives INSIDE the single flex-1 text column; accessories only via an
  explicit `trailing` slot.
- Regression-test note: the adapters test was attempted twice; shared-mock typing
  (`onStatus: vi.fn(() => …)` = zero-arg) makes call-arg assertions brittle. If reattempting,
  declare mocks `vi.fn((_cb: StatusCb) => () => undefined)` and mockClear() in each test —
  the file is currently RESTORED CLEAN (no test added).

---

# 2026-10-01 - device identity / metadata session

## READ THIS FIRST: how to reach the database

**The `db.<ref>.supabase.co` host does NOT resolve on this machine. Do not waste time on it.**
The Supavisor pooler works, and the project is in region **`ap-southeast-2`** — that is
undiscoverable without the Management API, so sweep it if the region ever changes.

```
host:     aws-0-ap-southeast-2.pooler.supabase.com
port:     5432
user:     postgres.bkylfnlybtsujwzropru
password: from genumsolutions-website\.env.local -> SUPABASE_DB_URL (URL-decode the password)
ssl:      rejectUnauthorized:false
```

`pg` is already in `genumsolutions-website/node_modules` — require it by absolute path, no
install needed. `psql` is NOT installed and there is no `supabase` CLI on PATH (use
`npx supabase`, and note its stored token at `~/.supabase/access-token` is **revoked** →
`Unauthorized`).

For future secrets: put them in a `.env.local` and tell me the KEY NAME. Chat history gets
summarized out of the session, which is how the original token got lost.

## Owner decisions taken (do not re-litigate)

1. **Model metadata is canonical in the repo** — `guide/DEVICE-REGISTRY.json` (NOT a git repo,
   plain file). **Per-unit display name lives in the database.**
2. **Advertised BT/AP names are FROZEN.** Renaming breaks saved pairings and every stored
   `car_profiles.profile_key`. Record them, never regenerate them.
3. Shared Supabase IS in scope; apply migrations live for both app and website.

## Landed this session

- **Website `5c4558f`** — migration `20261001120000_device_registry.sql`, **APPLIED LIVE** in one
  transaction. New: `device_models` (6 seeded, public read/staff write), `devices`,
  `user_devices`, `profiles` 8→17 cols (additive only, nothing dropped/renamed).
  Verified from the app's anon key: models=6, devices/user_devices/profiles=**0** (RLS holds).
- **App `adf9851`** — `services/deviceRegistryService.ts` (+15 tests). DB-first with
  `BUNDLED_DEVICE_MODELS` fallback; `pairingLabel()` shows app name + announced name.
- **App `5382d08`** — server/client help for all 8 methods; killed the 3× duplicate error card in
  `ToolsScreen`; `SensorGrid` prints `—` instead of fake `0°C/0%` (setSensorData has NO caller).
- Gates: tsc 0 · **vitest 369/369 (26 files)** · prettier clean. Both repos CLEAN.

## The bug that was found and fixed

`robo_car_modes.token` for `4wd4m` was `BT`. The firmware's real token is **`4WD4M`**; `BT` is a
LEGACY ALIAS kept only for pre-v1.5.0 controllers (firmware X-8). So the DB misreported what the
car expects. **Command behaviour was never affected** — the app's protocol layer is bound to the
bundled `roboCarCatalog` tokens, not that column. All 9 mode names unified on the em dash the app
already uses. `device_index` is PROTOCOL — untouched.

## Architecture already correct (do not "fix" it)

`robo_car_modes` = DISPLAY catalogue (website-admin-edited, public read). `roboCarCatalog.ts` =
PROTOCOL truth + offline fallback + **seed source**. They are intentionally different layers;
`carModeService` reads DB-first. `device_index` is the cycle order and is protocol.

## Known drift — needs an owner answer, do not guess

- **4 naming vocabularies per device:** repo folder / firmware `FW_NAME` / advertised BT+AP /
  app catalogue. 4WD4M = `Genum_4WD4M_CAR` · "4WD4M Car" · "4WD CAR"+"4WDCar_Wifi" · "4WD4M".
- **`wireless-car` (fw 1.8.0, the 4WD4M's own ancestor) and `smart-dustbin` have firmware but NO app
  mode entry** — invisible to the app. Add catalogue entries, or retired?
- **5 app modes have NO firmware repo:** `obstacle-us`, `obstacle-ir`, `website-client`,
  `website-server`, `path-follow`. Real products awaiting firmware, or dead entries to delete?
- App `car:` labels are internally inconsistent: `4-wheel-drive`/`2-wheel-drive` lower-hyphenated,
  `Self-balancing` capitalised, rest prose (`Obstacle avoider`, `RF car`).
- `4WD4M` + `remote-esp32` DEVIATE from the repo-wide "BT name = FW_NAME upper-cased" rule (R-17).
  Both deliberate and frozen; the new tests assert the deviation so it is not "corrected".

## Next moves

1. **Owner profile UI** — DB columns exist, nothing renders them. No garage screen yet.
2. Website: consume `device_models` so product/IoT pages show registry metadata.
3. Firmware `WebPage.h:219-220` still force-calls `setMode(MODE_ESP_SERVER)` on page load.
4. Untested-on-hardware (unchanged): HTTP `REQ_STATE → /status` + mode-token whitelist, unified
   JSON envelope, per-device Connection Manager API, first-handshake arbitration.
5. BLE/mDNS/MQTT still parked. MQTT still needs broker + credential decisions.

## Do-not-regress additions this session

- F-49: A **model** (physical product line, `device_models`) is NOT a **mode** (operational state,
  `robo_car_modes`). Conflating them is how one device ended up with four names. **This nearly
  shipped a live outage**: the garage claim passed `savedPrefs.modeId` as the model, and
  `register_device` validates its model arg against `device_models` and RAISES on an unknown one -
  so every car in a non-basic mode would have silently failed to reach the garage. Verified live:
  `'obstacle-us'` -> "unknown model_id", `null` -> OK. Fixed to send `null` (the RPC treats null as
  "did not say" and cannot overwrite a curated value). Pinned by a test.
- F-50: RLS verified from the PUBLIC anon key, not as `postgres`. A policy that only passes when
  tested as superuser is not protecting anything.
- F-51: Postgres validates a policy body at CREATE time — a policy referencing a table that does
  not exist yet fails the migration. Create both tables, THEN the policies (see section 3b).
- F-52: `advertisedName` must never be a copy of `displayName` — that edit renames hardware and
  breaks every saved pairing. Asserted case-SENSITIVELY; a case-only difference is legitimate.
- F-53: Never print a sensor reading no code path can supply. `0°C` reads as a measurement; `—`
  plus a reason is honest. Applies to every readout, not just controls.
- F-54: **Check the argument ORDER in a SQL `coalesce` conflict clause against the comment that
  describes it.** `coalesce` returns its first non-null argument, so `coalesce(excluded.x, d.x)`
  and `coalesce(d.x, excluded.x)` are opposite policies. `20261001140000` promised "a reported
  model only fills a gap; it never overwrites a curated value" and then wrote the caller-wins
  order, so any signed-in user could retype somebody else's car on the SHARED `devices` table.
  Reproduced live (`4wd4m` -> `smart-dustbin` on claim), fixed in `20261001160000`. Curated
  catalogue data is **first-write-wins**; only self-reported facts (`fw_version`, `last_seen_at`)
  may be refreshed by a caller.
- F-55: **A defect in SQL has no unit test to catch it.** All 208 website tests passed while the
  above was live. For SQL, assert the migration TEXT and always run a negative control:
  reintroduce the bug, confirm the test fails, restore. Also assert only the CREATE statement,
  excluding leading comment blocks, since a header that _documents_ a bug will otherwise satisfy
  or trip assertions meant for executable code.
- F-56: **A `"use client"` component must never reach a module that imports `next/headers`.**
  `lib/supabase/server.ts` is labelled SERVER-ONLY in its own header. An unused re-export in
  `GaragePanel.tsx` pulled it in and `next build` still passed, because tree-shaking hid it. A
  green build is not proof of a clean server/client boundary; unused re-exports survive longest
  and turn real the moment someone uses them.
