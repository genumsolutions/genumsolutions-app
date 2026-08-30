// =====================================================================
// ToolsScreen - native "Tools & IoT" panel for controlling Bluetooth /
// IoT devices from the GENUM Solutions app.
//
// Currently a UI/UX foundation: discovery + connection + quick controls
// are simulated with local state so the panel feels real. The next step
// wires these to react-native-ble-plx (a dev build, not Expo Go) and
// later mirrors the same controls on the website's /tools page.
//
// NOTE: keep this file free of `react-native-ble-plx` imports for now -
// instantiating BleManager inside Expo Go can crash the shell.
// =====================================================================
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { APP_VERSION } from '../config/site';
import { useApp } from '../context/AppContext';
import { UpdateScreen } from './UpdateScreen';

type Device = {
  id: string;
  name: string;
  type: string;
  address: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
};

// Placeholder devices - will be replaced by real BLE discovery later.
const DEMO_DEVICES: Device[] = [
  { id: 'car', name: 'GENUM Robot Car', type: 'BLE · ESP32', address: 'A4:CF:12:88:1B:07' },
  { id: 'board', name: 'ESP32 Dev Board', type: 'BLE · WiFi', address: 'CC:50:E3:44:9A:2D' },
  { id: 'light', name: 'RGB LED Strip', type: 'BLE Mesh', address: 'F0:08:D1:5C:3E:11' },
];

const SPEEDS = ['Slow', 'Medium', 'Fast'] as const;

