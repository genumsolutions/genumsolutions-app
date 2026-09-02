// =====================================================================
// Navigation param types for the native app. Matches the structure in
// src/navigation/RootNavigator.tsx.
// =====================================================================
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type MainTabParamList = {
  Home: undefined;
  Shop: undefined;
  Cart: undefined;
  Account: undefined;
};

export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  ProductDetail: { productId: string };
  Checkout: { provider?: 'cod' | 'esewa' | 'khalti'; status?: string } | undefined;
  Services: undefined;
  Projects: undefined;
  Contact: undefined;
  About: undefined;
  Tools: undefined;
  Admin: undefined;
  Journal: undefined;
  Printing: undefined;
  OpenTools: undefined;
  Category: { slug: string };
  Legal: { doc: 'privacy' | 'terms' };
  OrderSuccess: { orderId?: string; provider?: string; paid?: boolean };
};

/** Navigation prop for tab screens that can push onto the root stack. */
export type TabNav<T extends keyof MainTabParamList> = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, T>,
  NativeStackNavigationProp<RootStackParamList>
>;
