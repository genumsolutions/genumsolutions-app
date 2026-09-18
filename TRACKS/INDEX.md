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
| B1 | `mobile/src/config/roboCarCatalog.ts:55` `4wd4m` label → `'4WD4M'` | PENDING |
| B2 | Root `README.md` + `.gitleaks.toml` header (drop stale WebView/mobile/shared/supabase.ts refs) | PENDING |
| B3 | `.github/workflows/ci.yml` triggers `[dev]` → `[main]` (+PRs to `main`) | PENDING |
| B4 | Parity tests (APP_VERSION vs app.json · 9-mode fixture · update.ts URLs) | PENDING |
| C1 | README shared-contract section | PENDING |
| C2 | Verify `typecheck` / `test` / `doctor` green | PENDING |

## Notes

- Fully-native app; not a WebView mirror. Shared schema lives in the SIBLING website repo
  (`genumsolutions-website/supabase/schema.sql`); `mobile/supabase/` intentionally empty.
- Version single source of truth: `mobile/app.json` (version + versionCode). Mirrors:
  `src/config/site.ts` `APP_VERSION`, `package.json`, git tag. Current: **3.2.0 / 53**.
- `bump-version.mjs` intentionally does NOT touch the website fallback anymore.
- `.gitleaks.toml` allowlists ONLY the public anon key (ref `bkylfnlybtsujwzropru`) — the
  service-role key stays in env only. Never print secrets.
- Env copies: `mobile/.env.local`, `C:\bs\.env.local` (build mirror — `E:\` LongPaths disabled).

*Created 2026-09-18. Update status column on every change; never delete without owner OK.*