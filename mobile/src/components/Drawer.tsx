// =====================================================================
// Drawer - professional right-side slide-in navigation menu. Replaces the
// website's mobile hamburger dropdown. Sections: Shop, Company, Account
// (with Admin dashboard for admins), plus Tools & IoT and app info.
// =====================================================================
import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_VERSION } from '../config/site';
import { useApp } from '../context/AppContext';

type IconName = ComponentProps<typeof Feather>['name'];

type NavItem = {
  label: string;
  path: string;
  icon: IconName;
  match: (path: string) => boolean;
};

const startsWith = (path: string, prefix: string) =>
  path === prefix || path.startsWith(`${prefix}/`);

const matchHome = (path: string) => path === '/' || path === '';

const SHOP_ITEMS: NavItem[] = [
  { label: 'Home', path: '/', icon: 'home', match: matchHome },
  { label: 'Products', path: '/products', icon: 'grid', match: (p) => startsWith(p, '/products') },
  { label: 'Projects', path: '/projects', icon: 'layers', match: (p) => startsWith(p, '/projects') },
  { label: '3D Printing', path: '/3d-printing', icon: 'cpu', match: (p) => startsWith(p, '/3d-printing') },
];

const COMPANY_ITEMS: NavItem[] = [
  { label: 'Services', path: '/services', icon: 'briefcase', match: (p) => startsWith(p, '/services') },
  { label: 'Tools', path: '/tools', icon: 'tool', match: (p) => startsWith(p, '/tools') },
  { label: 'Journal', path: '/journal', icon: 'book-open', match: (p) => startsWith(p, '/journal') },
  { label: 'About', path: '/about', icon: 'info', match: (p) => startsWith(p, '/about') },
  { label: 'Contact', path: '/contact', icon: 'phone', match: (p) => startsWith(p, '/contact') },
];

type Props = {
  onOpenTools: () => void;
};

const PANEL_WIDTH = 300;

