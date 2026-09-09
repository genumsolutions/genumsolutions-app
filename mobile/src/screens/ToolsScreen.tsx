// =====================================================================
// ToolsScreen - native IoT & Remote Controller.
// Real Bluetooth SPP + WiFi WebSocket control for GENUM ESP32 cars.
// Mirrors the hand-held ESP remote (Genum_ESP32_Remote_v1.0.0) OLED display.
// Full control deck for all 9 car modes and 5 project categories.
//
// Remote-parity layer: ESP32-remote safety limits, fullscreen remote view,
// small mode dropdown/apply, mode sync from car telemetry, and per-device
// memory so the app remembers last speed/mode/steer/trim/joystick choices.
// =====================================================================
import React from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRoute, type RouteProp, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons'
import type { RootStackParamList } from '../navigation/types';
import { useControlHub } from '../components/tools/useControlHub';
import { DriveControls } from '../components/tools/DriveControls';
import { ModeInfo } from '../components/tools/ModeInfo';

type Route = RouteProp<RootStackParamList, 'Tools'>

export function ToolsScreen() {
  const route = useRoute<Route>()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const routeCategory = route.params?.category

  // Shared hook - provides all state; UI only renders connection + about sections.
  const hub = useControlHub(routeCategory)

  const {
    // connection
    connected, sppStatus, deviceName,
    sppSupported, sppDevices, scanning, connecting, connectingAddress,
    handleScan, handleConnect, handleDisconnect,
    wifiConnected, wifiUrl, setWifiUrl, handleWifiConnect, handleWifiDisconnect,
    error, connectionMessage, connectionMsgType, sppStatusMsg,
    // mode/category
    activeCategory, activeMode, carModes, selectMode, cycleMode,
    // drive (R5: the Control Panel drives again — the deck lives here too)
    speed, servo, steerLimit, trim, driveStatus, telemetry,
    handleDirection, handleSpeed, handleServo, applyPid, handleStickDrive,
    adjustSteerLimit, adjustTrim, handleEStop,
    pidKp, pidKi, pidKd, pidOut, pidOff,
    useJoystick, setUseJoystick,
    // derived
    isDrone, isNonRobocar, is2wd1mActive, safetyLimits,
  } = hub

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
            {isDrone ? 'Drone & Aerial Controller' : 'Drive like the handheld remote'}
          </Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('RemoteControl', { category: activeCategory })}
          accessibilityRole="button"
          accessibilityLabel="Open game remote"
          className="ml-3 shrink-0 rounded-full bg-navy p-3.5 shadow-card"
        >
          <Feather name="target" size={22} color="#fff" />
        </Pressable>
      </View>

      {/* Connection panel with SPP device selection */}
      <View className="mt-6">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <View className={`h-2.5 w-2.5 rounded-full ${sppStatus === 'connected' || sppStatus === 'connecting' ? 'bg-accent' : 'bg-border'}`} />
            <Text className="text-sm font-bold text-ink">
              {sppStatus === 'connected' ? `SPP Connected · ${deviceName}` :
               sppStatus === 'connecting' ? `SPP Connecting…` :
               'Not connected'}
            </Text>
          </View>
          {sppStatus === 'connected' && (
            <Pressable onPress={handleDisconnect}>
              <Text className="text-sm font-bold text-gold underline">Disconnect</Text>
            </Pressable>
          )}
        </View>

        {/* Status banner */}
        {sppStatusMsg && (
          <View className={`mt-3 rounded-xl px-4 py-3 ${sppStatus === 'connected' ? 'bg-accent/10 border border-accent/20' :
            sppStatus === 'error' || sppStatus === 'disconnected' ? 'bg-red-50 border border-red-200' :
            'bg-navy/10 border border-navy/20'}`}>
            <Text className={`text-sm font-bold ${sppStatus === 'connected' ? 'text-accent' :
              sppStatus === 'error' || sppStatus === 'disconnected' ? 'text-red-600' : 'text-navy'}`}>
              {sppStatusMsg}
            </Text>
          </View>
        )}

        {/* Connection message */}
        {connectionMessage && (
          <View className={`mt-3 rounded-xl px-4 py-3 ${connectionMsgType === 'success' ? 'bg-accent/10 border border-accent/20' : 'bg-red-50 border border-red-200'}`}>
            <Text className={`text-sm font-bold ${connectionMsgType === 'success' ? 'text-accent' : 'text-red-600'}`}>
              {connectionMessage}
            </Text>
          </View>
        )}

        {/* SPP card */}
        <View className={`mt-4 rounded-2xl border border-line bg-card p-5 shadow-card ${!sppSupported ? 'opacity-50' : ''}`}>
          <View className="flex-row items-center gap-2">
            <Feather name="bluetooth" size={16} color="#1e3a8a" />
            <Text className="text-sm font-bold text-ink">Classic Bluetooth (SPP)</Text>
          </View>
          <Text className="mt-1 text-xs leading-5 text-muted">
            Scan and connect to ESP32 cars. Pairs like the ESP remote. PIN: 1234.
          </Text>
          {!sppSupported && (
            <Text className="mt-2 text-[11px] font-bold italic text-muted">Not supported on this platform.</Text>
          )}

          <View className={sppSupported ? '' : 'opacity-40'} pointerEvents={sppSupported ? 'auto' : 'none'}>
            {!connected && (
              <Pressable
                onPress={handleScan}
                disabled={scanning}
                className="mt-4 flex-row items-center justify-center gap-2 rounded-full bg-navy px-5 py-2.5 disabled:opacity-60"
                accessibilityRole="button"
                accessibilityLabel="Scan cars (SPP)"
              >
                {scanning ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Feather name="search" size={14} color="#fff" />
                )}
                <Text className="text-xs font-black text-white">
                  {scanning ? 'Scanning…' : 'Scan cars (SPP)'}
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
                    accessibilityRole="button"
                    accessibilityLabel={`Connect to ${item.name}`}
                  >
                    <View className="min-w-0 flex-1 flex-row items-center gap-2">
                      <Feather name="smartphone" size={13} color="#1e3a8a" />
                      <Text className="flex-1 text-xs font-semibold text-ink" numberOfLines={1}>{item.name}</Text>
                      {item.bonded && (
                        <Text className="text-[10px] font-bold uppercase tracking-wide text-green-600">Paired</Text>
                      )}
                    </View>
                    <Text className="ml-2 text-xs font-bold text-navy">
                      {connectingAddress === item.address ? 'Connecting…' : 'Connect'}
                    </Text>
                  </Pressable>
                )}
              />
            )}

            {connected && (
              <View className="mt-3 rounded-xl bg-accent/10 px-4 py-3">
                <Text className="text-sm font-bold text-accent">
                  Connected to {deviceName}
                </Text>
                <Text className="mt-1 text-xs text-muted">
                  Use the controls below to drive. Tap Disconnect to stop.
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* WiFi card */}
        <View className={`mt-4 rounded-2xl border border-line bg-card p-5 shadow-card ${!sppSupported ? 'opacity-50' : ''}`}>
          <View className="flex-row items-center gap-2">
            <Feather name="wifi" size={16} color="#1e3a8a" />
            <Text className="text-sm font-bold text-ink">WiFi WebSocket</Text>
          </View>
          {!sppSupported && (
            <Text className="mt-1 text-xs leading-5 text-muted">Not used by this mode — no WiFi link for it.</Text>
          )}
          <View className={sppSupported ? '' : 'opacity-40'} pointerEvents={sppSupported ? 'auto' : 'none'}>
            <TextInput
              value={wifiUrl}
              onChangeText={setWifiUrl}
              editable={!connected && !wifiConnected}
              placeholder="ws://192.168.4.1:81"
              autoCapitalize="none"
              className="mt-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            />
            <Pressable
              onPress={wifiConnected ? handleWifiDisconnect : handleWifiConnect}
              disabled={connecting}
              className="mt-3 flex-row items-center justify-center gap-2 rounded-full bg-navy px-5 py-2.5 disabled:opacity-60"
              accessibilityRole="button"
              accessibilityLabel="Connect WiFi"
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
        </View>

        {/* Error display */}
        {sppSupported && error && !connected && !connectionMessage && (
          <View className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <Text className="text-xs leading-5 text-red-600">{error}</Text>
          </View>
        )}
      </View>

      {/* Drive deck (R5): the connected card promises "controls below to
          drive" — restore the full deck here so the Control Panel drives
          exactly like the Remote window (same hub, same handlers). Robocar
          categories only; drones/smart-farm/city keep their own decks. */}
      {!isDrone && !isNonRobocar && (
        <View className="mt-4">
          <View className="mb-3 flex-row items-center justify-between rounded-xl border border-line bg-card px-4 py-3">
            <Text className="min-w-0 flex-1 text-xs font-bold text-muted" numberOfLines={1}>
              Control mode · {driveStatus}
            </Text>
            <View className="flex-row shrink-0 gap-2">
              <Pressable
                onPress={() => setUseJoystick(false)}
                className={`rounded-full px-3 py-1.5 ${!useJoystick ? 'bg-navy' : 'border border-line bg-surface'}`}
                accessibilityRole="button"
                accessibilityLabel="Use D-pad"
              >
                <Text className={`text-xs font-bold ${!useJoystick ? 'text-white' : 'text-muted'}`}>D-pad</Text>
              </Pressable>
              <Pressable
                onPress={() => setUseJoystick(true)}
                className={`rounded-full px-3 py-1.5 ${useJoystick ? 'bg-navy' : 'border border-line bg-surface'}`}
                accessibilityRole="button"
                accessibilityLabel="Use Joystick"
              >
                <Text className={`text-xs font-bold ${useJoystick ? 'text-white' : 'text-muted'}`}>Joystick</Text>
              </Pressable>
            </View>
          </View>
          <DriveControls
            canControl={connected || wifiConnected}
            isDrone={false}
            activeMode={activeMode}
            speed={speed}
            servo={servo}
            pidKp={pidKp}
            pidKi={pidKi}
            pidKd={pidKd}
            pidOut={pidOut}
            pidOff={pidOff}
            useJoystick={useJoystick}
            onDirection={handleDirection}
            onSpeed={handleSpeed}
            onServo={handleServo}
            onPid={applyPid}
            onSignedDrive={is2wd1mActive ? handleStickDrive : undefined}
            steerLimit={is2wd1mActive ? steerLimit : undefined}
            onRun={() => handleDirection('F')}
            onStop={() => handleDirection('S')}
            onEStop={is2wd1mActive ? handleEStop : undefined}
            safetyLimits={safetyLimits}
          />
        </View>
      )}

      {/* About this mode */}
      <View className="mt-4">
        <ModeInfo mode={activeMode} />
      </View>
    </ScrollView>
  )
}