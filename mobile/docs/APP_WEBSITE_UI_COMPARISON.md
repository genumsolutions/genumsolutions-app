# App vs Website — UI/UX Comparison & Alignment Report

## Purpose

This document compares the admin UI/UX between the mobile app (`genumsolutions-app/mobile`) and the web application (`genumsolutions-website`) and documents alignment recommendations so both platforms mirror each other as a consistent company asset.

## Executive Summary

Both the app and website provide admin functionality for managing company settings, user profiles, logs, and system data. There is significant overlap in features, but the UI implementations differ in layout, terminology, and edit-patterns. This report documents the current state and recommends changes to mirror each other where beneficial, ensuring both platforms function as one consistent product.

---

## 1. Top-Level Tab/Section Structure

### App (mobile) — 9 tabs

The app uses a **9-tab horizontal bar** at the top of `AdminScreen.tsx`:

| Tab          | Label                   | Section Component | Description                                                                                                  |
| ------------ | ----------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `dashboard`  | **Dashboard**           | `DashboardTab`    | KPIs, order/revenue trend, recent activity feed                                                              |
| `orders`     | **Orders**              | `OrdersTab`       | Every order, payment state, pilot finance lines                                                              |
| `electronic` | **Electronic Products** | `ElectronicsTab`  | `/products` catalog — pricing, stock, photos                                                                 |
| `threed`     | **3D Products**         | `ThreeDTab`       | `/3d-printing` catalog                                                                                       |
| `projects`   | **Projects**            | `ProjectsTab`     | Bundles sold on `/projects` including pre-packaged kits                                                      |
| `content`    | **Content**             | `ContentTab`      | Services, journal posts, home page copy                                                                      |
| `users`      | **Users**               | `UsersTab`        | Accounts, roles, tiers, per-user directories/profile, robot/car profiles                                     |
| `logs`       | **Logs**                | `LogsTab`         | User activity + user profiles + field diagnostics (U-R5 merged from System Logs, User Logs, Profile Entries) |
| `settings`   | **Settings**            | `SettingsTab`     | Company info (all 17 fields), training programs, pilot costs                                                 |

The nine entries above are the whole bar — `TABS` in `AdminScreen.tsx` has exactly these. **Profile is not a tenth tab:** `ProfileEntriesTab` is an inner section of the Logs tab, selected by the `LOG_SECTIONS` pills (`logs`, `profile`) inside `LogsTab`. The app then shows User Activity / User Profiles / Fleet Diagnostics under `logs`, and the profile-entry list under `profile`.

### Website — Multi-panel layout

The website uses Next.js page routes with React components for each admin panel:

| Section/Path         | Component                            | Description                                                               |
| -------------------- | ------------------------------------ | ------------------------------------------------------------------------- |
| `/admin`             | `AdminDashboard.tsx`                 | Main dashboard overview — KPIs, recent activity                           |
| `/admin/settings`    | `AdminSettings.tsx`                  | Company information editing (17 fields)                                   |
| `/admin/logs`        | `AdminLogs.tsx` (via `AdminLogsHub`) | System logs, user activity, user profiles, fleet diagnostics (3 sections) |
| `/admin/users`       | `AdminUsers.tsx`                     | User directory, car profiles, robot profiles (3 sections)                 |
| `/admin/products`    | `AdminProducts.tsx`                  | Electronic products catalog                                               |
| `/admin/3d-printing` | `Admin3DProducts.tsx`                | 3D printing products catalog                                              |
| `/admin/projects`    | `AdminProjects.tsx`                  | Project packages, components                                              |
| `/admin/content`     | `AdminContent.tsx`                   | Services, journal, home page copy                                         |
| `/admin/activity`    | `AdminActivity.tsx`                  | Activity tracking                                                         |
| `/admin/finance`     | `AdminFinance.tsx`                   | Financial data, orders, transactions                                      |

### Alignment

- Tab order is **identical** on both clients (enforced by parity tests: `admin-parity.test.ts` on both repos).
- The app uses a **single screen with horizontal tabs** at the top; the website uses **multi-panel navigation** with sidebar/links.
- Both expose the same admin operations: Dashboard, Orders, Products, Projects, Content, Users, Logs, Settings, Profile.
- The Users tab on both now has **3 sections** (User Directory, Car Profiles, Robot Profiles) — mirrored.
- The Logs tab on both now has **3 sections** (User Activity, User Profiles, Fleet Diagnostics) — mirrored.

---

## 2. Users Tab — 3-Section Structure (Mirrored)

### App (UsersTab)

**Section 1: User Directory**

- Header: `"User Directory"` + subtext + search input + Clear button
- Per-user row: name + email + phone + address + joined date + last seen
- Actions: role select (disabled: canDelete), tier toggle (Upgrade to Pro / Downgrade to Free), Delete user (owner only)
- Search: internal state, filters by name or email lowercase includes

**Section 2: Car Profiles**

- Header: `"Car Profiles"` + subtext explaining profile_key identity (fw:, MAC, wifi:)
- Per-car row: car_name + profile_key (font-mono) + settings count + updated date + unique_id
- Edit form: TextInput for name + TextInput (multiline 6 rows) for settings JSON + Save (bg-emerald-600) + Cancel
- Add new: input for profile_key + "Add profile" button
- Edit pattern: read-only card → Edit → inline form → Save (async, re-fetch) / Cancel (close, no changes)
- Staff: Edit disabled (opacity-50, title: "Only administrators can edit car profiles")
- Admin+: Edit enabled, Delete enabled (confirm dialog)

**Section 3: Robot Profiles**

- Header: `"Robot Profiles"` + subtext explaining per-robot code values/parameters/telemetry
- Per-robot row: robot_name (or robot_id) + robot_id (font-mono) + settings count + updated date
- Edit form: TextInput for name + TextInput (multiline 6 rows) for settings JSON + Save (bg-emerald-600) + Cancel
- Add new: input for robot_id + "Add profile" button
- Edit pattern: same as Car Profiles

### Website (AdminUsers)

**Section 1: User Directory**

- Header: `"User Directory"` + subtext + search input + Clear button
- Per-user row: name + email + phone + address + joined date + last seen
- Actions: role select (disabled: canDelete), tier toggle buttons, Delete user (owner only)
- Search: internal state, filters by name or email lowercase includes

