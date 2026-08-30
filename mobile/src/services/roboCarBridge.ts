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
//     -> SiteScreen -> bridge.sendLine(...) -> car.
//
// Transport today: a native WebSocket to a LAN WiFi car (ESP_CLI / ESP_SER),
// which works with the current firmware and needs no native rebuild - so this
// loads safely in Expo Go too. A BLE (react-native-ble-plx) transport is the
// dev-build follow-up and is deliberately NOT imported here so the Expo Go
// shell never instantiates a BleManager (it can crash the shell).
// =====================================================================

const DEFAULT_WS_URL = 'ws://192.168.4.1:81';

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

function emit(kind: RoboIngressKind, payload: string) {
  listener?.(kind, payload);
}

function parseLine(line: string): void {
  const trimmed = line.trim();
  if (!trimmed) return;
  const up = trimmed.toUpperCase();

  // Relay whole lines the page understands. The page's parseTelemetryLine
  // is the single source of truth for STATE.../TEL.../SPD<n>; streaming the
  // raw line lets it stay exactly in sync with the in-page WS transport.
  emit('telemetry', trimmed);

  // Also surface a compact status signal derived from STATE;MODE=... so the
  // page can reflect mode even if the car only emits STATE lines.
  if (up.includes('MODE=') && up.includes('STATUS=')) {
    // Nothing extra - the page parses MODE/STATUS from the full line itself.
  }
}

function onData(data: string): void {
  lineBuffer += data;
  const lines = lineBuffer.split('\n');
  lineBuffer = lines.pop() ?? '';
  for (const l of lines) parseLine(l);
}

/** True when there is an open native socket to a car. */
export function roboBridgeConnected(): boolean {
  return ws?.readyState === WebSocket.OPEN;
}

/** Register the callback that forwards ingress to the WebView. */
export function setRoboIngress(cb: RoboIngress | null): void {
  listener = cb;
}

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

/** Send a single protocol line (e.g. "F", "SPD170", "SERVO90", "2WD1M"). */
export function roboBridgeSend(line: string): Promise<void> {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error('Not connected'));
  }
  ws.send(line + '\n');
  return Promise.resolve();
}

/** Close the native socket and stop forwarding. */
export function roboBridgeDisconnect(): void {
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
