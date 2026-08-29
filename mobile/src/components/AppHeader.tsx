// =====================================================================
// AppHeader - native top bar with the company logo + wordmark, a cart
// button (with live badge) and the drawer toggle. Sits flush under the
// status bar (no dead space) and replaces the website's own header, which
// is hidden by the injected CSS.
// =====================================================================
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';

export function AppHeader() {
  const insets = useSafeAreaInsets();
  const { cartCount, navigate, setDrawerOpen } = useApp();

  return (
    <View style={{ paddingTop: insets.top }} className="bg-navy">
      <View className="flex-row items-center justify-between px-3 pb-2.5 pt-1.5">
        <Pressable
          onPress={() => navigate('/')}
          accessibilityRole="button"
          accessibilityLabel="GENUM Solutions home"
          className="flex-row items-center"
        >
          <Image
            source={require('../../assets/logo.png')}
            style={{ width: 36, height: 36, borderRadius: 18 }}
            className="border border-white/40"
            resizeMode="contain"
          />
          <View className="ml-2">
            <Text className="font-display text-lg font-bold leading-tight text-white">
              GENUM
            </Text>
            <Text className="text-[8px] font-bold uppercase tracking-[0.28em] text-navy-light">
              Solutions Pvt.&nbsp;Ltd.
            </Text>
          </View>
        </Pressable>

        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => navigate('/checkout')}
            accessibilityRole="button"
            accessibilityLabel={cartCount > 0 ? `Open checkout, ${cartCount} items` : 'Open checkout'}
            className="relative h-10 w-10 items-center justify-center rounded-full bg-white/10"
          >
            <Feather name="shopping-bag" size={18} color="#ffffff" />
            {cartCount > 0 && (
              <View className="absolute -right-0.5 -top-0.5 min-w-[18px] items-center justify-center rounded-full bg-gold px-1">
                <Text className="text-[10px] font-black text-ink">
                  {cartCount > 99 ? '99+' : cartCount}
                </Text>
              </View>
            )}
          </Pressable>
          <Pressable
            onPress={() => setDrawerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
            className="h-10 w-10 items-center justify-center rounded-full bg-white/10"
          >
            <Feather name="menu" size={20} color="#ffffff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}