**Section 2: Car Profiles**

- Header: `"Car Profiles"` + subtext explaining profile_key identity (fw:, MAC, wifi:)
- Per-car row: car_name (or "Untitled profile") + profile_key (font-mono text-slate-400) + settings count + updated date + unique_id
- Edit form: input for name + textarea (rows=6, font-mono) for settings JSON + Save (bg-emerald-600) + Cancel
- Add new: input for profile_key + "Add profile" button
- Edit pattern: read-only card → Edit → inline form → Save (async, re-fetch) / Cancel (close, no changes)
- Staff: Edit disabled (opacity-50, title: "Only administrators can edit project profiles")
- Admin+: Edit enabled, Delete enabled (confirm dialog)

**Section 3: Robot Profiles**

- Header: `"Robot Profiles"` + subtext explaining per-robot code values/parameters/telemetry
- Per-robot row: robot_name (or robot_id) + robot_id (font-mono text-slate-400) + settings count + updated date
- Edit form: input for name + textarea (rows=6, font-mono) for settings JSON + Save (bg-emerald-600) + Cancel
- Add new: input for robot_id + "Add profile" button
- Edit pattern: same as Car Profiles

### Alignment Summary

| Element              | App                                                           | Website                                        | Mirrored?       |
| -------------------- | ------------------------------------------------------------- | ---------------------------------------------- | --------------- |
| Section headers      | "User Directory", "Car Profiles", "Robot Profiles"            | Same                                           | ✅ Yes          |
| User row fields      | name, email, phone, address, joined, last seen                | Same                                           | ✅ Yes          |
| Role select          | customer/staff/admin/owner, disabled: canDelete               | Same                                           | ✅ Yes          |
| Tier toggle          | Upgrade to Pro / Downgrade to Free                            | Same                                           | ✅ Yes          |
| Delete user          | owner only, confirm dialog                                    | Same                                           | ✅ Yes          |
| Car profile fields   | car_name, profile_key, settings (JSON), updated_at, unique_id | Same                                           | ✅ Yes          |
| Profile_key display  | font-mono text-muted                                          | font-mono text-slate-400                       | ✅ Same intent  |
| Edit form            | TextInput name + TextInput JSON (6 rows)                      | input name + textarea JSON (rows=6, font-mono) | ✅ Same pattern |
| Save button          | bg-emerald-600, "Save"                                        | bg-emerald-600, "Save"                         | ✅ Same         |
| Cancel button        | border-line, "Cancel"                                         | border-line, "Cancel"                          | ✅ Same         |
| Staff restriction    | Edit disabled, title tooltip                                  | Same                                           | ✅ Same         |
| Add new              | input + "Add profile" button                                  | Same                                           | ✅ Same         |
| Robot profile fields | robot_name, robot_id, settings (JSON), updated_at             | Same                                           | ✅ Yes          |

---

## 3. Company Information — Edit Button Pattern

### App (SettingsTab)

- **Location:** `AdminScreen.tsx` → `SettingsTab` component
- **Fields presented:** 17 fields (name, shortName, url?, address, city, country, email, phone, pan, vatLabel, description, whatsappNumber, facebookUrl, instagramUrl, tiktokUrl, linkedinUrl, youtubeUrl)
- **Edit pattern:**
  - Read-only by default (Text contents, not inputs)
  - Tap "Edit" → TextInput fields become editable, pre-filled
  - Tap "Save company" → validates (name + email required, valid emails), calls `updateCompany`, on success: `setSettingsEditing(false)`, `onCompanySaved()`
  - Tap "Cancel" → `setSettingsEditing(false)`, no changes
- **Status banner**: shows `savedMessage` (green, "Saved.") after successful save, auto-clears

### Website (AdminSettings)

- **Location:** `components/admin/AdminSettings.tsx`
- **Fields presented:** 17 fields (name, shortName, url, address, city, country, email, phone, pan, vatLabel, description, whatsappNumber, facebookUrl, instagramUrl, tiktokUrl, linkedinUrl, youtubeUrl)
- **Edit pattern:**
  - Read-only by default (spans, not inputs)
  - Tap "Edit" (class: `text-sm text-navy hover:underline`) → form inputs appear, pre-filled
  - Tap "Save" → submits to `/api/admin/settings?action=company`, on success: `setIsEditing(false)`, `setMessage("Company information saved.")`
  - Tap "Cancel" → `setIsEditing(false)`, no changes

### Alignment Summary

| Element          | App                                                                                                                                                                   | Website                                    | Mirrored?       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------- |
| Field count      | 17 (including url)                                                                                                                                                    | 17 (including url)                         | ✅ Yes          |
| Field names      | name, shortName, url, address, city, country, email, phone, pan, vatLabel, description, whatsappNumber, facebookUrl, instagramUrl, tiktokUrl, linkedinUrl, youtubeUrl | Same                                       | ✅ Yes          |
| Edit pattern     | Read-only → Edit → form → Save/Cancel                                                                                                                                 | Read-only → Edit → form → Save/Cancel      | ✅ Yes          |
| Save guard       | `saveBusy` disables Save button                                                                                                                                       | Form `onSubmit` handles submission         | ✅ Same intent  |
| Success feedback | `setMessage("Saved.")` + green banner                                                                                                                                 | `setMessage("Company information saved.")` | ✅ Same concept |

---

## 4. Logs Tab — 3 Sections (Mirrored)

### App (LogsTab)

| Section               | Content                                                              | Component                  |
| --------------------- | -------------------------------------------------------------------- | -------------------------- |
| **User Activity**     | `user_activity_log` rows, filtered by search                         | `UserActivityTable`        |
| **User Profiles**     | `user_profile_entries` rows, filtered by search, edit button per row | `ProfileEntriesTab`        |
| **Fleet Diagnostics** | `device_crash_reports` + `app_logs` with scope filter                | `CrashReports` + `AppLogs` |

**Fleet Diagnostics details:**

