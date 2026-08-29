// =====================================================================
// SiteScreen - full-screen WebView mirror of the GENUM Solutions website.
//
// The app is an exact copy of the live site rendered on mobile: every page
// (store, cart, checkout, account, admin) works identically because the
// WebView loads the website itself.
//
// Included behavior:
//   - branded loading overlay while pages load
//   - Android hardware back -> browser back (when available)
//   - offline / load-failure fallback with Retry (NetInfo driven)
//   - popup windows (payment gateways / OAuth) rendered in an in-app modal
// =====================================================================
import NetInfo from '@react-native-community/netinfo';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { WEBSITE_URL } from '../config/site';

export function SiteScreen() {
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [popupUrl, setPopupUrl] = useState<string | null>(null);
  const canGoBackRef = useRef(false);

  // Track connectivity so we can show a proper "offline" state and
  // auto-reload the moment the connection comes back.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOffline(state.isConnected === false);
    });
    return () => unsubscribe();
  }, []);

  // Android hardware back navigates the WebView history before exiting.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBackRef.current) {
        webRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, []);

  const handleNavigation = useCallback((state: WebViewNavigation) => {
    canGoBackRef.current = state.canGoBack;
  }, []);

  const reload = useCallback(() => {
    setLoadFailed(false);
    webRef.current?.reload();
  }, []);

  // Auto-reload the failed page once connectivity returns.
  useEffect(() => {
    if (!offline && loadFailed) {
      reload();
    }
  }, [offline, loadFailed, reload]);

  const showFallback = offline || loadFailed;

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <WebView
        ref={webRef}
        source={{ uri: WEBSITE_URL }}
        style={{ flex: 1 }}
        originWhitelist={['http://*', 'https://*']}
        allowsBackForwardNavigationGestures
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={handleNavigation}
        onError={() => setLoadFailed(true)}
        onOpenWindow={(event) => setPopupUrl(event.nativeEvent.targetUrl)}
      />

      {loading && !showFallback ? (
        <View className="absolute inset-0 items-center justify-center bg-surface">
          <ActivityIndicator size="large" color="#1e3a8a" />
          <Text className="mt-3 text-sm font-semibold text-navy">
            Loading GENUM Solutions…
          </Text>
        </View>
      ) : null}

      {showFallback ? (
        <View className="absolute inset-0 items-center justify-center bg-surface px-8">
          <Text className="text-center text-xl font-bold text-ink">
            {offline ? "You're offline" : 'Something went wrong'}
          </Text>
          <Text className="mt-2 text-center text-sm text-muted">
            {offline
              ? 'Connect to the internet, then try again.'
              : 'We could not reach the site. Please try again.'}
          </Text>
          <Pressable
            onPress={reload}
            className="mt-6 items-center rounded-full bg-navy px-8 py-3"
          >
            <Text className="font-bold text-white">Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Popup windows (eSewa/Khalti payment, OAuth) open here in-app */}
      <Modal
        visible={popupUrl !== null}
        animationType="slide"
        onRequestClose={() => setPopupUrl(null)}
      >
        <SafeAreaView className="flex-1 bg-surface">
          <View className="flex-row items-center justify-between border-b border-line bg-mist px-4 py-3">
            <Text className="text-sm font-bold text-navy">Payment / Sign-in</Text>
            <Pressable onPress={() => setPopupUrl(null)}>
              <Text className="font-bold text-ink">✕ Close</Text>
            </Pressable>
          </View>
          {popupUrl ? (
            <WebView
              source={{ uri: popupUrl }}
              style={{ flex: 1 }}
              originWhitelist={['http://*', 'https://*']}
              onNavigationStateChange={(state) => {
                // Auto-close once the gateway redirects back to the site.
                if (state.url.startsWith(WEBSITE_URL)) {
                  setPopupUrl(null);
                }
              }}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}