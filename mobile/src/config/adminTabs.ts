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
  "Settings",
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number];

// U-UI1 (2026-11-09): one line per tab, rendered under the tab strip on both
// clients. This is the app-side copy of the website's TAB_HINTS
// (components/admin/admin-types.ts); both parity tests compare the maps, so the
// console explains itself with the same words on either surface. Keep values
// free of double quotes — the tests parse them out of the source text.
export const ADMIN_TAB_HINTS: Record<AdminTab, string> = {
  Dashboard: "Revenue, orders and traffic at a glance.",
  Orders: "Every order, its payment state and the pilot finance lines.",
  "Electronic Products": "The /products catalog — pricing, stock and photos.",
  "3D Products": "The /3d-printing catalog.",
  Projects: "Bundles sold on /projects, including pre-packaged kits.",
  Content: "Services, journal posts and the home page copy.",
  Users: "Accounts, roles, orders, project profiles, activity and diagnostics.",
  Settings: "Company details, customer messages and newsletter subscribers.",
};
