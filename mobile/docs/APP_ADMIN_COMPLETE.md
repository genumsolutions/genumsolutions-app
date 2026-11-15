# App admin console — complete reference

**Last verified:** 2026-11-15 against `genumsolutions-app` `main` @ `d90dc16`.
**Scope:** the admin surface of the Expo/React Native app only. The website's
admin console is a separate implementation in `genumsolutions-website`.

> **Reading rule:** this file describes behavior, not line numbers. Earlier
> revisions of this document cited exact line ranges, and every one of them
> rotted after the next refactor. When this file and the source disagree, the
> source is authoritative — then fix this file.

## 1. Entry point and access control

| Item                 | Value                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Screen               | `src/screens/AdminScreen.tsx`                                                                                                          |
| Exported component   | `AdminScreen` (gate) → `AdminConsole` (the console itself)                                                                             |
| Staff gate           | `useApp().isStaff`. Non-staff, including a customer with a deep link or a stale screen after a role change, sees a "Staff only" panel. |
| Delete rights        | `canDelete = isAdmin` (admin **or** owner)                                                                                             |
| User-deletion rights | `isOwner` only, and never against another `owner` row                                                                                  |
| Enforcement          | Supabase RLS and the deployed Edge Functions. Every UI gate here is a convenience, not the security boundary.                          |

### Biometric lock (C7)

- Opt-in preference, set from **Menu → Security**, stored on the device.
- While locked the console is covered by an inert overlay and the OS biometric
  prompt is raised automatically; tapping the overlay retries the prompt.
- The lock re-arms when the app returns to the foreground, but only when the
  preference is on **and** the device can actually prompt.
- If biometrics became unavailable after the preference was enabled (OTA onto an
  older APK, sensor removed), the console auto-unlocks and clears the stale
  preference instead of staying blurred forever.
- This is a shoulder-surfing convenience lock, separate from staff sign-in.

## 2. Console chrome

Everything in this section is rendered once, above the tab content, and applies
to every tab:

- **Console bar** — role chip (`Owner` / `Admin` / `Staff`), the signed-in
  email, `Updated HH:MM` once the current tab has loaded, and a single refresh
  control for the current tab (spinner lives inside the button, so nothing
  shifts when a load starts).
- **Main tab strip** — one horizontally scrolling row of tabs
  (`accessibilityRole="tab"`, `minWidth: TAB_MIN_WIDTH = 96`, `minHeight: 44`).
  The active tab is scrolled into view using **measured** offsets, so long
  labels (`Electronic Products`) do not throw the centering off.
- **Tab hint line** — one sentence per tab from `ADMIN_TAB_HINTS`, identical to
  the website's `TAB_HINTS`.
- **Load-error banner** — if any read for the current tab fails, the tab says so
  (`"Some <tab> data could not be loaded. Use refresh to retry."`) and lists
  each failing load with its message. Failures are never rendered as an empty
  successful list.
- **Lazy mounting** — a tab's content mounts on first visit (`visited` map) and
  then stays mounted with `display: "none"` while inactive, so per-tab state and
  scroll position survive switching without firing all eight loads at once.
- **Editor guards** — while an inline editor is open on the current tab, the
  pager cannot be swiped and Android back closes the editor instead of leaving
  the console. Covered: product editor (both catalog tabs), project editor,
  service editor, journal editor, Settings fields (back dismisses the keyboard).

## 3. Tab inventory

Eight top-level tabs. The list is canonical in **two** places that are
deliberately kept identical, and both repositories' parity tests enforce it:

- App: `src/config/adminTabs.ts` → `ADMIN_TABS`, `ADMIN_TAB_HINTS`
- Website: `components/admin/admin-types.ts` → `TABS`, `TAB_HINTS`
- Guard: `src/config/admin-parity.test.ts` (app) and the website's
  `tests/admin-parity.test.ts`. Change both lists, both hint maps, and both
  tests in the same change.

| #   | Tab                   | Sections                           | Purpose                                                               |
| --- | --------------------- | ---------------------------------- | --------------------------------------------------------------------- |
| 1   | `Dashboard`           | `Overview` · `Activity`            | Orders, stock, accounts and traffic at a glance                       |
| 2   | `Orders`              | `Orders` · `Finance`               | Every order, its payment state and the finance lines                  |
| 3   | `Electronic Products` | —                                  | The `/products` catalog — pricing, stock and photos                   |
| 4   | `3D Products`         | `Catalog` + 8 print sections       | The `/3d-printing` catalog and print studio                           |
| 5   | `Projects`            | —                                  | Bundles sold on `/projects`, including pre-packaged kits              |
| 6   | `Content`             | `Services` · `Journal` · `Content` | Services, journal posts and the home page copy                        |
| 7   | `Users`               | `Users` · `Messages` · `Logs`      | Accounts, roles, messages, project profiles, activity and diagnostics |
| 8   | `Settings`            | —                                  | Company details, socials and contact channels                         |

