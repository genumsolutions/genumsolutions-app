// =====================================================================
// App - the GENUM Solutions mobile app mirrors the website in a full-screen
// WebView (see src/screens/SiteScreen.tsx). Branding only lives at the
// native shell level (app.json); all UI comes from the site itself.
// =====================================================================
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import './global.css';

import { SiteScreen } from './src/screens/SiteScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SiteScreen />
    </SafeAreaProvider>
  );
}