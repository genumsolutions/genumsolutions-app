// =====================================================================
// BrandHeader - native top bar (logo + wordmark, cart button, menu toggle).
// The menu opens the AppMenu navigation sheet. The menu is a native Modal
// overlay with GLOBAL open/close state (AppContext) so it can never get
// stuck open or block the next touch: global actions (navigation, deep
// links, sign-in/out) can always close it, and a hidden Modal is fully
// inert.
// =====================================================================
import React from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useApp } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/types';

type RootNav = NativeStackNavigationProp<RootStackParamList, 'Main'>;
type IconName = ComponentProps<typeof Feather>['name'];

export function BrandHeader() {
  const insets = useSafeAreaInsets();
  const { cartCount, menuOpen, setMenuOpen } = useApp();
  const nav = useNavigation<RootNav>();

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
            <Pressable
              onPress={() => setMenuOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Open menu"
              className="h-10 w-10 items-center justify-center rounded-full bg-white/10"
            >
              <Feather name="menu" size={20} color="#ffffff" />
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
  const { user, isSignedIn, isAdmin, signOut, setAuthSheetOpen } = useApp();
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable
          style={StyleSheet.absoluteFillObject}
          pointerEvents="auto"
          onPress={onClose}
          accessibilityLabel="Close menu"
        />
        <View
          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 280, paddingTop: insets.top, paddingBottom: insets.bottom }}
          className="border-l border-line bg-card shadow-lg"
        >
          <View className="border-b border-line bg-navy px-4 py-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-sans text-base font-bold text-white">Menu</Text>
              <Pressable onPress={onClose} className="h-8 w-8 items-center justify-center rounded-full bg-white/10" accessibilityLabel="Close">
                <Feather name="x" size={16} color="#ffffff" />
              </Pressable>
            </View>
          </View>

          {isSignedIn ? (
            <View className="flex-row items-center gap-2 border-b border-line px-4 py-2.5">
              <View className="h-8 w-8 items-center justify-center rounded-full bg-navy">
                <Text className="text-xs font-black text-white">{initials}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-xs font-bold text-ink">{user?.name}</Text>
                <Text className="text-xs text-muted">{user?.email}</Text>
              </View>
              {isAdmin ? (
                <View className="rounded-full bg-gold px-2 py-0.5">
                  <Text className="text-xs font-black uppercase text-ink">Admin</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View className="border-b border-line px-4 py-2.5">
              <Pressable
                onPress={() => {
                  onClose();
                  setAuthSheetOpen(true);
                }}
                className="items-center rounded-full bg-navy py-2"
              >
                <Text className="text-sm font-bold text-white">Sign in</Text>
              </Pressable>
            </View>
          )}

          <MenuGroup title="Shop">
            <MenuItem icon="home" label="Home" onPress={() => onNavigate(() => rootNav.navigate('Main', { screen: 'Home' }))} />
            <MenuItem icon="grid" label="Products" onPress={() => onNavigate(() => rootNav.navigate('Main', { screen: 'Shop' }))} />
            <MenuItem icon="shopping-bag" label="Cart" onPress={() => onNavigate(() => rootNav.navigate('Main', { screen: 'Cart' }))} />
            <MenuItem icon="layers" label="Projects" onPress={() => go('Projects')} />
          </MenuGroup>

          <MenuGroup title="Company">
            <MenuItem icon="briefcase" label="Services" onPress={() => go('Services')} />
            <MenuItem icon="tool" label="Tools & IoT" onPress={() => go('Tools')} />
            <MenuItem icon="info" label="About" onPress={() => go('About')} />
            <MenuItem icon="phone" label="Contact" onPress={() => go('Contact')} />
          </MenuGroup>

          <MenuGroup title="More">
            <MenuItem icon="book-open" label="Journal" onPress={() => go('Journal')} />
            <MenuItem icon="corner-down-left" label="3D Printing" onPress={() => go('Printing')} />
            <MenuItem icon="tool" label="Open Tools" onPress={() => go('OpenTools')} />
          </MenuGroup>

          <MenuGroup title="Account">
            {isSignedIn ? <MenuItem icon="user" label="My Account" onPress={() => onNavigate(() => rootNav.navigate('Main', { screen: 'Account' }))} /> : null}
            {isSignedIn ? (
              <Pressable
                onPress={() => {
                  onClose();
                  signOut();
                }}
                className="flex-row items-center px-4 py-2.5"
              >
                <Feather name="log-out" size={16} color="#dc2626" />
                <Text className="ml-2.5 text-sm font-bold text-red-600">Sign out</Text>
              </Pressable>
            ) : null}
          </MenuGroup>
        </View>
      </View>
    </Modal>
  );
}

function MenuGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="py-2">
      <Text className="px-4 pb-1 text-xs font-black uppercase tracking-widest text-border">
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
    <Pressable onPress={onPress} className="flex-row items-center rounded-lg px-4 py-2.5 active:bg-mist">
      <Feather name={icon} size={16} color="#64748b" />
      <Text className="ml-2.5 text-sm font-bold text-ink">{label}</Text>
    </Pressable>
  );
}