Section constants live in `src/config/app_admin_subtabs.ts`
(`DASHBOARD_SUBTABS`, `ORDER_PANELS`, `ORDERS_SUBTABS`, `CONTENT_SUBTABS`,
`USERS_SUBTABS`) and in `src/screens/AdminScreen.tsx` (`LOG_SECTIONS`).

**History that shaped this list:** `Logs` and `Profile` are **not** top-level
tabs. `System Logs`, `User Logs` and `Profile Entries` were three separate tabs
until U-R5 (2026-11-09) merged them into one `Logs` section under `Users`,
because all three answered "what happened?". Any document still describing 9 or
10 top-level tabs, or a top-level `Logs`/`Profile` tab, is stale.

## 4. Tab reference

### 4.1 Dashboard

- `Overview` (`DASHBOARD_SUBTABS`): six stat cards — Orders (pending), Users (new
  today), Cart items (active carts), Products (low stock), Messages (unread),
  Page views 30d (today) — then a "Money" card that routes to **Orders** (money
  lives only in Orders → Finance), then top pages (30 days, up to 10) and a
  daily-traffic bar strip.
- `Activity`: paginated activity feed (`listAdminActivity`).
- Data: `fetchDashboardStats`, `fetchAdminAnalytics(30)`. The feed loads with
  the tab, not only after visiting another tab first.

### 4.2 Orders

- `Orders` panel: search by buyer name/email (server-side), paginated list, and
  a status filter strip — `All` · `Pending` · `Paid` · `Fulfilled` ·
  `Cancelled` (`ORDERS_SUBTABS`). Selecting a status re-queries from page 1.
  Each order's status can be changed inline (`updateOrderStatus`).
- `Finance` panel: revenue and order-status figures read from the same
  dashboard stats object as the Dashboard (`FinanceTab`); it does not duplicate
  the order list.

### 4.3 Electronic Products

- `ProductsTab kind="electronic"`, scoped with `applyComponentsScope` so the
  category rows the storefront groups do not leak across tabs.
- Search, category chips, client-side pagination (8 per page), active/inactive
  toggle, delete (`canDelete` only), and an editor (`ProductEditor`) covering
  identity, pricing/markup, stock, media and SEO-ish fields.
- **Import by link**: `previewLinkImport` → editable import → `createLinkImport`
  keeps photos and copy from a product URL. A stale pending import is cleared
  when the admin switches to a normal row edit, so saving cannot re-import an
  old URL.
- **Preview** renders the real storefront `ProductCard` in a mobile two-column
  layout (`ProductPreviewModal`), not an approximation.

### 4.4 3D Products

A workspace driven by `PrintAdminPanel`:
`Catalog` + `Categories` · `Pricing` · `Costs` · `Promotions` · `Services` ·
`Gallery` · `Requests` · `Reports` (`PRINT_ADMIN_SECTIONS`).

- `Catalog` filters the shared product list to `category === "3d models"` and
  otherwise behaves like Electronic Products (search, paging, editor, import,
  preview, delete).
- `Pricing` holds materials, the price calculator and the approval stamp;
  approval is **admin-and-above only** (`canApprove={isAdmin}`).
- `Costs` is the internal cost/margin sheet (`lib/print-costing.ts`).
- `Requests` manages print quote requests and their statuses
  (`PRINT_QUOTE_STATUSES`).
- `Reports` derives revenue, average order value, grams, margin and conversion
  from quote records (`derivePrintReports`) rather than a second data source.
- Categories, materials, promotions, gallery items and quote requests all expose
  direct delete actions for authorized admins; quote deletion is additionally
  covered by the existing admin-only RLS policy.
- Every read/write goes through `services/printAdminService.ts`. Approval is
  gated in the UI even though the `print_*` RLS policies are looser, because a
  staff member approving their own quote is the failure the gate exists to stop.

### 4.5 Projects

- `ProjectTab` over `products.filter(isProjectPackage)`, with the full catalog
  passed separately so the component linker can suggest and resolve names.
- `ComponentLinkerCard`: attach catalog products to a project, with usage
  warnings. **Failed component-link or pricing reads surface with a retry
  action** and the links are cleared when switching records, so a stale project
  cannot save another project's components.
- `ProjectPricingCard`: markup, minimum price and an approval stamp that records
  who approved it.
- Delete and active toggle follow the same `canDelete` rule as the catalogs.

### 4.6 Content

- `Services` — service rows with editor, active toggle, delete.
- `Journal` — posts with tag, title, body, sort order, active/published toggle,
  delete, and an inline editor guarded against tab swipes.
