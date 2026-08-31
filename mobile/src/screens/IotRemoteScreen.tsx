import React, { useState, useEffect } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { roboBridgeConnectGeneric, roboBridgeDisconnect, roboBridgeSend, type RoboConnectPayload } from '../services/roboCarBridge';
import { getNativeCategory, NATIVE_CATEGORIES } from '../config/deviceCatalog';
import { BRIDGE_SCRIPT } from '../webview/inject';

export function IotRemoteScreen({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const {
    webRef,
    setCart,
    setUser,
    setCurrentPath,
    setOffline,
    navigate,
  } = useApp();

  const [categorySlug, setCategorySlug] = useState('robocar');
  const category = getNativeCategory(categorySlug) ?? NATIVE_CATEGORIES[0]!;
  const [progress, setProgress] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [popupUrl, setPopupUrl] = useState<string | null>(null);

  // --- BLE auto-connect on mount ---
  useEffect(() => {
    ;(async () => {
      try {
        await roboBridgeConnectGeneric({ transport: 'ble' });
      } catch (e) {
        // Auto-connect failed (no remembered device); bridge will fall back to scan UI.
      }
    })();
  }, []);

  // --- Category selector change ---
  const handleCategoryChange = (slug: string) => {
    setCategorySlug(slug);
    roboBridgeDisconnect();
  };

  // --- WebView navigation handling ---
  const handleNavigation = (state: { progress: number }) => {
    setProgress(state.progress);
    setLoadFailed(false);
  };

  // --- Message handling from the website bridge ---
  const handleMessage = (event: { nativeEvent: { data: string } }) => {
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
          void roboBridgeConnectGeneric(
            (typeof data.payload === 'object' && data.payload !== null ? data.payload : {}) as RoboConnectPayload,
          );
          break;
        default:
          break;
      }
    } catch {
      /* ignore malformed messages */
    }
  };

  // --- Push native telemetry/status back into the page ---
  const pushIngress = useCallback(
    (kind: string, payload: string) => {
      webRef.current?.injectJavaScript(
        `(function(){var f=(window.__GENUM_ROBO__||{}).ingress;if(f){try{f(${JSON.stringify(kind)},${JSON.stringify(payload)});}catch(e){}}())();true;`,
      );
    },
    [webRef],
  );

  useEffect(() => {
    /* the bridge is globally available via window.__GENUM_ROBO__ when
       GENUM_APP is true; the website /iot-remote page registers its own ingress. */
  }, []);

  // --- Reload the page when connectivity returns ---
  const reload = useCallback(() => {
    setLoadFailed(false);
    webRef.current?.reload();
  }, [webRef]);

  // --- Show fallback only when a page genuinely cannot be served ---
  const showFallback = loadFailed;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1 }} className="flex-1 bg-mist">
        <View className="flex-row items-center justify-between px-5 pb-2">
          <Text className="text-base font-bold text-white">IoT & Remote Controller</Text>
        </View>

        <View className="mx-5 mt-4">
          <Text className="text-base font-bold text-ink">Projects</Text>
          <View className="mt-2 flex flex-wrap gap-2">
            {NATIVE_CATEGORIES.map((cat) => {
              const active = cat.slug === categorySlug;
              return (
                <Pressable
                  key={cat.slug}
                  onPress={() => {
                    setCategorySlug(cat.slug);
                    roboBridgeDisconnect();
                  }}
                  className={`flex-row items-center justify-between rounded-xl border border-${
                    active ? 'border-accent' : 'border-line'}
                      bg-${active ? 'white' : 'surface'} p-3 transition`}
                >
                  <Text className={`text-sm font-bold ${active ? 'text-navy' : 'text-ink'}`}>
                    {cat.name}
                  </Text>
                  <Text className="mt-0.5 text-xs text-muted">${cat.tagline}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        <View className="mx-5 mt-4 flex-1">
          <WebView
            ref={(ref) => {}}
            style={{ flex: 1 }}
            source={{ uri: 'https://genumsolutions-website.vercel.app/iot-remote' }}
            originWhitelist={['http://*', 'https://*']}
            allowsBackForwardNavigationGestures
            injectedJavaScriptBeforeContentLoaded={`window.GENUM_APP = true; true;`}
            injectedJavaScript={BRIDGE_SCRIPT}
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
                setLoadFailed(false);
              }
            }}
            onLoadEnd={() => setLoadFailed(false)}
            onNavigationStateChange={handleNavigation}
            onHttpError={({ nativeEvent }) => {
              if (nativeEvent.statusCode >= 500) setLoadFailed(true);
            }}
            onError={() => setLoadFailed(true)}
            onOpenWindow={(event) => setPopupUrl(event.nativeEvent.targetUrl)}
            onMessage={handleMessage}
          />
        </View>

        {/* Thin progress bar for navigation - never blocks the page */}
        {!loadFailed && progress > 0 && progress < 1 ? (
          <View className="absolute inset-x-0 top-0 z-10 h-0.5 bg-transparent">
            <View
              style={{ width: `${Math.max(5, progress * 100)}%` }}
              className="h-full bg-navy"
            />
          </View>
        ) : null}

        {/* Non-blocking offline hint */}
        {!loadFailed ? (
          <View className="absolute inset-x-0 top-0 flex-row items-center justify-center bg-gold px-4 py-1">
            <Text className="text-[11px] font-black uppercase tracking-wider text-white">
              Offline — showing saved content
            </Text>
          </View>
        ) : null}

        {/* Fallback only when a page genuinely cannot be served (no cache) */}
        {loadFailed ? (
          <View className="absolute inset-0 items-center justify-center bg-surface px-8">
            <Text className="text-center text-xl font-bold text-ink">
              This page needs the internet
            </Text>
            <Text className="mt-2 text-center text-sm text-muted">
              Pages you have visited are saved and work offline. Buying and live
              search need a connection.
            </Text>
            <Pressable onPress={() => setLoadFailed(false)} className="mt-6 w-max max-w-xs items-center rounded-full bg-navy px-8 py-3">
              <Text className="font-bold text-white">Retry</Text>
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}