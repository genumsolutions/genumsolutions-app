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
import {
  DEFAULT_AP_IP,
  DEFAULT_WS_URL,
  parseTelemetryLine,
} from "../services/carProtocol";
import { linkManager, type CommandSender } from "./linkManager";
import type {
  DiscoveredDevice,
  Transport,
  TransportConnectOptions,
  TransportId,
  TransportStatus,
  TransportStatusEvent,
  TransportTeaching,
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
    teaching: {
      intro:
        "The car's BluetoothSerial radio speaks the same text protocol over a serial RFCOMM socket. The phone forms a real software serial port to the car, so the link is simple and has no router or hotspot involved.",
      needs:
        "An Android phone with Bluetooth. The car must be powered on and paired in the phone's Bluetooth settings.",
      when: "The default choice — the proven, reliable path here. Use it when the car is on the bench or wherever RF distance is enough.",
      steps: [
        "Pair the car ('4WD CAR') once in Android Settings → Connections → Bluetooth.",
        "In Connections → Bluetooth Classic (SPP), tap Scan for cars and pick it.",
        "The row shows Connected; open the Drive Deck and drive.",
      ],
    },
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
    // Honest until firmware ships a GATT UART service: this car build has no
    // BLE server, so the row is a registered PLACEHOLDER, not a live method.
    isSupported: () => false,
    roadmapNote:
      "Registered, waiting on firmware: the car's firmware must add a BLE UART (GATT) service before this method can work. The app side is ready; the next firmware round adds it.",
    teaching: {
      intro:
        "BLE GATT is a low-power Bluetooth link. A BLE-UART service (Rx/Tx characteristics) would carry the same text protocol as SPP, at lower power — useful for compact or battery-first builds.",
      needs:
        "Car firmware with a BLE UART service; a phone with Bluetooth Low Energy.",
      when: "A good future option for low-power cars. On this 4WD4M firmware build it is NOT available yet (see the roadmap note).",
      steps: [
        "Firmware: add the BLE-UART service (next firmware round).",
        "App: this row becomes selectable automatically once the service exists.",
        "Scan over BLE, pick the car, drive.",
      ],
    },
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
  teaching: TransportTeaching,
): Transport {
  let lastError: string | null = null;
  let currentUrl = defaultUrl;
  // Truthful status (owner: both WiFi rows used to show 'Connected' from ONE
  // shared socket): a row is 'connected' ONLY when the single process-wide
  // socket is open AND its URL is THIS transport's target. The other WiFi
  // topology can never light up from the same socket, so exactly one WiFi row
  // is live at a time.
  const target = () => currentUrl || defaultUrl;
  const ownsLiveSocket = () =>
    wifiService.isConnected && wifiService.url === target();
  return {
    id,
    label,
    radio: "wifi",
    blurb,
    teaching,
    // No "ota" over this link today: the car's WS is a text line protocol
    // with no streaming firmware path yet. Declaring the absence is the
    // point of the contract — the UI hides the option instead of offering
    // a button that half-works.
    capabilities: ["drive", "telemetry", "mode", "wifiConfig"],
    isSupported: () => true,
    getStatus: () => {
      if (lastError) return "error";
      if (ownsLiveSocket()) return "connected";
      if (wifiService.isConnecting) return "connecting";
      return "idle";
    },
    isConnected: () => ownsLiveSocket(),
    getTargetLabel: () => wifiService.url ?? target(),
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

const WIFI_AP_TEACHING: TransportTeaching = {
  intro:
    "The car runs its own access point (4WDCar_Wifi on 192.168.245.1). The phone joins that hotspot directly, so no router or home internet is needed at all — the car IS the network.",
  needs:
    "A WiFi phone. The car powered on and broadcasting 4WDCar_Wifi (it always does unless it joined a home router and you prefer that).",
  when: "The easy WiFi default: it works anywhere, no router, no passwords. Use it whenever the car is not already joined to your home router.",
  steps: [
    "Join 4WDCar_Wifi from the phone's WiFi settings (no password).",
    "In Connections → Car access point (WiFi), keep the default ws://192.168.245.1:81 and press Connect.",
    "The row turns Connected once the car answers a STATE request ('verified').",
  ],
};

const WIFI_STA_TEACHING: TransportTeaching = {
  intro:
    "The car joins your home/office router (STA — it becomes a client of the router), and the phone reaches it over the SAME WiFi network at the car's LAN address.",
  needs:
    "The car must be provisioned with the router (Connections → WiFi setup, or the Router panel: add the SSID + password and 'use' it). The phone must be on that same network.",
  when: "Pick this when the car is already joined to your router — longer range, and the same router keeps both car and phone on one LAN. Requires the router password to provision once.",
  steps: [
    "Provision the router once (SSID + password) so the car can join it.",
    "Confirm the car is ON the router (its network row shows the router SSID and signal).",
    "In Connections → Home router (WiFi), enter the car's LAN address (the IP it reports) as ws://<ip>:81 and press Connect.",
  ],
};

export function createWifiApTransport(): Transport {
  return createWifiWsTransport(
    "wifi-ap-ws",
    "Car access point (WiFi)",
    `Phone joins the car's own hotspot · ${DEFAULT_AP_IP}`,
    DEFAULT_WS_URL,
    WIFI_AP_TEACHING,
  );
}

export function createWifiStaTransport(): Transport {
  return createWifiWsTransport(
    "wifi-sta-ws",
    "Home router (WiFi)",
    "Car and phone on the same WiFi network",
    // Deliberately empty: the router-side IP is per-installation and the
    // owner must type it (the connections surface shows the car-reported IP).
    "",
    WIFI_STA_TEACHING,
  );
}

// --- HTTP / REST ----------------------------------------------------

const HTTP_TEACHING: TransportTeaching = {
  intro:
    "The car's built-in web server answers plain HTTP on port 80: /forward, /backward, /left, /right, /stop, /speed?val=, /mode?val= and /status. REST is the same text protocol without a persistent socket — every command is one request, so any browser or script can drive the car.",
  needs:
    "HTTP reachability only. Same as the AP method when phone is on 4WDCar_Wifi (http://192.168.245.1:80), or the car's LAN address when both are on a router.",
  when: "Great for scripts, browser tests and quick link checks. Telemetry is polled (/status), not pushed, so prefer the WebSocket methods for continuous driving.",
  steps: [
    "Confirm the car answers in a browser: http://192.168.245.1/status returns JSON.",
    "In Connections → HTTP/REST keep http://192.168.245.1:80 and press Connect.",
    "Drive letters (F/B/L/R/S), SPD<n> and mode tokens map to /f, /b, /l, /r, /stop, /speed?val=, /mode?val=; one /status round-trip verifies the link.",
  ],
};

export function createHttpTransport(): Transport {
  let lastError: string | null = null;
  let currentUrl = `http://${DEFAULT_AP_IP}:80`;
  let connected = false;

  const telemetryCbs: Array<(t: unknown) => void> = [];
  const statusCbs: Array<(e: TransportStatusEvent) => void> = [];
  const emitTelemetry = (t: unknown) => {
    for (const cb of telemetryCbs) cb(t);
  };
  const emitStatus = (kind: TransportStatusEvent["kind"], message?: string) => {
    for (const cb of statusCbs) cb({ kind, message });
  };

  const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const id = setTimeout(
        () => reject(new Error(`No answer from ${currentUrl} (timeout).`)),
        ms,
      );
      p.then(
        (v) => {
          clearTimeout(id);
          resolve(v);
        },
        (e) => {
          clearTimeout(id);
          reject(
            e instanceof Error
              ? e
              : new Error(`Request to ${currentUrl} failed.`),
          );
        },
      );
    });

  const json = async (
    path: string,
  ): Promise<Record<string, unknown> | null> => {
    const res = await withTimeout(fetch(`${currentUrl}${path}`), 6000);
    if (!res.ok) return null;
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      return j && typeof j === "object" ? (j as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };

  return {
    id: "http",
    label: "HTTP / REST (web server)",
    radio: "internet",
    blurb: "Drive the car's built-in web page with plain HTTP requests",
    capabilities: ["drive", "telemetry", "mode"],
    teaching: HTTP_TEACHING,
    isSupported: () => true,
    getStatus: () => statusFrom(connected, false, lastError),
    isConnected: () => connected,
    getTargetLabel: () => currentUrl,
    getLastError: () => lastError,
    async connect(o: TransportConnectOptions = {}) {
      const url = (o.url ?? currentUrl).trim();
      if (!url) throw new Error("Enter the car's HTTP address.");
      if (!/^https?:\/\//i.test(url)) {
        throw new Error("The address must start with http:// or https://");
      }
      lastError = null;
      currentUrl = url;
      try {
        const j = await json("/status");
        if (!j) throw new Error(`The car did not answer at ${url}`);
        connected = true;
        emitStatus("connected", url);
        emitTelemetry(parseTelemetryLine(JSON.stringify(j)));
      } catch (e) {
        connected = false;
        const msg = e instanceof Error ? e.message : String(e);
        lastError = msg;
        emitStatus("error", msg);
        throw e;
      }
    },
    async disconnect() {
      connected = false;
      emitStatus("disconnected");
    },
    async sendLine(line: string) {
      if (!connected) throw new Error("Not connected");
      const c = line.trim();
      const up = c.toUpperCase();
      let path: string | null = null;
      if (c === "S") path = "/stop";
      else if (/^[FBLR]$/.test(c)) path = `/${c.toLowerCase()}`;
      else if (c === "ESTOP")
        path = "/stop"; // no ESTOP route; safest stop
      else {
        const mSpd = /^SPD(\d{1,3})$/.exec(up);
        if (mSpd) path = `/speed?val=${Number(mSpd[1])}`;
        else {
          const mMode = /^(?:MODE_)?([A-Z0-9_]{2,})$/.exec(up);
          if (
            mMode &&
            !/^(?:SERVO|STEER|TRIM|GIMBAL|ALT|OUT|CFG|ROUTERS?|WIFI)/.test(
              mMode[1]!,
            )
          ) {
            path = `/mode?val=${mMode[1]}`;
          }
        }
      }
      if (!path) {
        throw new Error(`HTTP/REST cannot send "${line}" (no /route for it).`);
      }
      const j = await json(path);
      if (j && j.ok !== false) return;
      throw new Error(`The car rejected ${path} over HTTP.`);
    },
    async requestState() {
      if (!connected) throw new Error("Not connected");
      const j = await json("/status");
      if (j) emitTelemetry(parseTelemetryLine(JSON.stringify(j)));
    },
    onTelemetry: (cb) => {
      telemetryCbs.push(cb);
      return () => {
        const i = telemetryCbs.indexOf(cb);
        if (i >= 0) telemetryCbs.splice(i, 1);
      };
    },
    onStatus: (cb) => {
      statusCbs.push(cb);
      return () => {
        const i = statusCbs.indexOf(cb);
        if (i >= 0) statusCbs.splice(i, 1);
      };
    },
  };
}

// --- registered placeholders (the rest of the possible comm methods) --

/**
 * A registered-but-not-implemented comm method. `isSupported()` is false so
 * the picker shows the row (with teaching + a roadmap note) but never lets it
 * become the active link. This is the owner's full registry: no possible
 * method is missing from the UI, and each one explains what it would take.
 */
function createPlaceholderTransport(
  id: TransportId,
  label: string,
  radio: Transport["radio"],
  blurb: string,
  capabilities: Transport["capabilities"],
  teaching: TransportTeaching,
  roadmapNote: string,
): Transport {
  return {
    id,
    label,
    radio,
    blurb,
    capabilities,
    teaching,
    roadmapNote,
    isSupported: () => false,
    getStatus: () => "idle",
    isConnected: () => false,
    getTargetLabel: () => null,
    getLastError: () => null,
    async connect() {
      throw new Error(roadmapNote);
    },
    async disconnect() {},
    async sendLine() {
      throw new Error(`${label} is not available on this build.`);
    },
    async requestState() {},
    onTelemetry: () => () => {},
    onStatus: () => () => {},
  };
}

function createMdnssTransport(): Transport {
  return createPlaceholderTransport(
    "mdns",
    "mDNS · genum-car.local",
    "wifi",
    "Discover the car on the LAN by name instead of typing its IP",
    ["telemetry"],
    {
      intro:
        "mDNS lets the phone find the car by a fixed name (genum-car.local) on the same network, so you never need to know its IP.",
      needs:
        "Car firmware that advertises mDNS; phone on the same WiFi network.",
      when: "A future convenience for the Home-router method.",
      steps: [
        "Firmware round: advertise genum-car.local over mDNS.",
        "App chooses the URL automatically; no IP to type.",
      ],
    },
    "Roadmap: needs the car to advertise mDNS (a firmware addition). The row stays here so the method is visible and one day live.",
  );
}

function createMqttTransport(): Transport {
  return createPlaceholderTransport(
    "mqtt",
    "MQTT (broker)",
    "internet",
    "Car talks to a message broker on the LAN or the internet",
    ["telemetry", "mode"],
    {
      intro:
        "MQTT is a publish/subscribe protocol: both the phone and the car talk to a broker, so control and telemetry flow through one hub — even across the internet.",
      needs:
        "A broker (e.g. Mosquitto) reachable by both sides; firmware MQTT client.",
      when: "The future path to control the car from anywhere (cloud relay). Needs a broker decision first.",
      steps: [
        "Choose/deploy a broker and decide credentials.",
        "Firmware round: add the MQTT client + the same text protocol over topic messages.",
        "App registers the broker, connects, drives over the internet.",
      ],
    },
    "Roadmap: needs a broker (LAN or cloud) plus firmware MQTT support. No broker is hosted yet — recorded as an open decision.",
  );
}

function createUsbTransport(): Transport {
  return createPlaceholderTransport(
    "usb-serial",
    "USB serial (bench)",
    "wired",
    "A USB cable straight to the car's serial port — the best bench tool",
    ["drive", "telemetry", "mode"],
    {
      intro:
        "A USB cable to the car's UART is the simplest, most reliable bench link — no radio at all. Great for firmware bring-up and lab diagnostics.",
      needs:
        "A phone or computer with a USB-serial adapter driver; a bench cable.",
      when: "Purely for the workbench; not for normal driving.",
      steps: [
        "Plug the car into the USB-serial port.",
        "App registers the virtual COM port (needs the USB serial native module), picks it as the active link.",
      ],
    },
    "Roadmap: needs a native USB-serial module and a driver path — the best bench tool once wired.",
  );
}

function createCloudRelayTransport(): Transport {
  return createPlaceholderTransport(
    "cloud-relay",
    "Internet relay",
    "internet",
    "Control the car from anywhere via a cloud relay",
    ["telemetry", "mode"],
    {
      intro:
        "STA/Home-router control is limited to the LAN. An internet relay (broker or tunnel) would let the phone reach the car from anywhere, exactly like the app's other cloud services.",
      needs:
        "A hosted relay/tunnel service; the car must be on a network that can reach it.",
      when: "The future 'drive from anywhere' mode. LAN STA works today; internet needs the relay decision.",
      steps: [
        "Decide the relay (MQTT broker or WebRTC-style tunnel).",
        "Firmware + app both connect to the relay.",
        "Drive from any network.",
      ],
    },
    "Roadmap: no relay/tunnel service is hosted yet — LAN control works today; this is the recorded path to internet control.",
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
    createHttpTransport(),
    createMdnssTransport(),
    createMqttTransport(),
    createUsbTransport(),
    createCloudRelayTransport(),
  ];
  for (const t of built) linkManager.register(t);
}

/** The command path the rest of the app uses. Routes to the chosen link. */
export const sendViaActiveLink: CommandSender = (line) =>
  linkManager.sendLine(line);

/** Exposed for the Control Panel's "open the car's page" action. */
export { DEFAULT_AP_IP };
