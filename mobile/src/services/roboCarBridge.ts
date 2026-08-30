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
// =====================================================================
import Constants from 'expo-constants';

const DEFAULT_WS_URL = 'ws://192.168.4.1:81';

// Matches genum-car-ble.ino and the web BLE constants.
const BLE_UART_SERVICE = '0000ffe0-0000-1000-8000-00805f9b34fb';
const BLE_UART_TX = '0000ffe1-0000-1000-8000-00805f9b34fb'; // car -> app (notify)
const BLE_UART_RX = '0000ffe2-0000-1000-8000-00805f9b34fb'; // app -> car (write)
const BLE_SCAN_TIMEOUT_MS = 15000;

/** True when running inside Expo Go, where custom-native BLE is impossible. */
function inExpoGo(): boolean {
  try {
    return Constants?.executionEnvironment === 'storeClient';
  } catch {
    return false;
  }
}

export type RoboIngressKind =
  | 'telemetry'
  | 'status'
  | 'connected'
  | 'disconnected'
  | 'error';

export type RoboIngress = (kind: RoboIngressKind, payload: string) => void;

let ws: WebSocket | null = null;
let lineBuffer = '';
let listener: RoboIngress | null = null;
let activeUrl = DEFAULT_WS_URL;

// ---- BLE state (kept lazily initialised) ----
let bleManagerRef: any = null;
let bleDeviceId: string | null = null;
let bleTxCharacteristic: any = null;
let bleDisconnectSub: any = null;
let bleScanTimeout: ReturnType<typeof setTimeout> | null = null;

function emit(kind: RoboIngressKind, payload: string) {
  listener?.(kind, payload);
}

function onData(data: string): void {
  lineBuffer += data;
  const lines = lineBuffer.split('\n');
  lineBuffer = lines.pop() ?? '';
  for (const l of lines) {
    const trimmed = l.trim();
    if (trimmed) emit('telemetry', trimmed);
  }
}

// Decode a base64 string to UTF-8 without relying on the Node `Buffer`
// polyfill (Hermes provides atob; manual UTF-8 decode for safety).
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
  const target = (url && url.trim()) || activeUrl;
  return new Promise<void>((resolve, reject) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    let settled = false;
    const socket = new WebSocket(target);
    ws = socket;
    activeUrl = target;

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

function stopBleScan() {
  try {
    bleManagerRef?.stopDeviceScan?.();
  } catch {
    /* ignore */
  }
  if (bleScanTimeout) {
    clearTimeout(bleScanTimeout);
    bleScanTimeout = null;
  }
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

  if (bleDeviceId) {
    emit('connected', 'Car connected (BLE)');
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    let manager: any;
    try {
      manager = new mod.BleManager();
    } catch (e) {
      emit('error', 'Bluetooth (BLE) could not start. Rebuild the app with the BLE plugin and retry.');
      reject(e instanceof Error ? e : new Error('BLE manager failed'));
      return;
    }
    bleManagerRef = manager;

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
                if (uuid === BLE_UART_TX) tx = c;
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
  if (bleDeviceId && bleManagerRef && bleTxCharacteristic) {
    return bleTxCharacteristic
      .writeWithResponse(line + '\n')
      .catch(() => {
        // Fall back to writeWithoutResponse for HM-10 style modules.
        return bleTxCharacteristic.writeWithoutResponse(line + '\n');
      });
  }
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error('Not connected'));
  }
  ws.send(line + '\n');
  return Promise.resolve();
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

export type RoboConnectPayload = {
  transport?: 'ws' | 'ble';
  url?: string;
};

/** Dispatch a connect request from the web bridge. */
export async function roboBridgeConnectGeneric(payload: RoboConnectPayload): Promise<void> {
  const transport = payload?.transport === 'ble' ? 'ble' : 'ws';
  if (transport === 'ble') {
    return roboBridgeConnectBle();
  }
  return roboBridgeConnect(payload?.url);
}
