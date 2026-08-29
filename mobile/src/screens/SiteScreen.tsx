// =====================================================================
// SiteScreen - full-screen WebView mirror of the GENUM Solutions website.
//
// The app is an exact copy of the live site rendered on mobile: every page
// (store, cart, checkout, account, admin) works identically because the
// WebView loads the website itself.
//
// Loading / reliability behavior:
//   - branded splash only on the very first load (with a fail-safe timeout)
//   - a thin progress bar for every subsequent in-app navigation, so pages
//     are never hidden behind a blocking spinner
//   - Android hardware back -> browser back (when available)
//   - offline / load-failure fallback with Retry, "Open cached site" and
//     "Offline help" (NetInfo driven + service-worker cached shell)
//   - popup windows (payment gateways / OAuth) rendered in an in-app modal
//   - cookies + DOM storage enabled so the login session persists
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
import {
  WebView,
  type WebViewNavigation,
} from 'react-native-webview';
import { WEBSITE_URL } from '../config/site';

// If a navigation event pair is ever missed (common with client-side routing
// in the Next.js App Router), stop showing the initial splash after this long
// so the already-rendered page is never stuck behind the overlay.
const INITIAL_LOAD_TIMEOUT_MS = 5000;

export function SiteScreen() {
  const webRef = useRef<WebView>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [progress, setProgress] = useState(0);
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

  // Fail-safe: never let the initial splash block the page forever.
  useEffect(() => {
    if (!isInitialLoad) return;
    const timer = setTimeout(() => setIsInitialLoad(false), INITIAL_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isInitialLoad]);

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

  // Navigate the WebView to a site path. Works for both the live site and the
  // offline-cached shell once the service worker is installed.
  const navigateTo = useCallback((path: string) => {
    setLoadFailed(false);
    webRef.current?.injectJavaScript(
      `if (window.location.origin === '${WEBSITE_URL}') { window.location.assign('${path}'); } true;`
    );
  }, []);

  // Auto-reload the failed page once connectivity returns.
  useEffect(() => {
    if (!offline && loadFailed) {
      reload();
    }
  }, [offline, loadFailed, reload]);

  const showFallback = offline || loadFailed;
  const alone = isInitialLoad && !showFallback;

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <WebView
        ref={webRef}
        source={{ uri: WEBSITE_URL }}
        style={{ flex: 1 }}
        originWhitelist={['http://*', 'https://*']}
        allowsBackForwardNavigationGestures
        // Browser-like sandbox: persistence, storage, no forced zoom.
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        cacheEnabled
        setSupportMultipleWindows={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        textZoom={100}
        overScrollMode="never"
        onLoadStart={() => {
          setProgress(0.05);
        }}
        onLoadProgress={({ nativeEvent }) => {
          setProgress(nativeEvent.progress);
          if (nativeEvent.progress >= 1) {
            setIsInitialLoad(false);
            setLoadFailed(false);
          }
        }}
        onLoadEnd={() => setIsInitialLoad(false)}
        onNavigationStateChange={handleNavigation}
        onHttpError={({ nativeEvent }) => {
          if (nativeEvent.statusCode >= 500) setLoadFailed(true);
        }}
        onError={() => setLoadFailed(true)}
        onOpenWindow={(event) => setPopupUrl(event.nativeEvent.targetUrl)}
      />

      {/* Branded splash - first load only, auto-dismissed by timeout/progress */}
      {alone ? (
        <View className="absolute inset-0 items-center justify-center bg-surface">
          <ActivityIndicator size="large" color="#1e3a8a" />
          <Text className="mt-3 text-sm font-semibold text-navy">
            Loading GENUM Solutions…
          </Text>
        </View>
      ) : null}

      {/* Thin progress bar for in-app navigation (never blocks the page) */}
      {!alone && !showFallback && progress > 0 && progress < 1 ? (
        <View className="absolute inset-x-0 top-0 z-10 h-0.5 bg-transparent">
          <View
            style={{ width: `${Math.max(5, progress * 100)}%` }}
            className="h-full bg-navy"
          />
        </View>
      ) : null}

      {showFallback ? (
        <View className="absolute inset-0 items-center justify-center bg-surface px-8">
          <Text className="text-center text-xl font-bold text-ink">
            {offline ? "You're offline" : 'Something went wrong'}
          </Text>
          <Text className="mt-2 text-center text-sm text-muted">
            {offline
              ? 'Pages you have visited may still work below.'
              : 'We could not reach the site. Please try again.'}
          </Text>

          <Pressable
            onPress={reload}
            className="mt-6 w-full max-w-xs items-center rounded-full bg-navy px-8 py-3"
          >
            <Text className="font-bold text-white">Retry</Text>
          </Pressable>

          {offline ? (
            <>
              <Pressable
                onPress={() => navigateTo('/')}
                className="mt-3 w-full max-w-xs items-center rounded-full border border-line bg-white px-8 py-3"
              >
                <Text className="font-bold text-navy">Open cached site</Text>
              </Pressable>

              <Pressable
                onPress={() => navigateTo('/offline')}
                className="mt-3 w-full max-w-xs items-center rounded-full border border-line bg-white px-8 py-3"
              >
                <Text className="font-bold text-navy">Offline help</Text>
              </Pressable>
            </>
          ) : null}
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
              javaScriptEnabled
              domStorageEnabled
              thirdPartyCookiesEnabled
              sharedCookiesEnabled
              setSupportMultipleWindows={false}
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
