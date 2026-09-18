# genumsolutions-app

Android mobile app (Expo SDK 54 / React Native) for **GENUM SOLUTIONS PVT. LTD.** —
native app with its own UI/UX. **Not** a WebView wrapper.

- Entry app code: `mobile/` (see `mobile/README.md` and `mobile/AGENTS.md`).
- Releases: `mobile/scripts/upload-release.mjs` publishes APK + `release.json` to the
  shared `app-releases` Supabase bucket; the sibling `genumsolutions-website` repo syncs
  its bundled fallback from that manifest (`scripts/sync-app-fallback.mjs`).
- Shared contract with `genumsolutions-website`:
  - **Supabase project** `bkylfnlybtsujwzropru` — schema single source of truth is
    `genumsolutions-website/supabase/schema.sql` (this repo's `mobile/supabase/` is empty).
  - **DB tables:** `products`, `services`, `carts`, `orders`, `profiles`,
    `robo_car_modes`, `company_info`, `site_content`, `customer_messages`,
    `push_tokens`.
  - **Version contract** `3.2.0` (`mobile/app.json` `version` + `android.versionCode`,
    `mobile/src/config/site.ts` `APP_VERSION`, git tag `v3.2.0`). Bump these together;
    never let `APP_VERSION` drift from `app.json`.
  - **Brand palette:** navy/ink/gold, `Inter + Sora` fonts — mirrored in the website's
    `tailwind.config.ts`.
  - Keep `mobile/src/config/roboCarCatalog.ts` (and the other fallback catalogs) in sync
    with the website's `lib/` mirrors and the live DB.