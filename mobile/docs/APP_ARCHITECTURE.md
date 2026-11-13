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
│   │   ├── socials.ts       # Social media URLs + WhatsApp helpers
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
│   │   ├── AdminScreen.tsx  # Admin dashboard (8 tabs)
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
│   │   ├── orderService.ts  # Orders + contact edge URLs
│   │   ├── projectService.ts
│   │   ├── carProfileService.ts
│   │   ├── bleService.ts
│   │   ├── sppService.ts
│   │   ├── wifiService.ts
│   │   ├── carProtocol.ts
│   │   ├── logger.ts
│   │   ├── biometricsService.ts
│   │   ├── appLogService.ts
│   │   └── newsletterService.ts
│   ├── types/               # TypeScript types
│   │   └── index.ts
│   └── lib/                 # Utility functions
│       ├── project-components.ts
│       ├── imageLimits.ts
│       └── cartAvailability.ts
└── android/                 # Android native layer
```

## Core Concepts

### 1. Shared Schema Source of Truth

The **website's `supabase/schema.sql`** is the single source of truth for the database schema.
The app's `mobile/supabase/` folder is intentionally empty.

**Keep these in sync:**

- `src/config/company.ts` ↔ website `lib/company.ts`
- `src/config/socials.ts` ↔ website `lib/socials.ts`
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

**8 tabs** in `AdminScreen.tsx` (canonical list: `src/config/adminTabs.ts`, pinned by both repos' parity tests):

1. Dashboard
2. Orders
3. Electronic Products
4. 3D Products
5. Projects
6. Content
7. Users (sections: User Directory, Car Profiles, Robot Profiles, plus User Activity / User Profiles / Fleet Diagnostics)
8. Settings (company details, customer messages, newsletter subscribers, training programs and pilot costs)

### 7. User Preferences / My Devices

`UserPreferencesScreen.tsx` shows:

- **My Devices** section — car profiles with profile_key, car_name, settings
- **Robot Profiles** section — per-robot settings

Mirrors the admin Users tab structure.

### 8. Mirror: Contact, Account, Services, Projects

The app already mirrors the website for these flows. No code changes needed.

#### Contact Screen ↔ Contact Page

| Element          | App (`ContactScreen.tsx`)                               | Website (`app/contact/page.tsx`)                       | Shared                         |
| ---------------- | ------------------------------------------------------- | ------------------------------------------------------ | ------------------------------ |
| Contact details  | Company from Supabase `company_info` (bundled fallback) | Company from Supabase `company_info` (cached fallback) | Same `company_info` table      |
| Address          | Tap opens geo: URL                                      | Text shown                                             | Same company row               |
| Email            | Tap opens mailto: URL                                   | Text shown                                             | Same company row               |
| Phone            | Tap opens tel: URL                                      | Text shown                                             | Same company row               |
| WhatsApp         | Chat link via `whatsappLink()`                          | Chat link via `whatsappLink()`                         | Same `socials.ts` helper       |
| Socials          | Social pill chips via `SocialsRow`                      | Social links via `socialLinks()`                       | Same `company_info` row        |
| Inquiry form     | Native form (name/email/message) → `POST /contact` edge | Client form (name/email/message) → `POST /api/contact` | Same `customer_messages` table |
| Field limits     | name max 100, email max 254, message max 5000           | same limits enforced server-side                       | Same validation                |
| Email validation | regex client-side                                       | regex server-side                                      | Same pattern                   |
| Status feedback  | in-screen text, success/error                           | in-form text, success/error                            | Same UX pattern                |
| Legal links      | Privacy / Terms navigation                              | Footer links                                           | Same legal pages               |

**Contact form transport difference:**

- App: calls Supabase edge function `contact` via `edgeUrls.contact` (`EDGE_BASE/contact`) in `src/services/orderService.ts`
- Website: calls Next.js API route `POST /api/contact` in `app/api/contact/route.ts`
- Both write to the same `customer_messages` table, both rate-limit, both validate the same fields

#### Account Screen ↔ Account Page

| Element         | App (`AccountScreen.tsx`)                                             | Website (`app/account/page.tsx` + `AccountPanel.tsx`) | Shared                              |
| --------------- | --------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------- |
| Auth gate       | Redirect to sign-in if not signed in                                  | AuthPanel if no session                               | Same Supabase auth                  |
| Header          | Avatar (initials) + name + email + admin/staff badge + sign out       | Avatar (initials) + name + email + tier + log out     | Same `profiles` table               |
| Stats (3 cards) | Orders / build-list items / support messages                          | Orders / build-list items / support messages          | Same data sources                   |
| My collection   | Product cards from `user_collection` (RLS own-rows)                   | MyCollection component from `user_collection`         | Same `user_collection` table        |
| Your activity   | Habit counters (views/searches/cart_adds/orders) — hidden if all zero | Same habit counters — hidden if all zero              | Same `user_habits` table            |
| Your orders     | Status pill + provider + total + line items                           | Status pill + provider + total + line items           | Same `orders` table                 |
| Your details    | Edit profile (name/phone/address) form                                | Edit profile (name/phone/address) form                | Same `profiles` table               |
| Your messages   | Support history with status pills                                     | Support history with status pills                     | Same `customer_messages` table      |
| Newsletter      | Email + consent checkbox + subscribe button                           | Email + consent checkbox + subscribe button           | Same `newsletter_subscribers` table |
| Push settings   | (on Menu tab)                                                         | PushNotificationSettings component                    | Same push subscription              |
| Robot prefs     | (on UserPreferencesScreen)                                            | RobotPreferencesPanel                                 | Same robot settings                 |
| Car profiles    | (on UserPreferencesScreen)                                            | CarProfilesPanel                                      | Same car profiles                   |

#### Services Screen ↔ Services Page

| Element                   | App (`ServicesScreen.tsx`)                                          | Website (`app/services/page.tsx` + `ServicesGrid.tsx`)              | Shared                    |
| ------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------- |
| Data source               | Supabase `services` table via `getServices()`                       | Supabase `services` table via `listServices()`                      | Same `services` table     |
| Fields                    | id, name, category, priceLabel, description, tag, sortOrder, active | id, name, category, priceLabel, description, tag, sortOrder, active | Same `Service` type       |
| Filter                    | Category chips (derived from DB rows)                               | Category dropdown (derived from DB rows)                            | Same categories           |
| Search                    | Text input, filters by name/tag/id/description                      | Text input, filters by name/description                             | Same search intent        |
| Display                   | Card with name + tag badge + description + priceLabel               | ArticleCard with title + tag + description + priceLabel             | Same card data            |
| Empty state               | "No services match your filters"                                    | "No services in this category"                                      | Same empty handling       |
| Pagination                | PagePager (6 per page)                                              | Load all on server, paginate client-side                            | Different impl, same data |
| Quote CTA                 | (none on list — per-item detail)                                    | "Request a quote" link to /contact                                  | Same intent               |
| Training programs section | (not on services screen)                                            | Training programs + pilot costs + STEM highlights                   | Website-only add-on       |
| Process steps             | (not on app)                                                        | 4-step how-it-works section                                         | Website-only add-on       |

#### Projects Screen ↔ Projects Page

| Element      | App (`ProjectsScreen.tsx`)                          | Website (`app/projects/page.tsx` + `ProjectsCatalog.tsx`)       | Shared                          |
| ------------ | --------------------------------------------------- | --------------------------------------------------------------- | ------------------------------- |
| Data source  | Supabase `products` table (project packages + kits) | Supabase `products` via `getManagedProducts()` + `applyScope()` | Same `products` table           |
| Filter       | 6 project categories from `project_categories`      | 6 project categories from `project_categories`                  | Same `project_categories` table |
| Search       | Text input, filters by name/note/description        | Text input, filters by name/note/description                    | Same search intent              |
| Display      | 2-column grid, minimal ProductCard                  | 2-col grid on mobile, up to 5 at xl, ProductCard                | Same ProductCard component      |
| Empty state  | "No projects found matching your filters"           | "No projects found matching your filters"                       | Same empty handling             |
| Pagination   | PagePager (8 per page)                              | "See more" button + page indicator                              | Same pagination intent          |
| Coming soon  | Empty categories flagged                            | Empty categories flagged                                        | Same UX                         |
| Include kits | Pre-packaged Kits ride along (U-44)                 | `includeKits` prop re-adds kits                                 | Same decision                   |
| Tools CTA    | (none)                                              | "Test & control on the IoT Controller" link to /tools           | Website-only add-on             |

### 9. Product & Checkout Flow (mirrored with website)

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

### 10. Version Management

Version pins that must move **together**:

- `app.json` (`version` + `android.versionCode`)
- `src/config/site.ts` (`APP_VERSION`)
- `package.json` `version`
- `android/app/build.gradle` `versionName` + `versionCode`

Current: managed by `node scripts/bump-version.mjs <ver> <code>`.

### 11. Release & Update Channels

- `version` + `android.versionCode` in `app.json` (single source of truth)
- OTA hot-patches: `ota-only.yml` is JS-only, does not bump app version
- `app.json` derives `runtimeVersion` from `appVersion`
- Upload signed APK with `node scripts/upload-release.mjs`

### 12. Google Sign-In

Native (`@react-native-google-signin/google-signin`), not routed through any WebView.

Setup:

1. Supabase → Authentication → Providers → Google → enable
2. Add `genumsolutions://auth` to Supabase → Authentication → URL Configuration → Redirect URLs
3. Android OAuth client's SHA-1 must match release signing keystore