export function ToolsScreen({ visible, onClose }: Props) {
  const { navigate } = useApp();
  const [scanning, setScanning] = useState(false);
  const [connectedId, setConnectedId] = useState<string | null>(null);
  const [ledOn, setLedOn] = useState(true);
  const [headlightsOn, setHeadlightsOn] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>('Medium');
  const [showUpdate, setShowUpdate] = useState(false);

  const connected = connectedId !== null;
  const connectedDevice = DEMO_DEVICES.find((d) => d.id === connectedId) ?? null;

  const handleScan = () => {
    if (scanning) return;
    setScanning(true);
    // Simulated scan - will call BluetoothService.startScan later.
    setTimeout(() => setScanning(false), 2500);
  };

  const handleConnect = (device: Device) => {
    // Simulated connect - will call BluetoothService.connect later.
    setConnectedId(device.id);
  };

  const handleDisconnect = () => {
    setConnectedId(null);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-mist">
        {/* Header */}
        <View className="flex-row items-center justify-between bg-navy px-5 pb-2 pt-2">
          <View>
            <Text className="text-2xl font-bold text-white">Tools & IoT</Text>
            <Text className="mt-0.5 text-sm text-navy-light">
              Bluetooth device control
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            className="rounded-full bg-white/15 px-4 py-2"
          >
            <Text className="font-bold text-white">✕ Close</Text>
          </Pressable>
        </View>

        {/* Connection status */}
        <View className="flex-row items-center justify-between px-5 py-4">
          <View className="flex-row items-center">
            <View
              className={`h-2.5 w-2.5 rounded-full ${
                connected ? 'bg-accent' : 'bg-border'
              }`}
            />
            <Text className="ml-2 text-sm font-semibold text-ink">
              {connected
                ? `Connected · ${connectedDevice?.name}`
                : 'Not connected'}
            </Text>
          </View>
          {connected ? (
            <Pressable onPress={handleDisconnect}>
              <Text className="font-bold text-gold">Disconnect</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Robo Car launcher - the full control UI lives on the website's
            /robocar page, mirrored in the WebView. This opens it in-app. */}
        <View className="mx-5 rounded-xl border border-navy bg-white">
          <Pressable
            onPress={() => {
              onClose();
              navigate('/robocar');
            }}
            className="flex-row items-center gap-3 p-4"
          >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-navy">
              <Text className="text-lg text-white">🚗</Text>
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-ink">Robo Car Control</Text>
              <Text className="mt-0.5 text-xs text-muted">
                Connect &amp; drive the robot cars (BLE / WiFi)
              </Text>
            </View>
            <Text className="text-navy">›</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
          {/* Bluetooth devices */}
          <View className="px-5">
            <Text className="text-base font-bold text-ink">Devices</Text>
            <View className="mt-2 space-y-2">
              {DEMO_DEVICES.map((device) => {
                const isConnected = connectedId === device.id;
                return (
                  <Pressable
                    key={device.id}
                    onPress={() => handleConnect(device)}
                    disabled={scanning}
                    className={`flex-row items-center justify-between rounded-lg border px-4 py-3 ${
                      isConnected
                        ? 'border-accent bg-white'
                        : 'border-line bg-surface'
                    }`}
                  >
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-ink">
                        {device.name}
                      </Text>
                      <Text className="mt-0.5 text-xs text-muted">
                        {device.type} · {device.address}
                      </Text>
                    </View>
                    {scanning ? (
                      <ActivityIndicator size="small" color="#1e3a8a" />
                    ) : (
                      <Text
                        className={`text-xs font-bold ${
                          isConnected ? 'text-accent' : 'text-border'
                        }`}
                      >
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
              className="mt-4 items-center rounded-full bg-navy px-5 py-3"
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
            <Text className="mt-2 text-center text-xs text-muted">
              Discovery UI is a placeholder — real BLE scanning arrives with the
              dev-client build.
            </Text>
          </View>

          {/* Quick controls */}
          <View className="mt-6 px-5">
            <Text className="text-base font-bold text-ink">Quick controls</Text>
            <View
              className={`mt-2 rounded-lg border bg-surface px-4 py-3 ${
                connected ? 'border-line' : 'border-line'
              } ${connected ? '' : 'opacity-50'}`}
            >
              <View className="flex-row items-center justify-between py-3">
                <Text className="text-sm font-semibold text-ink">Built-in LED</Text>
                <Switch
                  value={ledOn}
                  onValueChange={setLedOn}
                  disabled={!connected}
                  trackColor={{ true: '#1e3a8a', false: '#e2e8f0' }}
                />
              </View>
              <View className="border-t border-line" />
              <View className="flex-row items-center justify-between py-3">
                <Text className="text-sm font-semibold text-ink">Headlights</Text>
                <Switch
                  value={headlightsOn}
                  onValueChange={setHeadlightsOn}
                  disabled={!connected}
                  trackColor={{ true: '#1e3a8a', false: '#e2e8f0' }}
                />
              </View>
              <View className="border-t border-line" />
              <View className="pt-3">
                <Text className="text-sm font-semibold text-ink">Motor speed</Text>
                <View className="mt-2 flex-row flex-wrap">
                  {SPEEDS.map((value) => {
                    const active = speed === value;
                    return (
                      <Pressable
                        key={value}
                        onPress={() => setSpeed(value)}
                        disabled={!connected}
                        className={`mr-2 rounded-full border px-4 py-1.5 ${
                          active
                            ? 'border-navy bg-navy'
                            : 'border-line bg-mist'
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold ${
                            active ? 'text-white' : 'text-navy'
                          }`}
                        >
                          {value}
                        </Text>
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
          </View>

          {/* Future note */}
          <View className="rounded-lg border border-line bg-sky px-4 py-3 mx-5 mt-6">
            <Text className="text-sm font-semibold text-navy">
              Robo car control
            </Text>
            <Text className="mt-1 text-xs text-muted">
              Open the Robo Car page above to connect and drive the robot cars
              over BLE or WiFi, with live telemetry, mode selection, and PID
              tuning.
            </Text>
          </View>

          <View className="mx-5 mt-8 rounded-lg border border-line bg-white p-4">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-sm font-semibold text-ink">GENUM Solutions</Text>
                <Text className="mt-0.5 text-[11px] text-muted">v{APP_VERSION}</Text>
              </View>
              <Pressable
                onPress={() => setShowUpdate(true)}
                className="rounded-full bg-navy px-4 py-2"
              >
                <Text className="text-xs font-bold text-white">Check for update</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      <UpdateScreen visible={showUpdate} onClose={() => setShowUpdate(false)} />
    </Modal>
  );
}