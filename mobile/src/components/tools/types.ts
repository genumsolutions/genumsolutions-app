// Shared types for IoT controller sub-components.
// ToolsScreen holds all state and passes subsets down as props.
import React from "react";
import { Platform } from "react-native";
import type { CarTelemetry, ModeAvailReport } from "../../services/carProtocol";
import type { CarMode } from "../../config/roboCarCatalog";
import type { RouterOutcome } from "./connection/commands";

export type SensorData = {
  temperature: number;
  humidity: number;
  soilMoisture: number;
  lightLevel: number;
  airQuality: number;
  distance: number;
};

/** ESP-remote-style safety limits so the app cannot command unsafe values. */
export type SafetyLimits = {
  /** Absolute motor PWM/speed ceiling (esp32 remote SAFE_PWM / SPEED_MAX style). */
  maxSpeed: number;
  /** Signed joystick drive ceiling (esp32 remote joystick drive range). */
  maxSignedDrive: number;
  /** Steering center for the app's SERVO mapping. */
  servoCenter: number;
  /** Max servo deflection from center (esp32 remote STEER limit style). */
  maxSteerDeviation: number;
  /** Trim ceiling (esp32 remote TRIM range style). */
  maxTrim: number;
};

/** Default safety limits mirroring the ESP32 remote's SAFE_PWM / limits. */

export const DEFAULT_SAFETY_LIMITS: SafetyLimits = {
  maxSpeed: 255,
  maxSignedDrive: 255,
  servoCenter: 90,
  maxSteerDeviation: 90,
  maxTrim: 90,
};

/** Saved per-device preferences (mirrors the ESP remote remembered values). */
export type DevicePrefs = {
  /** Last used SPP address so the app can re-select the same car. */
  address: string | null;
  /** Last used car name for display. */
  name: string | null;
  /** Last selected mode id. */
  modeId: string | null;
  /** Last speed value used by the app. */
  speed: number;
  /** Last servo/steering value used by the app. */
  servo: number;
  /** Last steer limit the user set (2WD1M style). */
  steerLimit: number;
  /** Last trim value the user set (car-persisted trim). */
  trim: number;
  /** Last joystick control style the user chose. */
  useJoystick: boolean;
  /** Last fullscreen state so the app can restore it. */
  fullscreen: boolean;
  /** Last selected joystick layout id. */
  joystickLayout: string;
  /** A-8: last WiFi SSID successfully sent to THIS car (pre-fill hint).
      The password is deliberately NOT persisted — it lives only in flight
      and in the car's NVS. */
  lastWifiSsid: string | null;
  /**
   * U-74 (2026-10-02): the router address the car LAST REPORTED while joined to
   * a router — the DHCP lease, not the hotspot gateway.
   *
   * Why this is needed: in AP_STA the softAP and the STA share one radio and
   * therefore one channel, so when the car joins a router its hotspot MOVES to
   * that router's channel and the phone's hotspot link drops. With no link the
   * app has no address for the car, which is why "the drive deck doesn't open
   * when on the other router". The car DOES broadcast the lease on that link for
   * a moment before the drop, so remembering it here turns "the app cannot find
   * the car" into a one-tap "connect to the car on your router".
   *
   * Persisted per device because the lease is stable for as long as the car is on
   * that router, and it is worthless the moment the lease changes — so it is
   * only ever a HINT, never an authority. The gateway address is deliberately
   * never stored here (that is the car's own hotspot, not a router lease).
   */
  lastRouterIp: string | null;
  /**
   * A-27 (device-round-5): per-device mirror of the saved-router list
   * (names only, from the car's `networks` JSON / optimistic edits) so the
   * WiFi & Router panel restores instantly while the car is unpaired.
   * The car remains the source of truth; passwords are never stored here. */
  savedRouters: string[] | null;
  /**
   * Connections-Hub round (per-device profiles): the board-unique id from
   * firmware (`ESP.getEfuseMac()` last 6 hex) when the car reports it. The
   * STABLE profile key: `fw:<id>` beats the WiFi identity/AP fallback.
   */
  uniqueId?: string | null;
  /** Connections-Hub round: every BT MAC this car has presented under
      (deduped, capped) so a car can be re-found across renames. */
  btIds?: string[] | null;
  /** Connections-Hub round: per-car Wi-Fi history (SSID → last seen ms,
      newest first, capped ~50) so a picked car recalls which routers it has
      been on. Names only — passwords never leave the phone/car. */
  wifiHistory?: Array<{ ssid: string; lastSeen: number }> | null;
  /** Connections-Hub round: last verified WS url used for THIS car. */
  lastWifiUrl?: string | null;
  /** Connections-Hub round: auto-join saved router on connect (smart-link),
      else go straight to the car's own AP. Default true. */
  autoJoinRouter?: boolean;
  /** Profiles-sync round: when this record was last saved locally
      (epoch ms). Feeds last-saved-wins merging against the cloud row's
      updated_at — the user's most recent save wins, wherever it happened. */
  savedAt?: number | null;
};

