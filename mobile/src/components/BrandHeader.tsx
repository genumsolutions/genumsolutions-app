// =====================================================================
// BrandHeader - native top bar (logo + wordmark, cart button, account
// button). The account button mirrors the website header: signed-in users
// open the Account screen (a stack screen, /account parity), guests open
// the sign-in sheet. The Menu destinations live on the Menu tab (a pager
// page in the bottom bar), so nothing here needs a modal overlay.
// =====================================================================
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/types';

type RootNav = NativeStackNavigationProp<RootStackParamList, 'Main'>;

export function BrandHeader() {
  const insets = useSafeAreaInsets();
  const { cartCount, user, isSignedIn, setAuthSheetOpen } = useApp();
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
          {/* Account - mirrors the website header: signed-in opens the
              Account screen, signed-out opens the sign-in sheet. */}
          <Pressable
            onPress={() => {
              if (isSignedIn) nav.push('Account');
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
    </View>
  );
}