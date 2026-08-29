// =====================================================================
// App - the GENUM Solutions mobile app.
//
// The app is a hybrid native shell around the company website loaded in a
// WebView (see src/screens/SiteScreen.tsx):
//   - AppHeader    (native top bar: logo, cart badge, menu toggle)
//   - SiteScreen   (the website, restyled to feel like an app)
//   - CartBar      (persistent checkout focus whenever the cart is non-empty)
//   - TabBar       (Home / Shop / Cart / Account)
//   - Drawer       (right-side navigation menu)
//   - ToolsScreen  (native Tools & IoT panel)
// =====================================================================
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import './global.css';

import { AppHeader } from './src/components/AppHeader';
import { CartBar } from './src/components/CartBar';
import { Drawer } from './src/components/Drawer';
import { SignInSheet } from './src/components/SignInSheet';
import { TabBar } from './src/components/TabBar';
import { AppProvider, useApp } from './src/context/AppContext';
import { SiteScreen } from './src/screens/SiteScreen';
import { ToolsScreen } from './src/screens/ToolsScreen';

function Shell() {
  const [toolsOpen, setToolsOpen] = useState(false);
  const { authSheetOpen, setAuthSheetOpen } = useApp();

  return (
    <View className="flex-1 bg-surface">
      <StatusBar style="light" />
      <AppHeader />
      <View className="flex-1">
        <SiteScreen />
      </View>
      <CartBar />
      <TabBar />
      <Drawer onOpenTools={() => setToolsOpen(true)} />
      <SignInSheet
        visible={authSheetOpen}
        onRequestClose={() => setAuthSheetOpen(false)}
      />
      <ToolsScreen visible={toolsOpen} onClose={() => setToolsOpen(false)} />
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