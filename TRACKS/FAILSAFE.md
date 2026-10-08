# genumsolutions-app TRACKS — FAILSAFE 2026-09-18

Do-not-break invariants + recovery during the app·website sync effort. Master plan:
`guide/APP-WEBSITE-SYNC-PLAN-2026-09-18.md`.

## Invariants

- **Version stays `3.2.0 / 53` this session** — this is a sync/cleanup effort, NOT a
  release. No bumps, no runtimeVersion changes, no APK builds.
- **Never print or commit secrets.** `.gitleaks.toml` allowlist stays scoped to the anon
  key only; never broaden to blanket-ignore jwt.
- **Only `main` is pushed, only when the owner asks.** `dev` untouched.
- **App never references the website** (no `*.vercel.app`, no WebViews). Only Supabase is
  shared. "Fully native" docs stay truthful.
- **`runtimeVersion` stays `1.0.0`**; JS-only changes ride `ota-only.yml`, never APK.
- **`4wd4m` edit (B1) is a pure display-string change** — token/id/deviceIndex unchanged,
  so it cannot break the wire protocol or DB seeding.
- **No ESTOP in the 4WD4M firmware.** `handleEStop` is returned by `useControlHub` and
  consumed by nothing, and `RemoteControlScreen`'s layout comment used to advertise an
  `[E-STOP]` FAB that is not rendered. The car's own FAILSAFE #11 says it has zero `ESTOP`
  handling. Safe stop is `S` / `SPD0` / disconnect. **Do not wire an E-stop UI up without
  an owner ruling on the firmware side first** — the button would send a command the car
  answers with `NACK;E=UNKNOWN_MODE`.
- **A dead reference is worse than a missing feature.** Several comments in this repo
  pointed at design docs that are not in the tree (`ARCHITECTURE.md`, 6 `guide/*.md`), at a
  route (`CarRemote`) that is not registered, at modules (`transportPickerFlow`,
  `staHandoff`) that no longer exist, and at hooks that had zero imports. Each read as
  documentation and each sent the next reader looking for something absent. When removing
  something, **fix the comments that described it** — a dangling "the X does Y" is the
  residue, not the dead code.
- **A test that cannot fail is not a test.** Two existed and were removed/rewritten
  2026-10-06: one asserted the length of a local literal array (the real constant was never
  imported), one asserted `typeof fn() === "boolean"`. Prefer asserting the real contract.
  When you discover the contract contradicts what you assumed, say so in the test comment —
  the wrong assumption is the thing future readers will repeat.
- **U-97 crash reports: one row per RESTART RECORD, never per poll.** `crashReportService`
  dedupes on `board_id|boot_count|crash_count|reset_reason` (the last-synced key in
  AsyncStorage). Do not wire `syncCrashReport` to every `/status` frame — the car loops them
  and it would flood `device_crash_reports`. Fire once on link-up per distinct record.
- **Missing is unknown, never zero (U-97).** Old firmware sends no restart fields; the row must
  keep them `null` and `has_crash` must come from a real `crashCount`, or the fleet table will
  invent crashes. Never default `boot_count`/`crash_count` to `0`.
- **Crash sync must never break a connection.** `syncCrashReport`/`flushCrashReports` catch
  everything and return, and the hub calls them fire-and-forget (`void`). A diagnostics network
  failure cannot fail a link. Keep it that way.
- **`device_crash_reports` is APPLIED (2026-10-08)** to project `bkylfnlybtsujwzropru`, verified
  (24 cols / 4 indexes / 3 RLS policies; anon insert tested then removed). To apply future
  migrations without the CLI: `POST https://api.supabase.com/v1/projects/bkylfnlybtsujwzropru/database/query`
  with `Authorization: Bearer <access token>`, ONE statement per request (multi-statement bodies
  413). The token is in `C:\bs\.env.local` (`SUPABASE_ACCESS_TOKEN`, gitignored, expires
  ~2026-11-07). Never print or commit it.

- **One live link at a time, and each transport only speaks for itself (U-98).** `dropBluetoothForWifi`
  is the ONLY sanctioned teardown of the other transport, it runs only on a Wi-Fi success path, and it
  hands `connected` to the surviving socket (`setConnected(wifiService.isConnected)`) — never
  `setConnected(false)`. The SPP status handler may clear `connected`/`linkVerified` only behind
  `!wifiService.isConnected`: a failed Bluetooth attempt, or a deliberate teardown during a Wi-Fi
  connect, must not un-verify a link Bluetooth does not own (symptom: status card stuck on
  "Connecting…" with the 2 s REQ_STATE poll dead on a working link). Pinned by
  `src/components/tools/oneActiveLink.test.ts` (raw source view, comments stripped, proven both
  directions — 4 mutations, each caught by its own rule). Do not "simplify" those guards away.

## Recovery

| Symptom                                            | Action                                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| B1 breaks a mode test                              | It is a label only. If a test pins the old label, update the pinned expected string to the website's `'4WD4M'`.                            |
| Parity test flags a mode mismatch                  | Compare `mobile/src/config/roboCarCatalog.ts` vs website `lib/robo-car-catalog.ts` vs DB `robo_car_modes`; correct only the drifted field. |
| CI trigger change (B3) unexpectedly skips workflow | Triggers become `[main]` (like the website). Nothing else in the workflow changes. Verify once after push.                                 |
| Env edit breaks supabase config                    | We don't touch `.env.local` or `supabase.ts` values — supabase config untouched.                                                           |
| Typecheck red after edits                          | Only B1 (string) + B4 (new test files) touch `mobile/src`; revert B4 additions if a runner config issue appears; B1 is inert.              |
