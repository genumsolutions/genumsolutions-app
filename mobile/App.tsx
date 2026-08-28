import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, Text, View } from 'react-native';
import './global.css';

import { HomeScreen } from './src/screens/HomeScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { OfflineAuditScreen } from './src/screens/OfflineAuditScreen';
import { ProductEditScreen } from './src/screens/ProductEditScreen';
import { RobotCarControlScreen } from './src/screens/RobotCarControlScreen';
import { SyncService } from './src/services/SyncService';

type Route = 'home' | 'auth' | 'offlineAudit' | 'productEdit' | 'robotCar';

// Minimal state-based navigation scaffold (no external router yet).
// TODO: replace with React Navigation / expo-router when adding deep links.
export default function App() {
  const [route, setRoute] = useState<Route>('home');

  useEffect(() => {
    const unsubscribe = SyncService.startSyncListener();
    return () => unsubscribe();
  }, []);

  const navigate = (screen: string) => {
    setRoute(screen as Route);
  };

  return (
    <SafeAreaView className="flex-1 bg-mist">
      <StatusBar style="light" />
      {route === 'home' && <HomeScreen onNavigate={navigate} />}
      {route === 'auth' && <AuthScreen />}
      {route === 'offlineAudit' && <OfflineAuditScreen />}
      {route === 'productEdit' && <ProductEditScreen />}
      {route === 'robotCar' && <RobotCarControlScreen />}
      {route !== 'home' && (
        <View className="border-t border-line bg-surface px-5 py-3">
          <Pressable onPress={() => navigate('home')}>
            <Text className="font-bold text-navy">← Back to Home</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
