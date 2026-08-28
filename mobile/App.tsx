import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, Text, View } from 'react-native';
import './global.css';

import { HomeScreen } from './src/screens/HomeScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { OfflineAuditScreen } from './src/screens/OfflineAuditScreen';
import { ProductEditScreen } from './src/screens/ProductEditScreen';
import { RobotCarControlScreen } from './src/screens/RobotCarControlScreen';
import { SyncService } from './src/services/SyncService';
import { AuthService } from './src/services/AuthService';

type Route = 'home' | 'auth' | 'offlineAudit' | 'productEdit' | 'robotCar';

// Minimal state-based navigation scaffold (no external router yet).
// TODO: replace with React Navigation / expo-router when adding deep links.
export default function App() {
  const [route, setRoute] = useState<Route>('auth');
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    // Restore any saved session, then flip authed if a user exists.
    (async () => {
      await AuthService.restoreSession();
      const email = await AuthService.getUserEmail();
      setAuthed(email !== null);
      setRoute(email ? 'home' : 'auth');
    })();
  }, []);

  useEffect(() => {
    const unsubscribe = SyncService.startSyncListener();
    return () => unsubscribe();
  }, []);

  const handleAuthed = () => {
    setAuthed(true);
    setRoute('home');
  };

  const handleSignedOut = () => {
    setAuthed(false);
    setRoute('auth');
  };

  const buildRoute = (screen: string) => setRoute(screen as Route);

  if (authed === null) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-mist">
        <ActivityIndicator size="large" color="#1e3a8a" />
        <Text className="mt-3 text-muted">Restoring session…</Text>
      </SafeAreaView>
    );
  }

  if (!authed) {
    return (
      <SafeAreaView className="flex-1 bg-mist">
        <StatusBar style="dark" />
        <AuthScreen onAuthed={handleAuthed} onSignedOut={handleSignedOut} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-mist">
      <StatusBar style="light" />
      {route === 'home' && <HomeScreen onNavigate={buildRoute} />}
      {route === 'auth' && (
        <AuthScreen onAuthed={handleAuthed} onSignedOut={handleSignedOut} />
      )}
      {route === 'offlineAudit' && <OfflineAuditScreen />}
      {route === 'productEdit' && <ProductEditScreen />}
      {route === 'robotCar' && <RobotCarControlScreen />}
      {route !== 'home' && (
        <View className="border-t border-line bg-surface px-5 py-3">
          <Pressable onPress={() => buildRoute('home')}>
            <Text className="font-bold text-navy">← Back to Home</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
