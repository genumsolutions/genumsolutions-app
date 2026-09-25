// =====================================================================
// adminTabs.ts — canonical admin tab inventory (ARCHITECTURE.md B-6).
//
// The admin surface must be an exact mirror on both clients (app
// AdminScreen + website AdminPanel). This module is the app-side,
// React-Native-free source for parity tests; the website pins the same
// list in `tests/admin-parity.test.ts`. Change BOTH + both tests in the
// same session.
// =====================================================================

// U-37 (2026-09-25): 12→6 tabs, group names removed.
// Merged: Dashboard+Activity · Orders+Finance · Products+Projects ·
// Services+Journal+Content · Users+Messages+Robots · Settings.
export const ADMIN_TABS = [
  "Dashboard",
  "Orders",
  "Catalog",
  "Content",
  "Users",
  "Settings",
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number];
