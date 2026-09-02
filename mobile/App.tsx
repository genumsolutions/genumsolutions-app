// =====================================================================
// App - the GENUM Solutions mobile app.
//
// The app is fully NATIVE with its own UI/UX. It reads and writes the SAME
// Supabase database as the website (products, services, projects, orders,
// carts, profiles) - it does NOT load pages from the website. There is no
// WebView.
//
//   NavigationContainer -> RootNavigator (tabs + stack)
//   AppProvider          native auth + cart state
//   SignInSheet          global sign-in / sign-up / reset overlay
// =====================================================================
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import './global.css';

import { RootNavigator } from './src/navigation/RootNavigator';
import { SignInSheet } from './src/components/SignInSheet';
import { AppProvider, useApp } from './src/context/AppContext';
import { navigationRef, navigate } from './src/navigation/navigationRef';
import { clearCart } from './src/services/cartService';

/** Parse a return link like genumsolutions://checkout/success?provider=esewa&order=...&paid=1 */
function handleDeepLink(url: string) {
  const { hostname, path, queryParams } = Linking.parse(url);
  const params = queryParams || {};

  if (hostname !== 'checkout') return;

  const sub = path?.replace(/\/+$/, '') || '/';

  if (sub === '/success') {
    // The order was already marked paid server-side by the edge function; drop
    // the local cart too (covers app-cold-start returns after payment).
    void clearCart();
    navigate('OrderSuccess', {
      orderId: typeof params.order === 'string' ? params.order : undefined,
      provider: typeof params.provider === 'string' ? params.provider : undefined,
      paid: params.paid === '1',
    });
    return;
  }

  // cancelled / not-paid / amount-mismatch / no-order -> let the user retry.
  navigate('Checkout', {
    provider: (typeof params.provider === 'string' ? params.provider : undefined) as
      | 'cod'
      | 'esewa'
      | 'khalti'
      | undefined,
    status: typeof params.status === 'string' ? params.status : undefined,
  });
}

function Shell() {
  const { authSheetOpen, setAuthSheetOpen } = useApp();

  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, []);

  return (
    <View className="flex-1 bg-surface">
      <StatusBar style="light" />
      <NavigationContainer ref={navigationRef}>
        <RootNavigator />
      </NavigationContainer>
      <SignInSheet visible={authSheetOpen} onRequestClose={() => setAuthSheetOpen(false)} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Shell />
      </AppProvider>
    </SafeAreaProvider>
  );
}
