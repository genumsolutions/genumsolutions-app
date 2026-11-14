// App-side admin section tabs.

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

export const CONTENT_SUBTABS = ["Services", "Journal", "Content"] as const;
type ContentSubTab = (typeof CONTENT_SUBTABS)[number];

export const USERS_SUBTABS = ["Users", "Messages", "Logs"] as const;
type UsersSubTab = (typeof USERS_SUBTABS)[number];

export type {
  OrderPanel,
  OrdersSubTab,
  ContentSubTab,
  UsersSubTab,
};