export function Drawer({ onOpenTools }: Props) {
  const insets = useSafeAreaInsets();
  const { drawerOpen, setDrawerOpen, navigate, signOut, currentPath, isSignedIn, isAdmin, user, setAuthSheetOpen } =
    useApp();
  const [mounted, setMounted] = useState(drawerOpen);
  const translateX = useSharedValue(PANEL_WIDTH);

  useEffect(() => {
    if (drawerOpen) {
      setMounted(true);
      translateX.value = withTiming(0, { duration: 240, easing: Easing.out(Easing.cubic) });
    } else {
      translateX.value = withTiming(PANEL_WIDTH, { duration: 200, easing: Easing.in(Easing.cubic) });
      const timer = setTimeout(() => setMounted(false), 210);
      return () => clearTimeout(timer);
    }
  }, [drawerOpen, translateX]);

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: withTiming(drawerOpen ? 1 : 0, { duration: 200 }),
  }));

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  if (!mounted) return null;

  const initials = (user?.name || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  const renderItem = (item: NavItem) => {
    const active = item.match(currentPath);
    return (
      <Pressable
        key={item.label}
        onPress={() => {
          navigate(item.path);
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        className={`flex-row items-center rounded-lg px-3 py-2.5 ${
          active ? 'bg-navy-light' : 'active:bg-mist'
        }`}
      >
        <Feather name={item.icon} size={17} color={active ? '#1e3a8a' : '#64748b'} />
        <Text className={`ml-3 text-sm font-bold ${active ? 'text-navy' : 'text-ink'}`}>
          {item.label}
        </Text>
        {active ? <View className="ml-auto h-1.5 w-1.5 rounded-full bg-navy" /> : null}
      </Pressable>
    );
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => setDrawerOpen(false)}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]} className="bg-ink/50">
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setDrawerOpen(false)}
            accessibilityLabel="Close menu"
          />
        </Animated.View>

        <Animated.View
          style={[
            panelStyle,
            {
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: PANEL_WIDTH,
            },
          ]}
          className="bg-white"
        >
          {/* Branding */}
          <View
            style={{ paddingTop: insets.top + 8 }}
            className="border-b border-line bg-navy px-4 pb-4"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Image
                  source={require('../../assets/logo.png')}
                  style={{ width: 38, height: 38, borderRadius: 19 }}
                  className="border border-white/40"
                  resizeMode="contain"
                />
                <View className="ml-2.5">
                  <Text className="font-display text-lg font-bold leading-tight text-white">
                    GENUM
                  </Text>
                  <Text className="text-[8px] font-bold uppercase tracking-[0.28em] text-navy-light">
                    Solutions Pvt.&nbsp;Ltd.
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => setDrawerOpen(false)}
                accessibilityLabel="Close menu"
                className="h-9 w-9 items-center justify-center rounded-full bg-white/10"
              >
                <Feather name="x" size={18} color="#ffffff" />
              </Pressable>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          >
            {/* Session block */}
            {isSignedIn ? (
              <View className="flex-row items-center gap-3 border-b border-line px-4 py-3">
                <View className="h-10 w-10 items-center justify-center rounded-full bg-navy">
                  <Text className="text-xs font-black text-white">{initials}</Text>
                </View>
                <View className="flex-1">
                  <Text className="truncate text-sm font-bold text-ink">{user?.name || 'Genum user'}</Text>
                  <Text className="truncate text-xs text-muted">{user?.email}</Text>
                </View>
                {isAdmin ? (
                  <View className="rounded-full bg-gold px-2 py-0.5">
                    <Text className="text-[9px] font-black uppercase text-ink">Admin</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <View className="border-b border-line px-4 py-3">
                <Pressable
                  onPress={() => {
                    setDrawerOpen(false);
                    setAuthSheetOpen(true);
                  }}
                  accessibilityRole="button"
                  className="flex-row items-center justify-center rounded-full bg-navy px-4 py-2.5"
                >
                  <Feather name="log-in" size={15} color="#ffffff" />
                  <Text className="ml-2 text-sm font-bold text-white">Sign in</Text>
                </Pressable>
              </View>
            )}

            <View className="px-2 pt-3">
              <Text className="px-3 pb-1 text-[10px] font-black uppercase tracking-widest text-border">
                Shop
              </Text>
              {SHOP_ITEMS.map(renderItem)}
            </View>

            <View className="px-2 pt-4">
              <Text className="px-3 pb-1 text-[10px] font-black uppercase tracking-widest text-border">
                Company
              </Text>
              {COMPANY_ITEMS.map(renderItem)}
            </View>

            <View className="px-2 pt-4">
              <Text className="px-3 pb-1 text-[10px] font-black uppercase tracking-widest text-border">
                Account
              </Text>
              {isSignedIn ? (
                renderItem({
                  label: 'My Account',
                  path: '/account',
                  icon: 'user',
                  match: (p) => startsWith(p, '/account'),
                })
              ) : null}
              {isAdmin
                ? renderItem({
                    label: 'Admin dashboard',
                    path: '/admin',
                    icon: 'shield',
                    match: (p) => startsWith(p, '/admin'),
                  })
                : null}
              {isSignedIn ? (
                <Pressable
                  onPress={signOut}
                  accessibilityRole="button"
                  className="flex-row items-center rounded-lg px-3 py-2.5"
                >
                  <Feather name="log-out" size={17} color="#dc2626" />
                  <Text className="ml-3 text-sm font-bold text-red-600">Sign out</Text>
                </Pressable>
              ) : null}
            </View>

            <View className="px-2 pt-4">
              <Text className="px-3 pb-1 text-[10px] font-black uppercase tracking-widest text-border">
                App
              </Text>
              <Pressable
                onPress={() => {
                  setDrawerOpen(false);
                  onOpenTools();
                }}
                accessibilityRole="button"
                className="flex-row items-center rounded-lg px-3 py-2.5"
              >
                <Feather name="zap" size={17} color="#64748b" />
                <Text className="ml-3 text-sm font-bold text-ink">Tools &amp; IoT</Text>
              </Pressable>
            </View>

            <View className="mt-5 border-t border-line px-4 pt-3">
              <Text className="text-[11px] text-muted">
                GENUM Solutions Pvt. Ltd.
              </Text>
              <Text className="mt-0.5 text-[10px] text-border">App v{APP_VERSION}</Text>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}