/** Per-device storage key prefix. */

export function devicePrefsKey(address: string): string {
  return `genum.device.${address}`;
}

/** Minimal shape of the storage backend used for remembered device prefs. */
type KVStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

let storagePromise: Promise<KVStore | null> | null = null;

/** Lazy-load AsyncStorage once. Kept behind Platform.OS so web builds stay
    native-free (mirrors how ToolsScreen handled it before). */
function getStorage(): Promise<KVStore | null> {
  if (storagePromise) return storagePromise;
  storagePromise = (async () => {
    if (!(Platform.OS === "android" || Platform.OS === "ios")) return null;
    try {
      const mod = await import("@react-native-async-storage/async-storage");
      return (mod.default ?? mod) as unknown as KVStore;
    } catch {
      return null;
    }
  })();
  return storagePromise;
}

/** Simple per-device storage backend. Remembered car prefs (speed, mode,
    steer, trim, joystick, fullscreen) are persisted per Bluetooth address so
    they survive app restarts; when storage is unavailable the backend falls
    back to in-memory only (returns null). */
export const deviceMemory = {
  read: async (address: string): Promise<DevicePrefs | null> => {
    try {
      const storage = await getStorage();
      const raw = await storage?.getItem(devicePrefsKey(address));
      if (typeof raw === "string" && raw.length > 0) {
        return JSON.parse(raw) as DevicePrefs;
      }
      return null;
    } catch {
      return null;
    }
  },

  write: async (address: string, prefs: DevicePrefs): Promise<void> => {
    try {
      const storage = await getStorage();
      if (!storage) return;
      await storage.setItem(devicePrefsKey(address), JSON.stringify(prefs));
    } catch {
      /* ignore write failures for now */
    }
  },
};

export type ModeChooserProps = {
  activeMode: CarMode;
  canControl: boolean;
  onSelect: (mode: CarMode) => void;
  onCycle: () => void;
  /** NAV highlight: draw the ESP-style inverted box around the trigger
      while the Mode top-bar field is selected. */
  highlighted?: boolean;
  /** NAV preview: show the browsed-to mode (before Select confirms). */
  previewMode?: CarMode | null;
  /** Disable direct selection (NAV up/down owns mode changes; the dropdown
      still opens so the user can see the list, matching the physical
      remote where the list is display-only while browsing). */
  locked?: boolean;
  /** Display catalogue (DB-first). Defaults to the bundled modes when omitted. */
  modes?: CarMode[];
  /** A-7 car truth: token -> stub flag from the car's CAP=STUB reports.
      Tokens not in the map fall back to the fleet fallback table. */
  carStubMap?: Record<string, boolean>;
  /**
   * R-10 car truth: token -> LIVE / WIP / CS from the car's full CAPS
   * broadcast. Authoritative per token; when absent the stub map + fleet
   * fallback apply (modeAvailStatus in carProtocol). All rows stay selectable
   * either way — the states only change the badge style.
   */
  carAvailMap?: Record<string, string>;
};

