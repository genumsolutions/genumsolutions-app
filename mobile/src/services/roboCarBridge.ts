// =====================================================================
// roboCarBridge - native transport host used by the /robocar page when it
// runs inside the GENUM app (window.GENUM_APP). The embedded WebView cannot
// use Web Bluetooth (Android does not support it in WebViews) and cannot pair
// Classic-SPP cars, so the page delegates the raw GENUM command protocol to
// the native shell.
//
// Data flow (native -> page):
//   car (WS/BLE) -> this service -> onIngress(kind, payload)
//     -> SiteScreen injects window.__GENUM_ROBO__.ingress(...) into the page.
//
// Data flow (page -> native):
//   page send() -> postMessage({ type:'genum:robo', action, payload })
//     -> SiteScreen -> bridge.send(...) -> car.
//
// Two transports are available:
//   1. WebSocket (native) to a LAN WiFi car (ESP_CLI / ESP_SER). Works with
//      current firmware and loads safely in Expo Go.
//   2. BLE (react-native-ble-plx via @sfourdrinier/react-native-ble-plx) to a
//      car exposing a BLE UART service (see genum-car-ble/ sketch). This
//      requires a DEV BUILD (custom native code); it is lazily required so
//      the Expo Go shell never instantiates a BleManager (which can crash
//      Expo Go).
//
// New in this version:
//   - Auto-connect: remembers the last BLE car device and reconnects to it
//     without a manual scan when the app starts, provided the device is still
//     paired/connected in the OS Bluetooth settings.
//   - Command buffer flush: every command sent to the car is removed from the
//     pending queue immediately after delivery, preventing stale/queued repeats.
// =====================================================================
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const DEFAULT_WS_URL = 'ws://192.168.4.1:81';

// Matches genum-car-ble.ino and the web BLE constants.
const BLE_UART_SERVICE = '0000ffe0-0000-1000-8000-00805f9b34fb';
const BLE_UART_TX = '0000ffe1-0000-1000-8000-00805f9b34fb'; // car -> app (notify)
const BLE_UART_RX = '0000ffe2-0000-1000-8000-00805f9b34fb'; // app -> car (write)
const BLE_SCAN_TIMEOUT_MS = 15000;

// Keys for SecureStore persistence of the last BLE device.
const LAST_BLE_DEVICE_ID_KEY = 'genum_last_ble_device_id';
const LAST_BLE_DEVICE_NAME_KEY = 'genum_last_ble_device_name';

// ---- BLE state (kept lazily initialised) ----
let bleManagerRef: any = null;
let bleDeviceId: string | null = null;
let bleTxCharacteristic: any = null;
let bleDisconnectSub: any = null;
let bleScanTimeout: ReturnType<typeof setTimeout> | null = null;

// ---- Command buffer (flush after each send) ----
let commandQueue: string[] = [];

/** True when running inside Expo Go, where custom-native BLE is impossible. */
function inExpoGo(): boolean {
  try {
    return Constants?.executionEnvironment === 'storeClient';
  } catch {
    return false;
  }
}

/** Persist the last BLE device ID + name to SecureStore. */
function persistLastBleDevice(id: string | null, name: string | null): void {
  try {
    if (id) {
      SecureStore.setItemAsync(LAST_BLE_DEVICE_ID_KEY, id);
      if (name) {
        SecureStore.setItemAsync(LAST_BLE_DEVICE_NAME_KEY, name);
      }
    } else {
      SecureStore.deleteItemAsync(LAST_BLE_DEVICE_ID_KEY).catch(() => {});
      SecureStore.deleteItemAsync(LAST_BLE_DEVICE_NAME_KEY).catch(() => {});
    }
  } catch {
    /* SecureStore failures must not block the build. */
  }
}

/** Retrieve the last BLE device ID + name from SecureStore. */
function retrieveLastBleDevice(): { id: string | null; name: string | null } {
  try {
    const id = SecureStore.getItemAsync(LAST_BLE_DEVICE_ID_KEY).catch(() => null);
    const name = SecureStore.getItemAsync(LAST_BLE_DEVICE_NAME_KEY).catch(() => null);
    return { id: id instanceof Promise ? id : id, name: name instanceof Promise ? name : name };
  } catch {
    return { id: null, name: null };
  }
}

/** Emit a kind + payload to the registered listener. */
function emit(kind: string, payload: string): void {
  listener?.(kind, payload);
}

/** Decode a base64 string to UTF-8 without relying on the Node `Buffer`
 * polyfill (Hermes provides atob; manual UTF-8 decode for safety). */
function base64ToUtf8(b64: string): string {
  try {
    if (typeof atob === 'function') {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder('utf-8').decode(bytes);
    }
  } catch {
    /* fall through */
  }
  return b64;
}

/** True when there is an open native socket to a car. */
export function roboBridgeConnected(): boolean {
  return ws?.readyState === WebSocket.OPEN || bleDeviceId !== null;
}

