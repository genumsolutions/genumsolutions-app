// =====================================================================
// transports/adapters — thin wrappers putting the three existing link
// singletons behind the Transport contract.
//
// These deliberately ADD NO BEHAVIOUR. bleService / sppService /
// wifiService keep their own public APIs and their own singletons, because
// Bluetooth is working perfectly in the field and a rewrite risks it. Each
// adapter is a mechanical translation, so a regression here is obvious.
//
// The one real behaviour added: Classic-BT is split into two transports
// (bt-classic = SPP, bt-ble = GATT) rather than one "bluetooth" row,
// because the owner asked to CHOOSE the connection method and those are
// genuinely different radios with different pairing flows on the phone.
//
// Wifi is likewise split by network topology, which is the choice the owner
// actually has to make:
//   • wifi-ap-ws  — the car runs its own access point, phone joins it
//                   directly. Works with no router. Default.
//   • wifi-sta-ws — the car joined a home/office router and the phone
//                   reaches it over the same LAN. Only useful once the car
//                   is on the same WiFi as the phone.
// Both speak the identical ws:// protocol; they differ only in the URL, so
// they share one implementation and differ in defaults.
// =====================================================================
import { bleService, type BleDevice } from "../services/bleService";
import { sppService, type SppDevice } from "../services/sppService";
import { wifiService } from "../services/wifiService";
import { DEFAULT_AP_IP, DEFAULT_WS_URL } from "../services/carProtocol";
import { linkManager, type CommandSender } from "./linkManager";
import type {
  DiscoveredDevice,
  Transport,
  TransportConnectOptions,
  TransportId,
  TransportStatus,
  TransportStatusEvent,
} from "./types";

/** Derive a contract status from a service's isConnected/isConnecting. */
function statusFrom(
  isConnected: boolean,
  isConnecting: boolean,
  lastError: string | null,
): TransportStatus {
  if (lastError) return "error";
  if (isConnected) return "connected";
  if (isConnecting) return "connecting";
  return "idle";
}

/** Adapt a service's (kind, message) status events to the contract. */
function forwardStatus(
  subscribe: (cb: (kind: string, message?: string) => void) => () => void,
  setError: (m: string | null) => void,
  emit: (e: TransportStatusEvent) => void,
): () => void {
  return subscribe((kind, message) => {
    if (kind === "error") setError(message ?? "Connection failed");
    else if (kind === "disconnected") setError(null);
    emit({ kind: kind as TransportStatusEvent["kind"], message });
  });
}

// --- Classic Bluetooth (SPP) ----------------------------------------

export function createClassicBtTransport(): Transport {
  let lastError: string | null = null;
  return {
    id: "bt-classic",
    label: "Bluetooth Classic (SPP)",
    radio: "bluetooth",
    blurb: "Paired car over RFCOMM — the proven working link",
    capabilities: ["drive", "telemetry", "mode", "wifiConfig"],
    isSupported: () => sppService.supported,
    getStatus: () =>
      statusFrom(sppService.isConnected, sppService.isConnecting, lastError),
    isConnected: () => sppService.isConnected,
    getTargetLabel: () => sppService.deviceName ?? sppService.currentAddress,
    getLastError: () => lastError,
    async scan(): Promise<DiscoveredDevice[]> {
      const found: SppDevice[] = await sppService.scan();
      return found.map((d) => ({
        id: d.address,
        name: d.name || d.address,
        detail: d.bonded ? "Paired" : "Not paired",
      }));
    },
    async connect(o: TransportConnectOptions = {}) {
      if (!o.address) throw new Error("Pick a car from the Bluetooth list.");
      lastError = null;
      await sppService.connect(o.address);
    },
    async disconnect() {
      await sppService.disconnect();
    },
    async sendLine(line: string) {
      await sppService.sendLine(line);
    },
    async requestState() {
      await sppService.requestState();
    },
    onTelemetry: (cb) => sppService.onTelemetry((t) => cb(t)),
    onStatus: (cb) =>
      forwardStatus(sppService.onStatus, (m) => (lastError = m), cb),
  };
}

// --- Bluetooth Low Energy (GATT) ------------------------------------

