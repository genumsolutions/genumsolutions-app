# Genum Solutions Mobile App — Architecture Documentation

## Overview

Expo SDK 54 (React Native + TypeScript) Android app for **GENUM SOLUTIONS PVT. LTD.**
(`com.genumsolutions.app`). The app is **fully native with its own UI/UX** — it is NOT a
WebView mirror of the website.

## Project Structure

```
mobile/
├── app.json                 # Expo config, version, permissions
├── package.json             # Dependencies
├── tailwind.config.js       # NativeWind theme tokens
├── global.css               # NativeWind base styles
├── src/
│   ├── config/              # App-wide configuration
│   │   ├── adminTabs.ts     # Admin tab parity config
│   │   ├── company.ts       # Company info type + fallback
│   │   ├── adminTabs.ts     # Admin tab definitions
│   │   ├── site.ts          # APP_VERSION, config
│   │   ├── socials.ts       # Social media URLs
│   │   └── push.ts          # Push notification config
│   ├── context/             # React context providers
│   │   └── AppContext.tsx   # Auth + cart state
│   ├── components/          # Reusable UI components
│   │   ├── admin/           # Admin-specific components
│   │   │   ├── AdminPager.tsx
│   │   │   ├── AdminCompanySkeleton.tsx
│   │   │   └── AdminSkeleton.tsx
│   │   ├── tools/           # Car/robot tools
│   │   │   ├── CarProfileCard.tsx
│   │   │   ├── carLogViewer.tsx
│   │   │   ├── carLogModel.ts
│   │   │   └── types.ts
│   │   ├── CategoryDropdown.tsx
│   │   ├── PagePager.tsx
│   │   ├── PlatformPager.tsx
│   │   └── calendar/
│   ├── navigation/          # Navigation setup
│   │   ├── RootNavigator.tsx
│   │   └── types.ts
│   ├── screens/             # Screen components
│   │   ├── AdminScreen.tsx  # Admin dashboard (10 tabs)
│   │   ├── UserPreferencesScreen.tsx
│   │   ├── HomeScreen.tsx
│   │   ├── ShopScreen.tsx
│   │   ├── CartScreen.tsx
│   │   ├── AccountScreen.tsx
│   │   ├── ProductDetailScreen.tsx
│   │   ├── CheckoutScreen.tsx
│   │   ├── OrderSuccessScreen.tsx
│   │   ├── ServicesScreen.tsx
│   │   ├── ProjectsScreen.tsx
│   │   ├── ContactScreen.tsx
│   │   ├── AboutScreen.tsx
│   │   └── ToolsScreen.tsx
│   ├── services/            # Business logic + API calls
│   │   ├── adminService.ts  # Admin CRUD + types
│   │   ├── authService.ts   # Supabase auth
│   │   ├── productService.ts
│   │   ├── serviceService.ts
│   │   ├── cartService.ts
│   │   ├── orderService.ts
│   │   ├── projectService.ts
│   │   ├── carProfileService.ts
│   │   ├── bleService.ts
│   │   ├── sppService.ts
│   │   ├── wifiService.ts
│   │   ├── carProtocol.ts
│   │   ├── logger.ts
│   │   ├── biometricsService.ts
│   │   └── appLogService.ts
│   ├── types/               # TypeScript types
│   │   └── index.ts
│   └── lib/                 # Utility functions
│       ├── project-components.ts
│       ├── imageLimits.ts
│       └── supabase.ts
└── android/                 # Android native layer
```

## Core Concepts

### 1. Shared Schema Source of Truth

The **website's `supabase/schema.sql`** is the single source of truth for the database schema.
The app's `mobile/supabase/` folder is intentionally empty.

**Keep these in sync:**

- `src/config/company.ts` ↔ website `lib/company.ts`
- `src/config/socials.ts` ↔ website socials config
- `src/types/galleryImages.ts` ↔ website product image catalog

### 2. Navigation

**Bottom tabs** (`@react-navigation`):

- Home / Shop / Cart / Account

**Native-stack screens**: ProductDetail, Checkout, OrderSuccess, Services, Projects, Contact, About, Tools

