// =====================================================================
// ToolsScreen — the Control Panel.
//
// Category organizer with category selector, detail card, connection
// card, and Remote window handoff. This is the single entry point
// from Menu → Control Panel and Projects → Control.
// =====================================================================
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, Vibration, View } from 'react-native';
import { useRoute, type RouteProp, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons'
import type { ComponentProps } from 'react';
import type { RootStackParamList } from '../navigation/types';
import { useControlHub } from '../components/tools/useControlHub';
import { ProjectInfo } from '../components/tools/ProjectInfo';
import { PROJECT_CATEGORIES, PRODUCT_CATEGORY_TO_SLUG, type ProjectCategory } from '../config/project-catalog';

type Route = RouteProp<RootStackParamList, 'Tools'>

type FeatherIcon = ComponentProps<typeof Feather>['name'];

const CATEGORY_ICONS: Record<string, FeatherIcon> = {
  robocar: 'cpu',
  'home-automation': 'home',
  'smart-farm': 'droplet',
  'smart-city': 'zap',
  drones: 'send',
}

const CAPABILITY_LABELS: Record<string, string> = {
  directional: 'Directional drive',
  servo: 'Servo steering',
  pid: 'PID tuning',
  'start-stop': 'Run / Stop routines',
  relay: 'Relay outputs',
  sensor: 'Live sensors',
  weblink: 'Web dashboard link',
  slider: 'Sliders',
  gimbal: 'Gimbal pan/tilt',
  altitude: 'Altitude control',
}

export function ToolsScreen() {
  const route = useRoute<Route>()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const routeCategory = (() => {
    const raw = route.params?.category
    if (!raw) return undefined
    if (PRODUCT_CATEGORY_TO_SLUG[raw]) return PRODUCT_CATEGORY_TO_SLUG[raw]
    if (PROJECT_CATEGORIES.some((c) => c.slug === raw)) return raw
    return undefined
  })()

  // Shared hook — connection state + everything the Remote window handoff
  // needs (the window runs its own hub instance on the same transports).
  const hub = useControlHub(routeCategory)
  const {
    connected, sppStatus, deviceName,
    sppSupported, sppDevices, scanning, connecting, connectingAddress,
    handleScan, handleConnect, handleDisconnect,
    wifiConnected, wifiUrl, setWifiUrl, handleWifiConnect, handleWifiDisconnect,
    error, sppStatusMsg,
    activeMode,
  } = hub

  // Category organizer
  const [selectedSlug, setSelectedSlug] = useState<string>(
    routeCategory && PROJECT_CATEGORIES.some((c) => c.slug === routeCategory)
      ? routeCategory
      : PROJECT_CATEGORIES[0]!.slug,
  )
  const category: ProjectCategory =
    PROJECT_CATEGORIES.find((c) => c.slug === selectedSlug) ?? PROJECT_CATEGORIES[0]!

  const isRobocarCat = category.slug === 'robocar'
  const remoteLabel = isRobocarCat
    ? 'Drive deck'
    : category.slug === 'drones'
      ? 'Flight deck'
      : 'Relay & sensor deck'

  // Connection tab: iOS-style segmented toggle
  const [connTab, setConnTab] = useState<'bluetooth' | 'wifi'>('bluetooth')

  // Disconnect confirmation
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)
  const confirmDisconnect = useCallback(() => {
    Vibration.vibrate(10)
    setShowDisconnectConfirm(false)
    handleDisconnect()
  }, [handleDisconnect])

  return (
    <ScrollView
      className="flex-1 bg-mist"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between">
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
            Control Panel
          </Text>
          <Text className="mt-2 font-display text-2xl font-bold text-ink">
            Test &amp; control your projects
          </Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('RemoteControl', { category: category.slug })}
          accessibilityRole="button"
          accessibilityLabel={`Open ${category.name} remote`}
          className="ml-3 shrink-0 rounded-full bg-navy p-3.5 shadow-card"
        >
          <Feather name="target" size={22} color="#fff" />
        </Pressable>
      </View>

      {/* Category selector */}
      <View className="mt-5 flex-row flex-wrap gap-2">
        {PROJECT_CATEGORIES.map((c) => {
          const active = c.slug === selectedSlug
          return (
            <Pressable
              key={c.slug}
              onPress={() => setSelectedSlug(c.slug)}
              accessibilityRole="button"
              accessibilityLabel={`Select category ${c.name}`}
              accessibilityState={{ selected: active }}
              className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-2 ${active ? 'bg-navy' : 'border border-line bg-card'}`}
            >
              <Feather
                name={CATEGORY_ICONS[c.slug] ?? 'box'}
                size={13}
                color={active ? '#fff' : '#1e3a8a'}
              />
              <Text numberOfLines={1} className={`text-xs font-bold ${active ? 'text-white' : 'text-navy'}`}>
                {c.name}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {/* Category detail card */}
      <View key={category.slug} className="mt-4 rounded-2xl border border-line bg-card p-5 shadow-card">
        <View className="flex-row items-start">
          <View className="h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-light">
            <Feather name={CATEGORY_ICONS[category.slug] ?? 'box'} size={18} color="#1e3a8a" />
          </View>
          <View className="ml-3 min-w-0 flex-1">
            <Text numberOfLines={1} className="font-display text-lg font-bold text-ink">{category.name}</Text>
            <Text numberOfLines={1} className="mt-0.5 text-xs font-semibold text-navy">{category.tagline}</Text>
          </View>
        </View>
        <Text className="mt-3 text-sm leading-5 text-muted">{category.description}</Text>

        <View className="mt-3 flex-row flex-wrap gap-1.5">
          {category.hardware.map((h) => (
            <Text key={h} className="rounded-full bg-mist px-2.5 py-1 text-[10px] font-bold text-navy">{h}</Text>
          ))}
        </View>

        <View className="mt-3 flex-row flex-wrap gap-x-4 gap-y-1.5">
          {category.capabilities.map((cap) => (
            <View key={cap} className="flex-row items-center gap-1.5">
              <Feather name="check-circle" size={12} color="#059669" />
              <Text className="text-xs font-semibold text-ink">{CAPABILITY_LABELS[cap] ?? cap}</Text>
            </View>
          ))}
        </View>

        <Pressable
          onPress={() => navigation.navigate('RemoteControl', { category: category.slug })}
          accessibilityRole="button"
          accessibilityLabel={`Open ${category.name} remote window`}
          className="mt-4 flex-row items-center justify-center gap-2 rounded-full bg-navy py-3"
        >
          <Feather name="target" size={15} color="#fff" />
          <Text className="text-sm font-black text-white">Open {remoteLabel} · {category.name}</Text>
          <Feather name="arrow-right" size={15} color="#fff" />
        </Pressable>
        <Text className="mt-1.5 text-center text-[11px] text-muted">
          Drive controls, speed and E-stop live in the Remote window — this page stays a clean organizer.
        </Text>
      </View>

      {/* Connection card */}
      <View className="mt-6">
        <View className="flex-row items-center justify-between">
          <View className="min-w-0 flex-1 flex-row items-center gap-2">
            <View className={`h-2.5 w-2.5 shrink-0 rounded-full ${(sppStatus === 'connected' || sppStatus === 'connecting' || wifiConnected) ? 'bg-accent' : 'bg-border'}`} />
            <Text numberOfLines={1} className="min-w-0 flex-1 text-sm font-bold text-ink">
              {sppStatus === 'connected' ? `Connected · ${deviceName}` :
               wifiConnected ? `WiFi Connected` :
               sppStatus === 'connecting' ? 'Connecting…' :
               'Not connected'}
            </Text>
          </View>
          {(sppStatus === 'connected' || wifiConnected) && (
            <Pressable onPress={() => { Vibration.vibrate(10); setShowDisconnectConfirm(true) }} className="shrink-0" hitSlop={8}>
              <Text className="text-sm font-bold text-gold underline">Disconnect</Text>
            </Pressable>
          )}
        </View>

        {sppStatusMsg && sppStatus !== 'connected' && !wifiConnected && (
          <View className={`mt-3 rounded-xl px-4 py-3 ${sppStatus === 'error' || sppStatus === 'disconnected' ? 'bg-red-50 border border-red-200' :
            'bg-navy/10 border border-navy/20'}`}>
            <Text numberOfLines={2} className={`text-sm font-bold ${sppStatus === 'error' || sppStatus === 'disconnected' ? 'text-red-600' : 'text-navy'}`}>
              {sppStatusMsg}
            </Text>
          </View>
        )}

        <View className="mt-4 rounded-2xl border border-line bg-card p-5 shadow-card">
          <View className="flex-row rounded-xl bg-slate-100 p-0.5">
            <Pressable
              onPress={() => setConnTab('bluetooth')}
              className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-2.5 ${connTab === 'bluetooth' ? 'bg-white shadow-sm' : ''}`}
            >
              <Feather name="bluetooth" size={13} color={connTab === 'bluetooth' ? '#1e3a8a' : '#94a3b8'} />
              <Text className={`text-xs font-bold ${connTab === 'bluetooth' ? 'text-navy' : 'text-slate-400'}`}>Bluetooth</Text>
            </Pressable>
            <Pressable
              onPress={() => setConnTab('wifi')}
              className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-2.5 ${connTab === 'wifi' ? 'bg-white shadow-sm' : ''}`}
            >
              <Feather name="wifi" size={13} color={connTab === 'wifi' ? '#1e3a8a' : '#94a3b8'} />
              <Text className={`text-xs font-bold ${connTab === 'wifi' ? 'text-navy' : 'text-slate-400'}`}>WiFi</Text>
            </Pressable>
          </View>

          {connTab === 'bluetooth' && (
            <View className="mt-4">
              <Text className="text-xs leading-5 text-muted">
                Scan and connect to your {category.name.toLowerCase()} hardware. Pairs like the hand-held remote. PIN: 1234.
              </Text>
              {!sppSupported && (
                <View className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <Text className="text-xs font-bold text-amber-700">Bluetooth SPP not supported on this platform.</Text>
                </View>
              )}
              <View className={sppSupported ? '' : 'opacity-40'} pointerEvents={sppSupported ? 'auto' : 'none'}>
                {!connected && !wifiConnected && (
                  <Pressable
                    onPress={handleScan}
                    disabled={scanning}
                    className="mt-4 flex-row items-center justify-center gap-2 rounded-full bg-navy px-5 py-2.5 disabled:opacity-60"
                  >
                    {scanning ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Feather name="search" size={14} color="#fff" />
                    )}
                    <Text className="text-xs font-black text-white">
                      {scanning ? 'Scanning…' : 'Scan devices (SPP)'}
                    </Text>
                  </Pressable>
                )}

                {sppDevices.length > 0 && (
                  <FlatList
                    data={sppDevices}
                    keyExtractor={(d) => d.address}
                    className="mt-3 max-h-48"
                    nestedScrollEnabled
                    renderItem={({ item }) => (
                      <Pressable
                        onPress={() => handleConnect(item)}
                        disabled={connecting}
                        className="mt-1 flex-row items-center justify-between rounded-lg border border-line px-3 py-2.5"
                      >
                        <View className="min-w-0 flex-1 flex-row items-center gap-2">
                          <Feather name="smartphone" size={13} color="#1e3a8a" />
                          <Text className="min-w-0 flex-1 text-xs font-semibold text-ink" numberOfLines={1}>{item.name}</Text>
                          {item.bonded && (
                            <Text className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-green-600">Paired</Text>
                          )}
                        </View>
                        <Text className="ml-2 shrink-0 text-xs font-bold text-navy">
                          {connectingAddress === item.address ? 'Connecting…' : 'Connect'}
                        </Text>
                      </Pressable>
                    )}
                  />
                )}
              </View>
            </View>
          )}

          {connTab === 'wifi' && (
            <View className="mt-4">
              <Text className="text-xs leading-5 text-muted">
                Connect to a WiFi-enabled car via WebSocket. Enter the car's URL.
              </Text>
              {!wifiConnected && (
                <TextInput
                  value={wifiUrl}
                  onChangeText={setWifiUrl}
                  editable={!connected && !wifiConnected}
                  placeholder="ws://192.168.4.1:81"
                  autoCapitalize="none"
                  className="mt-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                />
              )}
              <Pressable
                onPress={wifiConnected ? handleWifiDisconnect : handleWifiConnect}
                disabled={connecting}
                className="mt-3 flex-row items-center justify-center gap-2 rounded-full bg-navy px-5 py-2.5 disabled:opacity-60"
              >
                {connecting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Feather name={wifiConnected ? 'wifi-off' : 'wifi'} size={14} color="#fff" />
                )}
                <Text className="text-xs font-black text-white">
                  {wifiConnected ? 'Disconnect' : connecting ? 'Connecting…' : 'Connect WiFi'}
                </Text>
              </Pressable>
            </View>
          )}

          {sppSupported && error && !connected && !wifiConnected && (
            <View className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <Text className="text-xs leading-5 text-red-600">{error}</Text>
            </View>
          )}
        </View>
      </View>

      {/* About this project */}
      <View className="mt-4">
        <ProjectInfo mode={activeMode} categorySlug={category.slug} />
      </View>

      {/* Disconnect confirmation */}
      {showDisconnectConfirm && (
        <>
          <Pressable
            className="absolute inset-0 z-30 bg-black/30"
            onPress={() => setShowDisconnectConfirm(false)}
            accessibilityLabel="Cancel disconnect"
          />
          <View className="absolute inset-0 z-40 items-center justify-center px-8">
            <View className="w-full max-w-sm rounded-2xl border border-line bg-card p-5 shadow-xl">
              <Text className="text-center text-base font-black text-ink">Disconnect now?</Text>
              <Text className="mt-1 text-center text-xs leading-4 text-muted">
                The car receives a safe stop (SPD0 · SERVO90) before the link closes.
              </Text>
              <View className="mt-4 flex-row justify-center gap-3">
                <Pressable
                  onPress={() => setShowDisconnectConfirm(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Keep connection"
                  hitSlop={8}
                >
                  <View className="rounded-full border border-line bg-surface px-6 py-2.5">
                    <Text className="text-sm font-bold text-ink">Cancel</Text>
                  </View>
                </Pressable>
                <Pressable
                  onPress={confirmDisconnect}
                  accessibilityRole="button"
                  accessibilityLabel="Disconnect"
                  hitSlop={8}
                >
                  <View className="rounded-full bg-red-600 px-6 py-2.5">
                    <Text className="text-sm font-black text-white">Disconnect</Text>
                  </View>
                </Pressable>
              </View>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  )
}
