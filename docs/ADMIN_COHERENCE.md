# Admin coherence (app side)

The app console shares the website's canonical top-level tab inventory and
data/permission model. The full cross-client contract — role matrix, data
ownership, deliberate asymmetries — lives in
`genumsolutions-website/docs/ADMIN_COHERENCE.md`. This file records the app's
navigation and layout behavior.

## Tabs (8, same order as the website)

Dashboard · Orders · Electronic Products · 3D Products · Projects · Content ·
Users · Settings

`src/config/adminTabs.ts` is the canonical list, and
`src/config/admin-parity.test.ts` compares it against the website's
`components/admin/admin-types.ts` and against the strip in `AdminScreen.tsx`.

Dashboard has separate **Overview** and **Activity** subtabs; only one panel is
shown at a time. Orders, Content, and Users also use subtabs. **Logs** is a
Users subtab with _System_, _User activity_, and _Profiles_ sections, backed by
`device_crash_reports` + `app_logs`, `user_activity_log`, and
`user_profile_entries`.

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