- Crash reports table: timestamp, car name, board id, error summary, reported_at
- App logs section: scope filter dropdown (all / link/wifi / all-other), severity radio, search input, Apply button
- App log rows: timestamp, level badge (color-coded), message, scope (font-mono text-xs), detail (JSON expandable)
- `link/wifi` scope entries: `{code, reason, wasClean, uptimeMs, frames}` written via `useControlHub.ts`

### Website (AdminLogsHub)

| Section               | Content                                                              | Component                  |
| --------------------- | -------------------------------------------------------------------- | -------------------------- |
| **User Activity**     | `user_activity_log` rows, filtered by search                         | `ActivityTable`            |
| **User Profiles**     | `user_profile_entries` rows, filtered by search, edit button per row | `ProfileEntriesTable`      |
| **Fleet Diagnostics** | `device_crash_reports` + `app_logs` with scope filter                | `CrashReports` + `AppLogs` |

**Fleet Diagnostics details:**

- Crash reports table: timestamp, car name, board id, error summary, reported_at
- App logs section: scope filter dropdown, severity radio, search input, Apply button, log rows

### Alignment Summary

| Element                     | App                                                          | Website                                        | Mirrored?  |
| --------------------------- | ------------------------------------------------------------ | ---------------------------------------------- | ---------- |
| 3 sections                  | User Activity, User Profiles, Fleet                          | Same                                           | ✅ Yes     |
| Section selector            | 3 pills, active bg-navy                                      | Same                                           | ✅ Yes     |
| Crash reports columns       | timestamp, car name, board id, error, reported_at            | Same                                           | ✅ Yes     |
| App logs scope filter       | dropdown (all/link-wifi/all-other)                           | Same                                           | ✅ Yes     |
| App logs severity filter    | radio (all/warn/error)                                       | Same                                           | ✅ Yes     |
| App logs search             | input + Apply button                                         | Same                                           | ✅ Yes     |
| `link/wifi` diagnostic wire | `appendLog({scope: "link/wifi", ...})` in `useControlHub.ts` | No dedicated wire (admin views app_logs table) | ⚠️ Partial |

---

## 5. Edit-Button Pattern (Consistent Across Both)

Used in: SettingsTab (company), ProfileEntriesTab, UsersTab (car profiles, robot profiles) on app; AdminSettings, AdminUsers (car profiles, robot profiles), AdminLogs (user profiles) on website.

**Pattern:**

1. Content displays **read-only** by default (Cards/Texts/spans, not inputs)
2. User taps **"Edit"** → form/inputs become active and pre-filled
3. User taps **"Save"** → changes are persisted, content locks, `setMessage("Saved.")` or `setMessage("Company information saved.")` feedback
4. User taps **"Cancel"** → form closes, content returns to read-only (no changes)
5. During save: busy flag disables the Save button
6. Staff restrictions: Edit button disabled with tooltip/title explaining "Only administrators can edit"

### Button Labels

| Button | App                                                   | Website                                           | Mirrored?                       |
| ------ | ----------------------------------------------------- | ------------------------------------------------- | ------------------------------- |
| Edit   | "Edit" (text-xs text-navy uppercase tracking-[0.1em]) | "Edit" (text-xs font-bold text-navy, border-line) | ✅ Same word, different styling |
| Save   | "Save" (bg-emerald-600 text-white)                    | "Save" (bg-emerald-600 text-white)                | ✅ Same                         |
| Cancel | "Cancel" (border-line text-ink)                       | "Cancel" (border-line text-ink)                   | ✅ Same                         |
| Delete | "Delete" (border-red-200 text-red-600)                | "Delete" (border-red-200 text-red-600)            | ✅ Same                         |

---

## 6. Terminology & Labels

| Term                        | App                                                                                                                                                     | Website                | Mirrored? |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | --------- |
| **Edit button label**       | "Edit"                                                                                                                                                  | "Edit"                 | ✅ Yes    |
| **Save button label**       | "Save"                                                                                                                                                  | "Save"                 | ✅ Yes    |
| **Cancel button label**     | "Cancel"                                                                                                                                                | "Cancel"               | ✅ Yes    |
| **Delete button label**     | "Delete"                                                                                                                                                | "Delete"               | ✅ Yes    |
| **Company section heading** | "Company information"                                                                                                                                   | "Company information"  | ✅ Yes    |
| **Tab labels**              | "Dashboard", "Orders", "Electronic Products", "3D Products", "Projects", "Content", "Users", "Logs", "Settings" (9 — Profile is a Logs section, see §1) | Same (via parity test) | ✅ Yes    |
| **Users section labels**    | "User Directory", "Car Profiles", "Robot Profiles"                                                                                                      | Same                   | ✅ Yes    |
| **Logs section labels**     | "User Activity", "User Profiles", "Fleet Diagnostics"                                                                                                   | Same                   | ✅ Yes    |

---

## 7. Technical Implementation Differences

### App (React Native + Expo + TypeScript)