export type OledDisplayProps = {
  connected: boolean;
  wifiConnected: boolean;
  deviceName: string;
  activeMode: CarMode;
  speed: number;
  servo: number;
  driveStatus: string;
  targetAltitude: number;
  gimbalPan: number;
  gimbalTilt: number;
  sensorData: SensorData;
  telemetry: CarTelemetry;
  isDrone: boolean;
  isNonRobocar: boolean;
  /** Link label for the status chip; defaults to 'SPP LINK' / 'WiFi WS'. */
  linkKind?: "spp" | "wifi";
  /** Renders at the physical 1.3" OLED's 2:1 shape for the game remote:
      tighter padding/fonts and only the essential lines (no PID/Angle/echo). */
  compact?: boolean;
  /** ESP-remote dashboard parity (ui.md): which top-bar field is highlighted
      in NAV mode ('none' = DRIVE). Inverted-box highlight mirrors u8g2. */
  topField?: "mode" | "speed" | "steer" | "none";
  /** While browsing modes in NAV, the PREVIEWED mode is shown (top bar +
      body title / dashboard preview) before Select confirms — exactly like
      previewModeIndex on the physical remote. */
  previewMode?: CarMode | null;
  /** Unavailable firmware modes preview as COMING SOON (ui.md screen 9). */
  previewComingSoon?: boolean;
  /**
   * R-10 (replaces relying on the boolean alone): the previewed mode's car
   * truth availability — LIVE draws the real dashboard, WIP draws
   * "WORK IN PROGRESS", CS draws "COMING SOON" (remote drawAvailMarkBody
   * parity). Falls back to previewComingSoon when undef.
   */
  previewModeAvail?: ModeAvailReport;
  /** 2WD1M: the user-set MAX steer limit for the top bar — the ESP remote
      top bar shows the LIMIT, never the live servo angle. */
  steerLimit?: number;
  /** 2WD1M: the user-set trim offset (-90..90) for top bar display. */
  trim?: number;
};

export type BalanceControlsProps = {
  canControl: boolean;
  /** Live tilt from TEL;…ANGLE — null until the first telemetry frame. */
  angle: number | null;
  /** Latest parsed car telemetry (mode / speed / live PID values). */
  telemetry: CarTelemetry;
  kp: number;
  ki: number;
  kd: number;
  out: number;
  off: number;
  onPid: (key: "kp" | "ki" | "kd" | "out" | "off", v: number) => void;
  /** Switches the car into AUTO (self-balancing) mode. (unused, kept for compat) */
  onEnterMode?: () => void;
  /** Compact layout for the immersive game-remote (less padding, tighter spacing). */
  compact?: boolean;
  /** Optional OLED display slot (160×80) rendered next to the telemetry bar. */
  oledSlot?: React.ReactNode;
};

/**
 * A-26/A-27/A-28 (device-round-5): the ONE "WiFi & Router" panel shown when
 * the drive pads are hidden — saved-router list (car truth names, with
 * switch + delete), an Add form (SSID + password) and the active SSID/IP.
 * Replaces the retired Settings WiFi card + WeblinkControls card + the
 * "Pad hidden" placeholder. Keyboard-safe (keyboardShouldPersistTaps).
 */
export type RouterPanelProps = {
  canControl: boolean;
  /** True when any transport is live (BT or WS) — gates the send buttons. */
  linked: boolean;
  /** Car's active SSID (JSON `ssid` / optimistic provisioning) — null when
      the car is on its compile-time default / AP fallback. */
  carSsid: string | null;
  /** Car's AP-fallback broadcast id (JSON `ap`). */
  carApName: string | null;
  /** Car's reachable IP (tappable → opens the hosted web page). */
  ip: string | null;
  /** Saved-router names mirror (car `networks` JSON, optimistic edits,
      per-device savedRouters). Names only — never passwords. */
  networks: string[];
  // ---- U-81: every router action returns the CAR'S ANSWER -------------
  //
  // These used to be `=> void`. That is what let this panel lie: it fired a
  // command, cleared its form on a 600 ms timer and showed the new name,
  // without ever finding out whether the car had accepted it — so `ROUTERS;FULL`,
  // `Reserved`, `Password too long`, `SSID length`, `Syntax` and a plain timeout
  // were all pixel-identical to a success. The Control Panel had already been
  // moved onto the ack-consuming API in U-68; this shared panel is now on it too
  // (`requestRouter` / `runSwitchPlan`). Returning the outcome is what makes the
  // panel able to tell the truth — see `connection/routerPanelOutcome.ts`.
  /** Switch the car to a saved router. Resolves once the car answers. */
  onUse: (ssid: string) => Promise<RouterOutcome>;
  /** Add (or re-add, upsert) a router. Resolves once the car answers. */
  onAdd: (ssid: string, pass: string) => Promise<RouterOutcome>;
  /** Delete one saved router. Resolves once the car answers. */
  onDelete: (ssid: string) => Promise<RouterOutcome>;
  /** A-42 (round-9): fires on "Clear all" (after the confirm) —
      ROUTERS;CLEAR wipes every saved router + the active pair on car+remote
      and reverts to the car's OWN network (T-62). Resolves on the answer. */
  onClear: () => Promise<RouterOutcome>;
  onOpenWebPage: () => void;
  /**
   * R4-4 (owner: add/edit/delete saved routers): opens the EDIT view for one
   * saved router — pre-fills the SSID + password fields (password never comes
   * from the car; it stays blank unless the user retypes one) and routes the
   * save through onAdd, because the car stores ONE password per SSID: an edit
   * IS a re-ADD upsert (T-48a). Optional — the panel renders the per-row
   * Edit button only when supplied.
   */
  onStartEdit?: (ssid: string) => void;
  /** Whether the edit form is currently open for the given SSID (drives the
      row's "Editing" chip). Optional — omit for the remote's plain list. */
  editingSsid?: string | null;
};

