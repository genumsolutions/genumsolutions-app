// =====================================================================
// adminTabs.ts — canonical admin tab inventory (ARCHITECTURE.md B-6).
//
// The admin surface must be an exact mirror on both clients (app
// AdminScreen + website AdminPanel). This module is the app-side,
// React-Native-free source for parity tests; the website pins the same
// list in `tests/admin-parity.test.ts`. Change BOTH + both tests in the
// same session.
// =====================================================================

export const ADMIN_TABS = [
  "Dashboard",
  "Orders",
  "Products",
  "Projects",
  "Services",
  "Journal",
  "Users",
  "Messages",
  "Finance",
  "Activity",
  "Content",
  "Settings",
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number];
