// =====================================================================
// BrandHeader - native top bar (logo + wordmark, cart button, account
// button). The account button mirrors the website header: signed-in users
// open the Account screen (a stack screen, /account parity), guests open
// the sign-in sheet. The Menu opens the AppMenu sheet (a native Modal with
// GLOBAL open/close state in AppContext so it can never get stuck), which
// is now triggered from the bottom bar's Menu slot.
//
// The bottom-sheet menu is intentionally lean: it does NOT repeat the top
// brand header, and it does NOT list the main tabs (Home / Shop / Cart)
// because those already live in the bottom tab bar. It carries the
// destinations that have no tab of their own, a compact account row, the
// app theme toggle, and sign-out + app update check in the footer.
// =====================================================================
import React from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useApp } from '../context/AppContext';
import { AppUpdateCard } from './AppUpdateCard';
import type { RootStackParamList } from '../navigation/types';

type RootNav = NativeStackNavigationProp<RootStackParamList, 'Main'>;
type IconName = ComponentProps<typeof Feather>['name'];

export function BrandHeader() {
  const insets = useSafeAreaInsets();
  const { cartCount, user, isSignedIn, setAuthSheetOpen, menuOpen, setMenuOpen } = useApp();
  const nav = useNavigation<RootNav>();

  const initials = (user?.name || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  return (
    <>
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

      <AppMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNavigate={(target) => {
          // Close first, then navigate on a later frame. Running navigation in
          // the same gesture as the Modal teardown used to swallow the next
          // tap; deferring lets the overlay fully dismiss before we move.
          setMenuOpen(false);
          requestAnimationFrame(target);
        }}
      />
    </>
  );
}

type MenuProps = {
  visible: boolean;
  onClose: () => void;
  onNavigate: (run: () => void) => void;
};

function AppMenu({ visible, onClose, onNavigate }: MenuProps) {
  const { user, isSignedIn, isAdmin, signOut, setAuthSheetOpen, themeMode, setThemeMode } = useApp();
  const insets = useSafeAreaInsets();
  const rootNav = useNavigation<RootNav>();

  const go = (screen: 'Services' | 'Projects' | 'Contact' | 'About' | 'Tools' | 'Journal' | 'Printing' | 'OpenTools') =>
    onNavigate(() => rootNav.push(screen));
  const initials = (user?.name || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable
          style={StyleSheet.absoluteFillObject}
          pointerEvents="auto"
          onPress={onClose}
          accessibilityLabel="Close menu"
        />
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            maxHeight: '82%',
            paddingBottom: insets.bottom + 8,
            shadowColor: '#000',
            shadowOpacity: 0.14,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: -4 },
            elevation: 16,
          }}
          className="overflow-hidden rounded-t-2xl border-t border-line bg-card"
        >
          {/* Grabber + title + close */}
          <View className="items-center pt-2.5">
            <View className="h-1 w-10 rounded-full bg-border" />
          </View>
          <View className="flex-row items-center justify-between px-4 pb-1 pt-2">
            <Text className="font-display text-lg font-bold tracking-tight text-ink">Menu</Text>
            <Pressable
              onPress={onClose}
              className="h-8 w-8 items-center justify-center rounded-full bg-mist"
              accessibilityLabel="Close menu"
            >
              <Feather name="x" size={18} color="#1e3a8a" />
            </Pressable>
          </View>

          {/* Compact account row / sign-in - tappable like the website's
              account menu (Your account). */}
          {isSignedIn ? (
            <Pressable
              onPress={() => onNavigate(() => rootNav.push('Account'))}
              className="mx-4 mt-1 flex-row items-center gap-2.5 rounded-xl bg-mist px-3 py-2.5 active:bg-sky"
            >
              <View className="h-9 w-9 items-center justify-center rounded-full bg-navy">
                <Text className="text-xs font-black text-white">{initials}</Text>
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-bold text-ink" numberOfLines={1}>{user?.name}</Text>
                <Text className="text-xs text-muted" numberOfLines={1}>{user?.email}</Text>
              </View>
              {isAdmin ? (
                <View className="rounded-full bg-gold px-2 py-0.5">
                  <Text className="text-[10px] font-black uppercase text-ink">Admin</Text>
                </View>
              ) : null}
            </Pressable>
          ) : (
            <View className="mx-4 mt-1">
              <Pressable
                onPress={() => {
                  onClose();
                  setAuthSheetOpen(true);
                }}
                className="items-center rounded-full bg-navy py-2.5"
              >
                <Text className="text-sm font-black text-white">Sign in</Text>
              </Pressable>
              <Text className="mt-1.5 text-center text-[11px] text-muted">Sign in to sync your cart & orders</Text>
            </View>
          )}

          {/* Theme toggle - moved from Account into the menu */}
          <View className="mx-4 mt-3 rounded-xl bg-mist px-3 py-2.5">
            <Text className="mb-2 text-[11px] font-black uppercase tracking-widest text-muted">App theme</Text>
            <View className="flex-row gap-2">
              {(['system', 'light', 'dark'] as const).map((mode) => (
                <Pressable
                  key={mode}
                  onPress={() => setThemeMode(mode)}
                  className={`flex-1 items-center rounded-lg border py-1.5 ${themeMode === mode ? 'border-navy bg-navy' : 'border-line bg-card'}`}
                >
                  <Text className={`text-xs font-bold capitalize ${themeMode === mode ? 'text-white' : 'text-ink'}`}>
                    {mode}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Destinations with no tab of their own */}
          <ScrollView
            className="mt-1 flex-1"
            contentContainerStyle={{ paddingBottom: 12 }}
            showsVerticalScrollIndicator={false}
          >
            <MenuGroup title="Explore">
              <MenuItem icon="briefcase" label="Services" onPress={() => go('Services')} />
              <MenuItem icon="layers" label="Projects" onPress={() => go('Projects')} />
              <MenuItem icon="book-open" label="Journal" onPress={() => go('Journal')} />
              <MenuItem icon="corner-down-left" label="3D Printing" onPress={() => go('Printing')} />
              <MenuItem icon="tool" label="Open Tools" onPress={() => go('OpenTools')} />
            </MenuGroup>

            <MenuGroup title="Company">
              <MenuItem icon="cpu" label="Tools & IoT" onPress={() => go('Tools')} />
              <MenuItem icon="info" label="About" onPress={() => go('About')} />
              <MenuItem icon="phone" label="Contact" onPress={() => go('Contact')} />
              <MenuItem icon="shield" label="Privacy Policy" onPress={() => onNavigate(() => rootNav.push('Legal', { doc: 'privacy' }))} />
              <MenuItem icon="file-text" label="Terms of Service" onPress={() => onNavigate(() => rootNav.push('Legal', { doc: 'terms' }))} />
            </MenuGroup>

            {isAdmin ? (
              <MenuGroup title="Admin">
                <MenuItem icon="settings" label="Admin Dashboard" onPress={() => onNavigate(() => rootNav.push('Admin'))} />
              </MenuGroup>
            ) : null}
          </ScrollView>

          {/* Sign out + app update + version */}
          <View className="border-t border-line px-4 pb-2 pt-1.5">
            {isSignedIn ? (
              <Pressable
                onPress={() => {
                  onClose();
                  signOut();
                }}
                className="flex-row items-center justify-center gap-1.5 py-1.5"
              >
                <Feather name="log-out" size={15} color="#dc2626" />
                <Text className="text-sm font-bold text-red-600">Sign out</Text>
              </Pressable>
            ) : null}
            <AppUpdateCard compact />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function MenuGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="pt-3">
      <Text className="px-4 pb-1 text-[11px] font-black uppercase tracking-widest text-border">
        {title}
      </Text>
      {children}
    </View>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="mx-4 flex-row items-center rounded-lg px-2 py-2.5 active:bg-mist"
    >
      <Feather name={icon} size={16} color="#64748b" />
      <Text className="ml-3 text-sm font-semibold text-ink">{label}</Text>
    </Pressable>
  );
}