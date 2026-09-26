// =====================================================================
// adminTabs.ts — canonical admin tab inventory (ARCHITECTURE.md B-6).
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