export type DriveControlsProps = {
  canControl: boolean;
  isDrone: boolean;
  activeMode: CarMode;
  speed: number;
  servo: number;
  pidKp: number;
  pidKi: number;
  pidKd: number;
  pidOut: number;
  pidOff: number;
  /** When true, show dual joysticks instead of d-pad buttons. */
  useJoystick: boolean;
  onDirection: (d: "F" | "B" | "L" | "R" | "S") => void;
  onSpeed: (v: number) => void;
  onServo: (v: number) => void;
  /** ESP-remote 2WD1M joystick parity: left stick streams signed SPD
      (-255..255, transient drive) through this callback instead of direction
      letters, and the right stick clamps to ±steerLimit around center 90.
      Omit for the legacy letter-based mapping. */
  onSignedDrive?: (signed: number) => void;
  /** Max servo deflection (±°) from center 90 for the right joystick when
      onSignedDrive is set (mirrors the ESP remote's Steer limit). */
  steerLimit?: number;
  onPid: (key: "kp" | "ki" | "kd" | "out" | "off", v: number) => void;
  onRun?: () => void;
  onStop?: () => void;
  /** Compact game-remote deck: board fills the available space (joystick
      flex-fill), slim speed strip, and the PID / start-stop rows are hidden
      (the remote screen shows those elsewhere). A-43 (round-9): the emergency
      stop button was REMOVED from the app UI (owner) — the failsafe path
      (ESTOP protocol + auto safe-stop on link loss) is untouched, so no
      onEStop prop exists anymore. */
  compact?: boolean;
  /** NAV routing (ESP-remote parity): the deck reads this ref's CURRENT
      value on every touch (never stale) and routes input to the NAV
      handler instead of driving while NAV is active. Optional — decks
      without it always drive. */
  navActiveRef?: { current: boolean };
  /** NAV input from the pads/joysticks (left stick / d-pad nav: -1 left,
      +1 right, 0 up, 1 down on the Y axis). Optional. */
  onNavInput?: (axis: "x" | "y", value: -1 | 0 | 1) => void;
  /** OLED display rendered centered between the joysticks (always visible). */
  oledSlot?: React.ReactNode;
};

export type DroneControlsProps = {
  canControl: boolean;
  targetAltitude: number;
  gimbalPan: number;
  gimbalTilt: number;
  onAltitude: (v: number) => void;
  onGimbalPan: (v: number) => void;
  onGimbalTilt: (v: number) => void;
  onCommand: (cmd: string) => void;
  onSetAltitude: (v: number) => void;
};

export type SensorGridProps = {
  canControl: boolean;
  isDrone: boolean;
  isNonRobocar: boolean;
  activeCategory: string;
  sensorData: SensorData;
  relays: Record<number, boolean>;
  telemetry: CarTelemetry;
  onToggleRelay: (i: number) => void;
};
