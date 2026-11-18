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

export const USERS_SUBTABS = ["Users", "Messages", "Logs"] as const;
type UsersSubTab = (typeof USERS_SUBTABS)[number];

export type {
  DashboardSubTab,
  OrderPanel,
  OrdersSubTab,
  UsersSubTab,
};

