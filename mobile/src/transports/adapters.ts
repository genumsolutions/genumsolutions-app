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
  SPEED_MIN,
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
      serverClient:
        "The car is the SERVER and the phone is the CLIENT, and the pairing is symmetric-free: the car advertises the name '4WD CAR' from boot and simply waits, so the phone is always the side that initiates. The phone therefore picks the car from a scan — there is no address to type. Because the link is direct, it survives with no router and no internet, and the car keeps driving even if the phone's WiFi is on someone else's network.",
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
    // F-46: the service method MUST be invoked ON its object — passing the
    // bare reference detached `this`, so `this.statusCallbacks` threw
    // "Cannot read properties of undefined" on every adopt/activate and the
    // hub painted it as a red connect error under a perfectly verified link.
    onStatus: (cb) =>
      forwardStatus(
        (onCb) => sppService.onStatus(onCb),
        (m) => (lastError = m),
        cb,
      ),
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
      serverClient:
        "The car is the GATT SERVER and the phone is the GATT CLIENT — and unlike SPP, a BLE peripheral has to ADVERTISE first, so the phone must scan to find the car rather than dialing a known name. Low power is the whole point: the car can sleep between commands instead of holding an open connection, at the cost of latency and a smaller payload per packet.",
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
    // F-46 — same detached-`this` fix as the SPP adapter above.
    onStatus: (cb) =>
      forwardStatus(
        (onCb) => bleService.onStatus(onCb),
        (m) => (lastError = m),
        cb,
      ),
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
    // F-46 — same detached-`this` fix as the SPP adapter above.
    onStatus: (cb) =>
      forwardStatus(
        (onCb) => wifiService.onStatus(onCb),
        (m) => (lastError = m),
        cb,
      ),
  };
}

