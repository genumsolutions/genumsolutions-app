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

### 8. Product & Checkout Flow (mirrored with website)

#### Product Detail Screen (`ProductDetailScreen.tsx`)

Mirrors `ProductDetailPro` on the website:

- **Gallery**: full-screen image with thumbnail strip (U-23)
- **Header**: category badge, product name, description, price, SKU, import meta (design by, license, source)
- **Specs table**: structured specs from `importMeta.structuredSpecs` or parsed from `specs` lines
- **Audience/Warranty split**: two-column info row
- **Color/Delivery split**: two-column info row
- **Project info** (Project packages only): objectives, materials, learning outcomes, build steps, prerequisites, deliverables, maintenance notes, documentation/video links
- **Project components** (Project packages): horizontal scroll of linked components with qty badges
- **Used in projects** (non-project): horizontal scroll of projects using this component
- **Related products**: horizontal scroll of same-category → same-type products
- **CTA bar** (sticky bottom): qty stepper + Add to build list / Request quote / Control this car

#### Cart Screen (`CartScreen.tsx`)

Mirrors the website's checkout build list:

- **Cart header**: back chevron + "Your build list" title + subtitle
- **Empty states**: offline (wifi-off icon) vs empty cart (shopping-cart icon)
- **Line item**: photo + name (2-line clamp) + per-unit price + qty stepper (±) + line total + Remove
- **Footer**: Subtotal + Total + delivery note + Checkout button + Continue shopping

#### Checkout Screen (`CheckoutScreen.tsx`)

Mirrors the website's checkout page with the same 3 payment methods:

- **Order summary**: items list (qty × name + line total) + total
- **Delivery details**: name, email, phone, address fields
- **Payment method picker**: COD / eSewa / Khalti radio cards
- **Place order button**: disabled until all fields filled + signed in

#### Payment methods (identical across both):

| Method           | App                                            | Website                                          | Shared                    |
| ---------------- | ---------------------------------------------- | ------------------------------------------------ | ------------------------- |
| Cash on delivery | `createOrder({provider:'cod'})` → OrderSuccess | `POST /api/orders` → success page                | Both write `orders` table |
| eSewa            | `initiateEsewaPayment` → WebBrowser → confirm  | `POST /api/checkout/esewa` → form → confirm      | Both use eSewa v2         |
| Khalti           | `initiateKhaltiPayment` → WebBrowser → confirm | `POST /api/checkout/khalti` → redirect → confirm | Both use Khalti v2        |

Both re-price server-side, confirm server-to-server, write to immutable `transactions` ledger, and are idempotent.

#### Shared data contract:

- Products: same `products` table, same fields (id, name, price, stock, category, specs, etc.)
- Cart: app uses local state + Supabase `cart_items`; website uses client-side cart state
- Orders: same `orders` table, same fields (items JSON, totalNpr, customerName, email, phone, address, provider, status)
- Both require sign-in to checkout
- Both record cart_adds habit (fire-and-forget)
- Both clear cart after successful order

### 9. Version Management

Version pins that must move **together**:

- `app.json` (`version` + `android.versionCode`)
- `src/config/site.ts` (`APP_VERSION`)
- `package.json` `version`
- `android/app/build.gradle` `versionName` + `versionCode`

Current: managed by `node scripts/bump-version.mjs <ver> <code>`.

### 10. Release & Update Channels

- `version` + `android.versionCode` in `app.json` (single source of truth)
- OTA hot-patches: `ota-only.yml` is JS-only, does not bump app version
- `app.json` derives `runtimeVersion` from `appVersion`
- Upload signed APK with `node scripts/upload-release.mjs`

### 11. Google Sign-In

Native (`@react-native-google-signin/google-signin`), not routed through any WebView.

Setup:

1. Supabase → Authentication → Providers → Google → enable
2. Add `genumsolutions://auth` to Supabase → Authentication → URL Configuration → Redirect URLs
3. Android OAuth client's SHA-1 must match release signing keystore

### 12. Environment Variables

```bash
EXPO_PUBLIC_SUPABASE_URL=        # project URL
EXPO_PUBLIC_SUPABASE_ANON_KEY=   # public anon key (RLS-gated)
SUPABASE_URL=                    # same project URL
SUPABASE_SERVICE_ROLE_KEY=       # server-only
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
```

Only the **anon key** reaches the app bundle. The service-role key stays out of it.

### 13. Build Notes

- LongPaths is disabled on `E:\`, so release Gradle builds run from a mirror at `C:\bs`
- Keep `C:\bs` in sync with `mobile/`, including `keystores/` and `.env.local`

### 14. Test Status

- **955 vitest tests** across 65 files — all passing
- **TypeScript `tsc --noEmit`** — 0 errors
- **Admin parity tests** — enforce identical tab structure with website
- **Product/checkout parity**: ProductDetailScreen ↔ ProductDetailPro, CartScreen ↔ checkout build list, CheckoutScreen ↔ checkout page — all mirror the same data model

## Documentation Deliverables

- `docs/APP_ADMIN_COMPLETE.md` — Complete admin UI documentation
- `docs/ADMIN_UI_BLUEPRINT.md` — Admin UI blueprint
- `docs/APP_ARCHITECTURE.md` — This file (app architecture overview)
- `docs/APP_WEBSITE_UI_COMPARISON.md` — App vs website comparison
- `docs/LINK_RESILIENCE.md` — Wi-Fi link diagnostics guide

---

_Documentation generated: 2026-11-09_
