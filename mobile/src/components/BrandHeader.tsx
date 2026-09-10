// =====================================================================
// BrandHeader - native top bar (logo + wordmark, cart button, account
// button). The account button mirrors the website header: signed-in users
// open the Account screen (a stack screen, /account parity), guests open
// the sign-in sheet. The Menu destinations live on the Menu tab (a pager
// page in the bottom bar), so nothing here needs a modal overlay.
// =====================================================================
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AccountSheet } from '../components/AccountSheet';
import { useApp } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/types';

type RootNav = NativeStackNavigationProp<RootStackParamList, 'Main'>;

export function BrandHeader() {
  const insets = useSafeAreaInsets();
  const {
    cartCount,
    user,
    isSignedIn,
    setAuthSheetOpen,
    accountSheetOpen,
    setAccountSheetOpen,
    updatePill,
    setUpdatePill,
    appUpdated,
    setAppUpdated,
  } = useApp();
  const nav = useNavigation<RootNav>();

  const initials = (user?.name || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  return (
    <View style={{ paddingTop: insets.top }} className="bg-navy">
      <View className="flex-row items-center justify-between px-3 pb-2.5 pt-1.5">
        <Pressable
          onPress={() => nav.navigate('Main', { screen: 'Home' })}
          accessibilityRole="button"
          accessibilityLabel="GENUM Solutions home"
          className="flex-row items-center"
        >
          <Image
            source={require('../../assets/logo.png')}
            style={{ width: 34, height: 34, borderRadius: 17 }}
            className="border border-white/40"
            resizeMode="contain"
          />
          <View className="ml-2">
            <Text className="font-display text-lg font-bold leading-tight tracking-tight text-white">
              GENUM
            </Text>
            <Text className="text-xs font-bold uppercase tracking-widest text-navy-light">
              Solutions Pvt. Ltd.
            </Text>
          </View>
        </Pressable>

        <View className="flex-row items-center gap-2">
          {/* Update pill — a NEWER APK is published; tap to install. */}
          {updatePill && (
            <Pressable
              onPress={() => nav.navigate('Update')}
              accessibilityRole="button"
              accessibilityLabel={`Update available, version ${updatePill.version}`}
              className="h-10 flex-row items-center gap-1.5 rounded-full border border-gold/70 bg-gold/20 px-3"
            >
              <Feather name="download-cloud" size={14} color="#fbbf24" />
              <Text className="text-xs font-black text-gold">v{updatePill.version}</Text>
            </Pressable>
          )}
          {/* Account - mirrors the website header: signed-in opens the
              Account screen, signed-out opens the sign-in sheet. */}
<Pressable
              onPress={() => {
                if (isSignedIn) setAccountSheetOpen(true);
                else setAuthSheetOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={isSignedIn ? 'Open account' : 'Sign in'}
              className="h-10 w-10 items-center justify-center rounded-full bg-white/10"
            >
            {isSignedIn ? (
              <Text className="text-xs font-black text-white">{initials}</Text>
            ) : (
              <Feather name="user" size={18} color="#ffffff" />
            )}
          </Pressable>
          <AccountSheet
            visible={accountSheetOpen}
            onRequestClose={() => setAccountSheetOpen(false)}
          />
          <Pressable
            onPress={() => nav.navigate('Main', { screen: 'Cart' })}
            accessibilityRole="button"
            accessibilityLabel={cartCount > 0 ? `Open cart, ${cartCount} items` : 'Open cart'}
            className="relative h-10 w-10 items-center justify-center rounded-full bg-white/10"
          >
            <Feather name="shopping-bag" size={18} color="#ffffff" />
            {cartCount > 0 && (
              <View className="absolute -right-0.5 -top-0.5 min-w-[18px] items-center justify-center rounded-full bg-gold px-1">
                <Text className="text-xs font-black text-ink">
                  {cartCount > 99 ? '99+' : cartCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {/* OTA was fetched on launch — offer to reload instead of waiting. */}
      {appUpdated && (
        <View className="flex-row items-center gap-2 border-t border-white/10 bg-gold/10 px-3 py-2">
          <Feather name="check-circle" size={15} color="#fbbf24" />
           <Text numberOfLines={1} className="min-w-0 flex-1 text-xs font-bold text-white">
            Update applied — reload to see the new version.
          </Text>
          <Pressable
            onPress={() => {
              setAppUpdated(false);
              void Updates.reloadAsync();
            }}
            accessibilityRole="button"
            className="rounded-full bg-gold px-3 py-1.5"
          >
            <Text className="text-xs font-black text-ink">Reload</Text>
          </Pressable>
          <Pressable onPress={() => setAppUpdated(false)} accessibilityLabel="Dismiss update banner">
            <Feather name="x" size={16} color="#ffffff" />
          </Pressable>
        </View>
      )}
    </View>
  );
}