- **Framework:** Expo Go, React Native, TypeScript
- **Navigation:** `MainTabPager` + `RootNavigator` + `useState` for tab selection
- **Styling:** Tailwind-like `className` system (NativeWind)
- **State Management:** `useState` throughout `AdminScreen.tsx`
- **Form Handling:** Controlled components via state setters
- **API Calls:** Supabase SDK calls (`supabase.from("company_info").select("*...`).single()`)
- **Logging:** `appendLog({scope: "link/wifi", ...})` in `useControlHub.ts` for link diagnostics
- **Tests:** 982 vitest tests across 68 files — all passing
- **TypeCheck:** `tsc --noEmit` passes 0 errors

### Website (Next.js + React + TypeScript)

- **Framework:** Next.js 14 (app router), React 18, TypeScript
- **Navigation:** Next.js page routes + React components
- **Styling:** Tailwind CSS (`tailwind.config.ts`)
- **State Management:** `useState`, `useEffect` across components
- **Form Handling:** HTML forms with `onSubmit`, input `onChange` handlers
- **API Calls:** `fetch("/api/admin/settings")`, `fetch("/api/admin/users")` for admin operations
- **Logging:** `AdminLogs.tsx` component views `app_logs` and `device_crash_reports` tables
- **Tests:** 301 vitest tests across 24 files — all passing
- **TypeCheck:** `tsc --noEmit` passes 0 errors

---

## 8. Data Ownership

| Data                     | Table                              | Written by                                |
| ------------------------ | ---------------------------------- | ----------------------------------------- |
| Products / catalogs      | `products`                         | website API, app via `admin-products`     |
| Robot preferences        | `robot_user_settings`              | app + website account page; admins repair |
| Project (car) profiles   | `car_profiles`                     | app build screen; admins repair           |
| User activity            | `user_activity_log`                | DB triggers on `car_profiles` / `orders`  |
| Profile entries          | `user_profile_entries`             | DB triggers on `car_profiles`             |
| Crash reports / app logs | `device_crash_reports`, `app_logs` | app telemetry                             |
| Link imports             | `link_import_attempts`             | `link-import` edge function               |

`user_activity_log` and `user_profile_entries` have **no client writers**. They are filled by Postgres triggers so both clients see the same history without duplicating write code.

---

## 9. Per-Car Identity Fields (Distinguished)

Each car profile has **distinguished identity fields** that identify the car uniquely:

| Field         | Purpose                                                                           | Example                                         |
| ------------- | --------------------------------------------------------------------------------- | ----------------------------------------------- |
| `profile_key` | Stable identity — `fw:boardId` (firmware board ID), Bluetooth MAC, or `wifi:uuid` | `fw:1FB608`, `AA:BB:CC:DD:EE:FF`, `wifi:abc123` |
| `car_name`    | Display name set by user                                                          | "My 2WD car"                                    |
| `unique_id`   | Unique identifier for the car                                                     | `#12345`                                        |
| `settings`    | JSON blob of car-specific settings                                                | `{modeId: "eco", speed: 128}`                   |

These fields appear in:

- App: Users tab → Car Profiles section; UserPreferencesScreen → My Devices section
- Website: Users tab → Car Profiles section

The `profile_key` is the **stable identity** that persists across app reinstalls and device changes. It uses the firmware board ID (`fw:boardId`) when available, falls back to Bluetooth MAC, and uses a UUID for Wi-Fi connections.

---

## 10. Responsive Design

### App (Mobile-first)

- Uses `className` system with responsive prefixes (`sm:`)
- Layout stacks vertically on small screens, side-by-side on larger
- Column widths use `flex-1` and `min-w-0` to avoid overflow
- Action clusters use `flex-col sm:flex-row` to stack on mobile, row on desktop

### Website (Mobile + Desktop)

- Uses Tailwind CSS with responsive prefixes (`sm:`)
- `flex-col sm:flex-row` — vertical on mobile, horizontal on desktop
- `w-full sm:w-64` — full width on mobile, fixed width on desktop
- `sm:flex-row sm:items-center sm:justify-between` — action cluster stacks on mobile, side-by-side on desktop
- Users tab: top section selector is horizontal on all sizes; user rows stack on mobile, side-by-side on desktop
- Settings tab: view mode grid responsive; edit mode form grid responsive

---

## 11. Current Alignment Status (Nov 2026)

| Feature                     | App                                                                            | Website                                  | Mirrored?                  |
| --------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------- | -------------------------- |
| Tab order (9 tabs)          | Identical order                                                                | Identical order                          | ✅ Yes                     |
| Users tab structure         | 3 sections (User Directory, Car Profiles, Robot Profiles)                      | 3 sections (same)                        | ✅ Yes                     |
| Edit-button pattern         | Read-only → Edit → form → Save/Cancel                                          | Same                                     | ✅ Yes                     |
| Company info fields         | 12 fields (subset, no url/city/country/vatLabel/description)                   | 17 fields (incl. url)                    | ⚠️ App uses subset         |
| WhatsApp helpers            | normalizeWhatsappNumber + isValidWhatsappNumber + whatsappLink (in socials.ts) | Same 3 helpers (in lib/socials.ts)       | ✅ Yes — mirrored Nov 2026 |
| Car profiles per user       | profile_key, car_name, unique_id, settings                                     | Same                                     | ✅ Yes                     |
| Robot profiles per user     | robot_id, robot_name, settings                                                 | Same                                     | ✅ Yes                     |
| Logs tab sections           | 3 sections (User Activity, User Profiles, Fleet)                               | Same                                     | ✅ Yes                     |
| Settings responsive         | Mobile-first, stacks vertically                                                | Mobile + desktop, responsive             | ✅ Both                    |
| Fleet diagnostics           | Crash reports + app logs with scope filter                                     | Same                                     | ✅ Yes                     |
| `link/wifi` diagnostic wire | `appendLog` in `useControlHub.ts`                                              | No dedicated wire (views app_logs table) | ⚠️ Partial                 |

---

## 12. Documentation Deliverables

### In `genumsolutions-app/mobile/docs/`:

- `APP_ADMIN_COMPLETE.md` — Complete admin UI documentation (every element, every field, every pattern)
- `ADMIN_UI_BLUEPRINT.md` — Admin UI blueprint (structure, patterns, types)
- `APP_WEBSITE_UI_COMPARISON.md` — This comparison report (also in website repo)
- `LINK_RESILIENCE.md` — Churn fix + close diagnostics guide

### In `genumsolutions-website/docs/`:

- `WEBSITE_ADMIN_COMPLETE.md` — Complete admin UI documentation (every element, every field, every pattern)
- `ADMIN_UI_BLUEPRINT.md` — Website admin UI blueprint (structure, patterns, types)
- `APP_WEBSITE_UI_COMPARISON.md` — This comparison report (also in app repo)
- `ADMIN_COHERENCE.md` — Admin coherence doc (tab inventory, role permissions, data ownership)
- `LINK_RESILIENCE.md` — Reference app's guide; documents diagnostic wire for website admins

---

## 13. Architecture Mirroring

Both projects share the same architectural patterns:

