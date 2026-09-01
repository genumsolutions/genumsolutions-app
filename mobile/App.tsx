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
import React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import './global.css';

import { RootNavigator } from './src/navigation/RootNavigator';
import { SignInSheet } from './src/components/SignInSheet';
import { AppProvider, useApp } from './src/context/AppContext';

function Shell() {
  const { authSheetOpen, setAuthSheetOpen } = useApp();

  return (
    <View className="flex-1 bg-surface">
      <StatusBar style="light" />
      <NavigationContainer>
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
