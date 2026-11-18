# Admin coherence (app side)

The app console shares the website's canonical top-level tab inventory and
data/permission model. The full cross-client contract — role matrix, data
ownership, deliberate asymmetries — lives in
`genumsolutions-website/docs/ADMIN_COHERENCE.md`. This file records the app's
navigation and layout behavior.

## Tabs (7, same order as the website)

Dashboard · Orders · Electronic Products · 3D Products · Projects · Users ·
Settings

2026-11-18: **Content** is gone as a top-level tab. Its panels are Settings
sections now — Company, Home page, Storefront services, Journal — because all
four edit the same kind of record (the company's own content) and the split
made staff guess which surface owned a line of copy.

`src/config/adminTabs.ts` is the canonical list, and
`src/config/admin-parity.test.ts` compares it against the website's
`components/admin/admin-types.ts` and against the strip in `AdminScreen.tsx`.

Dashboard has separate **Overview** and **Activity** subtabs; only one panel is
shown at a time. Orders, Users and Settings also use subtabs, and both of the
latter carry a third level where it earns its keep.

### Projects sections

Projects works like the 3D studio: a six-section strip across the tab.

| Section             | What it answers                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog             | The package list — search, category filter, preview, edit, hide, delete                                                                                                                                 |
| Categories          | Project families (Robo Car, Smart Home, Smart Farm, Smart City, Smart Dustbin, Aerial Drones, plus Uncategorised): package counts, live/hidden, price range. Tapping a family filters the catalog to it |
| Pricing             | Every package's quote state in one place: approved / draft / no row, base charge, markup, minimum, extras and bulk-tier counts. Each row opens that package's editor on Pricing                         |
| Software & features | Toolchain, repository, libraries, objectives, control methods and feature lines, with an `n/6` completeness count; opens the editor on Code details                                                     |
| 3D materials        | Printer, filament, layer height, infill, print time and the materials list; opens 3D material details                                                                                                   |
| Coding procedure    | Build steps, coding steps, duration and procedure notes; opens Coding procedure                                                                                                                         |

Pricing reads `project_pricing` for all packages in one query
(`listAdminProjectPricing`); draft rows are visible to staff through RLS but
stay hidden from customers.

### Users sections

_Accounts · Project profiles · Messages · Diagnostics._

- **Accounts** — the directory: role, tier, joined/last seen, per-user robot
  settings and per-user project profiles, delete (owner only).
- **Project profiles** — every saved `car_profiles` row across all builders,
  newest first, searchable by builder/car/profile key, with a settings count and
  last update. Read-only; repairs stay on the account row so there is one write
  path.
- **Messages** — customer messages plus newsletter opt-ins.
- **Diagnostics** — crash reports + app logs (Fleet diagnostics), the user
  activity log, and profile-entry changes, three nested sections backed by
  `device_crash_reports` + `app_logs`, `user_activity_log`, and
  `user_profile_entries`.

### Settings sections

_Company · Home page · Storefront services · Journal._

- **Company** has three nested sections — Details / Contact / Social — over one
  `company_info` row. The editor works on a draft: nothing touches the live
  record or the read-only view until Save, name and email are required and the
  email is validated, and a failed database write is shown in the sheet instead
  of being swallowed. Every field carries a line explaining where it appears.
- **Home page** has four nested sections — Hero / Training / Pilot costs /
  Curriculum — instead of one long scroll mixing four record types.

### Electronic Products subtabs

_Catalog · Categories · Import_. The catalog list is unchanged; Categories is a
read-only roll-up (items, visible/hidden, stock, price range per category) whose
rows jump into the catalog filtered to that category; Import hosts the link
importer, which no longer sits on the catalog's own header.

### Project editor subtabs

Projects are edited one hierarchy level at a time, mirroring the website:

| Subtab              | Fields                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Category            | id, name, category, product type, project category, overview, outcomes, prerequisites, deliverables, audience, difficulty, cover + gallery |
| Pricing             | price, label, stock, SKU, warranty, maintenance, package quote panel                                                                       |
| Code details        | language/toolchain, repository, libraries, source folder, docs/video links, code notes, control methods, spec lines                        |
| 3D material details | materials required, printer, filament, layer height, infill, print time, material notes                                                    |
| Coding procedure    | build steps, coding procedure steps, procedure notes, estimated duration                                                                   |

Category and Pricing are the long-standing `products.project_category` and
`project_pricing` records. Code details, 3D material details and coding
procedure are stored in `products.import_meta.projectDetails` (see
`src/config/projectDetails.ts` for the exact shape). They live in that jsonb bag
because both clients already write it whole, so the blocks round-trip without a
DDL migration; the reader/writer is one module, so promoting them to columns
later needs no UI change.

**The columns are in code; the migration itself is still unapplied.**
`supabase/migrations/20261118180000_project_details_columns.sql` in the website
repo (the DB owner) adds twelve `products.project_*` columns and backfills them
from the JSON block; its runbook is `docs/PROJECT_DETAILS_COLUMNS.md` there.
Rollout order is backfill → reader that prefers a column and falls back to the
JSON → dual write → drop the JSON copy. On this side only two modules moved:
`src/config/projectDetails.ts` (the reader/writer) and
`services/adminService.ts` (the row mapper); no admin screen touches the storage
location — `AdminScreen.tsx` reads `product.projectDetails`, already merged.

Reads now take the column value per field and fall back to the JSON copy, so a
database without the columns still shows every block (empty columns lose to a
populated JSON copy, and an empty steps array does not hide JSON steps). Writes
keep both copies, but only include the columns after a one-time probe
(`select project_code_language from products limit 1`) confirms they exist — an
unknown column is a `42703` that would fail the whole product save. So the
migration can be applied before or after this build ships; the same binary
switches over on its own, and until then nothing about the console changes.

The 3D Products studio has its own section strip. Each section scrolls
vertically within the available screen space. Categories, Promotions, Services,
Gallery, and Requests show their records by default; their editor opens only
when a row is selected or New is chosen, and can be canceled without saving.
The browser layout test uses a mock staff response and mocked data requests;
it does not alter the app's auth gate or require real credentials.

## Access model

The app talks to Supabase directly with the signed-in session — no service key
ships to a phone — so the database policies are the real permission system:

| Action                                     | Policy                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| Staff read any log/crash row               | `staff read …` (`is_staff()`)                                          |
| Admin delete a row                         | `admin delete …` (`is_admin()`)                                        |
| Staff read any car profile / robot setting | `staff read …`                                                         |
| Admin create/update/delete them            | `admin insert` / `admin update` (`20261109_admin_update_profiles.sql`) |

The app keeps the staff-only screen gate and relies on Supabase RLS for
authorization. If a control "does nothing" in the app, check the policy before
the UI: an RLS denial is silent by design.

## Users tab

Each user row expands into two managers, matching the website:

- **Robot preferences** — `robot_user_settings` (`listUserRobotSettings`,
  `upsertUserRobotSettings`, `deleteUserRobotSetting`).
- **Project profiles** — `car_profiles` (`listUserCarProfiles`,
  `upsertAdminCarProfile`, `deleteAdminCarProfile`). Staff see the list; the
  write controls are hidden unless `canDelete` (admin+).
