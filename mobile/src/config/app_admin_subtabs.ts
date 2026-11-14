// ====================================================================
// app_admin_subtabs.ts — App-side admin sub-tabs (mirrors website)
// ====================================================================

// U-UI2 (2026-11-14): sub-tabs for App admin — mirroring the website's
// 3D Products / admin pattern. Only one sub-tab is visible at a time,
// sub-tabs are sticky while scrolling.

// Orders sub-tabs - mirror website AdminOrders
export const ORDERS_SUBTABS = [
  "All",
  "Pending",
  "Paid",
  "Fulfilled",
  "Cancelled",
] as const;
type OrdersSubTab = (typeof ORDERS_SUBTABS)[number];

// Content sub-tabs - mirror website AdminContent
export const CONTENT_SUBTABS = ["Services", "Journal", "Content"] as const;
type ContentSubTab = (typeof CONTENT_SUBTABS)[number];

// Users sub-tabs - mirror website AdminUsers
export const USERS_SUBTABS = ["Users", "Projects", "Robot Profiles"] as const;
type UsersSubTab = (typeof USERS_SUBTABS)[number];

// Finance sub-tabs - mirror website AdminFinance
export const FINANCE_SUBTABS = [
  "Overview",
  "Transactions",
  "Payments",
] as const;
type FinanceSubTab = (typeof FINANCE_SUBTABS)[number];

// Services sub-tabs - mirror website AdminServices
export const SERVICES_SUBTABS = ["General", "Pricing", "Settings"] as const;
type ServicesSubTab = (typeof SERVICES_SUBTABS)[number];

// Settings sub-tabs - mirror website AdminSettings
export const SETTINGS_SUBTABS = ["Details", "Contact", "Social"] as const;
type SettingsSubTab = (typeof SETTINGS_SUBTABS)[number];

// Journal sub-tabs - mirror website AdminJournal
export const JOURNAL_SUBTABS = ["Posts", "Categories", "Tags"] as const;
type JournalSubTab = (typeof JOURNAL_SUBTABS)[number];

// Export all sub-tab types
export type {
  OrdersSubTab,
  ContentSubTab,
  UsersSubTab,
  FinanceSubTab,
  ServicesSubTab,
  SettingsSubTab,
  JournalSubTab,
};
