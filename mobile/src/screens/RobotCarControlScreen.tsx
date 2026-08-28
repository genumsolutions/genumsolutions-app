// =====================================================================
// RobotCarControlScreen - BLE robot-car control placeholder.
//
// TODO (add_ble_service_characteristics):
//   - Replace ROBOT_SERVICE_UUID / COMMAND_CHARACTERISTIC_UUID with your
//     robot car's actual UUIDs (see src/services/BluetoothService.ts).
//   - Connect via BluetoothService, write command bytes for forward/back/
//     left/right/stop, and subscribe to telemetry.
//
// NOTE: react-native-ble-plx does NOT run in Expo Go. You must use a dev
// client or a prebuild (README has details).
// =====================================================================
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { BrandHeader } from '../components/BrandHeader';

const ROBOT_SERVICE_UUID = '<YOUR_ROBOT_SERVICE_UUID>';
const COMMAND_CHARACTERISTIC_UUID = '<YOUR_COMMAND_CHARACTERISTIC_UUID>';

const COMMANDS: { label: string; bytes: number[] }[] = [
  { label: '↑ Forward', bytes: [0x01] },
  { label: '← Left', bytes: [0x02] },
  { label: '→ Right', bytes: [0x03] },
  { label: '↓ Back', bytes: [0x04] },
  { label: '■ Stop', bytes: [0x00] },
];

export function RobotCarControlScreen() {
  const sendCommand = (bytes: number[]) => {
    // PLAYLACEHOLDER: BluetoothService.writeValue(serviceUuid, charUuid, bytes)
    // eslint-disable-next-line no-console
    console.log('BLE command placeholder:', bytes);
  };

  return (
    <ScrollView className="flex-1 bg-mist">
      <BrandHeader title="Robot Car" subtitle="BLE control (placeholder)" />
      <View className="p-5">
        <Text className="mb-4 text-xs text-muted">
          Service: {ROBOT_SERVICE_UUID} {'\n'}Characteristic: {COMMAND_CHARACTERISTIC_UUID}
        </Text>
        <View className="flex-row flex-wrap">
          {COMMANDS.map((cmd) => (
            <Pressable
              key={cmd.label}
              onPress={() => sendCommand(cmd.bytes)}
              className="m-2 min-w-[100px] items-center rounded-lg border border-navy bg-surface px-4 py-4"
            >
              <Text className="font-bold text-navy">{cmd.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