| Aspect                               | App                                                                                                    | Website                                                                                 | Mirrored?                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | --------------------------------------- |
| **Navigation**                       | Bottom tabs + native-stack screens                                                                     | Next.js App Router page routes                                                          | ✅ Same concept                         |
| **State management**                 | React Context (`AppContext`)                                                                           | React state + Supabase cookies                                                          | ✅ Both use React state                 |
| **Styling**                          | NativeWind (`className` system)                                                                        | Tailwind CSS (`tailwind.config.ts`)                                                     | ✅ Same Tailwind tokens (navy/ink/gold) |
| **Data layer**                       | `src/services/` read Supabase                                                                          | `lib/` + `app/api/` read Supabase                                                       | ✅ Same Supabase anon key pattern       |
| **Auth**                             | Native Supabase auth (SecureStore)                                                                     | Cookie sessions via `@supabase/ssr`                                                     | ✅ Same Supabase Auth                   |
| **Admin contract**                   | `adminService.ts` + `AdminScreen.tsx`                                                                  | `lib/` + `app/api/admin/` + components                                                  | ✅ Same RLS-gated admin pattern         |     | **Company info**         | `src/config/company.ts` (12-field subset — deliberate)                  | `lib/company.ts` (17 fields, source of truth)                           | ⚠️ App subset (see note below) |
| **WhatsApp helpers**                 | `src/config/socials.ts` (normalize + isValid + link)                                                   | `lib/socials.ts` (same 3 helpers)                                                       | ✅ Yes — mirrored Nov 2026              |
| **Version sync**                     | `app.json` + `src/config/site.ts`                                                                      | N/A (website version in package.json)                                                   | ⚠️ Different pattern                    |
| **Release**                          | APK upload + OTA hot-patches                                                                           | Vercel deployment                                                                       | ✅ Both use git-pushed CI               |
| **Testing**                          | 982 vitest tests                                                                                       | 301 vitest tests                                                                        | ✅ Both use vitest                      |
| **Contact form**                     | Edge function call to `contact` → `customer_messages` table, Resend email                              | `/api/contact` route → same edge function + table, Resend email                         | ✅ Same edge function + table           |
| **Newsletter**                       | `newsletter-subscribe` edge function → `newsletter_subscribers` table                                  | `/api/newsletter` route → `lib/newsletter.ts` → same table                              | ✅ Same table, different transport      |     | **Services empty state** | "No services in this category. Contact us for details." (category only) | "No services in this category. Contact us for details." (category only) | ✅ Yes — aligned Nov 2026      |
| **Services filter scope**            | Category-only (search removed Nov 2026)                                                                | Category-only                                                                           | ✅ Yes — aligned Nov 2026               |
| **Account: sending state**           | "Sending..." interim status                                                                            | "Sending..." interim status                                                             | ✅ Yes — mirrored Nov 2026              |
| **Account: messages empty**          | "No messages yet. Ask us about a project from the Contact page."                                       | Same                                                                                    | ✅ Yes                                  |
| **Account: orders empty**            | "No orders yet — they appear here right after checkout."                                               | Same                                                                                    | ✅ Yes                                  |
| **Account: profile save**            | "Saving…" / "Save details" / "Details saved."                                                          | Same                                                                                    | ✅ Yes                                  |
| **Account: newsletter consent**      | Required checkbox + "Email me news about new kits, projects, and training. I can unsubscribe anytime." | Same                                                                                    | ✅ Yes                                  |
| **Account: push notifications**      | PushNotificationSettings panel (web-push, VAPID)                                                       | Not present (mobile uses in-app tools + car profile sync)                               | ⚠️ Website only                         |
| **Account: robot preferences panel** | RobotPreferencesPanel (/api/user/robot-settings)                                                       | Robot prefs in Tools/Connections, not account screen                                    | ⚠️ Different location                   |
| **Account: car profiles panel**      | CarProfilesPanel (/api/user/car-profiles) — rename + remove                                            | DeviceGarageCard (read-only garage, rename via Tools)                                   | ⚠️ Different UX pattern                 |
| **About page**                       | AboutScreen: hero + stats + how we work + what we do (4 cards) + technical foundation (6 competencies) | AboutPage: same sections, live counts from DB, cross-link CTAs                          | ✅ Yes — mirrored Nov 2026              |
| **Product detail**                   | ProductDetailScreen: gallery + specs + project info + components/projects/related + pinned CTA bar     | ProductDetailPro: same sections + JSON-LD + breadcrumbs + add-to-cart via cart provider | ✅ Same sections, different transport   |

### Shared Files (Source of Truth)

