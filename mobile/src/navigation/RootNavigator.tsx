// =====================================================================
// RootNavigator - native navigation tree:
//   RootStack
//     ├─ Main      (swipeable pager: Home / Shop / Cart / Account)
//     └─ ProductDetail, Checkout, OrderSuccess, Services, Projects,
//        Contact, About, Tools
// =====================================================================
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { HomeScreen } from '../screens/HomeScreen';
import { ShopScreen } from '../screens/ShopScreen';
import { CartScreen } from '../screens/CartScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { MainTabPager } from './MainTabPager';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { CheckoutScreen } from '../screens/CheckoutScreen';
import { OrderSuccessScreen } from '../screens/OrderSuccessScreen';
import { ServicesScreen } from '../screens/ServicesScreen';
import { ProjectsScreen } from '../screens/ProjectsScreen';
import { ContactScreen } from '../screens/ContactScreen';
import { AboutScreen } from '../screens/AboutScreen';
import { ToolsScreen } from '../screens/ToolsScreen';
import { AdminScreen } from '../screens/AdminScreen';
import { JournalScreen } from '../screens/JournalScreen';
import { PrintingScreen } from '../screens/PrintingScreen';
import { OpenToolsScreen } from '../screens/OpenToolsScreen';
import { LegalScreen } from '../screens/LegalScreen';
import { useApp } from '../context/AppContext';
import { withErrorBoundary } from '../components/withErrorBoundary';
import type { RootStackParamList } from './types';

// Each screen gets its own error boundary so a crash in one screen shows a
// friendly fallback instead of killing the whole app. Defined at module scope
// so component identity is stable across renders.
const MainTabsSafe = withErrorBoundary(MainTabs, 'Main');
const HomeScreenSafe = withErrorBoundary(HomeScreen, 'Home');
const ShopScreenSafe = withErrorBoundary(ShopScreen, 'Shop');
const CartScreenSafe = withErrorBoundary(CartScreen, 'Cart');
const AccountScreenSafe = withErrorBoundary(AccountScreen, 'Account');
const ProductDetailScreenSafe = withErrorBoundary(ProductDetailScreen, 'ProductDetail');
const CheckoutScreenSafe = withErrorBoundary(CheckoutScreen, 'Checkout');
const OrderSuccessScreenSafe = withErrorBoundary(OrderSuccessScreen, 'OrderSuccess');
const ServicesScreenSafe = withErrorBoundary(ServicesScreen, 'Services');
const ProjectsScreenSafe = withErrorBoundary(ProjectsScreen, 'Projects');
const ContactScreenSafe = withErrorBoundary(ContactScreen, 'Contact');
const AboutScreenSafe = withErrorBoundary(AboutScreen, 'About');
const ToolsScreenSafe = withErrorBoundary(ToolsScreen, 'Tools');
const AdminScreenSafe = withErrorBoundary(AdminScreen, 'Admin');
const JournalScreenSafe = withErrorBoundary(JournalScreen, 'Journal');
const PrintingScreenSafe = withErrorBoundary(PrintingScreen, 'Printing');
const OpenToolsScreenSafe = withErrorBoundary(OpenToolsScreen, 'OpenTools');
const LegalScreenSafe = withErrorBoundary(LegalScreen, 'Legal');

const Stack = createNativeStackNavigator<RootStackParamList>();

function MainTabs() {
  return (
    <MainTabPager
      screens={{
        Home: HomeScreenSafe,
        Shop: ShopScreenSafe,
        Cart: CartScreenSafe,
        Account: AccountScreenSafe,
      }}
    />
  );
}

export function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#ffffff' },
      }}
    >
      <Stack.Screen name="Main" component={MainTabsSafe} />
      <Stack.Screen
        name="ProductDetail"
        component={ProductDetailScreenSafe}
        options={{ headerShown: true, title: 'Product', headerTintColor: '#1e3a8a', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="Checkout"
        component={CheckoutScreenSafe}
        options={{ headerShown: true, title: 'Checkout', headerTintColor: '#1e3a8a', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="OrderSuccess"
        component={OrderSuccessScreenSafe}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="Services"
        component={ServicesScreenSafe}
        options={{ headerShown: true, title: 'Services', headerTintColor: '#1e3a8a', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="Projects"
        component={ProjectsScreenSafe}
        options={{ headerShown: true, title: 'Projects', headerTintColor: '#1e3a8a', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="Contact"
        component={ContactScreenSafe}
        options={{ headerShown: true, title: 'Contact', headerTintColor: '#1e3a8a', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="About"
        component={AboutScreenSafe}
        options={{ headerShown: true, title: 'About', headerTintColor: '#1e3a8a', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="Tools"
        component={ToolsScreenSafe}
        options={{ headerShown: true, title: 'Tools & IoT', headerTintColor: '#1e3a8a', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="Admin"
        component={AdminScreenSafe}
        options={{ headerShown: true, title: 'Admin', headerTintColor: '#1e3a8a', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="Journal"
        component={JournalScreenSafe}
        options={{ headerShown: true, title: 'Journal', headerTintColor: '#1e3a8a', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="Printing"
        component={PrintingScreenSafe}
        options={{ headerShown: true, title: '3D Printing', headerTintColor: '#1e3a8a', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="OpenTools"
        component={OpenToolsScreenSafe}
        options={{ headerShown: true, title: 'Open Tools', headerTintColor: '#1e3a8a', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="Legal"
        component={LegalScreenSafe}
        options={({ route }) => ({
          headerShown: true,
          title: route.params.doc === 'privacy' ? 'Privacy Policy' : 'Terms of Service',
          headerTintColor: '#1e3a8a',
          headerBackTitle: 'Back',
        })}
      />
    </Stack.Navigator>
  );
}
