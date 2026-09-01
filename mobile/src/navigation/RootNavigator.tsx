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
import { useApp } from '../context/AppContext';
import { BrandHeader } from '../components/BrandHeader';
import type { MainTabParamList, RootStackParamList } from './types';

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
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Shop" component={ShopScreen} />
      <Tab.Screen
        name="Cart"
        component={CartScreen}
        options={{
          tabBarBadge: cartCount > 0 ? (cartCount > 99 ? '99+' : cartCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: '#b45309', color: '#ffffff', fontSize: 10 },
        }}
      />
      <Tab.Screen name="Account" component={AccountScreen} />
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
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen
        name="ProductDetail"
        component={ProductDetailScreen}
        options={{ headerShown: true, title: 'Product', headerTintColor: '#1e3a8a', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="Checkout"
        component={CheckoutScreen}
        options={{ headerShown: true, title: 'Checkout', headerTintColor: '#1e3a8a', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="OrderSuccess"
        component={OrderSuccessScreen}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="Services"
        component={ServicesScreen}
        options={{ headerShown: true, title: 'Services', headerTintColor: '#1e3a8a', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="Projects"
        component={ProjectsScreen}
        options={{ headerShown: true, title: 'Projects', headerTintColor: '#1e3a8a', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="Contact"
        component={ContactScreen}
        options={{ headerShown: true, title: 'Contact', headerTintColor: '#1e3a8a', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="About"
        component={AboutScreen}
        options={{ headerShown: true, title: 'About', headerTintColor: '#1e3a8a', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="Tools"
        component={ToolsScreen}
        options={{ headerShown: true, title: 'Tools & IoT', headerTintColor: '#1e3a8a', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="Admin"
        component={AdminScreen}
        options={{ headerShown: true, title: 'Admin', headerTintColor: '#1e3a8a', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="Journal"
        component={JournalScreen}
        options={{ headerShown: true, title: 'Journal', headerTintColor: '#1e3a8a', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="Printing"
        component={PrintingScreen}
        options={{ headerShown: true, title: '3D Printing', headerTintColor: '#1e3a8a', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="OpenTools"
        component={OpenToolsScreen}
        options={{ headerShown: true, title: 'Open Tools', headerTintColor: '#1e3a8a', headerBackTitle: 'Back' }}
      />
    </Stack.Navigator>
  );
}