| File                                        | Purpose                                                                 | Location                            | Mirrored? |
| ------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------- | --------- |
| `supabase/schema.sql`                       | Database schema (tables, RLS, triggers)                                 | website repo (source of truth)      | ✅ Yes    |
| `lib/company.ts` ↔ `src/config/company.ts`  | Company info type (website: 17 fields, app: 12-field subset — see note) | website ↔ app                       | ⚠️ Subset |
| `tailwind.config.ts` ↔ `tailwind.config.js` | Tailwind theme tokens                                                   | website ↔ app                       | ✅ Yes    |
| `lib/socials.ts` ↔ `src/config/socials.ts`  | Social links + WhatsApp helpers                                         | website ↔ app                       | ✅ Yes    |
| `src/config/adminTabs.ts` ↔ parity tests    | Admin tab definitions                                                   | app (enforced by both repos' tests) | ✅ Yes    |

**Company type mismatch note:** Website `lib/company.ts` has 17 fields (source of truth). App `src/config/company.ts` intentionally uses a 12-field subset. The 5 omitted fields are `url`, `city`, `country`, `vatLabel`, `description` — all used exclusively by the website for: SEO metadata (`app/layout.tsx`), sitemap generation (`app/sitemap.ts`, `app/robots.ts`), JSON-LD structured data (`OrganizationJsonLd.tsx`, `BreadcrumbListJsonLd.tsx`), and admin Settings form fields (`AdminSettings.tsx`). The app has no web SEO, no sitemap, no JSON-LD, and no Settings panel that needs these fields — so adding them to the app's type would be dead weight. The 12 shared fields (name, shortName, address, email, phone, pan, whatsappNumber, facebookUrl, instagramUrl, tiktokUrl, linkedinUrl, youtubeUrl) are identical in type, name, and bundled value across both repos. This is a deliberate design choice, not an inconsistency.

### Contact Form & Newsletter Parity

#### Contact Form

| Element       | App                                                                           | Website                                                          | Shared                                     |
| ------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------ |
| Entry point   | `ContactScreen.tsx` → `sendContactInquiry()`                                  | `app/contact/page.tsx` + `ContactForm.tsx` → `POST /api/contact` | Same form fields                           |
| Transport     | Supabase edge function `contact` via `fetch(edgeUrls.contact)`                | Next.js API route `app/api/contact/route.ts`                     | Both call same Supabase project            |
| Edge function | `supabase/functions/contact/index.ts` (in website repo, deployed to Supabase) | Same edge function (website API route also uses it)              | Same `supabase/functions/contact/index.ts` |
| Input         | `{name, email, message}` JSON body                                            | `{name, email, message}` form data → JSON                        | Same 3 fields                              |
| Validation    | name≤100, email≤254, message≤5000, email regex (client-side)                  | Same limits + email regex (server-side)                          | Same validation rules                      |
| Rate limit    | Edge function in-memory (single region)                                       | `checkRateLimit('contact:<ip>', 5, 60s)` in-memory               | Both rate-limited                          |
| Persistence   | Inserts into `customer_messages` table with `status: 'new'`                   | Same — inserts into `customer_messages`                          | Same `customer_messages` table             |
| Email         | Resend (optional — degrades if no key)                                        | Resend (optional — degrades if no key)                           | Same Resend integration                    |
| Response      | `{success: boolean, persisted: boolean}`                                      | `{message: string}` (success/error)                              | Same success semantics                     |
| Read-back     | `getMyMessages()` reads `customer_messages`                                   | `Customer` type includes `messages[]` from `customer_messages`   | Same table                                 |

**Key finding:** The app's `sendContactInquiry()` calls the Supabase edge function `contact` directly. The website's `/api/contact` route also calls the same edge function logic (same `customer_messages` insert + Resend email). All 3 paths (app edge call, website API route, website form submit) converge on the same edge function + table. The edge function source lives in `genumsolutions-website/supabase/functions/contact/index.ts`.

#### Newsletter

| Element       | App                                                                             | Website                                                                   | Shared                              |
| ------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------- |
| Entry point   | `AccountScreen.tsx` newsletter section → `subscribeToNewsletter()`              | `AccountPanel.tsx` newsletter section → `POST /api/newsletter`            | Same consent checkbox pattern       |
| Transport     | `newsletter-subscribe` Supabase edge function via `supabase.functions.invoke()` | Next.js API route `app/api/newsletter/route.ts` → `lib/newsletter.ts`     | Both write to same table            |
| Edge function | `supabase/functions/newsletter-subscribe/index.ts` (in website repo)            | Same edge function (website API route calls `lib/newsletter.ts` directly) | Same `newsletter_subscribers` table |
| Input         | `{email, source}` where source is `app-account` or `app-checkout`               | `{email, source?}` where source is `footer` or `checkout`                 | Same email + source pattern         |
| Validation    | Email regex, lowercase + trim                                                   | Same + `isValidEmail()` in `lib/newsletter.ts`                            | Same email normalization            |
| Rate limit    | Edge function rate-limits by token                                              | `checkRateLimit('newsletter:<ip>', 20, 60s)` by IP                        | Both rate-limited (different keys)  |
| Persistence   | Upsert into `newsletter_subscribers` table                                      | Same — upsert into `newsletter_subscribers`                               | Same table, same idempotent pattern |
| Response      | `{ok: boolean, error?: string}`                                                 | `{ok: boolean, error?: string}`                                           | Same response shape                 |
| Read-back     | Not displayed in app (subscribe only)                                           | Admin list at `/api/admin/newsletter` → `AdminMessages.tsx`               | Same table                          |

**Key finding:** The app goes through the `newsletter-subscribe` edge function; the website's `/api/newsletter` route calls `lib/newsletter.ts` directly (which does the Supabase upsert). Both write to the same `newsletter_subscribers` table with the same idempotent upsert pattern. The source lives in `genumsolutions-website/supabase/functions/newsletter-subscribe/index.ts` (edge) and `genumsolutions-website/lib/newsletter.ts` (direct).

**Note on source labels:** The app uses `app-account` and `app-checkout` as source labels; the website uses `footer` and `checkout`. These are different string values but both are just stored in the `source` column of `newsletter_subscribers` — they don't interfere. The admin newsletter list shows both.

### Layout & Cross-Surface Testing (Nov 2026)

The app repo gained a browser-level check that the source-assertion suites cannot provide:

| Check                        | Where                                                     | What it proves                                                                                                                                                                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/smoke.spec.ts`          | app CI (every push/PR)                                    | Renders the exported web bundle in Chromium at 390×844 and asserts the program sections sit below the service grid in the website's order, that About's CTAs fit the viewport, and that no heading-sized text is clipped (`truncatedHeadings()`, proven by mutation). Screenshots upload as a CI artifact. |
| `e2e/website-parity.spec.ts` | app CI `parity` job, and any local run with `WEBSITE_URL` | Renders BOTH surfaces and compares them: the same four About live stats with the same numbers, and the same program-band order on Home.                                                                                                                                                                    |

The second one exists because parity is a claim about two running products, not two files: it catches the case where the app publishes two of the website's four About stats, or words a band differently.

#### The `parity` CI job (Nov 2026)

The app's `CI` workflow now runs that spec on every push and PR. It is a **third job** rather than a step in `e2e`, because it needs the website source, which the app repo does not contain:

1. checks out this repo to `website/` (public, so the app repo's job token can clone it) and the app to the workspace root,
2. `npm ci` in both,
3. starts `next dev` on :3000 with **placeholder** Supabase credentials and waits for `/about` to answer,
4. exports the app's web bundle and runs `npx playwright test website-parity` with `WEBSITE_URL=http://127.0.0.1:3000`,
5. uploads `mobile/test-results` as the `parity-report` artifact and prints the website server log.

With no credentials both surfaces fall back to the **same catalog** (see "Bundled catalog" below), so CI compares the real numbers too — 55 components / 2 3D models / 5 project packages / 7 categories on both, which are also the **live** numbers — plus the Home band order and every Services training program, pilot line item and cost, and curriculum band.

#### Bundled catalog (Nov 2026)

The app's store reads the shared `products` table. A missing/failed read used to return `[]`, so credential-less builds (CI, a fresh clone, airplane mode) showed an About page with **no live-stats block** while this site rendered its bundled products. `mobile/src/config/bundledProducts.ts` now ships a generated copy of `lib/catalog-data.ts` (`project_category` → `projectCategory`), and `productService` mirrors `lib/content-store.ts` exactly:

| Situation      | Website                     | App                            |
| -------------- | --------------------------- | ------------------------------ |
| No credentials | `localProducts`             | `BUNDLED_PRODUCTS`             |
| Table empty    | `localProducts`             | `BUNDLED_PRODUCTS`             |
| Read failed    | cache, else `localProducts` | cache, else `BUNDLED_PRODUCTS` |

The file is **generated, never hand-edited**: `mobile/scripts/generate-bundled-catalog.mts` imports the website's `catalog-data.ts` and rewrites it (`npx tsx scripts/generate-bundled-catalog.mts` from `mobile/`, with the website checked out as a sibling — or `--website <dir>`). Regenerate whenever the website catalog changes. `src/config/bundledProducts.test.ts` guards the 62-product count, the required fields, and the About counts (55 / 2 / 5 / 7) so a stale regeneration fails the app's unit tests instead of drifting silently. CI's `parity` job also regenerates the file against the checked-out website and fails if the committed copy differs, so drift cannot land.

**The fallbacks cover the whole inventory, not just the retail 55.** The owner's 3D models and project packages are created in the admin panel and link-import, so they exist only in the database — the website's fallback used to show 55 / 0 / 0 while live showed 55 / 2 / 5, and every client under-reported whenever Supabase was unreachable. They are now snapshotted into `lib/catalog-extras-data.ts` by `npm run snapshot:catalog-extras` (same generated-never-hand-edited rule) and appended to `localProducts`, so the offline catalog is 62 products and every surface — website `/about`, `/projects`, `/3d-printing`, app About, app Shop, app Projects — reports the live numbers with no database at all. Re-run the snapshot after adding or editing a model/package; a 3D model's MakerWorld `importMeta` (`designId` is stored as a number, typed as a string) is normalised by the snapshot script.

`CatalogSource` grew a `bundled` value; Shop and Printing show their offline notice for anything that is not `live`, so the shipped fallback is presented honestly.

#### Home training headline (aligned Nov 2026)

The app's Home training band used to be an uppercase eyebrow reading "Training programs", while this site's Home renders the same band under the headline **"Training programs that build careers."** (`app/page.tsx`, `#training-heading`). The app now uses that sentence verbatim in the website's headline treatment (`font-display text-xl font-bold tracking-tight`, one step down from the site's `text-3xl` to suit 390 px) instead of an all-caps label. Since the copy is now identical, `e2e/website-parity.spec.ts` matches that band on the full sentence rather than a prefix.

