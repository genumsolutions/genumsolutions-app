// App-side admin section tabs.

export const DASHBOARD_SUBTABS = ["Overview", "Activity"] as const;
type DashboardSubTab = (typeof DASHBOARD_SUBTABS)[number];

export const ORDER_PANELS = ["Orders", "Finance"] as const;
type OrderPanel = (typeof ORDER_PANELS)[number];

export const ORDERS_SUBTABS = [
  "All",
  "Pending",
  "Paid",
  "Fulfilled",
  "Cancelled",
] as const;
type OrdersSubTab = (typeof ORDERS_SUBTABS)[number];

// 2026-11-18: CONTENT_SUBTABS was removed with the Content tab — its panels are
// Settings sections now (Company / Home page / Services / Journal).

// 2026-11-18 (owner: "the user tab also need the proper windowing like sub
// tabs to view the project profiles, and user profiles and the debugging
// things, crash report, etc"): each question a staff member has about the fleet
// now has its own window. Accounts is the directory (roles, tiers, per-user
// robot settings); Project profiles is every saved car/project profile across
// users; Messages is customer mail + newsletter; Diagnostics is the fleet's
// crash reports, app logs, activity log and profile-entry log.
export const USERS_SUBTABS = [
  "Accounts",
  "Project profiles",
  "Messages",
  "Diagnostics",
] as const;
type UsersSubTab = (typeof USERS_SUBTABS)[number];

export type { DashboardSubTab, OrderPanel, OrdersSubTab, UsersSubTab };