/** Register the callback that forwards ingress to the WebView. */
export function setRoboIngress(cb: RoboIngress | null): void {
  listener = cb;
}

// ---------------------------------------------------------------------
// WebSocket transport (LAN WiFi car)
// ---------------------------------------------------------------------

/** Open (or re-open) the native socket to the car at `url`. */
export function roboBridgeConnect(url?: string): Promise<void> {
  const target = (url && url.trim()) || DEFAULT_WS_URL;
  return new Promise<void>((resolve, reject) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    let settled = false;
    const socket = new WebSocket(target);
    ws = socket;

    socket.onopen = () => {
      if (settled) return;
      settled = true;
      emit('connected', 'WiFi car connected');
      resolve();
    };

    socket.onerror = () => {
      if (!settled) {
        settled = true;
        emit('error', 'Could not reach the car. Check its IP and that WiFi car firmware is running.');
        reject(new Error('WebSocket connection failed'));
      }
    };

    socket.onclose = () => {
      ws = null;
      lineBuffer = '';
      emit('disconnected', 'Car disconnected');
    };

    socket.onmessage = (event) => {
      if (typeof event.data === 'string') onData(event.data);
    };
  });
}

// ---------------------------------------------------------------------
// BLE transport (dev build only; Expo Go will report unavailable)
// ---------------------------------------------------------------------

function bleModule(): any | null {
  try {
    // Lazy require: never touches the native module until a connect is
    // actually requested, and only when running in a real (non-Go) build.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@sfourdrinier/react-native-ble-plx');
  } catch {
    return null;
  }
}

/** True when real BLE is possible (a dev/standalone build, not Expo Go). */
export function roboBridgeBleAvailable(): boolean {
  if (inExpoGo()) return false;
  return typeof bleModule()?.BleManager === 'function';
}

/** Check whether the OS already has a paired/connected device advertising
 * our UART service, without doing a full scan. */
