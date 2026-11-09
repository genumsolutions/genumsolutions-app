// =====================================================================
// adminTabs.ts — canonical admin tab inventory (was "ARCHITECTURE.md B-6";
// that spec is NOT in the repo).
//
// The admin surface must be an exact mirror on both clients (app
// AdminScreen + website AdminPanel). This module is the app-side,
// React-Native-free source for parity tests; the website pins the same
// list in `tests/admin-parity.test.ts`. Change BOTH + both tests in the
// same session.
// =====================================================================

// U-44 (2026-09-26, owner): Catalog split into THREE catalog tabs mirroring
// the customer storefront — Electronic Products (/products), 3D Products
// (/3d-printing), Projects (/projects, + Pre-packaged Kits). Must match the
// website's tests/admin-parity.test.ts ADMIN_TABS exactly.
// U-R3: "System Logs" added — fleet crash reports + app logs.
// U-R4 (2026-11-09): "User Logs" + "Profile Entries" added — per-user audit
// log and per-user car/project profiles, read from the shared Supabase tables
// (user_activity_log / user_profile_entries / profile_entry_types).
// U-R5 (2026-11-09): those two and "System Logs" merged into ONE "Logs" tab
// with three sections, because all three answered the same question (what
// happened?) and each cost its own click. Both clients now expose the
// identical 9-tab inventory.
export const ADMIN_TABS = [
  "Dashboard",
  "Orders",
  "Electronic Products",
  "3D Products",
  "Projects",
  "Content",
  "Users",
  "Logs",
  "Settings",
] as const;
