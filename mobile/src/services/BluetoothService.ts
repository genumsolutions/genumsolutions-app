// =====================================================================
// BluetoothService - BLE robot-car control scaffold (react-native-ble-plx).
//
// IMPORTANT: react-native-ble-plx does NOT run inside Expo Go.
// You must use a development build / prebuild (see README for details),
// and request the required native permissions (Android:
// BLUETOOTH_SCAN / BLUETOOTH_CONNECT; iOS: NSBluetoothAlwaysUsageDescription).
//
// Replace ROBOT_SERVICE_UUID and COMMAND_CHARACTERISTIC_UUID with the
// actual UUIDs for your robot car.
// =====================================================================
import { BleManager, type Device } from 'react-native-ble-plx';

// ---- PLACEHOLDER UUIDs ----
export const ROBOT_SERVICE_UUID = '<YOUR_ROBOT_SERVICE_UUID>';
export const COMMAND_CHARACTERISTIC_UUID = '<YOUR_COMMAND_CHARACTERISTIC_UUID>';

const manager = new BleManager();

let connectedDevice: Device | null = null;

// Minimal base64 encoder for byte arrays (no Node `Buffer` or `btoa` dependency).
const BASE64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: number[]): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const chunk = (b0 << 16) | (b1 << 8) | b2;
    result += BASE64_CHARS[(chunk >> 18) & 63];
    result += BASE64_CHARS[(chunk >> 12) & 63];
    result += i + 1 < bytes.length ? BASE64_CHARS[(chunk >> 6) & 63] : '=';
    result += i + 2 < bytes.length ? BASE64_CHARS[chunk & 63] : '=';
  }
  return result;
}


export async function startScan(onDevice: (d: Device) => void): Promise<void> {
  // PLAYLACEHOLDER: requestPermissions + startDeviceScan + cancellation
  manager.startDeviceScan(null, null, (_error, device) => {
    if (device && device.name) {
      onDevice(device);
    }
  });
}

export function stopScan(): void {
  manager.stopDeviceScan();
}

export async function connect(deviceId: string): Promise<Device> {
  const device = await manager.connectToDevice(deviceId);
  connectedDevice = await device.discoverAllServicesAndCharacteristics();
  return connectedDevice;
}

export async function disconnect(): Promise<void> {
  if (connectedDevice) {
    await manager.cancelDeviceConnection(connectedDevice.id);
    connectedDevice = null;
  }
}

// Write raw bytes to the command characteristic (command the robot).
export async function writeCommand(bytes: number[]): Promise<void> {
  if (!connectedDevice) {
    throw new Error('BluetoothService: not connected');
  }
  const base64 = bytesToBase64(bytes);
  await connectedDevice.writeCharacteristicWithResponseForService(
    ROBOT_SERVICE_UUID,
    COMMAND_CHARACTERISTIC_UUID,
    base64,
  );
}

// Subscribe to a telemetry characteristic (optional, robot dependant).
export async function subscribe(
  characteristicUuid: string,
  onData: (value: string | null) => void,
): Promise<void> {
  if (!connectedDevice) {
    throw new Error('BluetoothService: not connected');
  }
  connectedDevice.monitorCharacteristicForService(
    ROBOT_SERVICE_UUID,
    characteristicUuid,
    (error, characteristic) => {
      if (!error && characteristic) {
        onData(characteristic.value);
      }
    },
  );
}

export const BluetoothService = {
  ROBOT_SERVICE_UUID,
  COMMAND_CHARACTERISTIC_UUID,
  startScan,
  stopScan,
  connect,
  disconnect,
  writeCommand,
  subscribe,
};
