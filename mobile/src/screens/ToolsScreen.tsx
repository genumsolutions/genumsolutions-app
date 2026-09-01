// =====================================================================
// ToolsScreen - native Tools & IoT panel. Currently a Blender device demo;
// real BLE scanning/control will plug in via the BLE bridge.
// =====================================================================
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { APP_VERSION } from '../config/site';

type Device = {
  id: string;
  name: string;
  type: string;
};

const DEMO_DEVICES: Device[] = [
  { id: 'car', name: 'GENUM Robot Car', type: 'BLE · ESP32' },
  { id: 'board', name: 'ESP32 Dev Board', type: 'BLE · WiFi' },
  { id: 'light', name: 'RGB LED Strip', type: 'BLE Mesh' },
];

const SPEEDS = ['Slow', 'Medium', 'Fast'] as const;

export function ToolsScreen() {
  const [scanning, setScanning] = useState(false);
  const [connectedId, setConnectedId] = useState<string | null>(null);
  const [ledOn, setLedOn] = useState(true);
  const [headlightsOn, setHeadlightsOn] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>('Medium');

  const connected = connectedId !== null;
  const connectedDevice = DEMO_DEVICES.find((d) => d.id === connectedId) ?? null;

  const handleScan = () => {
    if (scanning) return;
    setScanning(true);
    setTimeout(() => setScanning(false), 2500);
  };

  return (
    <ScrollView className="flex-1 bg-mist" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      {/* Status */}
      <View className="flex-row items-center justify-between rounded-2xl border border-line bg-white px-4 py-3">
        <View className="flex-row items-center">
          <View className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-accent' : 'bg-border'}`} />
          <Text className="ml-2 text-sm font-semibold text-ink">
            {connected ? `Connected · ${connectedDevice?.name}` : 'Not connected'}
          </Text>
        </View>
        {connected ? (
          <Pressable onPress={() => setConnectedId(null)}>
            <Text className="font-bold text-gold">Disconnect</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Devices */}
      <Text className="mb-2 mt-6 text-base font-bold text-ink">Devices</Text>
      <View>
        {DEMO_DEVICES.map((device) => {
          const isConnected = connectedId === device.id;
          return (
            <Pressable
              key={device.id}
              onPress={() => setConnectedId(device.id)}
              disabled={scanning}
              className={`mb-2 flex-row items-center justify-between rounded-lg border px-4 py-3 ${
                isConnected ? 'border-accent bg-white' : 'border-line bg-surface'
              }`}
            >
              <View className="flex-1">
                <Text className="text-base font-semibold text-ink">{device.name}</Text>
                <Text className="mt-0.5 text-xs text-muted">{device.type}</Text>
              </View>
              {scanning ? (
                <ActivityIndicator size="small" color="#1e3a8a" />
              ) : (
                <Text className={`text-xs font-bold ${isConnected ? 'text-accent' : 'text-border'}`}>
                  {isConnected ? '● CONNECTED' : '○ TAP TO CONNECT'}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={handleScan}
        disabled={scanning}
        className="mt-2 items-center rounded-full bg-navy px-5 py-3 disabled:opacity-60"
      >
        {scanning ? (
          <View className="flex-row items-center">
            <ActivityIndicator size="small" color="#ffffff" />
            <Text className="ml-2 font-bold text-white">Scanning…</Text>
          </View>
        ) : (
          <Text className="font-bold text-white">Scan for devices</Text>
        )}
      </Pressable>

      {/* Quick controls */}
      <Text className="mb-2 mt-6 text-base font-bold text-ink">Quick controls</Text>
      <View className={`rounded-lg border border-line bg-surface px-4 py-1 ${connected ? '' : 'opacity-50'}`}>
        <Row label="Built-in LED">
          <Switch value={ledOn} onValueChange={setLedOn} disabled={!connected} trackColor={{ true: '#1e3a8a', false: '#e2e8f0' }} />
        </Row>
        <Row label="Headlights">
          <Switch value={headlightsOn} onValueChange={setHeadlightsOn} disabled={!connected} trackColor={{ true: '#1e3a8a', false: '#e2e8f0' }} />
        </Row>
        <View className="border-t border-line py-3">
          <Text className="mb-2 text-sm font-semibold text-ink">Motor speed</Text>
          <View className="flex-row flex-wrap">
            {SPEEDS.map((value) => {
              const active = speed === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setSpeed(value)}
                  disabled={!connected}
                  className={`mr-2 rounded-full border px-4 py-1.5 ${active ? 'border-navy bg-navy' : 'border-line bg-mist'}`}
                >
                  <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-navy'}`}>{value}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <Text className="mt-2 text-xs text-muted">
        {connected
          ? 'Controls below are demo-only until native BLE integration.'
          : 'Connect a device to unlock the quick controls.'}
      </Text>

      <View className="mt-6 rounded-lg border border-line bg-white p-4">
        <Text className="text-sm font-semibold text-navy">GENUM Solutions</Text>
        <Text className="mt-0.5 text-[11px] text-muted">App v{APP_VERSION}</Text>
        <View className="mt-2 flex-row items-center">
          <Feather name="bluetooth" size={16} color="#1e3a8a" />
          <Text className="ml-2 text-xs text-muted">IoT & Remote Controller</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between border-b border-line py-3 last:border-b-0">
      <Text className="text-sm font-semibold text-ink">{label}</Text>
      {children}
    </View>
  );
}