- `Content` — home-page copy (`upsertSiteContent`) plus the three content
  managers that used to be reachable only through Settings:
  `TrainingProgramsManager`, `PilotCostManager`, `CurriculumManager`. All three
  load when the tab opens, save through their own admin service calls, and
  delete is `canDelete`-gated.

### 4.7 Users

- `Users` — the directory. **Search is server-side** (`listAdminUsers` with the
  query) and page 1 is re-fetched on apply; the search box appears once, as the
  list header. Each card shows name, email, phone, address, joined/last-seen,
  role and tier badges, and these actions:
  - `Change role` (`canDelete`, never against an `owner`): customer / staff /
    admin via the `admin-set-role` Edge Function.
  - `Make pro` / `Make free`: the same Edge Function.
  - `Delete account` (`isOwner`, never against an `owner`): `deleteAdminUser`.
  - `Show projects` / `Hide projects` expands `UserProjectProfileManager`
    (car/project profiles keyed by `profile_key`, settings edited as JSON) and
    `UserRobotSettingsManager` (robot settings, one `key=value` per line). Both
    show a per-user load error with a retry control instead of an empty list.
- `Messages` — contact messages with `All` · `New` · `Replied` filters (server
  side), pagination, a detail preview, and `markMessageReplied`.
- `Logs` — three inner sections (`LOG_SECTIONS`):
  - `System`: car crash/restart reports plus app log lines, including the
    `link/wifi` teardown diagnostics, each with delete (`canDelete`).
  - `User activity`: the per-user audit trail (`listUserActivityLogs`), deletable.
  - `Profiles`: per-user profile entries (`listUserProfileEntries`) with type
    chips, pagination and **delete**. There is no edit affordance — the old
    Edit button was removed because the write it implied never existed.

### 4.8 Settings

- Single panel: `SettingsTab` → `CompanyInfoEditor`, subtitle "Company details —
  all DB-first (shared with the website)."
- 17 fields: Name, Short name, Address, City, Country, Email, Phone, PAN, VAT
  label, Description, WhatsApp number, Facebook URL, Instagram URL, TikTok URL,
  LinkedIn URL, Website URL, YouTube URL.
- `Save company` calls `saveCompanyInfo` and shows a transient `Saved.`
- While any field is focused (`focusCount`/`onEditingChange`) the admin pager
  cannot swipe; empty social fields simply hide that surface elsewhere in the
  app, and WhatsApp is stored digits-only.
- Customer messages are **not** here — they live in Users → Messages.

## 5. Shared building blocks

| Component             | Role                                                                                |
| --------------------- | ----------------------------------------------------------------------------------- |
| `AdminSubTabs`        | Horizontal pill section strip (`role="tablist"`, single row, scrolls)               |
| `AdminEditorSheet`    | Modal wrapper for every add/edit form — nothing is editable until Add/Edit opens it |
| `AdminSectionPanels`  | Renders section panels, hiding inactive ones from a11y and keeping them mounted     |
| `AdminPager`          | Prev/next + page indicator for paginated lists                                      |
| `AdminAction`         | Standard row action button                                                          |
| `SectionCard`         | Titled card with hint used across editors                                           |
| `ProductPreviewModal` | Storefront `ProductCard` preview (two-column mobile grid)                           |
| `CatalogPreviewModal` | Portrait storefront presentation for admin-managed content cards                    |
| `ImagePreviewModal`   | Full-size image preview for media fields                                            |

**Editing rule (2026-11-15):** every admin add/edit form is closed by default and
opens in `AdminEditorSheet` — a bottom sheet for the compact record editors, a
full-screen sheet for the product/service editors that own their header and
Save/Cancel row. Covered: products (both kinds), project packages, services,
journal posts, training programs, pilot cost lines, curriculum highlights,
company settings, and the print studio's categories, materials, calculator,
promotions, services, gallery and quote requests. Print → Costs stays live by
design: it is an internal costing worksheet, not published content.

## 6. Data layer

- `src/services/adminService.ts` — everything non-print. Row mappers
  (`mapProductRow`, `mapOrderRow`, `mapUserRow`, `mapProfileEntryRow`, …) and the
  queries/actions used by the console: `listAdminOrders`, `updateOrderStatus`,
  `listAdminProducts`, `upsertAdminProduct`, `deleteAdminProduct`,
  `previewLinkImport`, `createLinkImport`, `listAdminServices`,
  `listProjectComponents`, `listProjectUsage`, `saveProjectComponents`,
  `getAdminProjectPricing`, `saveAdminProjectPricing`,
  `setAdminProjectPricingApproval`, `listAdminUsers`, `toggleAdminRole`,
  `setUserTier`, `deleteAdminUser`, `listUserRobotSettings`,
  `upsertUserRobotSettings`, `deleteUserRobotSetting`, `listUserCarProfiles`,
  `upsertAdminCarProfile`, `deleteAdminCarProfile`, `listAdminMessages`,
  `markMessageReplied`, `fetchDashboardStats`, `fetchAdminAnalytics`,
  `listAdminActivity`, `listDeviceCrashReports`, `listAppLogs`,
  `listUserActivityLogs`, `listUserProfileEntries`, `listProfileEntryTypes`,
  delete helpers for each log type, `listAdminJournalPosts`,
  `getCompanyInfo`, `saveCompanyInfo`, and the training-program, pilot-cost and
  curriculum CRUD.