export function createBleTransport(): Transport {
  let lastError: string | null = null;
  return {
    id: "bt-ble",
    label: "Bluetooth Low Energy (GATT)",
    radio: "bluetooth",
    blurb: "Low-power BLE link to the car's UART service",
    capabilities: ["drive", "telemetry", "mode"],
    isSupported: () => true,
    getStatus: () => statusFrom(bleService.isConnected, false, lastError),
    isConnected: () => bleService.isConnected,
    getTargetLabel: () => bleService.deviceName ?? bleService.deviceId,
    getLastError: () => lastError,
    async scan(): Promise<DiscoveredDevice[]> {
      const found: BleDevice[] = await bleService.scan();
      return found.map((d) => ({
        id: d.id,
        name: d.name || d.id,
        detail: `${d.rssi} dBm`,
      }));
    },
    async connect(o: TransportConnectOptions = {}) {
      if (!o.address) throw new Error("Pick a car from the BLE list.");
      lastError = null;
      await bleService.connect(o.address);
    },
    async disconnect() {
      await bleService.disconnect();
    },
    async sendLine(line: string) {
      await bleService.sendLine(line);
    },
    async requestState() {
      await bleService.requestState();
    },
    onTelemetry: (cb) => bleService.onTelemetry((t) => cb(t)),
    onStatus: (cb) =>
      forwardStatus(bleService.onStatus, (m) => (lastError = m), cb),
  };
}

// --- WiFi WebSocket (shared by the AP and router topologies) --------

function createWifiWsTransport(
  id: TransportId,
  label: string,
  blurb: string,
  defaultUrl: string,
): Transport {
  let lastError: string | null = null;
  let currentUrl = defaultUrl;
  return {
    id,
    label,
    radio: "wifi",
    blurb,
    // No "ota" over this link today: the car's WS is a text line protocol
    // with no streaming firmware path yet. Declaring the absence is the
    // point of the contract — the UI hides the option instead of offering
    // a button that half-works.
    capabilities: ["drive", "telemetry", "mode", "wifiConfig"],
    isSupported: () => true,
    getStatus: () =>
      statusFrom(wifiService.isConnected, wifiService.isConnecting, lastError),
    isConnected: () => wifiService.isConnected,
    getTargetLabel: () => wifiService.url ?? currentUrl,
    getLastError: () => lastError,
    async connect(o: TransportConnectOptions = {}) {
      const url = (o.url ?? currentUrl ?? defaultUrl).trim();
      if (!url) throw new Error("Enter the car's WebSocket address.");
      if (!/^wss?:\/\//i.test(url)) {
        throw new Error("The address must start with ws:// or wss://");
      }
      lastError = null;
      currentUrl = url;
      await wifiService.connect(url);
      // The socket opening is not proof of life — the car must answer.
      const alive = await wifiService.waitForCarAnswer();
      if (!alive) {
        lastError = `Connected to ${url} but the car never answered.`;
        throw new Error(lastError);
      }
    },
    async disconnect() {
      await wifiService.disconnect();
    },
    async sendLine(line: string) {
      await wifiService.sendLine(line);
    },
    async requestState() {
      await wifiService.requestState();
    },
    onTelemetry: (cb) => wifiService.onTelemetry((t) => cb(t)),
    onStatus: (cb) =>
      forwardStatus(wifiService.onStatus, (m) => (lastError = m), cb),
  };
}

export function createWifiApTransport(): Transport {
  return createWifiWsTransport(
    "wifi-ap-ws",
    "Car access point (WiFi)",
    `Phone joins the car's own hotspot · ${DEFAULT_AP_IP}`,
    DEFAULT_WS_URL,
  );
}

export function createWifiStaTransport(): Transport {
  return createWifiWsTransport(
    "wifi-sta-ws",
    "Home router (WiFi)",
    "Car and phone on the same WiFi network",
    // Deliberately empty: the router-side IP is per-installation and the
    // owner must type it (RouterPanel shows the car-reported address).
    "",
  );
}

// --- registry --------------------------------------------------------

/** Build and register every transport. Idempotent. */
export function registerAllTransports(): void {
  const built: Transport[] = [
    createClassicBtTransport(),
    createBleTransport(),
    createWifiApTransport(),
    createWifiStaTransport(),
  ];
  for (const t of built) linkManager.register(t);
}

/** The command path the rest of the app uses. Routes to the chosen link. */
export const sendViaActiveLink: CommandSender = (line) =>
  linkManager.sendLine(line);

/** Exposed for the Control Panel's "open the car's page" action. */
export { DEFAULT_AP_IP };
