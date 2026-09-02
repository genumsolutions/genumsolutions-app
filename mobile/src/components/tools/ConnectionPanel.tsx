// ConnectionPanel — BLE scan/connect + WiFi WebSocket connect/disconnect.
import React from 'react'
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { ConnectionPanelProps } from './types'

export function ConnectionPanel({
  connected, wifiConnected, deviceName, scanningBle, connecting,
  devices, wifiUrl, error,
  onScan, onConnectBle, onWifiConnect, onWifiDisconnect,
  onDisconnect, onSetWifiUrl, onClearError,
}: ConnectionPanelProps) {
  return (
    <View className="rounded-2xl border border-line bg-card p-5 shadow-card">
      {/* Status bar */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <View className={`h-2.5 w-2.5 rounded-full ${(connected || wifiConnected) ? 'bg-accent' : 'bg-border'}`} />
          <Text className="text-sm font-bold text-ink">
            {connected ? `BLE · ${deviceName}` : wifiConnected ? 'WiFi · Connected' : 'Not connected'}
          </Text>
        </View>
        {(connected || wifiConnected) && (
          <Pressable onPress={onDisconnect}>
            <Text className="text-sm font-bold text-gold underline">Disconnect</Text>
          </Pressable>
        )}
      </View>

      <View className="mt-5 flex-row gap-4">
        {/* BLE */}
        <View className="flex-1 rounded-xl border border-line bg-surface p-4">
          <View className="flex-row items-center gap-2">
            <Feather name="bluetooth" size={16} color="#1e3a8a" />
            <Text className="text-sm font-bold text-ink">BLE</Text>
          </View>
          <Text className="mt-1 text-xs leading-5 text-muted">
            Scan and connect to an ESP32 car over Bluetooth.
          </Text>
          <Pressable
            onPress={onScan}
            disabled={scanningBle || connecting || connected}
            className="mt-3 flex-row items-center gap-2 rounded-full bg-navy px-5 py-2.5 disabled:opacity-60"
          >
            {scanningBle ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="search" size={14} color="#fff" />
            )}
            <Text className="text-xs font-black text-white">
              {scanningBle ? 'Scanning…' : 'Scan BLE'}
            </Text>
          </Pressable>
          {devices.length > 0 && (
            <FlatList
              data={devices}
              keyExtractor={(d) => d.id}
              className="mt-2 max-h-32"
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => onConnectBle(item.id)}
                  disabled={connecting}
                  className="flex-row items-center justify-between rounded-lg border border-line px-3 py-2 mt-1"
                >
                  <Text className="text-xs font-semibold text-ink">{item.name}</Text>
                  <Text className="text-xs text-navy font-bold">Connect</Text>
                </Pressable>
              )}
            />
          )}
        </View>

        {/* WiFi */}
        <View className="flex-1 rounded-xl border border-line bg-surface p-4">
          <View className="flex-row items-center gap-2">
            <Feather name="wifi" size={16} color="#1e3a8a" />
            <Text className="text-sm font-bold text-ink">WiFi</Text>
          </View>
          <TextInput
            value={wifiUrl}
            onChangeText={onSetWifiUrl}
            editable={!connected && !wifiConnected}
            placeholder="ws://192.168.4.1:81"
            autoCapitalize="none"
            className="mt-2 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink"
          />
          <Pressable
            onPress={wifiConnected ? onWifiDisconnect : onWifiConnect}
            disabled={connecting || connected}
            className="mt-3 flex-row items-center gap-2 rounded-full bg-navy px-5 py-2.5 disabled:opacity-60"
          >
            <Feather name={wifiConnected ? 'wifi-off' : 'wifi'} size={14} color="#fff" />
            <Text className="text-xs font-black text-white">
              {wifiConnected ? 'Disconnect' : connecting ? 'Connecting…' : 'Connect WiFi'}
            </Text>
          </Pressable>
        </View>
      </View>

      {error && (
        <View className="mt-3 flex-row items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <Text className="flex-1 text-xs leading-5 text-red-600">{error}</Text>
          <Pressable onPress={onClearError}>
            <Feather name="x" size={14} color="#dc2626" />
          </Pressable>
        </View>
      )}
    </View>
  )
}
