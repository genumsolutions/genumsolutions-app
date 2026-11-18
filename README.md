# genumsolutions-app

Android mobile app (Expo SDK 54 / React Native) for **GENUM SOLUTIONS PVT. LTD.** —
native app with its own UI/UX. **Not** a WebView wrapper.

- Entry app code: `mobile/` (see `mobile/README.md` and `mobile/AGENTS.md`).
- Operating docs: `docs/ADMIN_COHERENCE.md` (the 7-tab admin contract shared with
  the website), `docs/STORAGE_BUDGET.md` (shared free-tier image/storage budget), and
  `docs/LINK_RESILIENCE.md` (why the car link drops, what the app does, how to read
  a drop from the admin logs).
- Releases: `mobile/scripts/upload-release.mjs` publishes APK + `release.json` to the
  shared `app-releases` Supabase bucket; the sibling `genumsolutions-website` repo syncs
  its bundled fallback from that manifest (`scripts/sync-app-fallback.mjs`).
- Shared contract with `genumsolutions-website`:
  - **Supabase project** `jxgmbodzkmxanuwfaqxo` — schema single source of truth is
    `genumsolutions-website/supabase/schema.sql` (this repo's `mobile/supabase/` is empty).
  - **DB tables:** `products`, `services`, `carts`, `orders`, `profiles`,
    `robo_car_modes`, `company_info`, `site_content`, `customer_messages`,
    `push_tokens`.
  - **Current published version** is `3.4.3` / Android `versionCode` `67`, matching
    `mobile/app.json`, `mobile/package.json`, `mobile/src/config/site.ts`, and the
    public `release.json` manifest. Keep app-side version fields synchronized when
    preparing a release; do not advance the website fallback before the APK is published.
  - **Brand palette:** navy/ink/gold, `Inter + Sora` fonts — mirrored in the website's
    `tailwind.config.ts`.
  - Keep `mobile/src/config/roboCarCatalog.ts` (and the other fallback catalogs) in sync
    with the website's `lib/` mirrors and the live DB.
