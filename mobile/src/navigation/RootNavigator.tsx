// =====================================================================
// RootNavigator - native navigation tree:
//   RootStack
//     ├─ Main      (bottom tab navigator: Home / Shop / Cart / Account)
//     └─ ProductDetail, Checkout, OrderSuccess, Services, Projects,
//        Contact, About, Tools
// =====================================================================
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { HomeScreen } from '../screens/HomeScreen';
import { ShopScreen } from '../screens/ShopScreen';
import { CartScreen } from '../screens/CartScreen';
import { AccountScreen } from '../screens/AccountScreen';
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
import { CategoryHubScreen } from '../screens/CategoryHubScreen';
import { LegalScreen } from '../screens/LegalScreen';
import { useApp } from '../context/AppContext';
import { PROJECT_CATEGORIES } from '../config/project-catalog';
import { BrandHeader } from '../components/BrandHeader';
import { withErrorBoundary } from '../components/withErrorBoundary';
import type { MainTabParamList, RootStackParamList } from './types';

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
const CategoryHubScreenSafe = withErrorBoundary(CategoryHubScreen, 'Category');
const LegalScreenSafe = withErrorBoundary(LegalScreen, 'Legal');

type IconName = ComponentProps<typeof Feather>['name'];

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const TAB_ICONS: Record<keyof MainTabParamList, { on: IconName; off: IconName }> = {
  Home: { on: 'home', off: 'home' },
  Shop: { on: 'grid', off: 'grid' },
  Cart: { on: 'shopping-bag', off: 'shopping-bag' },
  Account: { on: 'user', off: 'user' },
};

function MainTabs() {
  const { cartCount } = useApp();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        header: () => <BrandHeader />,
        tabBarActiveTintColor: '#1e3a8a',
        tabBarInactiveTintColor: '#64748b',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
        tabBarIcon: ({ color, size, focused }) => {
          const icons = TAB_ICONS[route.name];
          return (
            <Feather
              name={focused ? icons.on : icons.off}
              size={size}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreenSafe} />
      <Tab.Screen name="Shop" component={ShopScreenSafe} />
      <Tab.Screen
        name="Cart"
        component={CartScreenSafe}
        options={{
          tabBarBadge: cartCount > 0 ? (cartCount > 99 ? '99+' : cartCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: '#b45309', color: '#ffffff', fontSize: 10 },
        }}
      />
      <Tab.Screen name="Account" component={AccountScreenSafe} />
    </Tab.Navigator>
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
        name="Category"
        component={CategoryHubScreenSafe}
        options={({ route }) => ({
          headerShown: true,
          title: PROJECT_CATEGORIES.find((c) => c.slug === route.params.slug)?.name ?? 'Category',
          headerTintColor: '#1e3a8a',
          headerBackTitle: 'Back',
        })}
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
