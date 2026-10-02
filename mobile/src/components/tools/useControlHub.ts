// =====================================================================
// useControlHub â€” shared connection/control/telemetry state + command
// logic for the IoT Control Panel.
//
// Both the lean Control Panel page (ToolsScreen) and the immersive
// game-style remote window (RemoteControlScreen) share this ONE hook so
// they drive the same car state and never drift: same SPP/WiFi connect,
// same mode / speed / servo / steer / trim / PID / gimbal / sensors /
// relays, same ESP-remote safety clamps and instant-stop-on-release,
// same per-device memory persistence.
//
// Every sender is safe when no device is linked (linkKind === 'none'):
// commands no-op, but UI state (knobs, sliders) still updates so the
// remote can be tested/debugged in a browser without hardware.
// =====================================================================
import React, { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useRoute, type RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "../../navigation/types";
import { APP_VERSION } from "../../config/site";
import { sppService, type SppDevice } from "../../services/sppService";
import { bleService } from "../../services/bleService";
import { wifiService } from "../../services/wifiService";
import { DEFAULT_SAFETY_LIMITS, type DevicePrefs } from "./types";
import {
  fetchCarProfiles,
  isFreshDefaultPrefs,
  mergeCloudProfile,
  saveCarProfile,
  type ProfileSyncState,
  type CarProfileCloudRecord,
} from "../../services/carProfileService";
import {
  addBtId,
  pickBestRouter,
  upsertWifiHistory,
} from "../../services/carProfileService";
import { rememberDeviceKey } from "../../services/deviceProfileRegistryService";
import { registerCurrentDevice } from "../../services/deviceRegistryService";
import {
  encodeEnvelopeWire,
  isEnvelopeIntakeEnabled,
  type EnvelopeInput,
  type EnvelopeSendResult,
} from "../../transports/envelopeWiring";
import {
  LOCAL_CAR_MODES,
  type CarMode,
  isModeToken,
  nextRemoteModeToken,
  sortRemoteModes,
} from "../../config/roboCarCatalog";
import { getCarModes } from "../../services/carModeService";
import { PROJECT_CATEGORIES } from "../../config/project-catalog";
import {
  DRIVE_CMD_MIN_INTERVAL_MS,
  SPP_RECONNECT_DELAYS_MS,
} from "./controlConstants";
import { routeCommand } from "./commandRouting";
import { ensureTransportsRegistered } from "../../transports/linkManagerHooks";
// Imported from the PURE modules directly, not from the `./connection` barrel.
// The barrel re-exports the UI (ConnectionSection → useControlHub, a
// type-only back-reference), and a hook has no business pulling React
// components into its dependency graph — nor sitting one hop from a cycle with
// the screen that renders it.
import {
  outcomeFor,
  parseRouterAnswer,
  routerRequestLine,
  timeoutOutcome,
  type RouterOutcome,
  type RouterRequest,
  type SwitchPlan,
} from "./connection/commands";
import { linkManager } from "../../transports/linkManager";
import {
  isAllowedDriveStatus,
  statusToDirection,
  quantizeSpeedToStep,
  parseTelemetryLine,
  buildWifiConfigLine,
  buildRouterCommand,
  normalizeModeToken,
  canonicalCarToken,
  SPEED_MIN,
  SPEED_MAX,
  SPEED_STEP,
  STEER_LIMIT_MIN,
  STEER_LIMIT_MAX,
  buildSteer,
  type ScanNetwork,
} from "../../services/carProtocol";
import { MODE_NAMES as ESP_MODE_NAMES } from "../../config/roboCarCatalog";

/** Token â†’ short display name for "Mode:<name>" statuses (MODE_NAMES[]). */
const MODE_NAME_FOR_TOKEN: Record<string, string> = ESP_MODE_NAMES;

// Round-6 (app): the app-wide "last touched car" spill. A per-device memory
// entry is the primary store, but it is only REACHABLE once we know the
// device address (a live link). Saving a small spill keyed globally here lets
// a cold start with NO live link still show the last known saved-router names
// in the Router panel ("options to use saved networks even after power cycle").
// Names only — passwords never leave the car (W-14) and never touch the app.
const LAST_DEVICE_KEY = "genum.lastDevice";

/**
 * Commands that must reach the car over EVERY live link, regardless of the
 * active mode's transport. Mode tokens (any live link can switch the car
 * into that mode â€” the car renders its own frame), plus the neutral /
 * emergency safety lines (ESTOP / SPD0 / SERVO90 / 'S' / REQ_STATE). Every
 * other command follows the ACTIVE mode's own transports (R-4 fleet parity:
 * WiFi modes drive over the WS, BT modes over SPP/BLE â€” never blast a
 * WiFi-mode drive letter at a Bluetooth car).
 */
const EVERY_LINK_COMMANDS = new Set([
  "4WD4M",
  "BT",
  "ESP_SER",
  "PATH",
  "OBS_US",
  "OBS_IR",
  "MAN",
  "AUTO",
  "ESP_CLI",
  "2WD1M",
  "ESTOP",
  "SPD0",
  "SERVO90",
  "REQ_STATE",
  "S",
  // A-27: router-registry commands are SYSTEM commands — they can switch the
  // car's network but never drive; reaching the car over WHATEVER link is
  // live (WS for wireless cars, BT for the hand-held remote path) rides the
  // car's single system-command hook (W-14/F-21).
  "ROUTERS",
]);
import { deviceMemory } from "./types";
import type { CarTelemetry } from "../../services/carProtocol";
import { DEFAULT_WS_URL } from "../../services/carProtocol";
import type { SensorData } from "./types";

type Route = RouteProp<RootStackParamList, "Tools">;

/**
 * U-69 (2026-10-02): the outcome of a connect attempt.
 *
 * `handleConnect` and `handleWifiConnect` have always stored their failure in
 * the hub's `error` state and returned NORMALLY. That was survivable only while
 * `error` had a renderer — `ConnectionBanner`. U-68 replaced the banner with the
 * rebuilt ConnectionSection, and with no surface and no return value a FAILED
 * connect was indistinguishable from a successful one: the app announced
 * "Connected to <car>" and nothing was connected. The owner's report — *"the
 * bluetooth is not build in the app and i am not able to connect the device to
 * the app"* — is exactly that bug. It was never a missing permission or a
 * missing native module.
 *
 * A fake success is worse than no success: it sends the tester hunting for a
 * link that does not exist (F-61/F-62). So a connect now reports what happened
 * and the UI is obliged to show it. Adding a return value is backwards
 * compatible — callers that ignore it are unaffected.
 */
export type ConnectOutcome =
  { ok: true; message: string } | { ok: false; reason: string };

export function useControlHub(routeCategory?: string) {
  // U-68 (2026-10-02): the transport registry used to be registered LAZILY,
  // as a side effect of `useTransportList` — which only `TransportPicker`
  // called. The Control Panel no longer mounts the picker (the connection
  // section was rebuilt), so nothing registered the transports and every
  // `linkManager.adopt("bt-classic", …)` in this hook would have thrown
  // "Unknown transport" the moment a connection was made.
  //
  // The registry is not a UI concern: any screen that owns a connection needs
  // it, so the hook that owns connections registers it. Idempotent.
  ensureTransportsRegistered();

  const route = useRoute<Route>();
  const resolvedCategory = routeCategory ?? route.params?.category;

  // ---- Connection state (SPP primary, WiFi secondary).
  // Initialised from the current sppService snapshot so a second consumer
  // (e.g. the RemoteControl window opened while ToolsScreen is already
  // connected) starts out showing an existing live link instead of "no
  // device", and keeps working when nothing is linked (simulation). ----
  const [sppDevices, setSppDevices] = useState<SppDevice[]>([]);
  const [connected, setConnected] = useState(sppService.isConnected);
  const [deviceName, setDeviceName] = useState(sppService.deviceName ?? "");
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [linkVerified, setLinkVerified] = useState(false);
  const [connectingAddress, setConnectingAddress] = useState<string | null>(
    null,
  );
  const [wifiConnected, setWifiConnected] = useState(false);
  // v2: default to the NEW 4WD4M car's own-AP WS (192.168.245.1 — the donor
  // owns .244 and the SDK default .4.x is forbidden fleet-wide). The field is
  // user-editable and the remembered per-device URL wins when present.
  const [wifiUrl, setWifiUrl] = useState(DEFAULT_WS_URL);
  // v1.4.0 provisioning: the WiFi network the CAR should join (its own AP
  // broadcast id + IP ride the car's status JSON for display).
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [wifiProvisioning, setWifiProvisioning] = useState(false);
  // A-27 (device-round-5): saved-router names mirror — from the wireless
  // car's `networks` JSON (every WS status broadcast), optimistic edits, and
  // the per-device savedRouters prefs (restored before the car is linked).
  // The car's NVS registry stays the source of truth; passwords never sync.
  const [carNetworks, setCarNetworks] = useState<string[]>([]);
  // Broadcast id of the car's AP fallback + its configured SSID (car truth,
  // from the status JSON `ap` / `ssid` fields). Shown in the ESP_SER deck.
  const [carApName, setCarApName] = useState<string | null>(null);
  const [carSsid, setCarSsid] = useState<string | null>(null);
  // A-7 legacy car-truth map: token -> stub flag, fed by CAP=STUB on
  // the car's STATE lines and `stub` in its WS JSON (both describe the
  // car's CURRENT mode â€” the map fills as the car visits modes, and stays
  // for v1.4.0 cars that don't broadcast the full CAPS table). Tokens
  // absent from the map fall back to the fleet default (modeAvailStatus in
  // carProtocol.ts).
  const [carStubMap, setCarStubMap] = useState<Record<string, boolean>>({});
  // R-10: full per-token availability table from the car's CAPS broadcast
  // (`caps` on STATE-style lines / WS JSON). Authoritative 3-state truth
  // (LIVE / WIP / CS) for the mode badges; supersedes the per-current-mode
  // stub flag for cars that announce the whole table (v1.5.0 fleet).
  const [carAvailMap, setCarAvailMap] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(
    null,
  );
  const [connectionMsgType, setConnectionMsgType] = useState<
    "success" | "error" | null
  >(null);
  const [sppStatus, setSppStatus] = useState<
    "idle" | "connecting" | "connected" | "disconnected" | "error"
  >(
    sppService.getConnectionInfo().status === "connected"
      ? "connected"
      : "idle",
  );
  const [sppStatusMsg, setSppStatusMsg] = useState<string | null>(
    sppService.getConnectionInfo().status === "connected" ? "Connected" : null,
  );
  const [showSppsRetry, setShowSppsRetry] = useState(false);

  // ---- Active mode + state (mirrors ESP remote) ----
  // speed starts at the ESP remote's default speedValue = 170.
  const [activeCategory, setActiveCategory] = useState("robocar");
  const [activeMode, setActiveMode] = useState<CarMode>(LOCAL_CAR_MODES[0]);
  const [speed, setSpeed] = useState(170);
  const [servo, setServo] = useState(90);
  // R-20: steerLimit = the steering travel LIMIT (max |servo − 90|, 10..90).
  // Car truth rides STATE ;STEER=; edits send STEER<n> and the car echoes.
  const [steerLimit, setSteerLimit] = useState(90);
  const [trim, setTrim] = useState(0);
  // R-19 (FIN-45): car-truth trip mirrors (STATE TRIP=/MSTEER=; telemetry-only,
  // never persisted — the car owns them).
  const [tripAvg, setTripAvg] = useState(0);
  const [maxSteer, setMaxSteer] = useState(0);
  // driveStatus = the remote's bottom-bar status line (ESP statusMessage):
  // local action messages ("Speed:170", "Steer limit:90", "Mode:2WD1M")
  // merged with whitelisted car statuses ("Forward", "EMERGENCY STOP").
  const [driveStatus, setDriveStatus] = useState("Stop");
  // driveDir = the dashboard BODY direction (ESP currentDir): mirrored from
  // the car's own status (so driving the car by its own buttons updates the
  // app) and from local input. The OLED body + HUD read this.
  const [driveDir, setDriveDir] = useState<"F" | "B" | "L" | "R" | "S">("S");
  // A-16 (device-round-2): guarded setters â€” the status/direction row only
  // repaints on an ACTUAL change. Every writer in this hook routes through
  // them, so steady drive (repeated "Forward"/"Stop" STATUS frames) no longer
  // floods the 4WD4M status card (pairs with remote R-21 setStatusLocked).
  const driveStatusRef = useRef(driveStatus);
  driveStatusRef.current = driveStatus;
  const driveDirRef = useRef(driveDir);
  driveDirRef.current = driveDir;
  // Speed mirror (owner round 2026-09-29): fresh value for the telemetry
  // pipeline so its change-guard reads the CURRENT speed, not a stale closure.
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const setDriveStatusOnce = useCallback((s: string) => {
    if (driveStatusRef.current === s) return;
    driveStatusRef.current = s;
    setDriveStatus(s);
  }, []);
  const setDriveDirOnce = useCallback((d: "F" | "B" | "L" | "R" | "S") => {
    if (driveDirRef.current === d) return;
    driveDirRef.current = d;
    setDriveDir(d);
  }, []);
  const [telemetry, setTelemetry] = useState<CarTelemetry>({});

  // NAV state (ESP INPUT_NAV parity): while true the pads/joysticks navigate
  // the top-bar fields and NOTHING drives; the hub also stops mirroring the
  // car's speed echo so an in-progress edit never snaps back (state.cpp:
  // "Skip the mirror during NAV editing").
  const [navActive, setNavState] = useState(false);
  const navActiveRef = useRef(false);
  const setNavActive = useCallback((v: boolean) => {
    navActiveRef.current = v;
    setNavState(v);
  }, []);
  // Which top-bar field NAV is editing right now.
  const [navField, setNavField] = useState<"mode" | "speed" | "steer" | "none">(
    "none",
  );
  // NAV mode preview (ESP previewModeIndex): the browsed-to mode shown
  // before Select confirms.
  const [previewMode, setPreviewMode] = useState<CarMode | null>(null);

  // ---- PID state (self-balancing) ----
  const [pidKp, setPidKp] = useState(12.0);
  const [pidKi, setPidKi] = useState(3.0);
  const [pidKd, setPidKd] = useState(1.0);
  const [pidOut, setPidOut] = useState(0);
  const [pidOff, setPidOff] = useState(0);

  // ---- Drone controls ----
  const [gimbalPan, setGimbalPan] = useState(90);
  const [gimbalTilt, setGimbalTilt] = useState(90);
  const [targetAltitude, setTargetAltitude] = useState(0);

  // ---- Sensor data for non-robocar categories ----
  const [sensorData, setSensorData] = useState<SensorData>({
    temperature: 0,
    humidity: 0,
    soilMoisture: 0,
    lightLevel: 0,
    airQuality: 0,
    distance: 0,
  });

  // ---- Control mode toggle ----
  const [useJoystick, setUseJoystick] = useState(false);

  // ---- ESP32-remote safety limits ----
  const safetyLimits = DEFAULT_SAFETY_LIMITS;

  // ---- Relays for non-robocar categories ----
  const [relays, setRelays] = useState<Record<number, boolean>>({});

  // Mode from car (mode sync)
  const [carModeId, setCarModeId] = useState<string | null>(null);
  const carModeIdRef = useRef<string | null>(null);
  // Connections-Hub: the board-unique id from firmware (`<ID=last6hex>` /
  // JSON `id`). STABLE profile identity — beats the BT MAC / WiFi identity
  // in the memory key, so a car keeps one profile across renames and links.
  const carFwIdRef = useRef<string | null>(null);
  // Connections-Hub: per-car auto-join toggle (smart-link). Default on.
  const [autoJoinRouter, setAutoJoinRouter] = useState<boolean>(true);
  // One write per join guard for the wifi-history recorder.
  const wifiJoinKeyRef = useRef<string>("");
  // Connections-Hub (smart-link): the car-side scan result (ROUTERS;SCAN),
  // carried as telemetry.scan. Strength-aware auto-join reads it.
  const [carScan, setCarScan] = useState<ScanNetwork[] | null>(null);
  // Smart-link session state: which profile has been offered a router join in
  // the CURRENT link session (reset when the link drops), plus the pending
  // scan timer so the app waits ≤ SMART_LINK_SCAN_MS for strength data before
  // falling back to a recency pick.
  const smartLinkFiredRef = useRef<string | null>(null);
  const smartLinkScanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const SMART_LINK_SCAN_MS = 6000;
  /**
   * D2 (U-68): how long a router request waits for the car's answer before it
   * is reported as unanswered. The car answers inside one STATE broadcast
   * (1 s) or the 2 s REQ_STATE poll, so this is generous — long enough not to
   * flap, short enough that a silent car does not leave the UI spinning.
   */
  const ROUTER_ACK_TIMEOUT_MS = 6000;

  /**
   * U-69 (2026-10-02): the outcome of a connect attempt.
   *
   * `handleConnect` and `handleWifiConnect` have always stored their failure in
   * the hub's `error` state and returned normally. That was survivable only
   * while `error` had a renderer — ConnectionBanner. U-68 replaced the banner
   * with the rebuilt ConnectionSection, and with no surface and no return value
   * a FAILED connect looked exactly like a successful one: the app announced
   * "Connected to <car>" and nothing was connected. The owner's report — *"the
   * bluetooth is not build in the app and i am not able to connect the device to
   * the app"* — is that bug.
   *
   * A fake success is worse than no success: it sends the tester hunting for a
   * link that does not exist. So a connect now reports what happened, and the
   * UI is obliged to show it (F-61, F-62).
   *
   * Adding a return value is backwards compatible — callers that ignore it are
   * unaffected.
   */

  // A-37: user mode-commit grace (ESP remote R-33 parity) — remember the token
  // the USER chose plus the car-truth mode at commit time so the stale in-flight
  // echo (still the pre-commit mode) cannot undo the optimistic pick (that was
  // the dropdown flicker). Any CHANGED echo is car truth and adopts + clears.
  const MODE_CHANGE_GRACE_MS = 2500;
  const modeCommitRef = useRef<{
    token: string;
    stale: string | null;
    at: number;
  } | null>(null);

  // A-14/A-16: always-fresh mirrors for the connection/status setters so the
  // writers can dedupe without stale closures and without re-running drives.
  const connectedRef = useRef(connected);
  connectedRef.current = connected;

  // Joystick layout style id persisted per device.
  const [joystickLayoutId, setJoystickLayoutId] = useState<string>("dual");

  // Remote settings drawer (in-window, non-overflowing).
  const [showSettings, setShowSettings] = useState(false);

  const mountedRef = useRef(true);
  const manualCloseRef = useRef(false);
  const lastDriveCmdAtRef = useRef<Record<string, number>>({});
  const connectionMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // ---- SPP auto-reconnect (ESP remote parity: 4 silent tries â†’ prompt) ----
  const sppReconnectAttemptsRef = useRef(0);
  // R1 flicker fix (owner round 1, 2026-09-28): re-arm guard. The status
  // handler called startSppReconnect() on EVERY emitted error while this
  // scheduler's own .catch ALSO chained the next attempt - duelling timers:
  // each failed retry emitted more statuses, which scheduled more retries,
  // and the Control Panel flickered continuously until the user pressed
  // Disconnect. startSppReconnect() is now the ONLY scheduler (idempotent:
  // a running burst returns early) and every exit path de-arms the flag.
  // One scheduler only; a running burst returns early, so repeated errors
  // cannot start a second scheduler and flicker the panel.
  const sppReconnectActiveRef = useRef(false);
  // FIN-44: last status message seen by the dedupe gate (see onStatus below).
  const sppStatusMsgRef = useRef<string | null>(null);
  const sppReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const sppLastAddressRef = useRef<string | null>(null);

  // Car-mode catalogue: DB-first with bundled fallback
  const [carModes, setCarModes] = useState<CarMode[]>(LOCAL_CAR_MODES);

  // Always-fresh mirrors for the telemetry pipeline (no stale closures).
  const carModesRef = useRef(carModes);
  carModesRef.current = carModes;
  const activeModeRef = useRef(activeMode);
  activeModeRef.current = activeMode;

  useEffect(() => {
    let active = true;
    getCarModes()
      .then((modes) => {
        if (!active || modes.length === 0) return;
        setCarModes(modes);
        // Only set a default mode if the car hasn't already reported one via
        // telemetry (carModeIdRef is set in applyTelemetry).  The car's
        // STATE;MODE=... is the authoritative source â€” don't overwrite it.
        if (!carModeIdRef.current) {
          const target = modes.find((m) => m.id === "2wd1m") || modes[0];
          setActiveMode(target);
        }
      })
      .catch(() => {
        /* keep bundled fallback */
      });
    return () => {
      active = false;
    };
  }, []);

  const carFwId = carFwIdRef.current;
  // Restore remembered device prefs when a device identity becomes available.
  // WiFi-only links have no BT MAC, so the remembered-key falls back to the
  // car's wifi identity (`wifi:<ssid|ap|url>`). BT links keep using the MAC.
  // The firmware board id (`fw:<id>`) is preferred above both when present.
  const wifiIdentity =
    wifiConnected && wifiUrl.trim()
      ? carSsid || carApName || wifiUrl.trim()
      : null;
  const legacyMemoryKey =
    sppService.currentAddress ??
    sppService.getConnectionInfo().address ??
    (wifiIdentity ? `wifi:${wifiIdentity}` : null);
  // Connections-Hub: prefer the firmware board id (`fw:<id>`) — stable + unique.
  // The previous key is kept as `legacyMemoryKey` so a first link under the
  // new key migrates the stored prefs instead of starting from factory.
  const addressForMemory = carFwId ? `fw:${carFwId}` : legacyMemoryKey;
  // Refs mirroring the live profile key + scan so timer callbacks (smart-link
  // fallback) read through without re-creating.
  const profileKeyRef = useRef<string | null>(null);
  profileKeyRef.current = addressForMemory;
  const profileKey = addressForMemory;
  const carScanRef = useRef<ScanNetwork[] | null>(null);
  const [savedPrefs, setSavedPrefs] = useState<DevicePrefs | null>(null);
  // Profiles-sync: last cloud mirror attempt for the current car profile
  // ("synced" = pushed to the user's account; "offline" = kept local only;
  // null = no attempt yet this session).
  const [profileSync, setProfileSync] = useState<ProfileSyncState | null>(null);
  useFocusEffect(
    React.useCallback(() => {
      if (!addressForMemory) {
        setSavedPrefs(null);
        // Round-6: no live link — still recall the last device's saved
        // router names from the global spill so the Router panel isn't
        // empty after a power cycle (the car's `networks` echo re-syncs
        // to car truth the moment a link opens).
        let active = true;
        void AsyncStorage.getItem(LAST_DEVICE_KEY).then((raw) => {
          if (!active || !raw) return;
          try {
            const last = JSON.parse(raw) as {
              address?: string;
              name?: string;
              savedRouters?: string[];
            };
            if (last?.savedRouters?.length) {
              setCarNetworks((cur) =>
                cur.length > 0 ? cur : last.savedRouters!,
              );
            }
            if (last?.name) setDeviceName((cur) => cur || last.name!);
          } catch {
            /* ignore corrupt spill */
          }
        });
        return () => {
          active = false;
        };
      }
      let active = true;
      void deviceMemory.read(addressForMemory).then(async (prefs) => {
        if (!active) return;
        // Connections-Hub (profiles): the first link under the STABLE
        // `fw:<id>` key migrates the old key's prefs (formely BT MAC or
        // `wifi:<ssid>`) so nothing stored under the old identity is lost.
        let resolved = prefs;
        if (
          !resolved &&
          legacyMemoryKey &&
          legacyMemoryKey !== addressForMemory
        ) {
          const legacy = await deviceMemory.read(legacyMemoryKey);
          if (legacy) {
            resolved = legacy;
            void deviceMemory.write(addressForMemory, legacy);
          }
        }
        if (!active) return;
        setSavedPrefs(resolved);
        if (resolved) {
          if (
            resolved.modeId &&
            carModes.some((m) => m.id === resolved.modeId)
          ) {
            setActiveMode(carModes.find((m) => m.id === resolved.modeId)!);
          }
          if (resolved.speed != null) setSpeed(resolved.speed);
          if (resolved.servo != null) setServo(resolved.servo);
          if (resolved.steerLimit != null) setSteerLimit(resolved.steerLimit);
          if (resolved.trim != null) setTrim(resolved.trim);
          if (resolved.useJoystick != null)
            setUseJoystick(resolved.useJoystick);
          if (resolved.autoJoinRouter != null)
            setAutoJoinRouter(resolved.autoJoinRouter);
          // A-8: pre-fill the WiFi card with the last SSID sent to THIS car
          // (never the password â€” that lives only in flight + the car's NVS).
          if (resolved.lastWifiSsid)
            setWifiSsid((cur) => cur || resolved.lastWifiSsid!);
          // A-27: restore the per-device saved-router mirror so the WiFi &
          // Router panel renders before the car links (names only). The
          // car's next `networks` echo re-syncs it to car truth.
          if (resolved.savedRouters && resolved.savedRouters.length > 0) {
            setCarNetworks((cur) =>
              cur.length > 0 ? cur : (resolved.savedRouters ?? []),
            );
          }
        }
      });
      return () => {
        active = false;
      };
    }, [addressForMemory, legacyMemoryKey, carModes]),
  );

  // Profiles-sync (owner: "gets sync with the device as soon as everything
  // gets connected"): once a stable profile key exists, pull THIS user's
  // cloud car profiles and adopt this car's row when it is newer than what
  // the phone holds (or the phone holds only factory defaults). Adopting
  // restores mode/speed/steer/trim/joystick + saved routers + Wi-Fi history
  // so the car comes up exactly as the user last saved it — on any phone.
  // Push happens in persistPrefs; pull happens here (last-saved-wins both
  // ways; nothing secret is in the row — names only, never passwords).
  const cloudAdoptedRef = useRef<string | null>(null);
  // Registry claim guard: one claim attempt per car per session. Without it
  // every effect re-run (and every reconnect) would fire another RPC.
  const claimedDeviceRef = useRef<string | null>(null);
  useEffect(() => {
    if (!addressForMemory) return;
    if (cloudAdoptedRef.current === addressForMemory) return;
    cloudAdoptedRef.current = addressForMemory;
    let active = true;

    // Register the unit in the shared device registry as soon as a stable
    // identity exists, so it appears in the user's garage (app Account tab
    // and the website /tools garage) instead of only as a car_profiles row.
    // Fire-and-forget: a failed claim must never block the drive UI, and the
    // car is still fully usable with a car_profiles row alone.
    //
    // The model is deliberately NOT passed. `savedPrefs.modeId` is a MODE id
    // ("obstacle-us"), not a MODEL id ("4wd4m"); the two only coincide for
    // three of the nine. register_device validates its model argument against
    // device_models and raises on an unknown one, so sending a mode id would
    // abort the whole claim and the car would never reach the garage. The
    // RPC treats null as "did not say" and leaves the column alone, so
    // passing nothing is both correct and non-destructive.
    if (claimedDeviceRef.current !== addressForMemory) {
      claimedDeviceRef.current = addressForMemory;
      void registerCurrentDevice(addressForMemory, null);
    }

    void (async () => {
      const { rows, offline } = await fetchCarProfiles();
      if (!active || offline) {
        if (active && offline) setProfileSync({ state: "offline" });
        return;
      }
      const row = rows.find(
        (r: CarProfileCloudRecord) => r.profile_key === addressForMemory,
      );
      if (!row) {
        // First time this car is known in the cloud — push what we have.
        const local = await deviceMemory.read(addressForMemory);
        if (local && !isFreshDefaultPrefs(local)) {
          void saveCarProfile(local, addressForMemory).then((res) => {
            setProfileSync(
              res.ok
                ? { state: "synced", at: Date.now() }
                : { state: "offline" },
            );
          });
        }
        return;
      }
      const local = await deviceMemory.read(addressForMemory);
      if (!isFreshDefaultPrefs(local) && local?.savedAt) {
        const localTime = local.savedAt;
        const cloudTime = Date.parse(row.updated_at || "") || 0;
        if (localTime >= cloudTime) {
          // The phone holds the newer save — push it instead of adopting.
          void saveCarProfile(local, addressForMemory).then((res) => {
            setProfileSync(
              res.ok
                ? { state: "synced", at: Date.now() }
                : { state: "offline" },
            );
          });
          return;
        }
      }
      const base: Omit<DevicePrefs, "address"> = {
        name: null,
        modeId: null,
        speed: 170,
        servo: 90,
        steerLimit: 90,
        trim: 0,
        useJoystick: false,
        fullscreen: false,
        joystickLayout: "dual",
        lastWifiSsid: null,
        savedRouters: [],
      };
      const merged = mergeCloudProfile(row, local, base);
      if (!merged.changed) return;
      await deviceMemory.write(addressForMemory, merged.prefs);
      if (!active) return;
      setSavedPrefs(merged.prefs);
      if (
        merged.prefs.modeId &&
        carModes.some((m) => m.id === merged.prefs.modeId)
      ) {
        setActiveMode(carModes.find((m) => m.id === merged.prefs.modeId)!);
      }
      if (merged.prefs.speed != null) setSpeed(merged.prefs.speed);
      if (merged.prefs.servo != null) setServo(merged.prefs.servo);
      if (merged.prefs.steerLimit != null)
        setSteerLimit(merged.prefs.steerLimit);
      if (merged.prefs.trim != null) setTrim(merged.prefs.trim);
      if (merged.prefs.useJoystick != null)
        setUseJoystick(merged.prefs.useJoystick);
      if (merged.prefs.joystickLayout)
        setJoystickLayoutId(merged.prefs.joystickLayout);
      if (merged.prefs.autoJoinRouter != null)
        setAutoJoinRouter(merged.prefs.autoJoinRouter);
      if (merged.prefs.savedRouters && merged.prefs.savedRouters.length > 0) {
        setCarNetworks((cur) =>
          cur.length > 0 ? cur : (merged.prefs.savedRouters ?? []),
        );
      }
      // R4-5 (owner: "after being connected, the car shares its info to the
      // app, then the database — and back"): the adopted profile restores
      // the last-used router too — the smart-link recency seed AND the
      // home-router address field, so the next STA connect is one tap.
      if (merged.prefs.lastWifiSsid) {
        setWifiSsid((cur) => cur || merged.prefs.lastWifiSsid!);
      }
      if (merged.prefs.lastWifiUrl) {
        setWifiUrl((cur) =>
          cur && cur !== DEFAULT_WS_URL ? cur : merged.prefs.lastWifiUrl!,
        );
      }
      setProfileSync({ state: "adopted", at: Date.now() });
    })();
    return () => {
      active = false;
    };
  }, [addressForMemory, carModes]);

  // Persist device prefs whenever the user changes a remembered value.
  // Round-6 (bug): read the CURRENT saved-router names from a live ref, not
  // from the `savedPrefs` closure — the old closure captured a stale copy of
  // `savedRouters: []` at hook-scope, so any later speed/steer persist wiped
  // the saved-router mirror back to empty (networks vanished after power
  // cycle). The ref tracks the live `carNetworks` (car echo + optimistic
  // adds/deletes), so every patch ships the latest names forward.
  const savedNetworksRef = useRef<string[]>([]);
  useEffect(() => {
    savedNetworksRef.current = carNetworks;
  }, [carNetworks]);
  const persistPrefs = React.useCallback(
    (patch: Partial<DevicePrefs>) => {
      if (!addressForMemory) return;
      const next: DevicePrefs = {
        address: addressForMemory,
        name: sppService.deviceName ?? deviceName,
        modeId: activeMode.id,
        speed,
        servo,
        steerLimit,
        trim,
        useJoystick,
        joystickLayout: joystickLayoutId,
        lastWifiSsid: savedPrefs?.lastWifiSsid ?? null,
        // A-27 / round-6: ship the LIVE saved-router mirror with every patch
        // (never a stale-captured base), so router additions survive later
        // speed/steer persists AND a device power cycle.
        savedRouters: savedNetworksRef.current.slice(),
        // Connections-Hub (profiles): stable board id + every MAC this car
        // has presented + the smart-link auto-join toggle.
        uniqueId: carFwIdRef.current || null,
        btIds: addBtId(
          savedPrefs?.btIds ?? ([] as string[]),
          sppService.currentAddress ??
            sppService.getConnectionInfo().address ??
            "",
        ),
        autoJoinRouter,
        // Profiles-sync round: carry fields a narrow patch must NOT wipe
        // (previously a speed/mode persist erased wifiHistory + fullscreen
        // because the base record omitted them entirely).
        wifiHistory: savedPrefs?.wifiHistory ?? [],
        fullscreen: savedPrefs?.fullscreen ?? false,
        ...patch,
        // Last-save stamp: feeds last-saved-wins cloud merging.
        savedAt: Date.now(),
      } as DevicePrefs;
      void deviceMemory.write(addressForMemory, next);
      setSavedPrefs(next);
      // R4-7: register the key in the device-profile registry index so the
      // User preferences hub can enumerate every device ever saved (the
      // index is a best-effort spill; deviceMemory stays authoritative).
      void rememberDeviceKey(addressForMemory);
      // Profiles-sync: mirror the save to the user's cloud account so the
      // same car restores its last-saved state on any device (fire-and-
      // forget; local write already succeeded so this can never block UX).
      void saveCarProfile(next, addressForMemory).then((res) => {
        setProfileSync(
          res.ok ? { state: "synced", at: Date.now() } : { state: "offline" },
        );
      });
      // Round-6: spill the last-touched device globally so a cold start with
      // no live link can still recall the saved-router names (see LAST_DEVICE_KEY).
      const lastDevice = {
        address: addressForMemory,
        name: sppService.deviceName ?? deviceName,
        savedRouters: next.savedRouters,
      };
      void AsyncStorage.setItem(
        LAST_DEVICE_KEY,
        JSON.stringify(lastDevice),
      ).catch(() => {});
    },
    [
      addressForMemory,
      deviceName,
      activeMode.id,
      speed,
      servo,
      steerLimit,
      trim,
      useJoystick,
      joystickLayoutId,
      savedPrefs?.lastWifiSsid,
      savedPrefs?.wifiHistory,
      carFwIdRef.current,
      savedPrefs?.btIds,
      autoJoinRouter,
    ],
  );

  // Ref mirror so NAV commit callbacks can persist without re-creating
  // (and without stale captures) when called from deep in the input chain.
  const persistPrefsRef = useRef(persistPrefs);
  persistPrefsRef.current = persistPrefs;

  // Connections-Hub (profiles): record a Wi-Fi join into the per-car history
  // (names only) once per join, and remember the last verified router URL.
  // `telemetry.connected === true` is the STA-joined signal from firmware;
  // the join-key guard keeps the steady 1s status frames from re-writing.
  useEffect(() => {
    const joined = telemetry.connected === true && linkVerified && !!carSsid;
    const key = joined ? `${carSsid}:on` : "";
    if (joined) {
      if (wifiJoinKeyRef.current === key) return;
      wifiJoinKeyRef.current = key;
      persistPrefsRef.current?.({
        wifiHistory: upsertWifiHistory(savedPrefs?.wifiHistory, carSsid!),
        lastWifiUrl: wifiUrl || null,
      });
    } else {
      wifiJoinKeyRef.current = "";
    }
  }, [telemetry.connected, carSsid, linkVerified, wifiUrl, savedPrefs]);

  // Provisioning-reply handler mirror (defined below with useState deps).
  const handleWifiProvisionReplyRef = useRef<((reply: string) => void) | null>(
    null,
  );
  /**
   * D2 (U-68): the router-answer consumer, reached from the telemetry path via
   * a ref for the same reason `handleWifiProvisionReply` is — the telemetry
   * callback is registered once and must not be re-subscribed when the
   * consumer's identity changes.
   */
  const consumeRouterAnswerRef = useRef<((text: string) => boolean) | null>(
    null,
  );
  // R-4 NACK handler mirror (defined below; applyTelemetry has empty deps).
  const handleNackRef = useRef<((arg: string) => void) | null>(null);

  // Set category from route params
  useEffect(() => {
    if (
      resolvedCategory &&
      PROJECT_CATEGORIES.some((c) => c.slug === resolvedCategory)
    ) {
      setActiveCategory(resolvedCategory);
    }
  }, [resolvedCategory]);

  // Show connection message for a few seconds, then clear
  const showConnectionMessage = useCallback(
    (msg: string, type: "success" | "error") => {
      setConnectionMessage(msg);
      setConnectionMsgType(type);
      if (connectionMsgTimerRef.current)
        clearTimeout(connectionMsgTimerRef.current);
      connectionMsgTimerRef.current = setTimeout(() => {
        setConnectionMessage(null);
        setConnectionMsgType(null);
        connectionMsgTimerRef.current = null;
      }, 4000);
    },
    [],
  );

  const handleCategoryPress = useCallback((slug: string) => {
    setActiveCategory(slug);
  }, []);

  // F-34: a hub instance that MOUNTS after a link is already up must show it.
  // Status events never replay, so the Drive Deck opened while the Control
  // Panel is already WiFi-connected kept wifiConnected=false forever ->
  // canControl=false -> the whole drive deck rendered dim/disabled ("as if
  // connection is not made") even though traffic still flowed (sendCommand
  // reads wifiService.isConnected live, which is also why the mode dropdown
  // kept working over WiFi). Reconcile THIS instance with the LIVE singleton
  // truth exactly once, at mount; after that the status subscriptions drive
  // the state as before.
  useEffect(() => {
    if (wifiService.isConnected) {
      setWifiConnected(true);
      setConnected(true);
    }
    if (sppService.isConnected) {
      setConnected(true);
      setDeviceName(sppService.deviceName ?? "");
    } else if (bleService.isConnected) {
      setConnected(true);
      setDeviceName(bleService.deviceName ?? "");
    }
    if (wifiService.linkVerified) setLinkVerified(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount â€” do NOT disconnect the singleton services; the
  // BLE/SPP/WiFi connection must survive navigation between screens (and
  // between ToolsScreen and the Remote window). Only explicit user action
  // (handleDisconnect) should tear down a transport. wifiService owns its
  // socket + reconnect timer, so there is nothing to tear down here.
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      manualCloseRef.current = true;
      if (connectionMsgTimerRef.current) {
        clearTimeout(connectionMsgTimerRef.current);
        connectionMsgTimerRef.current = null;
      }
    };
  }, []);

  // Telemetry + status wiring (SPP service)
  // Parity with the ESP remote's parseTelemetryLine() + applyRemoteState()
  // (state.cpp / comms.cpp):
  //   â€¢ MODE: ALWAYS mirror the car's authoritative mode (the car's own mode
  //     button must switch the app too).
  //   â€¢ SPD: mirror the magnitude quantized to the 5-step grid inside
  //     SPEED_MIN..SPEED_MAX; skipped while NAV is editing; SPD0 = stop echo
  //     keeps the displayed speed.
  //   â€¢ STATUS: only whitelisted short statuses are displayed.
  //   â€¢ TRIM: mirrored.
  useEffect(() => {
    const applyTelemetry = (t: CarTelemetry) => {
      if (!mountedRef.current) return;
      setTelemetry((prev) => ({ ...prev, ...t }));
      // Connections-Hub (profiles): remember the board-unique id. It changes
      // the stable memory key to `fw:<id>` (see addressForMemory) and lands
      // in the persisted profile as uniqueId.
      if (t.id) carFwIdRef.current = t.id.trim() || null;
      // Mode: always mirror (applyRemoteState parity). X-8: incoming tokens
      // are canonicalized so old cars' MODE=BT still mirrors the 4WD4M row.
      // A-37: R-33 parity — within MODE_CHANGE_GRACE_MS of selectMode, an echo
      // still equal to the PRE-commit mode is the stale race line (skip, the
      // optimistic pick stands); a changed echo is car truth → adopt + clear.
      if (t.mode) {
        const canonical = canonicalCarToken(t.mode);
        const commit = modeCommitRef.current;
        if (commit && Date.now() - commit.at > MODE_CHANGE_GRACE_MS)
          modeCommitRef.current = null;
        const pending = modeCommitRef.current;
        const staleRace =
          pending != null &&
          canonical === pending.stale &&
          canonical !== pending.token;
        if (!staleRace) {
          if (pending != null) modeCommitRef.current = null;
          setCarModeId(canonical);
          carModeIdRef.current = canonical;
          const matched = carModesRef.current.find(
            (m) => m.id === canonical.toLowerCase() || m.token === canonical,
          );
          if (matched) setActiveMode(matched);
        }
      }
      // Speed mirror — car-truth, change-guarded, range-clamped (owner
      // 2026-09-29: "speed is malicious — mid-drive it shows something else").
      // Rules, in order:
      //   • skipped entirely while NAV is editing (state.cpp parity);
      //   • magnitude only — SPD0 is the stop echo and keeps the display;
      //   • clamped into the car's accepted 100..255 window BEFORE
      //     quantizing (the car clamps there too — Config.h MIN/MAX), so an
      //     out-of-window echo is noise, never a new speed to display;
      //   • applied ONLY on a state-changing frame (STATUS "Speed set"/mode
      //     change — the car confirming an actual speed), never on the
      //     steady STATE echo, which raced the user's in-flight slider edit
      //     and snapped the strip to a different number mid-drag.
      if (!navActiveRef.current && t.speed != null) {
        const mag = Math.abs(t.speed);
        if (mag > 0) {
          const confirmed = isAllowedDriveStatus(t.status) || t.mode != null;
          const inWindow = mag >= SPEED_MIN && mag <= SPEED_MAX;
          if (confirmed || inWindow) {
            const next = quantizeSpeedToStep(
              Math.max(SPEED_MIN, Math.min(SPEED_MAX, mag)),
            );
            if (next !== speedRef.current) setSpeed(next);
          }
        }
      }
      if (t.trim != null) setTrim(t.trim);
      // R-19: car-truth trip metrics (2WD1M family STATE extras)
      if (t.trip != null) setTripAvg(t.trip);
      if (t.maxSteer != null) setMaxSteer(t.maxSteer);
      // R-20: car-truth steering travel limit (STATE ;STEER=). Clamped to the
      // car's persisted range; the local steppers send STEER<n> and the car
      // echoes the stored value, so remote + app converge on one truth.
      if (t.steerLimit != null) {
        const lim = Math.max(
          STEER_LIMIT_MIN,
          Math.min(STEER_LIMIT_MAX, Math.round(t.steerLimit)),
        );
        setSteerLimit((prev) => (prev === lim ? prev : lim));
      }
      // PID telemetry from TEL; frames (self-balancing live values).
      if (t.kp != null) setPidKp(t.kp);
      if (t.ki != null) setPidKi(t.ki);
      if (t.kd != null) setPidKd(t.kd);
      if (t.out != null) setPidOut(t.out);
      if (t.off != null) setPidOff(t.off);
      // Status: whitelist only â€” verbose/unknown statuses never shown.
      if (t.status && isAllowedDriveStatus(t.status)) {
        setDriveStatusOnce(t.status);
        const d = statusToDirection(t.status);
        if (d) setDriveDirOnce(d);
      }
      // v1.4.0: provisioning replies ride STATE as REPLY=â€¦ (car â†’ app).
      // V2: provisioning moves the car to its own AP or a STA join; the
      // app must give up the AP dial so the drive socket is not stuck on the
      // car's own AP. The car keeps every transport live; the next
      // STATE;IP= broadcasts the router IP for the user to dial.
      if (t.reply) {
        // D2 (U-68): the car answers router commands in the SAME `REPLY=` slot
        // as the legacy WIFICFG replies. Both are offered to both consumers:
        // the WIFICFG handler ignores what it does not own, and the router
        // consumer ignores what is not a `ROUTERS;…` answer. Before this, a
        // `ROUTERS;FULL` or `ROUTERS;ERROR;…` was received and dropped, which
        // is why a failed add was indistinguishable from a successful one.
        handleWifiProvisionReplyRef.current?.(t.reply);
        consumeRouterAnswerRef.current?.(t.reply);
      }
      if (t.ap !== undefined) setCarApName(t.ap || null);
      if (t.ssid !== undefined) setCarSsid(t.ssid || null);
      // Connections-Hub (smart-link): the car-side scan answer to ROUTERS;SCAN
      // (firmware v2). Change-guarded so steady frames don't thrash.
      if (t.scan !== undefined) {
        setCarScan((prev) =>
          prev && prev.length === t.scan!.length
            ? prev
            : (t.scan ?? []).slice(),
        );
      }
      if (t.scan !== undefined) carScanRef.current = (t.scan ?? []).slice();
      // A-27: sync the saved-router mirror from the car's `networks` JSON
      // (broadcast on every WS status frame + REQ_STATE). Change-guarded to
      // skip identical arrays (steady 1 s broadcasts don't thrash the panel).
      //
      // D6 (U-68): the car ALSO sends the registry as a `NETW;…` text line on
      // every transport, and that is the only shape a Bluetooth link carries.
      // Both feed the same state, so the router list is no longer a WiFi-shaped
      // accident (F-66) — it is a property of the connection, which is what
      // lets it be managed over Bluetooth at all.
      const incomingRouters =
        t.networks && Array.isArray(t.networks)
          ? t.networks
          : t.netw && Array.isArray(t.netw)
            ? t.netw
            : null;
      if (incomingRouters) {
        const incoming: string[] = incomingRouters;
        setCarNetworks((prev) =>
          prev.length === incoming.length &&
          prev.every((n, i) => n === incoming[i])
            ? prev
            : incoming.slice(),
        );
      }
      // A-7: car truth â€” CAP=STUB (STATE lines) / `stub` (WS JSON) describe
      // the car's CURRENT mode; record it per token so the mode chooser and
      // selectMode() gate on car reality, not a hardcoded app list
      // (X-8: keys canonical â€” legacy BT â†’ 4WD4M).
      if (t.stub !== undefined && t.mode) {
        const tok = canonicalCarToken(t.mode);
        if (tok)
          setCarStubMap((prev) =>
            prev[tok] === t.stub ? prev : { ...prev, [tok]: t.stub! },
          );
      }
      // R-10: full availability table (CAPS;â€¦ broadcast) â€” authoritative
      // per-token 3-state truth. Canonical keys (legacy BT â†’ 4WD4M).
      if (t.caps && Object.keys(t.caps).length > 0) {
        setCarAvailMap((prev) => {
          let next = prev;
          for (const [tok, val] of Object.entries(t.caps!)) {
            if (!tok) continue;
            next = next[tok] === val ? next : { ...next, [tok]: val };
          }
          return next;
        });
      }
      // R-4 (app half): the car rejected a sent mode token â€” park it as
      // car-truth stub and surface "Not supported by car" (remote
      // comms.cpp:505-508 parity).
      if (t.nackError === "UNKNOWN_MODE" && t.nackArg)
        handleNackRef.current?.(t.nackArg);
    };
    const offSpp = sppService.onTelemetry(applyTelemetry);
    const offBle = bleService.onTelemetry(applyTelemetry);
    const offWifi = wifiService.onTelemetry(applyTelemetry);
    const offStatus = sppService.onStatus((kind, message) => {
      if (!mountedRef.current) return;
      // FIN-50: FIN-44's dedupe compares against sppStatusMsgRef, but the ref
      // was never WRITTEN — every comparison saw `null`, so the 'error'
      // same-message guard never matched and the reconnect burst kept
      // re-rendering. Keep it truthful (ref write = no re-render).
      sppStatusMsgRef.current = message ?? null;
      // FIN-50 flicker fix (owner gate 2026-09-20): during the SILENT
      // auto-reconnect burst the UI flapped connecting↔error on every attempt
      // (each transition re-rendered the control panel + remote screen). While
      // the backoff is running, collapse both transient kinds into ONE stable
      // presentation ('connecting' + 'Reconnecting…') so repeated attempts no
      // longer change any rendered value. Real transitions ('connected',
      // 'disconnected') and the exhausted-attempts banner are unaffected.
      const reconnecting =
        !manualCloseRef.current &&
        !sppService.manualClose &&
        !!sppLastAddressRef.current &&
        sppReconnectAttemptsRef.current > 0;
      const burst = reconnecting && (kind === "connecting" || kind === "error");
      const presentationKind = burst ? "connecting" : kind;
      const presentationMsg = burst ? "Reconnecting…" : (message ?? null);
      // FIN-44 flicker fix: dedupe repeats of the same status kind (the SPP
      // service emits per event; repeated 'connecting'/'error' bursts from the
      // auto-reconnect backoff re-rendered the BT connection-details row on
      // every attempt even though nothing changed). Transitions still render.
      setSppStatus((prevKind) => {
        if (prevKind === presentationKind) {
          // Same state again — only 'error' carries a NEW message worth a repaint.
          if (
            presentationKind !== "error" ||
            presentationMsg === sppStatusMsgRef.current
          )
            return prevKind;
        }
        return presentationKind;
      });
      switch (kind) {
        case "connecting":
          if (!burst) setSppStatusMsg(""); // burst: keep the stable message
          setShowSppsRetry(false);
          break;
        case "connected":
          setSppStatus("connected");
          setSppStatusMsg(message ?? "Connected");
          setShowSppsRetry(false);
          sppReconnectAttemptsRef.current = 0;
          // A-7: fresh link â€” drop any stub truth from the previous session
          // so the next car (or a re-flashed car) starts from the fallback
          // table until it reports per-token truth again (remote R-10 parity).
          setCarStubMap({});
          setCarAvailMap({});
          // Bugfix: only the manual handleConnect() used to set connected=true;
          // a silent auto-reconnect or retry that reached 'connected' left the
          // UI believing the link was down (dead Connect button on return).
          setConnected(true);
          // Force the car to broadcast its current STATE so the app
          // immediately picks up the active mode, speed, trim, etc.
          setTimeout(() => {
            sppService.requestState().catch(() => {});
          }, 200);
          break;
        case "disconnected":
          setSppStatus("disconnected");
          setSppStatusMsg("");
          setConnected(false);
          setDeviceName("");
          setDriveStatusOnce("Stop");
          setDriveDirOnce("S");
          // Auto-reconnect on unexpected disconnect (ESP remote parity):
          // silent exponential backoff; the banner appears when exhausted.
          if (
            !manualCloseRef.current &&
            !sppService.manualClose &&
            sppLastAddressRef.current
          ) {
            startSppReconnect();
          } else {
            setShowSppsRetry(false);
          }
          break;
        case "error":
          if (!burst) setSppStatusMsg(presentationMsg ?? "Connection error"); // burst: no flap
          setConnected(false);
          setDeviceName("");
          setDriveStatusOnce("Stop");
          setDriveDirOnce("S");
          if (
            !manualCloseRef.current &&
            !sppService.manualClose &&
            sppLastAddressRef.current
          ) {
            startSppReconnect();
          } else {
            setShowSppsRetry(false);
          }
          break;
        default:
          break;
      }
    });
    // BLE status â€” mirrors SPP connected/disconnected handling so BLE-only
    // links trigger REQ_STATE and set connected=true.
    const offBleStatus = bleService.onStatus((kind, message) => {
      if (!mountedRef.current) return;
      if (kind === "connected") {
        setConnected(true);
        setDeviceName(bleService.deviceName ?? "Car");
        setTimeout(() => {
          bleService.requestState().catch(() => {});
        }, 200);
      } else if (kind === "disconnected") {
        // Only clear connected if SPP is also not linked.
        if (!sppService.isConnected) {
          setConnected(false);
          setDeviceName("");
        }
      } else if (kind === "error") {
        // BLE monitoring error â€” treat like disconnect if SPP is also down
        if (!sppService.isConnected) {
          setConnected(false);
          setDeviceName("");
        }
      }
    });
    // WiFi status â€” mirrors SPP/BLE handling so a shared link updates every
    // hub instance (Remote window + Control Panel) from the ONE socket.
    const offWifiStatus = wifiService.onStatus((kind, message) => {
      if (!mountedRef.current) return;
      switch (kind) {
        case "connecting":
          setConnecting(true);
          setError(null);
          break;
        case "connected":
          setConnected(true);
          setWifiConnected(true);
          setConnecting(false);
          setError(null);
          setShowSppsRetry(false);
          // A-7/R-10: fresh link â€” drop stale stub/avail truth from the old
          // session (same reset the SPP handler does on its own reconnect).
          setCarStubMap({});
          setCarAvailMap({});
          showConnectionMessage("WiFi connected", "success");
          setTimeout(() => {
            wifiService.requestState().catch(() => {});
          }, 200);
          break;
        case "disconnected":
          setWifiConnected(false);
          setConnecting(false);
          // Only clear the global "connected" if SPP/BLE are also down.
          if (!sppService.isConnected && !bleService.isConnected) {
            setConnected(false);
            setDeviceName("");
          }
          break;
        case "error":
          setWifiConnected(false);
          setConnecting(false);
          setError(message ?? "WiFi connection lost");
          if (!sppService.isConnected && !bleService.isConnected) {
            setConnected(false);
            setDeviceName("");
          }
          break;
        default:
          break;
      }
    });
    return () => {
      offSpp();
      offBle();
      offStatus();
      offBleStatus();
      offWifi();
      offWifiStatus();
    };
    // NOTE: deps are intentionally empty â€” activeMode is read via
    // carModesRef (fresh on every telemetry frame) and setActiveMode is a
    // stable setState.  The old [activeMode] dependency tore down and
    // re-created the subscription on every mode change, which caused the
    // app to miss STATE;MODE=â€¦ frames from the car during the gap.
  }, []);

  // Check if SPP is supported on this device
  const sppSupported = sppService.supported;

  // Periodic REQ_STATE â€” keeps the app synced with the car's current mode,
  // speed, and trim. The ESP32 firmware may not auto-broadcast STATE when
  // the physical mode button is pressed, so we poll every 2 s.
  // Works for SPP, BLE, and WiFi transports. Polling only runs while THIS
  // hub is the focused screen, so the Tools+Remote pair never sends
  // duplicate REQ_STATEs to the same car (bug: two wsRefs polled before).
  const isFocused = useIsFocused();
  // A-14: the poll loop depends ONLY on focus — `connected` is read from a
  // fresh ref, so connect/disconnect churn never tears down and re-creates
  // the interval (was a flicker source: the interval restarted whenever
  // `connected`/`wifiConnected` flipped, right when the link was recovering).
  useEffect(() => {
    if (!isFocused || !connectedRef.current) return;
    const id = setInterval(() => {
      if (sppService.isConnected) {
        sppService.requestState().catch(() => {});
      }
      if (bleService.isConnected) {
        bleService.requestState().catch(() => {});
      }
      if (wifiService.isConnected) {
        wifiService.requestState().catch(() => {});
      }
    }, 2000);
    return () => clearInterval(id);
  }, [isFocused]);

  // Scan for SPP devices (Classic Bluetooth)
  const handleScan = useCallback(async () => {
    if (!sppSupported) {
      setError("Classic Bluetooth (SPP) is not available on this device");
      return;
    }
    setScanning(true);
    setError(null);
    setSppDevices([]);
    try {
      const devices = await sppService.scan();
      if (devices.length > 0) {
        setSppDevices(devices);
        if (connectionMsgType) {
          setConnectionMessage(null);
          setConnectionMsgType(null);
        }
      } else {
        setError(
          "No Bluetooth cars found. Make sure your ESP32 car is powered on.",
        );
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : "Scan failed");
      }
    } finally {
      if (mountedRef.current) setScanning(false);
    }
  }, [sppSupported, connectionMsgType]);

  // Connect to SPP device
  const handleConnect = useCallback(
    async (device: SppDevice): Promise<ConnectOutcome> => {
      if (!device.address) {
        const reason =
          "This car has no Bluetooth address. Rescan and try again.";
        setError(reason);
        return { ok: false, reason };
      }
      setConnectingAddress(device.address);
      setError(null);
      manualCloseRef.current = false;
      try {
        await sppService.connect(device.address);
        sppLastAddressRef.current = device.address;
        sppReconnectAttemptsRef.current = 0;
        sppReconnectActiveRef.current = false; // fresh manual link: re-arm the scheduler
        setConnected(true);
        setDeviceName(device.name);
        setConnecting(false);
        setConnectingAddress(null);
        setWifiConnected(false);
        showConnectionMessage(`Connected to ${device.name}`, "success");
        void sppService.requestState().catch(() => {});
        return {
          ok: true,
          message: `Connected to ${device.name || device.address}.`,
        };
      } catch (e) {
        const reason = e instanceof Error ? e.message : "Connection failed";
        if (mountedRef.current) {
          setError(reason);
          setConnecting(false);
          setConnectingAddress(null);
          // UX-1: no toast here - the hub's `error` is the single failure
          // state; the Control Panel's connection section renders it.
        }
        // U-69 (2026-10-02): the outcome is now RETURNED as well as stored.
        //
        // This handler has always swallowed its failure into `error` state,
        // which used to be rendered by ConnectionBanner. When U-68 replaced the
        // banner with the rebuilt ConnectionSection, the caller had nothing to
        // await and nothing to read — so a FAILED Bluetooth connect resolved
        // normally and the UI announced "Connected to <car>". That is the
        // owner's "the bluetooth is not build in the app and i am not able to
        // connect the device to the app": a fake success is worse than no
        // success, because it sends the tester looking for a link that is not
        // there (F-61/F-62).
        //
        // Returning the outcome is ADDITIVE — the callers that ignore it (the
        // dead DeviceConnectionScreen) are unaffected — and it makes a failure
        // impossible to mistake for a success.
        return { ok: false, reason };
      }
    },
    [showConnectionMessage],
  );

  // Immediate SPP retry (uses last known address from service)
  const handleSppsRetry = useCallback(async () => {
    setShowSppsRetry(false);
    setError(null);
    manualCloseRef.current = false;
    sppReconnectAttemptsRef.current = 0;
    sppReconnectActiveRef.current = false; // explicit user retry: re-arm first (idempotent)
    try {
      await sppService.retryConnect();
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : "Retry failed");
      }
    }
  }, []);

  // UX-1 (2026-10-02 audit): a connect failure surfaces ONCE — through the
  // hub's `error` (the ConnectionBanner is the single problem surface on the
  // Control Panel). The extra toast here was the duplicate-message defect
  // the 2026-09-30 cleanup killed, reintroduced by the picker bridge.
  const handleWifiConnect = useCallback(
    async (overrideUrl?: string) => {
      setError(null);
      // OPS-2: the ToolsScreen bridge calls setWifiUrl(options.url) and then
      // this handler in the SAME tick — the `wifiUrl` state has not re-rendered
      // yet, so a first connect would dial the bundled default instead of the
      // restored address. An explicit override is dialled directly.
      const effectiveUrl = overrideUrl?.trim() || wifiUrl;
      if (!effectiveUrl) {
        const reason = `Enter the car WiFi address (e.g. ${DEFAULT_WS_URL})`;
        setError(reason);
        return { ok: false, reason };
      }
      const wsUrl =
        effectiveUrl.startsWith("ws://") || effectiveUrl.startsWith("wss://")
          ? effectiveUrl
          : `ws://${effectiveUrl}`;
      manualCloseRef.current = false;
      setConnecting(true);
      setLinkVerified(false);
      // Deliver over the ONE shared socket every hub reads — the SAME
      // WebSocket the website page (http://192.168.245.1) uses for drive.
      // R1: connect() only proves the socket opened, so wait for the car to
      // actually answer before claiming a working link.
      try {
        await wifiService.connect(wsUrl);
        const answered = await wifiService.waitForCarAnswer();
        if (!mountedRef.current) {
          return {
            ok: false,
            reason: "The app closed before the car answered.",
          };
        }
        setLinkVerified(answered);
        if (answered) {
          setWifiConnected(true);
          setError(null);
          showConnectionMessage(`Connected to car via WiFi`, "success");
          setTimeout(() => {
            wifiService.requestState().catch(() => {});
          }, 200);
          return { ok: true, message: "Connected." };
        }
        // The socket opened but the car never spoke — a half-open link. Say so
        // rather than letting the caller assume a connection (U-69).
        const reason =
          "WiFi link opened but the car did not answer. Check the car is powered and that you are on the right network.";
        setWifiConnected(false);
        setError(reason);
        return { ok: false, reason };
      } catch (e) {
        const reason = e instanceof Error ? e.message : "WiFi connect failed";
        if (mountedRef.current) {
          setError(reason);
          setWifiConnected(false);
          setLinkVerified(false);
        }
        return { ok: false, reason };
      } finally {
        if (mountedRef.current) setConnecting(false);
      }
    },
    [wifiUrl, showConnectionMessage],
  ) as (overrideUrl?: string) => Promise<ConnectOutcome>;

  const handleWifiDisconnect = useCallback(async () => {
    manualCloseRef.current = true;
    // Safe-stop: send stop commands before closing (only over the live socket).
    if (wifiService.isConnected) {
      try {
        await wifiService.sendLine("S");
      } catch {
        /* ignore â€” link may already be dead */
      }
      try {
        await wifiService.sendLine("SPD0");
      } catch {
        /* ignore */
      }
    }
    await wifiService.disconnect();
    setWifiConnected(false);
    setError(null);
  }, []);

  // ---- v1.4.0 WiFi provisioning (app â†’ BT â†’ car) ----
  // Sends WIFICFG;<ssid>;<password> over the Bluetooth link; the car stores
  // the pair in Preferences and switches itself to ESP_SER (joins the router
  // and hosts its web page). The car's STATE echo carries REPLY=WIFICFG;â€¦
  const handleWifiProvision = useCallback(async () => {
    const ssid = wifiSsid.trim();
    if (!ssid) {
      setError("Enter the WiFi network name (SSID) first.");
      return;
    }
    if (!connected || !sppService.isConnected) {
      setError(
        "Connect the car over Bluetooth first â€” credentials travel the BT link.",
      );
      return;
    }
    setWifiProvisioning(true);
    setError(null);
    try {
      await sppService.sendLine(buildWifiConfigLine(ssid, wifiPassword));
      // A-15 (device-round-2): update the deck optimistically — show the
      // just-sent network immediately instead of waiting for the car's
      // REPLY (the stale default-SSID bug). The car's T-35 confirm
      // (sendStateOn → REPLY=WIFICFG;STORED;<ssid>) re-confirms anyway.
      // V2: provisioning moves the car to its own AP or a STA join; the
      // app must give up the AP dial so the drive socket is not stuck on the
      // car's own AP. The car keeps every transport live; the next
      // STATE;IP= broadcasts the router IP for the user to dial.
      wifiService.disconnect().catch(() => {});
      showConnectionMessage(
        `Sent WiFi "${ssid}" to the car — it is switching to Webserver/join mode.`,
        "success",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to send WiFi credentials",
      );
    } finally {
      setWifiProvisioning(false);
    }
  }, [wifiSsid, wifiPassword, connected, showConnectionMessage, persistPrefs]);

  // REPLY=â€¦ lines from the car (WIFICFG;STORED;<ssid>) confirm provisioning
  // and pre-fill the WS URL for the deck.
  const lastProvisionReplyRef = useRef<string | null>(null);
  const handleWifiProvisionReply = useCallback(
    (reply: string) => {
      if (reply.startsWith("WIFICFG;STORED;")) {
        const ssid = reply.slice("WIFICFG;STORED;".length).trim();
        setCarSsid(ssid);
        setWifiPassword("");
        // A-8: keep the SSID in the field (it doubles as confirmation of what
        // the car stored) and remember it per car so the card pre-fills next
        // session. The password is cleared â€” it must never linger in the UI.
        persistPrefs({ lastWifiSsid: ssid });
        // The car joins the router and gets a DHCP IP; default to the car's
        // AP address until the user reads the real IP off the OLED/deck.
        // v2: the new 4WD4M car's own AP is 192.168.245.1 (donor owns .244;
        // SDK-default .4.x is forbidden fleet-wide).
        // V2: drop the AP socket on provisioning so the dial is not stuck
        // on the car's own AP; the car keeps every transport live and the
        // next STATE;IP= broadcasts the router IP for the user to dial.
        wifiService.disconnect().catch(() => {});
        setWifiUrl(DEFAULT_WS_URL);
        showConnectionMessage(
          `Car stored WiFi "${ssid}" â€” switched to Webserver/join mode (v2 cars keep every transport live).`,
          "success",
        );
      } else if (reply.startsWith("WIFICFG;ERROR")) {
        setError(`Car rejected WiFi settings: ${reply}`);
      } else if (reply.startsWith("WIFICFG;SSID;")) {
        setCarSsid(reply.slice("WIFICFG;SSID;".length).trim() || null);
      }
      lastProvisionReplyRef.current = reply;
    },
    [showConnectionMessage, persistPrefs],
  );
  handleWifiProvisionReplyRef.current = handleWifiProvisionReply;

  // R-4 (app half, fleet parity): the car replied NACK;E=UNKNOWN_MODE;ARG=<token>
  // to a mode token it doesn't recognize (mixed-pair case). Surface "Not
  // supported by car" and park the token as car-truth stub so ModeChooser
  // BADGES it as work-in-progress, which is what the hand-held remote does
  // (comms.cpp:505-508: setCarStub(arg,true) + setStatus(...)).
  //
  // It does NOT refuse the token, and an earlier version of this comment
  // claimed it did. Parking is presentation-only: selectMode() sends every
  // token (R-10, 2026-09-15) and the car is the authority on what it accepts.
  // The stale "refuse it from here on" wording survived a deliberate removal
  // of that gate, which is the worst kind of comment — one that describes a
  // safety control that isn't there.
  //
  // F-52: a NACK is NOT only about modes. handleCommand() falls through to
  // setModeFromString() for any line it does not handle, so the car answers
  // every unrecognised COMMAND with the same UNKNOWN_MODE error. The 4WD4M
  // (differential drive) implements neither ESTOP, SERVO<n>, TRIM<n> nor
  // STEER<n> — all four are sent by this screen — so every EMERGENCY STOP
  // press (and every trim / steering-limit edit) arrived here and produced a
  // red "ESTOP is not supported by this car" toast on the one control that
  // must never look broken, overwrote the "EMERGENCY STOP" status with
  // "Not supported by car", and parked a phantom `ESTOP` stub. The car did
  // stop (SPD0 is correct) — which is exactly why it survived every bench
  // round. Only a real MODE token may be parked or reported.
  const handleNack = useCallback(
    (arg: string) => {
      const tok = canonicalCarToken(arg);
      if (!tok) return;
      if (!isModeToken(tok)) return;
      setCarStubMap((prev) =>
        prev[tok] === true ? prev : { ...prev, [tok]: true },
      );
      setDriveStatusOnce("Not supported by car");
      showConnectionMessage(
        `${MODE_NAME_FOR_TOKEN[tok] ?? tok} is not supported by this car.`,
        "error",
      );
    },
    [showConnectionMessage],
  );
  handleNackRef.current = handleNack;

  // Safe stop on link loss (comms.cpp safeStopAndClearQueue parity): the
  // neutral commands are sent by the transport layer on disconnect; here we
  // reset the on-screen drive state so the app never shows a stale
  // "Forward" after the car already stopped.
  useFocusEffect(
    React.useCallback(() => {
      return sppService.onStatus((kind) => {
        if (!mountedRef.current) return;
        if (kind === "disconnected" || kind === "error") {
          setDriveDirOnce("S");
        }
      });
    }, []),
  );

  const handleDisconnect = useCallback(async () => {
    // Persist everything before tearing down so the car remembers for next
    // power cycle (owner: "remember state after restart").
    persistPrefsRef.current?.({ modeId: activeMode.id });
    manualCloseRef.current = true;
    // Safe-stop: send neutral commands over every live transport.
    try {
      await sppService.sendLine("SPD0");
    } catch {
      /* ignore */
    }
    try {
      await sppService.sendLine("SERVO90");
    } catch {
      /* ignore */
    }
    if (bleService.isConnected) {
      try {
        await bleService.sendLine("SPD0");
      } catch {
        /* ignore */
      }
      try {
        await bleService.sendLine("SERVO90");
      } catch {
        /* ignore */
      }
      await bleService.disconnect();
    }
    if (wifiService.isConnected) {
      try {
        await wifiService.sendLine("SPD0");
      } catch {
        /* ignore */
      }
      try {
        await wifiService.sendLine("SERVO90");
      } catch {
        /* ignore */
      }
      await wifiService.disconnect();
    }
    await sppService.disconnect();
    // Drive UI reset: only the live drive state â€” speed / servo / PID /
    // gimbal / telemetry stay at their current values so they restore on
    // reconnect (bug fix 2026-09-15: "remember after power cycle").
    setConnected(false);
    setWifiConnected(false);
    setDeviceName("");
    setSppDevices([]);
    setDriveStatusOnce("Stop");
    setDriveDirOnce("S");
    setNavActive(false);
    setNavField("none");
    setPreviewMode(null);
  }, [activeMode]);

  // Send a command over the right transport(s) for the ACTIVE mode; no-ops
  // when nothing is linked.
  //   â€¢ Every-link commands (mode tokens + neutral/emergency lines) go over
  //     all live links.
  //   â€¢ Everything else follows the active mode's own transports: WiFi modes
  //     (ESP_SER / ESP_CLI) drive over the WebSocket only, BT modes over
  //     SPP/BLE only (R-4 parity â€” a Bluetooth car must never hear a
  //     WiFi-mode drive letter).
  //   â€¢ When only ONE link is live it is used regardless of mode, so a 4WD4M
  //     car connected purely over the wireless car's WS still drives (that
  //     path accepts drive in any mode).
  //   * 4b (2026-10-02 evening): when TWO links are live the user's CHOSEN
  //     method (the manager's active link) is the tie-breaker — it is ADDED
  //     as a carrier, so a stale secondary link can never strand a drive
  //     command while the phone sits on the router. The decision is pinned
  //     pure in commandRouting.ts / commandRouting.test.ts.
  const sendCommand = useCallback(
    (cmd: string) => {
      const btLive = sppService.isConnected || bleService.isConnected;
      const wsLive = wifiService.isConnected;
      const modeUsesBt =
        activeMode.transport.includes("classic-bt") ||
        activeMode.transport.includes("ble");
      const modeUsesWifi = activeMode.transport.includes("wifi");
      const broadcast = EVERY_LINK_COMMANDS.has(
        cmd.trim().toUpperCase().split(";")[0],
      );
      // F-12: the chosen link is read LIVE at call time (manager truth) —
      // never cached in state, so a method switch changes routing on the
      // very next command.
      const route = routeCommand({
        broadcast,
        btLive,
        wsLive,
        modeUsesBt,
        modeUsesWifi,
        chosenRadio: linkManager.getActive()?.radio ?? null,
      });
      if (route.bt && connected && sppService.isConnected) {
        void sppService.sendLine(cmd).catch(() => {});
      }
      if (route.bt && connected && bleService.isConnected) {
        void bleService.sendLine(cmd).catch(() => {});
      }
      if (route.ws && wifiService.isConnected) {
        void wifiService.sendLine(cmd).catch(() => {});
      }
    },
    [connected, wifiConnected, activeMode],
  );

  // ---- Connection-Manager Phase B: the ONE opt-in envelope intake ----
  //
  // Both dialects now coexist: the existing screen code keeps calling
  // sendCommand("SPD140") with hand-written wire lines, and this accepts
  // the additive JSON envelope. The envelope is encoded to a line FIRST,
  // then handed to the SAME sendCommand fan-out above — deliberately, not
  // to linkManager. Going through linkManager would have been shorter but
  // WRONG: sendCommand is where R-4 fleet parity lives (mode-based
  // transport routing + the EVERY_LINK_COMMANDS broadcast set), and
  // linkManager.sendLine is not on that path. Encoding here is also what
  // makes "the envelope never changes a byte on the wire" true by
  // construction rather than by test.
  //
  // Fails CLOSED in three places, none of which put anything on the wire:
  //   • gate off (the shipped default)      → refused
  //   • malformed envelope                  → its readable error
  //   • no link / nothing connected         → the fan-out's own no-op
  const sendEnvelopeCommand = useCallback(
    (input: EnvelopeInput): EnvelopeSendResult => {
      if (!isEnvelopeIntakeEnabled()) {
        return {
          ok: false,
          error: "Command envelopes are not enabled on this build.",
        };
      }
      const encoded = encodeEnvelopeWire(input);
      if (!encoded.ok) {
        // Surface the translation layer's own reason (F-30: one readable
        // error, never a silent drop).
        setError(encoded.error);
        return { ok: false, error: encoded.error };
      }
      // The line is now a normal wire line: mode routing, the broadcast
      // set and the canControl gating all behave exactly as they do for a
      // hand-written one. W-14: the password-bearing lines (ROUTERS;ADD,
      // WIFICFG) go to the car and are never echoed into a status string.
      sendCommand(encoded.line);
      return { ok: true };
    },
    [sendCommand],
  );

  // ---- A-27: saved-router registry (wireless car v1.7.1, ROUTERS;*) ----
  // The car (NVS `botcfg`) is the source of truth; the app mirrors names in
  // savedRouters so the panel restores instantly. Commands broadcast over
  // EVERY link (W-14: system commands, never drive). Each edit persists the
  // mirror optimistically; the car's `networks` echo re-syncs within ~1-2 s
  // (1 s WS broadcast + 2 s REQ_STATE poll).
  const routerUse = useCallback(
    (ssid: string) => {
      const s = ssid.trim();
      if (!s) return;
      sendCommand(buildRouterCommand("USE", s));
      setDriveStatusOnce(`Switching WiFi to ${s}`);
      persistPrefsRef.current?.({ savedRouters: [...carNetworks] });
    },
    [sendCommand, carNetworks],
  );

  const routerAdd = useCallback(
    (ssid: string, pass: string) => {
      const s = ssid.trim();
      if (!s) return;
      sendCommand(buildRouterCommand("ADD", s, pass));
      // Optimistic list update (the car's next echo is authoritative).
      setCarNetworks((prev) => (prev.includes(s) ? prev : [...prev, s]));
      persistPrefsRef.current?.({
        savedRouters: carNetworks.includes(s)
          ? [...carNetworks]
          : [...carNetworks, s],
      });
      setDriveStatusOnce(`Saved router ${s}`);
    },
    [sendCommand, carNetworks],
  );

  // -------------------------------------------------------------------
  // D2 (U-68): RUN A ROUTER REQUEST AND WAIT FOR THE CAR'S ANSWER.
  //
  // The car answers every router command (`ROUTERS;ADDED` / `USED` /
  // `DELETED` / `CLEARED` / `FULL` / `ERROR;…`). Until now the app parsed
  // `REPLY=` off the STATE line and threw it away — only `WIFICFG;*` was
  // handled — so "add a router" was fire-and-forget: a success and a
  // `ROUTERS;FULL` looked identical, and the form cleared itself on a 600 ms
  // timer. That is why the owner could not make adding a router work and
  // could not see why.
  //
  // F-62: an answer must be CONSUMED. `requestRouter` sends the line, arms a
  // timeout, and resolves with the outcome the user is shown. Silence becomes
  // a VISIBLE failure — never a fake success. Exactly one request is in
  // flight at a time, which is what lets a single answer be attributed.
  // -------------------------------------------------------------------
  const routerPendingRef = useRef<{
    request: RouterRequest;
    resolve: (o: RouterOutcome) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  const settleRouter = useCallback((outcome: RouterOutcome) => {
    const pending = routerPendingRef.current;
    if (!pending) return;
    routerPendingRef.current = null;
    clearTimeout(pending.timer);
    pending.resolve(outcome);
  }, []);

  /**
   * Consume an inbound answer. Called from the telemetry path with the raw
   * `REPLY=` text, and separately with any `ROUTERS;…` line.
   *
   * Exported through the hub so the Control Panel can also feed it a line it
   * received directly (a Bluetooth `REPLY` arrives on the same STATE line, so
   * this is belt-and-braces rather than a second path).
   */
  // U-71 (2026-10-02): remember CONFIRMED router changes, so the app and the car
  // both keep the setting.
  //
  // The owner asked for it directly ("all the car and app to remember the old
  // setting in the database too and both app and cars too"), and it was a real
  // gap I introduced in U-68: the pre-existing `routerUse`/`routerAdd` pair
  // persisted its optimistic local list, but the ack-consuming path built in
  // U-68 (`requestRouter`/`runSwitchPlan`) only persisted on a `list` answer. So
  // adding or switching a router updated the car and the screen, and nothing was
  // written to AsyncStorage or to the Supabase `car_profiles` row — the setting
  // was forgotten the moment the app restarted.
  //
  // The list is derived from the car's ANSWER, never from what we hoped would
  // happen: `ROUTERS;ADDED;<ssid>` adds that exact name, `DELETED` removes it,
  // `CLEARED` empties it, and a `list` replaces it wholesale. A FAILED answer
  // changes nothing, which is the point of consuming it at all (F-62).
  const persistRouters = useCallback(
    (next: string[], lastSsid?: string | null) => {
      savedNetworksRef.current = next.slice();
      persistPrefsRef.current?.({
        savedRouters: next.slice(),
        ...(lastSsid ? { lastWifiSsid: lastSsid } : {}),
      });
    },
    [],
  );

  const consumeRouterAnswer = useCallback(
    (text: string) => {
      const answer = parseRouterAnswer(text);
      if (!answer) return false;
      const current = () => savedNetworksRef.current.slice();
      const withName = (s: string) => {
        const next = current();
        return next.some((n) => n.toUpperCase() === s.toUpperCase())
          ? next
          : [...next, s];
      };
      const withoutName = (s: string) =>
        current().filter((n) => n.toUpperCase() !== s.toUpperCase());

      // A list is DATA, not an acknowledgement: refresh the mirror but never
      // let it resolve a pending command (a scan result must not look like
      // the answer to an add).
      if (answer.kind === "list") {
        setCarNetworks(answer.ssids.slice());
        persistRouters(answer.ssids.slice());
        return true;
      }
      // Persist from the ANSWER before resolving, so a caller that reacts to the
      // resolved outcome (clearing a form, closing a panel) cannot race the save.
      if (answer.kind === "added") {
        const next = withName(answer.ssid);
        setCarNetworks(next);
        persistRouters(next, answer.ssid);
      } else if (answer.kind === "used") {
        const next = withName(answer.ssid);
        setCarNetworks(next);
        // `lastWifiSsid` is what pre-fills the field next session and seeds the
        // smart-link's recency pick, so a switch is remembered as a switch.
        persistRouters(next, answer.ssid);
      } else if (answer.kind === "deleted") {
        const next = withoutName(answer.ssid);
        setCarNetworks(next);
        persistRouters(next);
      } else if (answer.kind === "cleared") {
        setCarNetworks([]);
        persistRouters([]);
      }

      const pending = routerPendingRef.current;
      if (!pending) return true; // nothing to attribute it to; not an error
      settleRouter(outcomeFor(answer, pending.request));
      return true;
    },
    [persistRouters, settleRouter],
  );
  consumeRouterAnswerRef.current = consumeRouterAnswer;

  const requestRouter = useCallback(
    (request: RouterRequest): Promise<RouterOutcome> => {
      // One at a time: a second request supersedes the first rather than
      // racing it, and the superseded one is failed honestly.
      settleRouter({
        ok: false,
        reason: "Another router request was started before this one finished.",
      });
      return new Promise<RouterOutcome>((resolve) => {
        const timer = setTimeout(() => {
          settleRouter(timeoutOutcome(request));
        }, ROUTER_ACK_TIMEOUT_MS);
        routerPendingRef.current = { request, resolve, timer };
        sendCommand(routerRequestLine(request));
      });
    },
    [sendCommand, settleRouter],
  );

  /** Run a switch plan's steps in order, stopping at the first failure. */
  const runSwitchPlan = useCallback(
    async (plan: SwitchPlan): Promise<RouterOutcome> => {
      let last: RouterOutcome = { ok: true, message: "" };
      for (const step of plan.steps) {
        last = await requestRouter(step);
        if (!last.ok) return last;
      }
      return last;
    },
    [requestRouter],
  );

  /** Ask the car to enumerate the networks its own antenna can see. */
  const requestScan = useCallback(
    () => requestRouter({ kind: "scan" }),
    [requestRouter],
  );

  const routerDelete = useCallback(
    (ssid: string) => {
      const s = ssid.trim();
      if (!s) return;
      sendCommand(buildRouterCommand("DEL", s));
      const next = carNetworks.filter((n) => n !== s);
      setCarNetworks(next);
      persistPrefsRef.current?.({ savedRouters: next });
    },
    [sendCommand, carNetworks],
  );

  const routerClearAll = useCallback(() => {
    // A-41 (round-9): wipe EVERY saved router + the stored active pair on the
    // car and remote (ROUTERS;CLEAR over every link, T-62). Optimistic reset
    // to an empty list — the car's own network (WirelessCar_Wifi) is virtual;
    // the car's next `networks` echo re-appends it as the leading, protected
    // entry (T-66). Never touches the car's own AP.
    sendCommand(buildRouterCommand("CLEAR", ""));
    setCarNetworks([]);
    persistPrefsRef.current?.({ savedRouters: [] });
    setDriveStatusOnce("All routers cleared");
  }, [sendCommand]);

  // ---- Smart-link (owner ③): auto-join a saved router ON CAR SELECTION. ----
  // When the link verifies, if the car is sitting on its OWN access point and
  // THIS car has saved routers, offer the best one: a saved router the car's
  // OWN antenna hears with strength (ROUTERS;SCAN → scan.rssi, strongest
  // wins), else the most recently used saved router. Asked for the scan first
  // and wait ≤ SMART_LINK_SCAN_MS for strength before the recency fallback —
  // that IS the owner's "use if available with strength, else own AP" rule.
  // User-controlled via autoJoinRouter (per-car profile toggle). Fires once
  // per link session; a fresh link re-arms it.
  const fireRouterUse = useCallback(
    (ssid: string) => {
      if (smartLinkFiredRef.current) return;
      smartLinkFiredRef.current = profileKeyRef.current;
      routerUse(ssid);
      // 2026-10-02 review: say the join is AUTOMATIC and name the toggle
      // that turns it off. The owner's evening bench session read an
      // unexplained router switch (and, on the unflashed binary, the car
      // RESET it triggered) as "the app is broken" — an after-the-fact
      // toast that never said "automatic" invited that read. This is the
      // same narration-hides-an-action failure F-59's confirm rule fixed,
      // in its automation form.
      showConnectionMessage(
        `Smart-link joined "${ssid}" automatically — connect your phone to it to drive. Turn this off under Saved settings → Auto-join saved router.`,
        "success",
      );
    },
    [routerUse, showConnectionMessage],
  );
  const smartLinkFallbackTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  useEffect(() => {
    // Re-arm on every fresh link session.
    if (!linkVerified || !profileKey || !autoJoinRouter) {
      smartLinkFiredRef.current = null;
      if (smartLinkFallbackTimerRef.current) {
        clearTimeout(smartLinkFallbackTimerRef.current);
        smartLinkFallbackTimerRef.current = null;
      }
      return;
    }
    if (smartLinkFiredRef.current === profileKey) return;
    // Router-capable car only (own AP + ROUTERS;* vocabulary).
    const routerCapable = !!carApName || carNetworks.length > 0 || !!carSsid;
    if (!routerCapable) return;
    const saved = savedPrefs?.savedRouters ?? [];
    if (saved.length === 0) return;
    // Already satisfied: the car is on a saved router right now.
    if (carSsid && saved.includes(carSsid)) {
      smartLinkFiredRef.current = profileKey;
      return;
    }
    // Never kick a car off a router we don't know about.
    if (carSsid) return;
    // Ask the car for a strength scan; fall back to recency if it never answers.
    if (!smartLinkFallbackTimerRef.current) {
      sendCommand(buildRouterCommand("SCAN", ""));
      smartLinkFallbackTimerRef.current = setTimeout(() => {
        smartLinkFallbackTimerRef.current = null;
        const fallback = pickBestRouter({
          saved,
          scan: carScanRef.current,
          history: savedPrefs?.wifiHistory,
          lastSsid: savedPrefs?.lastWifiSsid,
        });
        if (fallback) fireRouterUse(fallback);
      }, SMART_LINK_SCAN_MS);
    }
  }, [
    linkVerified,
    profileKey,
    autoJoinRouter,
    carApName,
    carSsid,
    carNetworks,
    savedPrefs,
    carScan,
    sendCommand,
    fireRouterUse,
  ]);

  // A scan answer with a live router HEARD with strength beats the timer:
  // fire the join the moment strength data arrives (before the fallback).
  useEffect(() => {
    if (!linkVerified || !profileKey || !autoJoinRouter) return;
    if (smartLinkFiredRef.current === profileKey) return;
    if (!smartLinkFallbackTimerRef.current) return; // no pending offer
    const saved = savedPrefs?.savedRouters ?? [];
    if (saved.length === 0) return;
    const best = pickBestRouter({
      saved,
      scan: carScan,
      history: savedPrefs?.wifiHistory,
      lastSsid: savedPrefs?.lastWifiSsid,
    });
    if (!best) return;
    if (smartLinkFallbackTimerRef.current) {
      clearTimeout(smartLinkFallbackTimerRef.current);
      smartLinkFallbackTimerRef.current = null;
    }
    fireRouterUse(best);
  }, [
    linkVerified,
    profileKey,
    autoJoinRouter,
    carScan,
    savedPrefs,
    fireRouterUse,
  ]);

  // Auto-dial: when the car announces its new router IP (STATE;IP=<ip>) after
  // a smart-link USE, pre-fill the WS URL toward the router so the user only
  // joins that WiFi and taps Connect — no more reading the IP off a 0.96″ OLED.
  const telemetryIpRef = useRef<string | null>(null);
  useEffect(() => {
    const ip = telemetry.ip?.trim();
    if (ip) telemetryIpRef.current = ip;
  }, [telemetry.ip]);
  const smartLinkDialedRef = useRef(false);
  useEffect(() => {
    if (!linkVerified) {
      smartLinkDialedRef.current = false;
      return;
    }
    if (smartLinkDialedRef.current) return;
    const ip = telemetryIpRef.current;
    if (!ip) return;
    const bare = ip
      .replace(/^ws:\/\//, "")
      .replace(/:\d+$/, "")
      .trim();
    if (!bare) return;
    const currentHost = (wifiService.url ?? "").match(/\/\/([^:/]+)/)?.[1];
    if (bare === currentHost) return;
    smartLinkDialedRef.current = true;
    const newUrl = /^\d{1,3}(\.\d{1,3}){3}$/.test(bare)
      ? `ws://${bare}:81`
      : ip.startsWith("ws://")
        ? ip
        : `ws://${ip}`;
    setWifiUrl(newUrl);
    showConnectionMessage(
      `Car is on router at ${ip} — join that network and tap Connect.`,
      "success",
    );
  }, [
    linkVerified,
    profileKey,
    telemetry.ip,
    setWifiUrl,
    showConnectionMessage,
  ]);

  const handleDirection = useCallback(
    (d: "F" | "B" | "L" | "R" | "S") => {
      setDriveDirOnce(d);
      if (d === "S") {
        setDriveStatusOnce("Stop");
        sendCommand("S");
        return;
      }
      setDriveStatusOnce(
        d === "F"
          ? "Forward"
          : d === "B"
            ? "Backward"
            : d === "L"
              ? "Left"
              : "Right",
      );
      sendCommand(d);
    },
    [sendCommand],
  );

  const sendThrottled = useCallback(
    (kind: string, cmd: string) => {
      const now = Date.now();
      if (cmd === "S" || cmd === "SPD0" || cmd === "SERVO90") {
        sendCommand(cmd);
        lastDriveCmdAtRef.current[kind] = now;
        return;
      }
      const last = lastDriveCmdAtRef.current[kind] ?? 0;
      if (now - last < DRIVE_CMD_MIN_INTERVAL_MS) return;
      lastDriveCmdAtRef.current[kind] = now;
      sendCommand(cmd);
    },
    [sendCommand],
  );

  // ESP-remote parity: speed is NEVER sent live while driving. handleSpeed
  // only edits the PREVIEW (NAV highlight field); commitSpeed â€” called on
  // Select â€” sends SPD<n> once, sets the local "Speed:<n>" status and
  // persists (the .ino TOP_SPEED branch).
  //
  // Owner round 2026-09-29 ("speed is malicious"): the slider is LINEAR
  // 100..255 — exactly the window the car accepts (Config.h MIN/MAX speed).
  // The number shown IS the number sent as SPD<n>; nothing re-scales,
  // re-offsets or re-bases it. The old "input is 0..255" comment was wrong
  // (the strip has always been bounded 100..255); the real mid-drive number
  // jumps came from the telemetry echo overwriting this state, fixed above.
  const handleSpeed = useCallback((value: number) => {
    const q = quantizeSpeedToStep(
      Math.max(SPEED_MIN, Math.min(SPEED_MAX, Math.round(value))),
    );
    setSpeed(q);
  }, []);

  const commitSpeed = useCallback(() => {
    setSpeed((s) => {
      sendThrottled("spd", `SPD${Math.round(s)}`);
      setDriveStatusOnce(`Speed:${Math.round(s)}`);
      persistPrefsRef.current?.({ speed: s });
      return s;
    });
  }, [sendThrottled]);

  const handleServo = useCallback(
    (value: number) => {
      setServo(value);
      sendThrottled("servo", `SERVO${Math.round(value)}`);
    },
    [sendThrottled],
  );

  const applyPid = useCallback(
    (key: "kp" | "ki" | "kd" | "out" | "off", value: number) => {
      const next = {
        kp: pidKp,
        ki: pidKi,
        kd: pidKd,
        out: pidOut,
        off: pidOff,
      };
      next[key] = value;
      if (key === "kp") setPidKp(value);
      if (key === "ki") setPidKi(value);
      if (key === "kd") setPidKd(value);
      if (key === "out") setPidOut(value);
      if (key === "off") setPidOff(value);
      sendCommand(
        `CFG;Kp:${next.kp.toFixed(2)};Ki:${next.ki.toFixed(3)};Kd:${next.kd.toFixed(3)};OUT:${next.out.toFixed(0)};OFF:${next.off.toFixed(2)}`,
      );
    },
    [pidKp, pidKi, pidKd, pidOut, pidOff, sendCommand],
  );

  // R-20 fixed throttle (owner: "speed fixed, not gradually increasing"): the
  // joystick/d-pad signals DIRECTION only — the magnitude sent is ALWAYS the
  // speed setting (quantized 100..255). The car clamps it into MIN..MAX and
  // holds that exact PWM while the stick is deflected.
  const handleStickDrive = useCallback(
    (signed: number) => {
      setDriveDirOnce(signed > 0 ? "F" : signed < 0 ? "B" : "S");
      setDriveStatusOnce(
        signed > 0 ? "Forward" : signed < 0 ? "Backward" : "Stop",
      );
      const mag = quantizeSpeedToStep(speed);
      sendThrottled("spd", `SPD${signed > 0 ? mag : signed < 0 ? -mag : 0}`);
    },
    [sendThrottled, speed],
  );

  // R-20: steering travel LIMIT edits — clamp to the car's 10..90 range,
  // send STEER<n> IMMEDIATELY (car persists + echoes STATE ;STEER=, so the
  // hand-held remote mirrors the same value), and persist locally. Same
  // pattern as adjustTrim (TRIM<n>).
  const adjustSteerLimit = useCallback(
    (delta: number) => {
      setSteerLimit((prev) => {
        const next = Math.max(
          STEER_LIMIT_MIN,
          Math.min(STEER_LIMIT_MAX, prev + delta),
        );
        if (next !== prev) {
          sendCommand(buildSteer(next));
          persistPrefsRef.current?.({ steerLimit: next });
        }
        return next;
      });
    },
    [sendCommand],
  );

  const adjustTrim = useCallback(
    (delta: number) => {
      setTrim((prev) => {
        const next = Math.max(
          -safetyLimits.maxTrim,
          Math.min(safetyLimits.maxTrim, prev + delta),
        );
        sendCommand(`TRIM${next}`);
        persistPrefs({ trim: next });
        return next;
      });
    },
    [safetyLimits.maxTrim, sendCommand, persistPrefs],
  );

  const handleEStop = useCallback(() => {
    setDriveDirOnce("S");
    setDriveStatusOnce("EMERGENCY STOP");
    sendCommand("ESTOP");
    sendCommand("SPD0");
    sendCommand("SERVO90");
  }, [sendCommand]);

  // Mode select = the ESP confirm path: clear the queue, send the token
  // immediately, mirror the mode, status "Mode:<name>", stop driving.
  // Owner decision 2026-09-15: ALL 9 firmware modes are selectable â€” a
  // WIP/CS mode still receives its token (the car renders its own frame /
  // COMING SOON, WORK IN PROGRESS states) and the controller shows the badge.
  // The old A-7 app-side refuse gate is gone (the car says no itself via its
  // frame or a NACK;E=UNKNOWN_MODE if it truly rejects a token).
  const selectMode = useCallback(
    (m: CarMode) => {
      setActiveMode(m);
      setDriveDirOnce("S");
      setDriveStatusOnce(`Mode:${MODE_NAME_FOR_TOKEN[m.token] ?? m.token}`);
      sendCommand("S");
      sendCommand(m.token);
      // A-37: open the commit-grace window (pre-commit car truth + chosen token)
      // so the stale in-flight MODE echo can't flicker the optimistic pick back.
      modeCommitRef.current = {
        token: canonicalCarToken(m.token),
        stale: carModeIdRef.current,
        at: Date.now(),
      };
      // Persist the selected mode so it restores on reconnect / next power cycle.
      persistPrefsRef.current?.({ modeId: m.id });
    },
    [sendCommand],
  );

  const cycleMode = useCallback(() => {
    // Remote fleet cycle order â€” always advances and wraps. Unknown tokens
    // roll forward from the head of the order, never land on pool[0].
    const pool =
      carModes.length > 0 ? sortRemoteModes(carModes) : [...LOCAL_CAR_MODES];
    const nextToken = nextRemoteModeToken(activeMode.token);
    const next =
      pool.find((m) => canonicalCarToken(m.token) === nextToken) ??
      [...LOCAL_CAR_MODES].find(
        (m) => canonicalCarToken(m.token) === nextToken,
      );
    if (next) selectMode(next);
  }, [activeMode, selectMode, carModes]);

  const toggleRelay = useCallback(
    (i: number) => {
      setRelays((prev) => {
        const next = !prev[i];
        sendCommand(`OUT${i}:${next ? 1 : 0}`);
        return { ...prev, [i]: next };
      });
    },
    [sendCommand],
  );

  const handleGimbalPan = useCallback(
    (value: number) => {
      setGimbalPan(value);
      sendCommand(`GIMBAL_PAN:${Math.round(value)}`);
    },
    [sendCommand],
  );
  const handleGimbalTilt = useCallback(
    (value: number) => {
      setGimbalTilt(value);
      sendCommand(`GIMBAL_TILT:${Math.round(value)}`);
    },
    [sendCommand],
  );
  const handleAltitude = useCallback(
    (value: number) => {
      setTargetAltitude(value);
      sendCommand(`ALT:${Math.round(value)}`);
    },
    [sendCommand],
  );

  const selectJoystickLayout = useCallback(
    (id: string) => {
      setJoystickLayoutId(id);
      setUseJoystick(id === "dual");
      persistPrefs({ joystickLayout: id, useJoystick: id === "dual" });
    },
    [persistPrefs],
  );

  // ---- SPP auto-reconnect â€” silent exponential backoff ----
  // Delays: 1s â†’ 2s â†’ 4s â†’ 8s â†’ give up â†’ show the reconnect banner.
  const startSppReconnect = useCallback(() => {
    // R1 flicker fix: idempotent re-arm guard (see sppReconnectActiveRef).
    // The status handler fires on every error; without this guard each error
    // started a SECOND scheduler alongside the .catch chain below, and the
    // multiplying retry loops flickered the Control Panel until Disconnect.
    if (sppReconnectActiveRef.current) return;
    sppReconnectActiveRef.current = true;
    if (sppReconnectTimerRef.current) {
      clearTimeout(sppReconnectTimerRef.current);
      sppReconnectTimerRef.current = null;
    }
    const attempt = () => {
      if (
        !mountedRef.current ||
        manualCloseRef.current ||
        sppService.manualClose ||
        !sppLastAddressRef.current
      ) {
        // R1 flicker fix: on failure, de-arm so the next retry does not
        // have a contradictory state from a duelling scheduler.        // R1 flicker fix: on failure, de-arm so the next retry does not
        // have a contradictory state from a duelling scheduler.
        sppReconnectActiveRef.current = false;
        return;
      }
      const n = sppReconnectAttemptsRef.current;
      if (n >= SPP_RECONNECT_DELAYS_MS.length) {
        // All attempts exhausted â€” surface the banner so the user can decide.
        // (Previously this path gave up silently: the â€œconnection lostâ€ UI
        // never appeared and only a manual reconnect could recover.)
        sppReconnectAttemptsRef.current = 0;
        sppReconnectActiveRef.current = false;
        setShowSppsRetry(true);
        return;
      }
      sppReconnectAttemptsRef.current += 1;
      sppService.retryConnect().catch(() => {
        if (
          !mountedRef.current ||
          manualCloseRef.current ||
          sppService.manualClose
        ) {
          sppReconnectActiveRef.current = false;
          return;
        }
        const delay =
          SPP_RECONNECT_DELAYS_MS[sppReconnectAttemptsRef.current] ??
          SPP_RECONNECT_DELAYS_MS[SPP_RECONNECT_DELAYS_MS.length - 1];
        sppReconnectTimerRef.current = setTimeout(attempt, delay);
      });
    };
    sppReconnectTimerRef.current = setTimeout(
      attempt,
      SPP_RECONNECT_DELAYS_MS[0],
    );
  }, []);

  const handleReconnectPromptCancel = useCallback(() => {
    // Dismiss the banner WITHOUT tearing the remembered device down â€” the
    // user may just want to keep browsing; a fresh connect from the device
    // list (or Retry) must stay possible (old behavior killed the address,
    // which contributed to the dead Connect button).
    setShowSppsRetry(false);
    manualCloseRef.current = true;
    if (sppReconnectTimerRef.current) {
      clearTimeout(sppReconnectTimerRef.current);
      sppReconnectTimerRef.current = null;
    }
  }, []);

  // Cleanup reconnect timer on unmount.
  useEffect(() => {
    return () => {
      if (sppReconnectTimerRef.current)
        clearTimeout(sppReconnectTimerRef.current);
    };
  }, []);

  // Derived helpers
  const usesBtComm =
    activeMode.transport.includes("classic-bt") ||
    activeMode.transport.includes("ble");
  const usesWifi = activeMode.transport.includes("wifi");
  const canControl = connected || wifiConnected;
  const isDrone = activeCategory === "drones";
  const isNonRobocar = activeCategory !== "robocar";
  const is2wd1mActive = activeMode.controls.includes("drive-2wd1m");

  return {
    // connection
    sppDevices,
    connected,
    deviceName,
    scanning,
    connecting,
    connectingAddress,
    wifiConnected,
    // R1: the WiFi socket is open AND the car has answered on it. Distinct
    // from wifiConnected's transport-only truth so the UI can say "linked,
    // but the car is not answering" instead of a plain false.
    linkVerified,
    wifiUrl,
    error,
    connectionMessage,
    connectionMsgType,
    sppStatus,
    sppStatusMsg,
    showSppsRetry,
    sppSupported,
    canControl,
    setWifiUrl,
    handleScan,
    handleConnect,
    handleSppsRetry,
    handleWifiConnect,
    handleWifiDisconnect,
    handleDisconnect,
    showConnectionMessage,
    // v1.4.0 WiFi provisioning (app â†’ BT â†’ car) + car WiFi truth
    wifiSsid,
    setWifiSsid,
    wifiPassword,
    setWifiPassword,
    wifiProvisioning,
    handleWifiProvision,
    carApName,
    carSsid,
    carStubMap,
    carAvailMap,
    // A-27: saved-router registry (car truth names + command helpers)
    carNetworks,
    routerUse,
    routerAdd,
    routerDelete,
    routerClearAll,
    // D2 (U-68): the ack-consuming API. `routerUse`/`routerAdd` above are the
    // legacy fire-and-forget pair and are still exported because the Remote
    // screen (which this round must not change) calls them directly; the
    // Control Panel uses these instead so a failure is visible.
    requestRouter,
    runSwitchPlan,
    requestScan,
    consumeRouterAnswer,
    // D3 (U-68): the car's own antenna scan result, so the Control Panel can
    // offer a real nearby-network list. `null` until the car answers.
    carScan,
    // SPP auto-reconnect
    handleReconnectPromptCancel,
    // mode + category (carStubMap is returned with the WiFi-truth group above)
    activeCategory,
    setActiveCategory,
    activeMode,
    carModes,
    carModeId,
    selectMode,
    cycleMode,
    handleCategoryPress,
    // drive state
    speed,
    setSpeed,
    servo,
    steerLimit,
    trim,
    driveStatus,
    driveDir,
    telemetry,
    safetyLimits,
    handleDirection,
    handleSpeed,
    handleServo,
    applyPid,
    handleStickDrive,
    adjustSteerLimit,
    commitSpeed,
    adjustTrim,
    handleEStop,
    sendCommand,
    // Connection-Manager Phase B — flag-gated JSON envelope intake. Shipped
    // OFF (F-41); no screen calls it yet. Exposed so the 4WD4M testbed
    // acceptance round can exercise it without touching the UI.
    sendEnvelopeCommand,
    isEnvelopeIntakeEnabled,
    // R-19 (FIN-45): car-truth trip metrics (2WD1M family)
    tripAvg,
    maxSteer,
    // NAV (ESP INPUT_NAV parity)
    navActive,
    setNavActive,
    navActiveRef,
    navField,
    setNavField,
    previewMode,
    setPreviewMode,
    // pid
    pidKp,
    pidKi,
    pidKd,
    pidOut,
    pidOff,
    // drone
    gimbalPan,
    gimbalTilt,
    targetAltitude,
    handleGimbalPan,
    handleGimbalTilt,
    handleAltitude,
    // sensors + relays
    sensorData,
    relays,
    toggleRelay,
    // toggles
    useJoystick,
    setUseJoystick,
    joystickLayoutId,
    selectJoystickLayout,
    // persistence
    savedPrefs,
    persistPrefs,
    addressForMemory,
    // Connections-Hub (per-device profiles)
    profileKey: addressForMemory,
    carUniqueId: carFwIdRef.current,
    autoJoinRouter,
    setAutoJoinRouter,
    // Profiles-sync (cloud mirror state for the current car profile)
    profileSync,
    // derived
    isDrone,
    isNonRobocar,
    is2wd1mActive,
    usesBtComm,
    usesWifi,
  };
}
