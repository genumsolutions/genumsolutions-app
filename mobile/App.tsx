// =====================================================================
// App - the GENUM Solutions mobile app mirrors the website in a full-screen
// WebView (see src/screens/SiteScreen.tsx) and adds a native "Tools & IoT"
// panel on top for Bluetooth / IoT device control.
// =====================================================================
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import './global.css';

import { SiteScreen } from './src/screens/SiteScreen';
import { ToolsScreen } from './src/screens/ToolsScreen';

function FloatingToolsButton({ onPress }: { onPress: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="Open Tools & IoT panel"
      style={{
        position: 'absolute',
        right: 16,
        bottom: insets.bottom + 16,
        zIndex: 10,
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
      }}
      className="h-14 w-14 items-center justify-center rounded-full bg-navy"
    >
      <Text className="text-sm font-bold text-white">IoT</Text>
    </Pressable>
  );
}

export default function App() {
  const [toolsOpen, setToolsOpen] = useState(false);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SiteScreen />
      <FloatingToolsButton onPress={() => setToolsOpen(true)} />
      <ToolsScreen visible={toolsOpen} onClose={() => setToolsOpen(false)} />
    </SafeAreaProvider>
  );
}