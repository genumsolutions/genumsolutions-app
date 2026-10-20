// =====================================================================
// Navigation param types for the native app. Matches the structure in
// src/navigation/RootNavigator.tsx.
//
// The bottom bar is Home / Printing / Shop / Menu. Account is NOT a tab: it lives
// in the top bar like the website's header account icon and is a stack screen
// (website /account parity). Cart is NOT a tab either — it moved to the stack.
// This line used to read "Home / Shop / Cart / Menu" and no longer matched
// MainTabParamList two lines below it.
// =====================================================================
import type { NavigatorScreenParams } from "@react-navigation/native";
// U-119b (2026-10-21): TabNav and the three navigation-prop type imports that
// existed ONLY to build it (CompositeNavigationProp, BottomTabNavigationProp,
// NativeStackNavigationProp) were deleted together — zero importers of TabNav
// anywhere in mobile/src, and no other line in this file used those three.

export type MainTabParamList = {
  Home: undefined;
  Printing: undefined; // "3D Products" tab (bottom-nav label)
  Shop: undefined; // "Electronic Products" tab (bottom-nav label)
  Menu: undefined;
  // U-44 (2026-09-26, owner): Cart is NOT a bottom tab anymore — the
  // BrandHeader bag icon (top right) pushes the Cart STACK route instead.
};

export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Cart: undefined; // U-44: pushed from the header bag icon (no longer a tab)
  ProductDetail: { productId: string };
  Checkout:
    { provider?: "cod" | "esewa" | "khalti"; status?: string } | undefined;
  Services: undefined;
  Projects: undefined;
  Contact: undefined;
  About: undefined;
  Tools: { category?: string } | undefined;
  /** Immersive game-style joystick remote window (opened from the Control
   *  Panel's header joystick icon). Same hub state as Tools; own full-screen,
   *  landscape-by-default UI. PRO USERS ONLY — the screen enforces the tier. */
  RemoteControl: { category?: string } | undefined;
  /** Per-robot preference profiles (Settings menu, Pro users): code values,
   *  parameters, and telemetry channel picks stored per user × robot. */
  /** R4-7: the user hub — devices ever connected + per-robot profiles. */
  UserPreferences: undefined;
  Admin: undefined;
  Journal: undefined;
  Printing: undefined;
  OpenTools: undefined;
  Legal: { doc: "privacy" | "terms" };
  OrderSuccess: { orderId?: string; provider?: string; paid?: boolean };
  Account: undefined;
  /** U-49 (2026-09-28): the connection wizard — every link method gets a row
   *  here (BT SPP, own-AP and STA are built; BLE / ESP remote are placeholders),
   *  then hands off to DeviceConnection for the chosen kind. */
  DeviceSetup: undefined;
  DeviceConnection: { kind: string; deviceName: string };
  Update: undefined;
};
