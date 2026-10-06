// =====================================================================
// transports/types — the ONE contract every car link implements.
//
// WHY this exists (owner 2026-09-28): "I want this app to be able to
// communicate and control ALL the types of wifi and bluetooth
// communications ... the user gets to choose to select one which they
// like at a time. The app already has the bluetooth and wifi setup, of
// which bluetooth set is working fine but doesn't show or allow to choose
// which type of communications the user is going to select."
//
// The picker that request implies could not be built because there was no
// thing to build it FROM. The three links were three unrelated singletons
// (bleService / sppService / wifiService) with slightly different shapes,
// and the command path had its own hardcoded preference inside
// useControlHub (`goBt ?? goWs`) — so the app silently decided the link
// instead of the user, and WiFi could only ever be used by unplugging
// Bluetooth. This file is the seam that makes "choose one" possible.
//
// Design rules, learned from the working Bluetooth link and kept
// deliberately boring:
//   • A transport NEVER owns UI. It reports state and takes commands.
//   • EXACTLY ONE transport is active at a time (owner requirement), so
//     "active" is a single value in linkManager, never a priority guess.
//   • Capabilities are declared, not assumed. A link that cannot change
//     mode must say so, so the UI can grey the button instead of sending
//     a command the car will reject — the exact class of bug that made
//     the mode chooser dangerous over WiFi.
//   • `sendLine` is the single command dialect (see carProtocol). The
//     string/object `caps` mismatch happened because two layers spoke
//     different shapes for the same field.
// =====================================================================

/**
 * Stable ids for every link the app can drive the car over.
 *
 * Implemented today: bt-classic, wifi-ap-ws, wifi-sta-ws, http (REST).
 * Registered placeholders (the full "what if every possible comm method"
 * registry the owner asked for — see guide/TRANSPORTS-WIFI-GUIDE.md, NOT in the repo):
 * bt-ble (needs firmware GATT-UART), mdns, mqtt, cloud-relay.
 */
export type TransportId =
  | "bt-classic"
  | "bt-ble"
  | "wifi-ap-ws"
  | "wifi-sta-ws"
  | "http"
  | "mdns"
  | "mqtt"
  | "cloud-relay";

/**
 * The radio a transport rides on — what the picker groups by.
 *
 * `wired` (the cable/USB-serial method) was removed at the owner's request
 * ("remove the cable ones method too totally"), so it is no longer a radio.
 */
export type TransportRadio = "bluetooth" | "wifi" | "internet";

/**
 * What a link can do. The UI hides or disables anything absent here,
 * instead of sending a command and letting the car refuse it.
 */
export type TransportCapability =
  /** Send drive/direction/speed commands. */
  | "drive"
  /** Receive telemetry. */
  | "telemetry"
  /** Switch the car's operating mode. */
  | "mode"
  /** Read/write the car's saved-router list. */
  | "wifiConfig"
  /** Stream firmware over the link. */
  | "ota";

export type TransportStatus = "idle" | "connecting" | "connected" | "error";

/** Status event payload, matching what the existing services already emit. */
export type TransportStatusEvent = {
  kind: "connecting" | "connected" | "disconnected" | "error";
  message?: string;
};

/**
 * Connection options. Every field is optional so a transport can accept
 * only what applies to it (SPP needs an address, WS needs a URL).
 */
export type TransportConnectOptions = {
  /** Classic-BT / BLE device address. */
  address?: string;
  /** Human-readable device name from the scan row (SPP display name). */
  name?: string;
  /** WebSocket or HTTP endpoint, e.g. ws://192.168.245.1:81 */
  url?: string;
  /** Seconds to scan for devices (BLE). */
  scanSeconds?: number;
};

/** One discovered device on a radio, for the picker's scan list. */
export type DiscoveredDevice = {
  /** Stable per-radio identifier (MAC for BT, URL for WiFi). */
  id: string;
  name: string;
  /** Free-form extra shown in the list, e.g. signal strength. */
  detail?: string;
};

/**
 * User-facing explanation of HOW a comm method works — the teaching text
 * the Control Panel renders under the row and under "About this project".
 * Written for a person, so a roadmap method reads as whole and honest as a
 * live one (owner round: "register every possible comm method and write the
 * details of each below the About section").
 */
export type TransportTeaching = {
  /** One-paragraph plain-language "what this is". */
  intro: string;
  /** What the user must have (radio, network, firmware build) to use it. */
  needs: string;
  /** When this method is the right choice. */
  when: string;
  /**
   * Who dials whom, in one sentence, plus the consequence of that choice.
   * Optional per-transport, but EVERY row that reaches a network fills it in:
   * "server" and "client" are the single most misread words in this feature,
   * and getting them backwards is why a link that "should just work" doesn't.
   */
  serverClient?: string;
  /** Concrete steps to connect + verify (numbered lines). */
  steps: string[];
};

/**
 * The contract. Every method is optional except the state getters and
 * `sendLine` — a transport that cannot scan (e.g. a fixed-URL WebSocket)
 * simply omits it rather than implementing a fake list.
 */
export type Transport = {
  readonly id: TransportId;
  readonly label: string;
  readonly radio: TransportRadio;
  /** Short line for the picker row, e.g. "Car access point · ws://…". */
  readonly blurb: string;
  readonly capabilities: readonly TransportCapability[];
  /** Optional: what this method is / requires / when / how (teaching). */
  readonly teaching?: TransportTeaching;
  /**
   * Optional: shown when `isSupported()` is false. Explains WHY a registered
   * method is not actionable on this build (roadmap / firmware gap) so the
   * row is informative instead of dead.
   */
  readonly roadmapNote?: string;

  /** False when the platform/native side is missing (web, old APK). */
  isSupported(): boolean;
  /** Current link state. */
  getStatus(): TransportStatus;
  isConnected(): boolean;
  /** Transport-specific description of what it is talking to. */
  getTargetLabel(): string | null;
  /** Last error from this transport, if any. */
  getLastError(): string | null;

  /** Devices on this radio. Omitted when not discoverable. */
  scan?(): Promise<DiscoveredDevice[]>;
  connect(options?: TransportConnectOptions): Promise<void>;
  disconnect(): Promise<void>;

  /** The one command dialect. Throws when the link is not up. */
  sendLine(line: string): Promise<void>;
  /** Ask the car to re-broadcast its state. */
  requestState(): Promise<void>;

  onTelemetry(cb: (t: unknown) => void): () => void;
  onStatus(cb: (e: TransportStatusEvent) => void): () => void;
};

export function hasCapability(
  t: Pick<Transport, "capabilities">,
  c: TransportCapability,
): boolean {
  return t.capabilities.includes(c);
}
