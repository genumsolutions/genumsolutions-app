# Admin coherence (app side)

The app console mirrors the website dashboard exactly. The full contract —
role matrix, data ownership, deliberate asymmetries — lives in
`genumsolutions-website/docs/ADMIN_COHERENCE.md`. This file is the app's copy of
the parts that live here.

## Tabs (9, same order as the website)

Dashboard · Orders · Electronic Products · 3D Products · Projects · Content ·
Users · Logs · Settings

`src/config/adminTabs.ts` is the canonical list, and
`src/config/admin-parity.test.ts` compares it against the website's
`components/admin/admin-types.ts` and against the strip in `AdminScreen.tsx`.

**Logs** is the merged monitoring tab (November 2026): a section switch over
*Activity* (`user_activity_log`), *Profiles* (`user_profile_entries`) and
*Crashes* (`device_crash_reports` + `app_logs`). It opens all four queries once
on tab entry so switching sections costs no extra requests.

## Access model

The app talks to Supabase directly with the signed-in session — no service key
ships to a phone — so the database policies are the real permission system:

| Action | Policy |
| --- | --- |
| Staff read any log/crash row | `staff read …` (`is_staff()`) |
| Admin delete a row | `admin delete …` (`is_admin()`) |
| Staff read any car profile / robot setting | `staff read …` |
| Admin create/update/delete them | `admin insert` / `admin update` (`20261109_admin_update_profiles.sql`) |

If a control "does nothing" in the app, check the policy before the UI: an RLS
denial is silent by design.

## Users tab

Each user row expands into two managers, matching the website:

- **Robot preferences** — `robot_user_settings` (`listUserRobotSettings`,
  `upsertUserRobotSettings`, `deleteUserRobotSetting`).
- **Project profiles** — `car_profiles` (`listUserCarProfiles`,
  `upsertAdminCarProfile`, `deleteAdminCarProfile`). Staff see the list; the
  write controls are hidden unless `canDelete` (admin+).
