// =====================================================================
// SiteScreen - the WebView that renders the GENUM website. It sits inside
// the native shell (header above, tabs below), so it intentionally takes
// the full remaining height with no safe-area padding of its own.
//
//  - loads the live site with the injected bridge (BRIDGE_SCRIPT, which
//    hides the website header/footer, compacts the content to an app feel,
//    and streams cart / session / path / online state to native)
//  - Android hardware back -> browser back
//  - thin progress bar for in-app navigation (never blocks the page)
//  - popup windows (payment gateways / OAuth) open in an in-app modal
// =====================================================================
import NetInfo from '@react-native-community/netinfo';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Modal, Pressable, Text, View } from 'react-native';
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewNavigation,
} from 'react-native-webview';
import { WEBSITE_URL } from '../config/site';
import { useApp } from '../context/AppContext';
import {
  roboBridgeConnectGeneric,
  roboBridgeDisconnect,
  roboBridgeSend,
  setRoboIngress,
  type RoboIngressKind,
  type RoboConnectPayload,
} from '../services/roboCarBridge';
import { BRIDGE_SCRIPT } from '../webview/inject';

export function SiteScreen() {
  const {
    webRef,
    setCart,
    setUser,
    setCurrentPath,
    setOffline,
    navigate,
  } = useApp();

  const [progress, setProgress] = useState(0);
  const [navigating, setNavigating] = useState(false);
  const [offlineUi, setOfflineUi] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [popupUrl, setPopupUrl] = useState<string | null>(null);
  const canGoBackRef = useRef(false);

  // Track connectivity so the native shell can react and we can show a
  // non-blocking "offline" hint (full-screen blocking was removed in the
  // app redesign - see offline.ts for the caching strategy).
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOffline = state.isConnected === false;
      setOffline(isOffline);
      setOfflineUi(isOffline);
    });
    return () => unsubscribe();
  }, [setOffline]);

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
  }, [webRef]);

  const handleNavigation = useCallback((state: WebViewNavigation) => {
    canGoBackRef.current = state.canGoBack;
    setLoadFailed(false);
  }, []);

  // Streaming state from the website's injected bridge.
  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        switch (data.type) {
          case 'genum:cart':
            setCart({ count: data.count, size: data.size });
            break;
          case 'genum:session':
            setUser(data.user ?? null);
            break;
          case 'genum:path':
            setCurrentPath(data.path);
            break;
          case 'genum:online':
            setOffline(data.online === false);
            break;
          case 'genum:robo':
            void handleRoboAction(data.action, data.payload);
            break;
          default:
            break;
        }
      } catch {
        // ignore malformed messages
      }
    },
    [setCart, setUser, setCurrentPath, setOffline],
  );

  // Robo car: the /robocar page delegates its transport to the native shell.
  const handleRoboAction = useCallback(
    async (action: string, payload: unknown) => {
      try {
        switch (action) {
          case 'connect':
            await roboBridgeConnectGeneric(
              (typeof payload === 'object' && payload !== null ? payload : {}) as RoboConnectPayload,
            );
            break;
          case 'send':
            if (typeof payload === 'string') await roboBridgeSend(payload);
            break;
          case 'disconnect':
            roboBridgeDisconnect();
            break;
          default:
            break;
        }
      } catch (e) {
        // The bridge itself reports errors via ingress('error', ...).
      }
    },
    [],
  );

  // Push native telemetry/status back into the page. The page registers
  // window.__GENUM_ROBO__.ingress only while it is mounted; if it is not
  // there yet the call is a no-op, so this is safe on any URL.
  const pushIngress = useCallback(
    (kind: RoboIngressKind, payload: string) => {
      webRef.current?.injectJavaScript(
        `(function(){var f=(window.__GENUM_ROBO__||{}).ingress;if(f){try{f(${JSON.stringify(kind)},${JSON.stringify(payload)});}catch(e){}}})();true;`,
      );
    },
    [webRef],
  );

  useEffect(() => {
    setRoboIngress(pushIngress);
    return () => setRoboIngress(null);
  }, [pushIngress]);

  const reload = useCallback(() => {
    setLoadFailed(false);
    webRef.current?.reload();
  }, [webRef]);

  // Auto-reload the failed page once connectivity returns.
  useEffect(() => {
    if (!offlineUi && loadFailed) {
      reload();
    }
  }, [offlineUi, loadFailed, reload]);

  const showFallback = loadFailed;

  return (
    <View className="flex-1 bg-surface">
      <WebView
        ref={(ref) => {
          webRef.current = ref;
        }}
        source={{ uri: WEBSITE_URL }}
        style={{ flex: 1 }}
        originWhitelist={['http://*', 'https://*']}
        allowsBackForwardNavigationGestures
        // Tell the site we are the native app (hides "download the app"), and
        // inject the app-feel CSS + native bridge.
        injectedJavaScriptBeforeContentLoaded={`window.GENUM_APP = true; true;`}
        injectedJavaScript={BRIDGE_SCRIPT}
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
          setNavigating(true);
        }}
        onLoadProgress={({ nativeEvent }) => {
          setProgress(nativeEvent.progress);
          if (nativeEvent.progress >= 1) {
            setNavigating(false);
            setLoadFailed(false);
          }
        }}
        onLoadEnd={() => setNavigating(false)}
        onNavigationStateChange={handleNavigation}
        onHttpError={({ nativeEvent }) => {
          if (nativeEvent.statusCode >= 500) setLoadFailed(true);
        }}
        onError={() => setLoadFailed(true)}
        onOpenWindow={(event) => setPopupUrl(event.nativeEvent.targetUrl)}
        onMessage={handleMessage}
      />

      {/* Thin progress bar for navigation - never blocks the page */}
      {!showFallback && navigating && progress > 0 && progress < 1 ? (
        <View className="absolute inset-x-0 top-0 z-10 h-0.5 bg-transparent">
          <View
            style={{ width: `${Math.max(5, progress * 100)}%` }}
            className="h-full bg-navy"
          />
        </View>
      ) : null}

      {/* Non-blocking offline hint */}
      {!showFallback && offlineUi ? (
        <View className="absolute inset-x-0 top-0 z-10 flex-row items-center justify-center bg-gold px-4 py-1">
          <Text className="text-[11px] font-black uppercase tracking-wider text-white">
            Offline — showing saved content
          </Text>
        </View>
      ) : null}

      {/* Fallback only when a page genuinely cannot be served (no cache) */}
      {showFallback ? (
        <View className="absolute inset-0 items-center justify-center bg-surface px-8">
          <Text className="text-center text-xl font-bold text-ink">
            This page needs the internet
          </Text>
          <Text className="mt-2 text-center text-sm text-muted">
            Pages you have visited are saved and work offline. Buying and live
            search need a connection.
          </Text>

          <Pressable
            onPress={reload}
            className="mt-6 w-full max-w-xs items-center rounded-full bg-navy px-8 py-3"
          >
            <Text className="font-bold text-white">Retry</Text>
          </Pressable>

          <Pressable
            onPress={() => navigate('/products')}
            className="mt-3 w-full max-w-xs items-center rounded-full border border-line bg-white px-8 py-3"
          >
            <Text className="font-bold text-navy">Browse saved products</Text>
          </Pressable>

          <Pressable
            onPress={() => navigate('/')}
            className="mt-3 w-full max-w-xs items-center rounded-full border border-line bg-white px-8 py-3"
          >
            <Text className="font-bold text-navy">Open home</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Popup windows (eSewa/Khalti payment, OAuth) open here in-app */}
      <Modal
        visible={popupUrl !== null}
        animationType="slide"
        onRequestClose={() => setPopupUrl(null)}
      >
        <View className="flex-1 bg-surface">
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
        </View>
      </Modal>
    </View>
  );
}