const WIFI_AP_TEACHING: TransportTeaching = {
  intro:
    "The car runs its own access point (4WDCar_Wifi on 192.168.245.1). The phone joins that hotspot directly, so no router or home internet is needed at all — the car IS the network.",
  needs:
    "A WiFi phone. The car powered on and broadcasting 4WDCar_Wifi (it always does unless it joined a home router and you prefer that).",
  when: "The easy WiFi default: it works anywhere, no router, no passwords. Use it whenever the car is not already joined to your home router.",
  serverClient:
    "The car is the SERVER and the phone is the CLIENT: the car creates the network and publishes a fixed address (192.168.245.1), then waits for the phone to dial in. The phone must therefore be the one that connects. Because the car chose the network, there is no router, no password and no internet — but only one such car is reachable at a time from a given phone.",
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
  serverClient:
    "Both sides are CLIENTS of your router — that is what STA means. The router is the only server here, and it hands each device its own address, so the car needs a router before the phone can find it. Two consequences: the car cannot be reached at all until it has joined a router, and its address can change between joins, so the phone reads the current IP off the car's STATE line or the OLED rather than assuming one. With both on one LAN, more than one car can be reachable at once.",
  steps: [
    "Provision the router once (SSID + password) so the car can join it.",
    "Confirm the car is ON the router (its network row shows the router SSID).",
    "In Connections → Home router (WiFi), enter the car's LAN address (the IP it reports) as ws://<ip>:81 and press Connect.",
  ],
  // Honest limits, stated where the owner reads them (F-51: a help window that
  // promises a capability the car cannot deliver is the same defect as a route
  // the car does not serve):
  //  • the car reports the SSID it is on, NOT a signal strength — no firmware
  //    in the fleet answers ROUTERS;SCAN, so the smart-link strength pick falls
  //    back to most-recently-used. Do not promise a "signal" here.
  //  • mDNS name resolution is a roadmap item; the LAN address is typed today.
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
  serverClient:
    "The car is the HTTP SERVER and the phone is the CLIENT — this is the clearest example of the split. The car listens on port 80 and holds nothing open; the phone sends one request per command and the car answers immediately, then the connection closes. Two consequences worth knowing: because nothing stays open, the car can never push to the phone (so telemetry must be polled at /status, which is why this method is for checks and scripts rather than driving), and because each command is a separate request, a lost packet loses exactly one command instead of a queued batch.",
  steps: [
    "Confirm the car answers in a browser: http://192.168.245.1/status returns JSON.",
    "In Connections → HTTP/REST keep http://192.168.245.1:80 and press Connect.",
    "Drive letters (F/B/L/R/S), SPD<n> and mode tokens map to /forward, /backward, /left, /right, /stop, /speed?val=, /mode?val=; one /status round-trip verifies the link.",
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
      // The car's web server registers the SPELLED-OUT routes
      // /forward /backward /left /right (WebServerComm.cpp server.on calls,
      // identical on the wireless donor car and the 4WD4M testbed). This
      // adapter used to build /f /b /l /r, which the car answers with a
      // 404 Not Found — so every direction command silently failed while
      // the link still looked healthy. One wrong byte-pair, exactly the
      // class F-30 records. The routes are named here once, from the
      // firmware, and pinned by adapters.test.ts.
      else if (c === "F") path = "/forward";
      else if (c === "B") path = "/backward";
      else if (c === "L") path = "/left";
      else if (c === "R") path = "/right";
      else if (c === "ESTOP")
        path = "/stop"; // no ESTOP route; safest stop
      else {
        const mSpd = /^SPD(\d{1,3})$/.exec(up);
        if (mSpd) {
          const value = Number(mSpd[1]);
          // SPD0 is a STOP line (SAFE_STOP_LINES), but /speed has no stop
          // semantics: the firmware clamps with constrain(val, MIN_SPEED,
          // MAX_SPEED), so SPD0 would become speed 100 and the car would
          // DRIVE. On BT/WS the car treats SPD0 as a stop, so mapping it to
          // /speed?val=0 made the SAME neutral command mean opposite things
          // on two transports — the exact "two dialects for one field" trap
          // F-30 records. Route every sub-floor speed to /stop instead.
          if (value < SPEED_MIN) path = "/stop";
          else path = `/speed?val=${value}`;
        } else {
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
      serverClient:
        "The phone is the CLIENT asking the network a QUESTION: 'what address is genum-car.local?' A small DNS responder on the car answers. Nothing about who dials whom changes — this sits on top of the Home-router method, where the car is still a client of your router. The whole point is that you stop typing an IP, so it is a convenience layer, never a new connection type.",
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
      serverClient:
        "Neither side connects to the other. BOTH the phone and the car are CLIENTS of a broker, and each one dials OUT to it — the broker is the only server, and it holds both connections and passes messages between them. That is the whole reason MQTT is the answer for 'drive from anywhere': neither device needs to be reachable or even on the same network, because each makes its own outbound connection. It also means credentials become a real concern — a broker with a public address needs a per-device login, which is why this row stays parked until that decision is made.",
      steps: [
        "Choose/deploy a broker and decide credentials.",
        "Firmware round: add the MQTT client + the same text protocol over topic messages.",
        "App registers the broker, connects, drives over the internet.",
      ],
    },
    "Roadmap: needs a broker (LAN or cloud) plus firmware MQTT support. No broker is hosted yet — recorded as an open decision.",
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
      serverClient:
        "The car dials OUT to a relay on the public internet, so the relay can reach the car even though the car sits behind a home router that would otherwise hide it. The phone then connects to that same relay. Both sides are clients of the relay — the car is not reachable directly at all. This is the same 'dial outward' shape as MQTT, differing in that the relay is a purpose-built tunnel for this one app rather than a general message bus.",
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

/**
 * Every registered transport, in display order.
 *
 * Exported (not just folded into registerAllTransports) so the F-41 method
 * gate can be asserted against the REAL registry in CI: a policy test built on
 * a hand-written list of ids proves nothing about the ids that actually ship —
 * that is F-51's second rule applied to our own tests.
 */
export function buildAllTransports(): Transport[] {
  return [
    createClassicBtTransport(),
    createBleTransport(),
    createWifiApTransport(),
    createWifiStaTransport(),
    createHttpTransport(),
    createMdnssTransport(),
    createMqttTransport(),
    createCloudRelayTransport(),
  ];
}

/** Build and register every transport. Idempotent. */
export function registerAllTransports(): void {
  for (const t of buildAllTransports()) linkManager.register(t);
}

/** The command path the rest of the app uses. Routes to the chosen link. */
export const sendViaActiveLink: CommandSender = (line) =>
  linkManager.sendLine(line);

/** Exposed for the Control Panel's "open the car's page" action. */
export { DEFAULT_AP_IP };