- `src/services/printAdminService.ts` — the print studio: `loadPrintAdminData`,
  `savePrintSettings`, `setPrintApproval`, `savePrintCategory`,
  `savePrintMaterial`, `savePrintPromotion`, `savePrintGalleryItem`,
  `savePrintService`, `savePrintCosting`, `uploadPrintImage`,
  `deletePrintRecord`, `updatePrintQuote`, `derivePrintReports`.
- `src/services/appLogService.ts` + `src/components/tools/useControlHub.ts` —
  produce the `link/wifi` diagnostics rows rendered under Users → Logs →
  System. Each socket teardown is logged once (guarded ref), so both control
  hubs cannot double-write the same close.
- **Shared contract:** the website owns the canonical Supabase schema and the
  deployed Edge Functions; the app carries reference copies plus parity checks.
  Any change to a shared table, RLS policy, stored field or function contract
  must be evaluated on both sides.

## 7. Authorization matrix

| Action                                                                              | Staff | Admin | Owner                    |
| ----------------------------------------------------------------------------------- | ----- | ----- | ------------------------ |
| View console, all tabs                                                              | ✅    | ✅    | ✅                       |
| Create / edit catalog, services, journal, content, print studio                     | ✅    | ✅    | ✅                       |
| Approve print pricing                                                               | —     | ✅    | ✅                       |
| Delete products, services, journal posts, print records, log rows, project profiles | —     | ✅    | ✅                       |
| Change a user's role or tier                                                        | —     | ✅    | ✅                       |
| Delete a user account                                                               | —     | —     | ✅ (never another owner) |

Row-level enforcement still happens in Supabase; the app never assumes its own
gates are sufficient.

## 8. Validation

Verified on 2026-11-15 against `main` @ `d90dc16`, from `genumsolutions-app/mobile`:

- `node node_modules/vitest/vitest.mjs run` → **79 files / 1,067 tests passing**.
- `node node_modules/typescript/bin/tsc --noEmit` → clean.
- `src/config/admin-parity.test.ts` guards the 8-tab inventory, the hint map and
  the dashboard sections, and reads the sibling website's
  `components/admin/admin-types.ts` when that repo is checked out next to the
  app.
- CI additionally runs the admin layout smoke check (390 × 844 web render) and
  the app/website Playwright parity job.
- None of this replaces an authenticated walkthrough on a real device against a
  live Supabase environment, which remains a manual step.

## 9. Known differences from the website mirror

The two consoles intentionally share the tab inventory, section structure and
design language but are separate implementations. Verified differences at the
time of this writing:

| Area                                          | App                                                     | Website                                              |
| --------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------- |
| Settings                                      | Three sections, read-only rows until Edit               | Three sections, read-only rows until Edit (matching) |
| Users → Logs                                  | `User activity` · `User profiles` · `Fleet diagnostics` | Same order (matching)                                |
| Dashboard                                     | `Overview` / `Activity` pills                           | `AdminDashboard` + `AdminActivity` stacked           |
| Orders status filter                          | Pill strip (`ORDERS_SUBTABS`)                           | Select control                                       |
| Editor presentation                           | `AdminEditorSheet` (native `Modal`)                     | `AdminEditorSheet` (portal dialog)                   |
| Users → Messages                              | Contact messages only                                   | Contact messages **plus** newsletter opt-ins         |
| Orders/Content/Users/3D Products section sets | same lists                                              | same lists                                           |

The newsletter-opt-in list is the one **functional** asymmetry: the app captures
opt-ins from Account → Newsletter but the app console cannot read them back.

## 10. Documentation status

- This file now matches the 8-tab console.
- `docs/ADMIN_REDESIGN_PLAN.md` describes the 8-tab layout correctly, but still
  lists "customer messages" and "newsletter subscribers" under Settings — both
  are wrong now (messages moved to Users; no subscriber screen exists in the app).
- `docs/ADMIN_UI_BLUEPRINT.md` is **stale**: it claims nine tabs with a
  top-level `Logs` tab, two inner `LOG_SECTIONS`, an editable
  `ProfileEntriesTab`, and Settings holding training programs and pilot costs.
  None of that is true of the current code.
- `docs/APP_WEBSITE_UI_COMPARISON.md` must stay byte-identical in both
  repositories when the admin comparison changes.