function findPairedDevice(manager: any): { deviceId: string; device: any } | null {
  try {
    const devices = manager.connectedDevices?.([BLE_UART_SERVICE]);
    if (devices && devices.length > 0) {
      const d = devices[0];
      return { deviceId: d.id, device: d };
    }
    // Also try all known paired devices via manager.devices() if available.
    const all = manager.devices?.() ?? [];
    for (const d of all) {
      if (d.services?.includes?.BLE_UART_SERVICE || (d.serviceUuids && d.serviceUuids.includes(BLE_UART_SERVICE))) {
        return { deviceId: d.id, device: d };
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Scan for a car exposing the BLE UART service and connect to it. */
export function roboBridgeConnectBle(): Promise<void> {
  const mod = bleModule();
  if (inExpoGo()) {
    emit('error', 'Bluetooth (BLE) is not available in Expo Go. Install the development build of the app and retry.');
    return Promise.reject(new Error('BLE unavailable in Expo Go'));
  }
  if (!mod || typeof mod.BleManager !== 'function') {
    emit('error', 'Bluetooth (BLE) is not linked in this build. Rebuild the app with the BLE plugin and retry.');
    return Promise.reject(new Error('BLE unavailable in this build'));
  }

  // --- Auto-connect: try the remembered device first ---
  const { id: rememberedId, name: rememberedName } = retrieveLastBleDevice();
  if (rememberedId) {
    emit('connected', `Car connected (BLE) — ${rememberedName || ''}`);
    bleDeviceId = rememberedId;
    // Set up disconnect + telemetry for the remembered device.
    try {
      bleManagerRef = new mod.BleManager();
      bleDisconnectSub = bleManagerRef.onDisconnected(
        (_e: any, _d: any) => {
          bleDeviceId = null;
          bleTxCharacteristic = null;
          emit('disconnected', 'Car disconnected (BLE)');
        },
      );
      // Attempt to connect to the remembered device ID directly.
      try {
        const device = await bleManagerRef?.connect?.(bleDeviceId);
        if (device && device.id) {
          bleDeviceId = device.id;
          // set up telemetry monitoring.
          await device.discoverAllServicesAndCharacteristics();
          return Promise.resolve();
        }
      } catch (e) {
        // fall through to OS-connected / scan below
        bleDeviceId = null;
      }
    } catch (e) {
      bleDeviceId = null;
    }
  }

  // --- Check OS-connected devices that are advertising our service ---
  try {
    const mod2 = bleModule();
    if (mod2?.BleManager) {
      const paired = findPairedDevice(mod2);
      if (paired) {
        emit('connected', `Car connected (BLE) — ${paired.device.name || 'Paired device'}`);
        bleDeviceId = paired.deviceId;
        bleManagerRef = mod2.BleManager;
        bleDisconnectSub = bleManagerRef.onDisconnected(
          (_e: any, _d: any) => {
            bleDeviceId = null;
            bleTxCharacteristic = null;
            emit('disconnected', 'Car disconnected (BLE)');
          },
        );
        // set up telemetry monitoring for the paired device.
        try {
          await paired.device.discoverAllServicesAndCharacteristics?.();
        } catch {
          /* ignore */
        }
        return Promise.resolve();
      }
    }
  } catch {
    /* ignore */
  }

  // --- Full scan fallback (as before) ---
  if (bleDeviceId) {
    emit('connected', 'Car connected (BLE)');
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      stopBleScan();
      if (err) {
        emit('error', err.message || 'BLE connect failed');
        reject(err);
      } else {
        emit('connected', 'Car connected (BLE)');
        // Persist the newly connected device so next launch auto-connects.
        if (bleDeviceId) {
          persistLastBleDevice(bleDeviceId, bleDeviceId ? 'GENUM car' : null);
        }
        resolve();
      }
    };

    bleScanTimeout = setTimeout(() => {
      finish(new Error('No GENUM car found. Make sure the car is powered on and running the BLE UART sketch.'));
    }, BLE_SCAN_TIMEOUT_MS);

    manager.startDeviceScan(
      [BLE_UART_SERVICE],
      null,
      (scanError: any, scanned: any) => {
        if (scanError) {
          finish(new Error(scanError.message || 'BLE scan failed'));
          return;
        }
        if (!scanned) return;
        const name = scanned.name || 'GENUM car';
        stopBleScan();
        manager.stopDeviceScan?.();

        scanned
          .connect()
          .then((device: any) => {
            if (device.id) bleDeviceId = device.id;
            bleDisconnectSub = device.onDisconnected(
              (_e: any, _d: any) => {
                bleDeviceId = null;
                bleTxCharacteristic = null;
                emit('disconnected', 'Car disconnected (BLE)');
              },
            );
            return device.discoverAllServicesAndCharacteristics();
          })
          .then(async (device: any) => {
            const services = await device.services();
            let tx = null;
            for (const s of services) {
              const chars = await s.characteristics();
              for (const c of chars) {
                const uuid = c.uuid.toLowerCase();
                if (uuid === BLE_UART_TX.toLowerCase()) tx = c;
              }
            }
            if (!tx) {
              finish(new Error(`Connected to ${name} but found no TX channel.`));
              return;
            }
            bleTxCharacteristic = tx;
            await tx.monitor((_e: any, characteristic: any) => {
              const b64 = characteristic?.value;
              if (typeof b64 === 'string') {
                onData(base64ToUtf8(b64));
              }
            });
            finish();
          })
          .catch((err: any) => {
            finish(new Error(err?.message || 'BLE connection failed'));
          });
      },
    );
  });
}

// ---------------------------------------------------------------------
// Unified send / disconnect / dispatch
// ---------------------------------------------------------------------

/** Send a single protocol line (e.g. "F", "SPD170", "SERVO90", "2WD1M"). */
export function roboBridgeSend(line: string): Promise<void> {
  // Flush: add to queue, send, then immediately remove — no stale repeats.
  return new Promise<void>((resolve, reject) => {
    if (bleDeviceId && bleManagerRef && bleTxCharacteristic) {
      // Queue the command, then send it, then flush.
      commandQueue.push(line);
      bleTxCharacteristic
        .writeWithResponse(line + '\n')
        .catch(() => {
          // Fall back to writeWithoutResponse for HM-10 style modules.
          return bleTxCharacteristic.writeWithoutResponse(line + '\n');
        })
        .finally(() => {
          // Remove from queue after delivery attempt (regardless of success).
          commandQueue = commandQueue.filter((c) => c !== line);
          resolve();
        });
      return;
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      // Also flush the queue when not connected.
      commandQueue = [];
      return Promise.reject(new Error('Not connected'));
    }
    ws?.send(line + '\n');
    commandQueue = [];
    resolve();
  });
}

/** Close the active link (BLE or WS) and stop forwarding. */
export function roboBridgeDisconnect(): void {
  stopBleScan();
  try {
    bleDisconnectSub?.remove?.();
  } catch {
    /* ignore */
  }
  bleDisconnectSub = null;
  try {
    if (bleDeviceId && bleManagerRef) {
      bleManagerRef.cancelDeviceConnection(bleDeviceId).catch(() => {});
    }
  } catch {
    /* ignore */
  }
  bleDeviceId = null;
  bleTxCharacteristic = null;
  try {
    bleManagerRef?.destroy?.();
  } catch {
    /* ignore */
  }
  bleManagerRef = null;

  // Clear the command buffer on disconnect.
  commandQueue = [];

  if (ws) {
    try {
      ws.onclose = null;
      ws.close();
    } catch {
      /* ignore */
    }
  }
  ws = null;
  lineBuffer = '';
  emit('disconnected', 'Car disconnected');
}

/** Dispatch a connect request from the web bridge. */
export async function roboBridgeConnectGeneric(payload: RoboConnectPayload): Promise<void> {
  const transport = payload?.transport === 'ble' ? 'ble' : 'ws';
  if (transport === 'ble') {
    return roboBridgeConnectBle();
  }
  return roboBridgeConnect(payload?.url);
}

/** Type for the command queue (internal). */
export type QueuedCommand = string;