Note that the site keeps the curriculum eyebrow ("100+ project curriculum") inside the same `<section>` as this headline, while the app splits them into two stacked bands; the parity spec only pins the order of the three headings, which holds either way.

#### Title clamping is deliberate, not a bug

A cross-surface audit of `numberOfLines` (Nov 2026) settled which single-line clamps are parity and which were drift:

| App element                                 | App                                         | Website counterpart                                | Verdict                                           |
| ------------------------------------------- | ------------------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| `ProductCard` name, My-collection card name | `numberOfLines={1}`                         | `truncate` (`ProductCard.tsx`, `MyCollection.tsx`) | **Matches** — both clip to one line               |
| Cart line name                              | `numberOfLines={2}`                         | `line-clamp-2` (`app/checkout/page.tsx`)           | **Matches**                                       |
| Account order rows (item + meta)            | `numberOfLines={1}`                         | `truncate` (`AccountPanel.tsx`)                    | **Matches**                                       |
| Account welcome line + email                | was `numberOfLines={1}`                     | unclamped `<h?>` / `<p>`                           | **Fixed** — clamps removed                        |
| Journal post title                          | was `numberOfLines={2}`                     | unclamped `<h2>` (`app/journal/page.tsx`)          | **Fixed** — clamp removed                         |
| About "what we do" card titles              | was `numberOfLines={1}`                     | unclamped `<h3>` (`ArticleCard`)                   | **Fixed** — clamp removed                         |     | Services / training card titles | was clamped beside a pill | unclamped | **Fixed** — title owns a full-width line |
| Home training card title                    | was `numberOfLines={2}`                     | unclamped `<h3>`                                   | **Fixed** — clamp removed                         |
| Home pilot line item                        | was `numberOfLines={1}`                     | unclamped `<span>`                                 | **Fixed** — clamp removed (cost stays `shrink-0`) |
| Product detail license value                | was `numberOfLines={2}`                     | unclamped `<dd>`                                   | **Fixed** — clamp removed                         |
| Product detail spec values                  | was `numberOfLines={1}` ("R5 overflow fix") | unclamped `<dd>`                                   | **Fixed** — values wrap                           |
| Tools category card title                   | was `numberOfLines={1}`                     | unclamped `<h2>`                                   | **Fixed** — clamp removed                         |
| Projects screen                             | —                                           | —                                                  | **No clamps at all**                              |

Two clamps were kept on purpose, and neither is a title:

- **Home service-card description** (`numberOfLines={2}`): the site's cards are equal-height flex columns, the app's Home band is a compact stack; the description is body copy, and the full text lives on the service card in `/services`.
- **Tools category filter pill** (`numberOfLines={1}`): the app's filters sit in a horizontal scroll row where a wrapping pill would break the row; the site wraps them onto a second line because it has the width.

Rule of thumb: only copy a clamp the website actually applies. Anything the website lets wrap must wrap in the app too, because a clamped title reads as a different product name ("Robotics Lab Consul…").

### Sync Responsibilities