See `src/navigation/RootNavigator.tsx` + `src/navigation/types.ts`.

### 3. State Management

`src/context/AppContext.tsx` holds:

- Auth state (user, session)
- Cart state (items, total)

Native Supabase auth via `src/services/authService.ts` (email/password, Google, reset).
Session persisted in SecureStore.

### 4. Data Layer

`src/services/` read the shared tables with the anon key (RLS allows public SELECT):

| Service             | Purpose                  |
| ------------------- | ------------------------ |
| `productService.ts` | Products catalog         |
| `serviceService.ts` | Services catalog         |
| `cartService.ts`    | Cart operations          |
| `orderService.ts`   | Order placement + status |
| `projectService.ts` | Project packages         |
| `adminService.ts`   | Admin CRUD (protected)   |

### 5. Device Remote Stack

For GENUM robo-car fleet control:

- BLE / classic-BT / WiFi transport
- `bleService.ts` — Bluetooth LE
- `sppService.ts` — Serial Port Profile
- `wifiService.ts` — WiFi direct
- `carProtocol.ts` — Protocol definitions

### 6. Admin Dashboard

See `docs/APP_ADMIN_COMPLETE.md` for complete admin UI documentation.

**10 tabs** in `AdminScreen.tsx`:

1. Dashboard
2. Orders
3. Electronic Products
4. 3D Products
5. Projects
6. Content
7. Users (3 sections: User Directory, Car Profiles, Robot Profiles)
8. Logs (3 sections: User Activity, User Profiles, Fleet Diagnostics)
9. Settings (Company info + training programs + pilot costs)
10. Profile (User profile entries)

### 7. User Preferences / My Devices

`UserPreferencesScreen.tsx` shows:

- **My Devices** section — car profiles with profile_key, car_name, settings
- **Robot Profiles** section — per-robot settings

Mirrors the admin Users tab structure.

### 8. Version Management

Version pins that must move **together**:

- `app.json` (`version` + `android.versionCode`)
- `src/config/site.ts` (`APP_VERSION`)
- `package.json` `version`
- `android/app/build.gradle` `versionName` + `versionCode`

Current: managed by `node scripts/bump-version.mjs <ver> <code>`.

### 9. Release & Update Channels

- `version` + `android.versionCode` in `app.json` (single source of truth)
- OTA hot-patches: `ota-only.yml` is JS-only, does not bump app version
- `app.json` derives `runtimeVersion` from `appVersion`
- Upload signed APK with `node scripts/upload-release.mjs`

### 10. Google Sign-In

Native (`@react-native-google-signin/google-signin`), not routed through any WebView.

Setup:

1. Supabase → Authentication → Providers → Google → enable
2. Add `genumsolutions://auth` to Supabase → Authentication → URL Configuration → Redirect URLs
3. Android OAuth client's SHA-1 must match release signing keystore

## Environment Variables

```bash
EXPO_PUBLIC_SUPABASE_URL=        # project URL
EXPO_PUBLIC_SUPABASE_ANON_KEY=   # public anon key (RLS-gated)
SUPABASE_URL=                    # same project URL
SUPABASE_SERVICE_ROLE_KEY=       # server-only
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
```

Only the **anon key** reaches the app bundle. The service-role key stays out of it.

## Build Notes

- LongPaths is disabled on `E:\`, so release Gradle builds run from a mirror at `C:\bs`
- Keep `C:\bs` in sync with `mobile/`, including `keystores/` and `.env.local`

## Test Status

- **955 vitest tests** across 65 files — all passing
- **TypeScript `tsc --noEmit`** — 0 errors
- **Admin parity tests** — enforce identical tab structure with website

## Documentation Deliverables

- `docs/APP_ADMIN_COMPLETE.md` — Complete admin UI documentation
- `docs/ADMIN_UI_BLUEPRINT.md` — Admin UI blueprint
- `docs/APP_ARCHITECTURE.md` — This file (app architecture overview)
- `docs/APP_WEBSITE_UI_COMPARISON.md` — App vs website comparison
- `docs/LINK_RESILIENCE.md` — Wi-Fi link diagnostics guide

---

_Documentation generated: 2026-11-09_
