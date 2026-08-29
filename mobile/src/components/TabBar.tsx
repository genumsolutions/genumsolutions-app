// =====================================================================
// TabBar - bottom navigation (Home / Shop / Cart / Account) that drives the
// loaded website via AppContext.navigate(). Cart shows a live gold badge.
// =====================================================================
import { Feather } from '@expo/vector-icons';
import React from 'react';
import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';

type IconName = ComponentProps<typeof Feather>['name'];

type Tab = {
  key: string;
  label: string;
  icon: IconName;
  path: string;
  match: (path: string) => boolean;
};

const startsWith = (path: string, prefix: string) =>
  path === prefix || path.startsWith(`${prefix}/`);

const tabs: Tab[] = [
  {
    key: 'home',
    label: 'Home',
    icon: 'home',
    path: '/',
    match: (path) => path === '/' || path === '',
  },
  {
    key: 'shop',
    label: 'Shop',
    icon: 'grid',
    path: '/products',
    match: (path) => startsWith(path, '/products'),
  },
  {
    key: 'cart',
    label: 'Cart',
    icon: 'shopping-bag',
    path: '/checkout',
    match: (path) => startsWith(path, '/checkout'),
  },
  {
    key: 'account',
    label: 'Account',
    icon: 'user',
    path: '/account',
    match: (path) => startsWith(path, '/account') || startsWith(path, '/login'),
  },
];

export function TabBar() {
  const insets = useSafeAreaInsets();
  const { navigate, currentPath, cartCount, isSignedIn, setAuthSheetOpen } = useApp();

  const onPressTab = (tab: Tab) => {
    if (tab.key === 'account' && !isSignedIn) {
      setAuthSheetOpen(true);
      return;
    }
    navigate(tab.path);
  };

  return (
    <View
      style={{ paddingBottom: Math.max(insets.bottom, 6) }}
      className="border-t border-line bg-white px-2 pt-1.5"
    >
      <View className="flex-row items-center justify-around">
        {tabs.map((tab) => {
          const active = tab.match(currentPath);
          const color = active ? '#1e3a8a' : '#64748b';
          return (
            <Pressable
              key={tab.key}
              onPress={() => onPressTab(tab)}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
              className="min-w-[64px] items-center justify-center py-1"
            >
              <View>
                <Feather name={tab.icon} size={21} color={color} />
                {tab.key === 'cart' && cartCount > 0 && (
                  <View className="absolute -right-2 -top-1.5 min-w-4 items-center justify-center rounded-full bg-gold px-1">
                    <Text className="text-[9px] font-black text-ink">
                      {cartCount > 9 ? '9+' : cartCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text
                className={`mt-1 text-[10px] font-bold ${active ? 'text-navy' : 'text-muted'}`}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}