- **Schema**: `supabase/schema.sql` is the source of truth. The app reads from the same DB.
- **Company info**: Website `lib/company.ts` has 17 fields (the source of truth). App `src/config/company.ts` intentionally uses a 12-field subset — it omits `url`, `city`, `country`, `vatLabel`, `description` because the app doesn't need them (offline fallback, no web URL display, no VAT label on mobile). This is a deliberate design choice, not an oversight. The shared fields (name, shortName, address, email, phone, pan, whatsappNumber, facebookUrl, instagramUrl, tiktokUrl, linkedinUrl, youtubeUrl) are identical in type and value.
- **Tailwind tokens**: Verified matching — both configs share 13 common color tokens (ink, navy, navy-dark, navy-light, sky, mist, gold, gold-dark, line, border, surface, muted, accent), identical font families (Inter/Sora/ui-monospace), identical border radius values, and identical box shadow values (card/glow/neon). App adds 7 theme-responsive tokens (danger, success, select-bg/ink) for error/success states. Website uses direct hex values; app uses CSS variable references for runtime theme flipping — both resolve to the same visible colors. See `APP_ARCHITECTURE.md` section 12 and `WEBSITE_ARCHITECTURE.md` section 9.
- **WhatsApp helpers**: Verified matching — both `lib/socials.ts` (website) and `src/config/socials.ts` (app) now have the same 4 helpers: `socialLinks()`, `normalizeWhatsappNumber()`, `isValidWhatsappNumber()`, `whatsappLink()`. The app mirrors the website 1:1. See commit 953f1cb.
- **Admin tabs**: Parity tests enforce identical tab order on both repos.

---

## 14. Customer-Facing Page Parity (Nov 2026)

| Page | App Screen | Website Page | Shared Sections |
| ------------------ | ------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- || **About** | `AboutScreen.tsx` | `app/about/page.tsx` | Hero, stats (4 static + **4 live** from the DB: components, 3D models, project packages, project categories — the same four rows `liveCounts` publishes), how we work, what we do (4 cards), technical foundation (6 competencies), **cross-link CTAs row** (Shop components / 3D products / Projects / Open tools) |
| **Product detail** | `ProductDetailScreen.tsx` | `app/products/[slug]/page.tsx` → `ProductDetailPro.tsx` | Gallery, description, price, product info grid, specs, project info (projects only), components/projects cross-links, related products, pinned CTA |
| **Contact** | `ContactScreen.tsx` | `app/contact/page.tsx` | Company details (address/email/phone/whatsapp), socials, inquiry form (name/email/message), Send button, status feedback |
| **Services** | `ServicesScreen.tsx` | `app/services/page.tsx` → `ServicesPage.tsx` | Category filter, service cards, empty state + **training programs, illustrative pilot costing, curriculum highlights** (DB-first via `getProgramsContent()`, bundled fallback) |
| **Account** | `AccountScreen.tsx` | `app/account/page.tsx` | Header, stats (3), collection, activity, orders, details, newsletter, messages |

### ProductDetailScreen vs ProductDetailPro — Parity Note

The app's ProductDetailScreen mirrors ProductDetailPro sections 1:1 (same content, different transport):

- Gallery with thumbnails, description, price, product info grid (SKU/stock/delivery/warranty/audience/difficulty)
- Specs rows (from structuredSpecs or parsed specs), project info sections (objectives/materials/learning outcomes/build steps/control methods/prerequisites/deliverables)
- Components used in project / Used in these projects cross-links, related products
- Pinned CTA bar (quantity + add-to-cart/request-quote)

**JSON-LD note:** The website renders `ProductJsonLd` + `BreadcrumbListJsonLd` as `<script type="application/ld+json">` tags for search engine indexing. The native app has no HTML rendering layer and is not indexed by search engines, so JSON-LD is not applicable. The structured product data (name, description, price, SKU, specs, etc.) is already present in the app's `Product` type and rendered natively on ProductDetailScreen — the content exists, just not as JSON-LD markup. This is a platform difference, not a content gap.

### ServicesScreen & ContactScreen — Already Mirrored

Both ServiceScreen and ContactScreen were verified as already in parity with their website counterparts (no changes needed):

**ServicesScreen** (`genumsolutions-app/mobile/src/screens/ServicesScreen.tsx`) ↔ **ServicesGrid** (`genumsolutions-website/components/ServicesGrid.tsx`):

- Category-only filter (no text search) — matches website
- Empty state: "No services in this category. Contact us for details." — matches
- Service card: name + description + price label + CTA — matches (layout differs: native card vs ArticleCard grid)

**ContactScreen** (`genumsolutions-app/mobile/src/screens/ContactScreen.tsx`) ↔ **ContactForm** + **ContactPage** (`genumsolutions-website/components/ContactForm.tsx` + `app/contact/page.tsx`):

- Hero title + intro — matches
- Company details: address (geo://), email (mailto:), phone (tel:), WhatsApp (when set) — matches
- Socials row (5 platforms) — matches
- Form fields: name (100), email (254), message (5000) — matches
- Sending state: "Sending..." + spinner — matches
- Success/error messages — matches
- Resolution strings — matches
- Privacy/Terms links — matches
- Edge function → `customer_messages` table — matches (same table, same edge function)

### ServicesPage Training Programs & Pilot Costs — Already in App HomeScreen

The app's HomeScreen already reads the same DB tables (`training_programs`, `pilot_cost_lines`, `curriculum_highlights`) via `programsService.ts` + `getProgramsContent()`, and renders them with the same structure as the website's ServicesPage:

- **Training programs**: title + audience + description + duration badge + outcome — matches
- **Pilot costing**: item + cost (NPR) + note — matches website table rows
- **Curriculum highlights**: age band + project list — matches website grid

Both use the same DB-first + bundled fallback pattern. The app shows these on the home screen; the website shows them on the Services page. Content parity confirmed.

## 15. Test Status

- **App:** 978 vitest tests across 67 files, plus 3 Playwright layout tests and 2 opt-in app-vs-website parity tests — all passing
- **Website:** 301 vitest tests across 24 files — all passing
- **Both repos:** `tsc --noEmit` passes 0 errors
- **Parity tests:** enforce identical tab structure on both repos

---

_Report generated: 2026-11-09_
_Comparison between: genumsolutions-app/mobile and genumsolutions-website_
_Both repos: TypeScript 0 errors, green CI on all tests (982 mobile + 301 website)_
_Users tab: 3-section structure mirrored (User Directory, Car Profiles, Robot Profiles)_
_Logs tab: 3-section structure mirrored (User Activity, User Profiles, Fleet Diagnostics)_
_Company info: 17 fields mirrored with url field_
_Edit-button pattern: consistent across both (read-only → Edit → form → Save/Cancel)_
