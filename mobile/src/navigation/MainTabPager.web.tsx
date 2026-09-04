// =====================================================================
// MainTabPager (web) - browser variant of the swipeable pager.
//
// react-native-pager-view is native-only, so on web we render the same
// three tab pages (Home / Shop / Cart) with all screens kept MOUNTED
// (inactive ones hidden with display:none) to preserve per-tab state
// exactly like the native pager. Account lives in the top bar (website
// parity) and the Menu button (4th slot) opens the AppMenu sheet. The
// tab bar, param-sync and focus re-sync logic mirror MainTabPager.tsx.
// =====================================================================
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useApp } from '../context/AppContext';
import { BrandHeader } from '../components/BrandHeader';
import type { MainTabParamList, RootStackParamList } from './types';

type TabKey = keyof MainTabParamList;

const TAB_ORDER: TabKey[] = ['Home', 'Shop', 'Cart'];

type IconName = ComponentProps<typeof Feather>['name'];
const TAB_ICONS: Record<TabKey, IconName> = {
  Home: 'home',
  Shop: 'grid',
  Cart: 'shopping-bag',
};

type Nav = NativeStackNavigationProp<RootStackParamList, 'Main'>;
type MainRoute = RouteProp<RootStackParamList, 'Main'>;

type MainTabPagerProps = {
  screens: { [K in TabKey]: React.ComponentType };
};

export function MainTabPager({ screens }: MainTabPagerProps) {
  const navigation = useNavigation<Nav>();
  const route = useRoute<MainRoute>();
  const insets = useSafeAreaInsets();
  const { cartCount, setMenuOpen } = useApp();
  const [page, setPage] = useState<TabKey>(() => initialTab(route.params?.screen));

  // Derive the page from the `screen` param so external tab switches land.
  const syncToParam = useCallback(() => {
    const target = TAB_ORDER.indexOf(initialTab(route.params?.screen));
    if (target < 0) return;
    setPage(TAB_ORDER[target]);
  }, [route.params?.screen]);

  useEffect(() => {
    syncToParam();
  }, [syncToParam]);

  // Re-sync whenever Main regains focus and close the global menu so it can
  // never stay "stuck" (mirrors the native pager behavior).
  useFocusEffect(
    useCallback(() => {
      setMenuOpen(false);
      syncToParam();
    }, [setMenuOpen, syncToParam]),
  );

  const goToTab = useCallback(
    (key: TabKey) => {
      setPage(key);
      if (route.params?.screen !== key) {
        (navigation.setParams as (p: { screen?: TabKey }) => void)({ screen: key });
      }
    },
    [navigation, route.params?.screen],
  );

  return (
    <View className="flex-1 bg-white">
      <BrandHeader />
      {TAB_ORDER.map((key) => {
        const Screen = screens[key];
        return (
          <View key={key} className="flex-1 bg-white" style={key === page ? undefined : { display: 'none' }}>
            <Screen />
          </View>
        );
      })}

      <View
        style={{ paddingBottom: insets.bottom }}
        className="flex-row items-center border-t border-line bg-white"
      >
        {TAB_ORDER.map((key) => {
          const active = key === page;
          const color = active ? '#1e3a8a' : '#64748b';
          return (
            <Pressable
              key={key}
              onPress={() => goToTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={key}
              className="flex-1 items-center justify-center pb-2 pt-2.5"
            >
              <View className="relative">
                <Feather name={TAB_ICONS[key]} size={22} color={color} />
                {key === 'Cart' && cartCount > 0 && (
                  <View className="absolute -right-2 -top-1.5 min-w-[16px] items-center justify-center rounded-full bg-gold px-1">
                    <Text className="text-[10px] font-black text-ink">
                      {cartCount > 99 ? '99+' : cartCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text className={`mt-1 text-[10px] font-bold ${active ? 'text-navy' : 'text-slate-500'}`}>
                {key}
              </Text>
            </Pressable>
          );
        })}
        {/* Menu opens the AppMenu sheet - it is an action, not a swipe page. */}
        <Pressable
          onPress={() => setMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          className="flex-1 items-center justify-center pb-2 pt-2.5"
        >
          <Feather name="menu" size={22} color="#64748b" />
          <Text className="mt-1 text-[10px] font-bold text-slate-500">Menu</Text>
        </Pressable>
      </View>
    </View>
  );
}

function initialTab(screen: TabKey | undefined): TabKey {
  return screen && TAB_ORDER.includes(screen) ? screen : 'Home';
}