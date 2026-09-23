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

## Recovery

| Symptom                                            | Action                                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| B1 breaks a mode test                              | It is a label only. If a test pins the old label, update the pinned expected string to the website's `'4WD4M'`.                            |
| Parity test flags a mode mismatch                  | Compare `mobile/src/config/roboCarCatalog.ts` vs website `lib/robo-car-catalog.ts` vs DB `robo_car_modes`; correct only the drifted field. |
| CI trigger change (B3) unexpectedly skips workflow | Triggers become `[main]` (like the website). Nothing else in the workflow changes. Verify once after push.                                 |
| Env edit breaks supabase config                    | We don't touch `.env.local` or `supabase.ts` values — supabase config untouched.                                                           |
| Typecheck red after edits                          | Only B1 (string) + B4 (new test files) touch `mobile/src`; revert B4 additions if a runner config issue appears; B1 is inert.              |
