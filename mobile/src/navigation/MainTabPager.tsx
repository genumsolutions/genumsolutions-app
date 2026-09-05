// =====================================================================
// MainTabPager - the main tab area as a horizontal swipeable pager.
//
// Home / Shop / Cart / Menu live as pages of a react-native-pager-view so
// the user can swipe between them; Account lives in the top bar (website
// parity). The Menu page is a normal tab - it renders in the same space
// between the brand header and the bottom tab bar like the other three. The
// pager is
// kept in sync with the active tab that lives on the `Main` route's `screen`
// param:
//   - a swipe  -> onPageSelected -> navigation.setParams({ screen })
//   - a tab tap / navigate('Main', { screen }) -> params change ->
//     useEffect -> pagerRef.setPage(index)
//
// This keeps every external tab-switch call site (`navigate('Main', { screen:
// 'X' })`) working unchanged while the content itself swipes horizontally.
// Per-screen state is preserved because pager-view keeps all pages mounted.
// The custom bottom tab bar is rendered here (not by a tab navigator), so the
// tab strip and page content can never fight for vertical space.
//
// Android back is handled here too: a single back press from any non-Home tab
// goes Home (exactly one step), and once on Home the OS default runs (exit the
// app / pop a screen beneath Main). This is the standard bottom-nav behavior
// for a multi-stage app - it never jumps more than one step per press.
// =====================================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PagerView from 'react-native-pager-view';
import type { PagerViewOnPageSelectedEvent } from 'react-native-pager-view';
import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useApp } from '../context/AppContext';
import { BrandHeader } from '../components/BrandHeader';
import type { MainTabParamList, RootStackParamList } from './types';

type TabKey = keyof MainTabParamList;

const TAB_ORDER: TabKey[] = ['Home', 'Shop', 'Cart', 'Menu'];

type IconName = ComponentProps<typeof Feather>['name'];
const TAB_ICONS: Record<TabKey, IconName> = {
  Home: 'home',
  Shop: 'grid',
  Cart: 'shopping-bag',
  Menu: 'menu',
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
  const { cartCount } = useApp();
  const pagerRef = useRef<PagerView>(null);
  const currentPageRef = useRef<number>(0);
  const [page, setPage] = useState<TabKey>(() => initialTab(route.params?.screen));

  const initialIndex = useRef<number>(TAB_ORDER.indexOf(initialTab(route.params?.screen)));

  // Derive the page from the `screen` param so external tab switches land.
  const syncToParam = useCallback(() => {
    const target = TAB_ORDER.indexOf(initialTab(route.params?.screen));
    if (target < 0 || target === currentPageRef.current) return;
    currentPageRef.current = target;
    setPage(TAB_ORDER[target]);
    pagerRef.current?.setPage(target);
  }, [route.params?.screen]);

  useEffect(() => {
    syncToParam();
  }, [syncToParam]);

  const onPageSelected = useCallback(
    (event: PagerViewOnPageSelectedEvent) => {
      const index = event.nativeEvent.position;
      currentPageRef.current = index;
      const key = TAB_ORDER[index];
      setPage(key);
      if (route.params?.screen !== key) {
        (navigation.setParams as (p: { screen?: TabKey }) => void)({ screen: key });
      }
    },
    [navigation, route.params?.screen],
  );

  const goToTab = useCallback((key: TabKey) => {
    const index = TAB_ORDER.indexOf(key);
    if (index < 0 || index === currentPageRef.current) return;
    currentPageRef.current = index;
    setPage(key);
    pagerRef.current?.setPage(index);
    if (route.params?.screen !== key) {
      (navigation.setParams as (p: { screen?: TabKey }) => void)({ screen: key });
    }
  }, [navigation, route.params?.screen]);

  // Re-sync whenever Main regains focus (e.g. after a pushed screen like Admin
  // pops back). The param may not have changed, so the effect above won't run;
  // this guarantees the pager lands on the tab the user left, not a drifted /
  // initial one.
  useFocusEffect(
    useCallback(() => {
      const index = TAB_ORDER.indexOf(initialTab(route.params?.screen));
      if (index >= 0 && index !== currentPageRef.current) {
        currentPageRef.current = index;
        setPage(TAB_ORDER[index]);
        pagerRef.current?.setPage(index);
      }

      // Android back while inside the tabs: a SINGLE back press from any
      // non-Home tab goes Home (one step), and once on Home the OS handles
      // it (exit app / pop a screen beneath Main). This is the standard
      // bottom-nav behavior for a multi-stage app - never more than one
      // step per press.
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        const current = TAB_ORDER[currentPageRef.current];
        if (current !== 'Home') {
          goToTab('Home');
          return true; // consumed - exactly one step back
        }
        return false; // on Home -> default (exit app / pop stack)
      });
      return () => sub.remove();
    }, [route.params?.screen, goToTab]),
  );

  return (
    <View className="flex-1 bg-white">
      <BrandHeader />
      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={initialIndex.current}
        onPageSelected={onPageSelected}
        offscreenPageLimit={1}
      >
        {TAB_ORDER.map((key) => {
          const Screen = screens[key];
          return (
            <View key={key} className="flex-1 bg-white">
              <Screen />
            </View>
          );
        })}
      </PagerView>

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
      </View>
    </View>
  );
}

function initialTab(screen: TabKey | undefined): TabKey {
  return screen && TAB_ORDER.includes(screen) ? screen : 'Home';
}