### 13. Environment Variables

```bash
EXPO_PUBLIC_SUPABASE_URL=        # project URL
EXPO_PUBLIC_SUPABASE_ANON_KEY=   # public anon key (RLS-gated)
SUPABASE_URL=                    # same project URL
SUPABASE_SERVICE_ROLE_KEY=       # server-only
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
```

Only the **anon key** reaches the app bundle. The service-role key stays out of it.

### 14. Build Notes

- LongPaths is disabled on `E:\`, so release Gradle builds run from a mirror at `C:\bs`
- Keep `C:\bs` in sync with `mobile/`, including `keystores/` and `.env.local`

### 15. Test Status

- **955 vitest tests** across 65 files — all passing
- **TypeScript `tsc --noEmit`** — 0 errors
- **Admin parity tests** — enforce identical tab structure with website
- **Product/checkout parity**: ProductDetailScreen ↔ ProductDetailPro, CartScreen ↔ checkout build list, CheckoutScreen ↔ checkout page — all mirror the same data model
- **Contact/account/services/projects parity**: all 4 screens mirror website equivalents — documented in section 8

### 16. Shared Types with Website

The app and website share types that must stay in sync. The website is the source of truth for each.

#### Company type (`src/config/company.ts` ↔ `lib/company.ts`)

| Repo                        | Fields             | Notes                                                                             |
| --------------------------- | ------------------ | --------------------------------------------------------------------------------- |
| Website `lib/company.ts`    | 17 fields (full)   | Source of truth                                                                   |
| App `src/config/company.ts` | 12 fields (subset) | Deliberate — app doesn't need `url`, `city`, `country`, `vatLabel`, `description` |

The 5 omitted fields are website-only: used for SEO metadata, sitemap, JSON-LD, and admin Settings form. The 12 shared fields are identical in type, name, and bundled value.

#### Socials helpers (`src/config/socials.ts` ↔ `lib/socials.ts`)

Both repos have identical 4 helpers:

- `socialLinks(company)` — returns Facebook/Instagram/TikTok/LinkedIn/YouTube links
- `normalizeWhatsappNumber(raw)` — strips non-digits
- `isValidWhatsappNumber(value)` — validates 8-15 digits
- `whatsappLink(number, message?)` — builds wa.me URL

#### Service type (`src/types/index.ts` ↔ `lib/services.ts`)

| Field                                                               | App          | Website | Match                       |
| ------------------------------------------------------------------- | ------------ | ------- | --------------------------- |
| id, name, category, priceLabel, description, tag, sortOrder, active | ✅           | ✅      | Yes                         |
| createdAt, updatedAt                                                | ❌ (omitted) | ✅      | App doesn't need timestamps |

#### Product/catalog types (`src/types/index.ts` ↔ `lib/catalog.ts`)

Both repos read from the same `products` table. The app's `Product` type is a subset — it omits website-only fields like JSON-LD metadata, SEO fields, and blog-specific fields. The shared fields (id, name, price, stock, category, specs, image, etc.) are identical.

#### Order type (`src/types/index.ts` ↔ shared `orders` table)

Both repos use the same `orders` table. The app's `Order` type matches the table columns used by both (id, items, total_npr, status, provider, created_at, etc.).

#### Sync rule

When the website adds a field to a shared type:

1. If the app needs it → add to app type + update bundled fallback in `company.ts`
2. If the app doesn't need it → leave the app as a subset, document in this section

## Documentation Deliverables

- `docs/APP_ADMIN_COMPLETE.md` — Complete admin UI documentation
- `docs/ADMIN_UI_BLUEPRINT.md` — Admin UI blueprint
- `docs/APP_ARCHITECTURE.md` — This file (app architecture overview)
- `docs/APP_WEBSITE_UI_COMPARISON.md` — App vs website comparison
- `docs/LINK_RESILIENCE.md` — Wi-Fi link diagnostics guide

---

_Documentation generated: 2026-11-09_
