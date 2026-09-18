# genumsolutions-app TRACKS — app·website sync 2026-09-18

Per-project tracker for the **APP + WEBSITE SYNC / UNIFICATION (2026-09-18)** effort.
Master plan + recovery: `(workspace) guide/APP-WEBSITE-SYNC-PLAN-2026-09-18.md`.

Branches: `main` (only push target) · `dev` (owner backup — never push).
Workflows: `ci.yml` · `ota-only.yml` · `release.yml` · `sync-version.yml`.
App root: `mobile/`. Release chain: `bump-version.mjs → gradlew assembleRelease →
upload-release.mjs → (website) sync-app-fallback.mjs`.

## Items

| ID | Change | Status |
|---|---|---|
| B1 | `mobile/src/config/roboCarCatalog.ts:55` `4wd4m` label → `'4WD4M'` | DONE |
| B2 | Root `README.md` + `.gitleaks.toml` header (drop stale WebView/mobile/shared/supabase.ts refs) | DONE |
| B3 | `.github/workflows/ci.yml` triggers `[dev]` → `[main]` (+PRs to `main`) | DONE |
| B4 | Parity tests (APP_VERSION vs app.json · 9-mode fixture · update.ts URLs) | DONE |
| C1 | README shared-contract section | DONE |
| C2 | Verify `typecheck` / `test` / `doctor` green | DONE |

## Notes

- Fully-native app; not a WebView mirror. Shared schema lives in the SIBLING website repo
  (`genumsolutions-website/supabase/schema.sql`); `mobile/supabase/` intentionally empty.
- Version single source of truth: `mobile/app.json` (version + versionCode). Mirrors:
  `src/config/site.ts` `APP_VERSION`, `package.json`, git tag. Current: **3.2.0 / 53**.
- `bump-version.mjs` intentionally does NOT touch the website fallback anymore.
- **2026-09-18 result:** all B/C items landed on `main` (HEAD `a390b6e`). `4wd4m` display
  label aligned to `4WD4M`, CI triggers → `main`, docs refreshed to the fully-native app,
  and `mobile/src/config/parity.test.ts` now pins APP_VERSION ↔ app.json, the 9-mode
  catalogue, and the shared `app-releases` bucket URLs (62 tests + typecheck + doctor
  18/18 green).
- `.gitleaks.toml` allowlists ONLY the public anon key (ref `bkylfnlybtsujwzropru`) — the
  service-role key stays in env only. Never print secrets.
- Env copies: `mobile/.env.local`, `C:\bs\.env.local` (build mirror — `E:\` LongPaths disabled).

*Created 2026-09-18. Update status column on every change; never delete without owner OK.*