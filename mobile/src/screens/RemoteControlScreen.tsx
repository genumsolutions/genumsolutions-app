// =====================================================================
// RemoteControlScreen — the immersive "gaming remote" window opened from
// the Control Panel's header joystick icon.
//
// Standard gamepad layout (landscape):
//   [Back] [Select]  REMOTE  ●CarName  Mode▸  Spd═══  [🎮] [⚙]
//   ┌─────┐                     ┌─────┐
//   │  ↑  │     ┌─────────┐    │  ↑  │
//   │← ● →│     │  OLED   │    │← ● →│
//   │  ↓  │     │ 128×64  │    │  ↓  │
//   └─────┘     └─────────┘    └─────┘
//   L joystick                R joystick
//
// Phase 1 rebuild: clean chrome row (no ScrollView), standard gamepad
// layout, settings dropdown. Drive controls
// (joystick/d-pad) are delegated to DriveControls.
//
// NO E-STOP CONTROL IS RENDERED, despite what the diagram above used to show.
// useControlHub still exposes handleEStop but nothing consumes it, and the
// firmware has no ESTOP handler at all (see the car's FAILSAFE #11) — safe
// stop is S / SPD0 / disconnect. The layout diagram and the "E-stop FAB" line
// are corrected here rather than left to describe a feature that does not exist.
// =====================================================================
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { useViewport } from "../lib/viewport";
import { useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ScreenOrientation from "expo-screen-orientation";
import { Feather } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RootStackParamList } from "../navigation/types";
import { useApp } from "../context/AppContext";
import { useControlHub } from "../components/tools/useControlHub";
import { DriveControls } from "../components/tools/DriveControls";
import { BalanceControls, PID_DEFS } from "../components/tools/BalanceControls";
import type { PidKey } from "../components/tools/BalanceControls";
import { ModeChooser } from "../components/tools/ModeChooser";
import { OledDisplay } from "../components/tools/OledDisplay";
import {
  DriveTelemetry,
  TelemetryLine,
} from "../components/tools/DriveTelemetry";
import { SensorGrid } from "../components/tools/SensorGrid";
import { hasDeck } from "../components/tools/decks/deckkit";
import { SmartHomeDeck } from "../components/tools/decks/SmartHomeDeck";
import { SmartFarmDeck } from "../components/tools/decks/SmartFarmDeck";
import { SmartCityDeck } from "../components/tools/decks/SmartCityDeck";
import { SmartDustbinDeck } from "../components/tools/decks/SmartDustbinDeck";
import { HandheldDeck } from "../components/tools/decks/HandheldDeck";
import { DroneControls } from "../components/tools/DroneControls";
import {
  ConnectionSection,
  type ConnectionMethodId,
} from "../components/tools/connection";
import { DEFAULT_AP_IP, DEFAULT_WS_URL } from "../services/carProtocol";
import {
  isCarApGateway,
  carIsOnOwnHotspot,
} from "../components/tools/connection/dial";
import {
  LOCAL_CAR_MODES,
  type CarMode,
  sortRemoteModes,
} from "../config/roboCarCatalog";
import {
  SPEED_MIN,
  SPEED_MAX,
  SPEED_STEP,
  canonicalCarToken,
  modeAvailStatus,
} from "../services/carProtocol";
import { feedbackTap } from "../services/hapticsService";
import type { SafetyLimits } from "../components/tools/types";

type Props = NativeStackScreenProps<RootStackParamList, "RemoteControl">;
type Route = RouteProp<RootStackParamList, "RemoteControl">;

const NAV_DEBOUNCE_MS = 120;

const DEFAULT_SAFETY_LIMITS: SafetyLimits = {
  maxSpeed: 255,
  maxSignedDrive: 255,
  servoCenter: 90,
  maxSteerDeviation: 90,
  maxTrim: 90,
};

function clampStep(
  value: number,
  min: number,
  max: number,
  step: number,
): number {
  const v = Math.round(value / step) * step;
  return Math.max(min, Math.min(max, v));
}

/**
 * A-25 (device-round-5): the BT device name shown in the header must be
 * FRIENDLY — never a raw hex address. SPP scans can resolve to the MAC
 * fallback (sppService `device.name ?? device.address`); here a MAC-shaped
 * string becomes a neutral label and underscores are prettified into spaces
 * (`WIRELESS_CAR` → `WIRELESS CAR`).
 *
 * A-38 (device-round-8, owner): never invent a car name. When the scan only
 * gave us a MAC (or a 1–2 char fragment) there is no real name to show, so
 * return '' — callers already fall back to the neutral "Connected" label.
 * The old 'ESP32 Car' placeholder is removed.
 */
function friendlyBtName(name: string): string {
  const n = (name || "").trim();
  if (!n) return "";
  const hexMac = /^([0-9A-Fa-f]{2}([:-])){5}[0-9A-Fa-f]{2}$/.test(n);
  if (hexMac || n.length <= 2) return "";
  return n.replace(/_/g, " ");
}

/** Small −/+ stepper pill for the settings dropdown. */
function StepperPill({
  onPress,
  disabled,
  icon,
}: {
  onPress: () => void;
  disabled: boolean;
  icon: "minus" | "plus";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      android_ripple={{
        color: "rgba(255,255,255,0.2)",
        borderless: true,
        radius: 20,
      }}
      className="h-8 w-8 items-center justify-center rounded-full border border-line bg-card disabled:opacity-40"
    >
      <Feather name={icon} size={14} color="#64748b" />
    </Pressable>
  );
}

/** Inline value strip for the chrome row — Speed or Steer LIMIT. */
function ValueStrip({
  label,
  value,
  min,
  max,
  canControl,
  locked,
  highlight,
  onChange,
  onCommit,
  dark,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  canControl: boolean;
  locked: boolean;
  highlight: boolean;
  onChange: (v: number) => void;
  onCommit: () => void;
  dark: boolean;
}) {
  return (
    <View
      className={`h-9 min-w-[110px] max-w-[220px] flex-1 flex-row items-center gap-1.5 rounded-full px-2.5 ${
        highlight ? "bg-navy-light" : "border border-line bg-card"
      }`}
    >
      <Text
        className={`text-[9px] font-black uppercase tracking-widest ${highlight ? "text-navy-dark" : "text-muted"}`}
      >
        {label}
      </Text>
      <Slider
        value={value}
        minimumValue={min}
        maximumValue={max}
        step={5}
        onValueChange={onChange}
        onSlidingComplete={onCommit}
        disabled={!canControl || locked}
        minimumTrackTintColor={highlight ? "#1e3a8a" : "#60a5fa"}
        maximumTrackTintColor={
          highlight
            ? "rgba(30,58,138,0.3)"
            : dark
              ? "rgba(255,255,255,0.15)"
              : "rgba(100,116,139,0.3)"
        }
        thumbTintColor={highlight ? "#1e3a8a" : "#3b82f6"}
        style={{ flex: 1, height: 28 }}
      />
      <Text
        className={`w-7 shrink-0 text-right font-mono text-[11px] font-bold ${highlight ? "text-navy-dark" : "text-ink dark:text-white"}`}
      >
        {Math.round(value)}
      </Text>
    </View>
  );
}

/**
 * 2026-10-12 (owner): the Remote window is no longer a Pro feature — every
 * account can use it. The ProGate that used to wrap the whole screen and show
 * an upsell for free/signed-out users is removed; the screen renders for
 * anyone who reaches it (Control Panel's Open button, the floating remote
 * button, or the connection screen).
 */

export function RemoteControlScreen({ navigation }: Props) {
  const route = useRoute<Route>();
  const routeCategory = route.params?.category;
  const hub = useControlHub(routeCategory);
  const { width, height, isLandscape } = useViewport();
  const insets = useSafeAreaInsets();
  const { themeMode, setThemeMode } = useApp();

  const {
    connected,
    wifiConnected,
    sppStatus,
    deviceName,
    canControl,
    wifiUrl,
    activeCategory,
    activeMode,
    carModes,
    carStubMap,
    carAvailMap,
    selectMode,
    cycleMode,
    speed,
    servo,
    steerLimit,
    trim,
    driveStatus,
    driveDir,
    telemetry,
    carApName,
    carSsid,
    tripAvg,
    maxSteer,
    handleDirection,
    handleSpeed,
    handleServo,
    applyPid,
    handleStickDrive,
    adjustSteerLimit,
    commitSpeed,
    adjustTrim,
    navActive,
    setNavActive,
    navActiveRef,
    navField,
    setNavField,
    previewMode,
    setPreviewMode,
    pidKp,
    pidKd,
    pidKi,
    pidOut,
    pidOff,
    gimbalPan,
    gimbalTilt,
    targetAltitude,
    handleGimbalPan,
    handleGimbalTilt,
    handleAltitude,
    sensorData,
    relays,
    toggleRelay,
    useJoystick,
    setUseJoystick,
    isDrone,
    isNonRobocar,
    is2wd1mActive,
    showSppsRetry,
    handleSppsRetry,
    handleReconnectPromptCancel,
    autoJoinRouter,
    setAutoJoinRouter,
  } = hub;

  const linked = connected || wifiConnected;
  // U-105 (1.3.5, owner 2026-10-13): Bluetooth and Wi-Fi stay live TOGETHER by
  // default — the parallel + power-save settings are gone. Whenever both links
  // are open the strip and sub-header name BOTH at once (the car's OLED says
  // the same), not just the Bluetooth name.
  const parallelBoth = connected && wifiConnected;
  const isRobocar = !isDrone && !isNonRobocar;

  // W5: determine if car is on its own hotspot and the correct IP to display
  const onOwnHotspot = carIsOnOwnHotspot({
    reportedSsid: telemetry.ssid ?? null,
    ownApName: carApName ?? null,
  });
  // Car is on router if WiFi connected and NOT on own hotspot
  const carOnRouter = wifiConnected && !onOwnHotspot;
  // Display IP: use telemetry.ip if available and valid; otherwise show AP IP only
  // when we know car is on its own hotspot; otherwise show placeholder
  const displayIp = telemetry.ip
    ? telemetry.ip
    : onOwnHotspot
      ? DEFAULT_AP_IP
      : carOnRouter
        ? "—"
        : DEFAULT_AP_IP;
  const showIp = telemetry.ip !== undefined || onOwnHotspot;

  // Restore joystick layout choice per device.
  useEffect(() => {
    if (!connected && !wifiConnected) return;
    if (hub.savedPrefs?.joystickLayout) {
      hub.selectJoystickLayout(hub.savedPrefs.joystickLayout);
    }
  }, [connected, wifiConnected]);

  // ── NAV state machine ──
  const modeList = carModes.length > 0 ? carModes : LOCAL_CAR_MODES;
  const lastNavAtRef = useRef(0);
  // Keyboard support (owner 2026-10-12): the Wi-Fi add/edit form lives at the
  // bottom of the Connectivity panel, so when a field is focused we scroll that
  // panel to the end to keep the field clear of the keyboard.
  const connScrollRef = useRef<ScrollView | null>(null);

  const navInput = useCallback(
    (axis: "x" | "y", value: -1 | 0 | 1) => {
      if (value === 0) return;
      const now = Date.now();
      if (now - lastNavAtRef.current < NAV_DEBOUNCE_MS) return;
      lastNavAtRef.current = now;

      if (navField === "mode") {
        if (axis === "y") {
          // Browse by CANONICAL TOKEN over the fleet order (never by local
          // array index — a DB row set missing the active mode used to jump
          // to pool[0], the 4WD4M "stuck" symptom).
          const pool =
            modeList.length > 0
              ? sortRemoteModes(modeList)
              : [...LOCAL_CAR_MODES];
          if (pool.length === 0) return;
          const current = previewMode ?? activeMode;
          const curToken = canonicalCarToken(current.token);
          let idx = pool.findIndex(
            (m) =>
              canonicalCarToken(m.token) === curToken || m.id === current.id,
          );
          if (idx === -1) idx = 0;
          const next =
            pool[
              (((idx + (value === -1 ? -1 : 1)) % pool.length) + pool.length) %
                pool.length
            ];
          if (next) setPreviewMode(next);
        }
        return;
      }
      if (navField === "speed") {
        if (axis === "y") {
          const next = clampStep(
            speed + (value === -1 ? -SPEED_STEP : SPEED_STEP),
            SPEED_MIN,
            SPEED_MAX,
            SPEED_STEP,
          );
          handleSpeed(next);
        } else if (value === -1) {
          setNavField("mode");
        }
        return;
      }
      // R-20: NAV has no steer field — the top strip is the SPEED slider in
      // every mode; the steering limit + trim live in the Settings menu
      // (steppers there send STEER<n>/TRIM<n> to the car directly).
      if (axis === "x" && value === -1) setNavField("mode");
    },
    [
      navField,
      previewMode,
      activeMode,
      modeList,
      speed,
      handleSpeed,
      setPreviewMode,
      setNavField,
    ],
  );

  const handleBack = useCallback(() => {
    feedbackTap();
    if (navActive) {
      setPreviewMode(null);
      setNavActive(false);
      setNavField("none");
      return;
    }
    // Navigate back WITHOUT disconnecting — connection survives navigation
    navigation.goBack();
  }, [navActive, navigation, setNavActive, setNavField, setPreviewMode]);

  const backLabel = navActive ? "Cancel" : "Back";

  // ── Weblink handlers ──
  // A-36: the IP chip is ALWAYS tappable — with a reachable STA IP we open the
  // car's web page directly; offline/AP-fallback we open the car's own AP page
  // (v2 default: the 4WD4M car's 192.168.245.1; donor cars use .244), so
  // "nothing happens" is gone even unconnected.
  const handleOpenWebPage = useCallback(() => {
    let url: string | null = null;
    if (telemetry.ip) {
      url = `http://${telemetry.ip}`;
    } else if (onOwnHotspot) {
      url = `http://${DEFAULT_AP_IP}`;
    }
    // If on router but no IP yet, don't open anything (url stays null)
    if (url) {
      void Linking.openURL(url).catch(() => undefined);
    }
  }, [telemetry.ip, onOwnHotspot]);

  // Phase 2 (owner 2026-10-12): the router callbacks that used to feed
  // RouterPanel are gone — the Connectivity panel now renders ConnectionSection,
  // which drives the SAME ack-consuming hub API (`runSwitchPlan` / `requestRouter`
  // / `routerDelete`) itself. One connection surface, one manager.

  // ── Settings ──
  const [showSettings, setShowSettings] = useState(false);
  // Pads are the primary drive surface — show them by default for every mode;
  // users can still hide via Settings (choice lives for the session only).
  const [showJoystick, setShowJoystick] = useState(true);
  // Phase 2 (owner 2026-10-12): `showRouter` now opens the CONNECTIVITY panel
  // (BT + Wi-Fi + router management in one place). The connection method the
  // embedded ConnectionSection shows is owned HERE so the choice survives the
  // section re-rendering as car truth arrives.
  const [showRouter, setShowRouter] = useState(false);
  // U-102 (owner: the Connectivity screen must open as the split DIRECTLY):
  // default the method to Bluetooth so the left=method / right=network panes
  // both render on open — a null default left the panel as one full-width
  // column until a method was picked ("two separate formats").
  const [connMethod, setConnMethod] = useState<ConnectionMethodId>("bluetooth");

  // ── Orientation lock ──
  const priorLockRef = useRef<ScreenOrientation.OrientationLock | null>(null);
  const [boardKey, setBoardKey] = useState(0);

  useEffect(() => {
    if (Platform.OS === "web") return;
    (async () => {
      try {
        priorLockRef.current =
          await ScreenOrientation.getOrientationLockAsync();
      } catch {
        priorLockRef.current = null;
      }
      try {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.LANDSCAPE,
        );
      } catch {}
      setBoardKey((k) => k + 1);
    })();
    return () => {
      if (Platform.OS === "web") return;
      if (priorLockRef.current != null) {
        try {
          void ScreenOrientation.lockAsync(priorLockRef.current);
        } catch {}
      }
    };
  }, []);

  // The Connectivity panel is the ONE connection surface — it must stay open
  // even when no link is up, because it is where a connection is initiated.
  // The Phase 2 auto-close (`if (!linked) setShowRouter(false)`) is gone: it
  // made the panel disappear exactly when it was needed (owner 2026-10-12:
  // "the connectivity section is disabled and dim, not able to initiate the
  // connection"). Opening it is always allowed; the connection cards inside
  // say honestly what needs a live link.

  // U-105 (1.3.5): read the car's three transport toggles once a link is up, so
  // the Settings rows reflect CAR truth (null until the car answers).
  useEffect(() => {
    if (linked) {
      hub.queryCarTransportToggle("WIFI");
      hub.queryCarTransportToggle("BT");
      hub.queryCarTransportToggle("AUTOJOIN");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked]);

  // ── Derived values ──
  const limits: SafetyLimits = hub.safetyLimits ?? DEFAULT_SAFETY_LIMITS;
  const navActiveBool = navActive && isRobocar;
  const shownMode = previewMode ?? activeMode;
  const isShown2wd1m = shownMode.controls.includes("drive-2wd1m");
  // R-20: NAV edits MODE and SPEED only — no steer field in the top bar.
  const topField = !navActiveBool
    ? ("none" as const)
    : navField === "speed"
      ? ("speed" as const)
      : ("mode" as const);

  // ── Telemetry + OLED mirror (owner 2026-10-12 follow-up) ──
  // The CAR's own readings (uptime / heap / signal) now live on the top
  // connection-status line as `TelemetryLine`; formatting still comes from the
  // pure, tested `telemetryFormat.ts`. The gamepad's centre gap shows the
  // compact OLED mirror again (RESTORED) — the readings no longer sit there.
  const linkLabel = parallelBoth
    ? "BT+WiFi"
    : connected
      ? "Bluetooth"
      : wifiConnected
        ? "WiFi"
        : "Offline";
  // M2: the ONE label for the chrome row AND the sub-header line 1 — both live
  // links named together under parallel, never a raw hex MAC (friendly names
  // only; the hex belongs on a profile surface, not the Remote).
  const deckLinkLabel = parallelBoth
    ? `BT · ${friendlyBtName(deviceName) || "Car"} + WiFi · ${displayIp}${onOwnHotspot ? " (AP)" : ""}`
    : connected
      ? friendlyBtName(deviceName) || "Connected"
      : wifiConnected
        ? `WiFi · ${displayIp}${onOwnHotspot ? " (AP)" : ""}`
        : "No link";
  const driveTelemetryArgs = {
    linked,
    linkLabel,
    rssi: telemetry.rssi,
    signal: telemetry.signal,
    uptimeMs: telemetry.uptimeMs,
    freeHeap: telemetry.freeHeap,
  };
  const oledCommonProps = {
    connected,
    wifiConnected,
    deviceName,
    activeMode,
    speed,
    servo,
    driveStatus,
    driveDir,
    targetAltitude,
    gimbalPan,
    gimbalTilt,
    sensorData,
    telemetry,
    isDrone,
    isNonRobocar,
    linkKind: connected
      ? ("spp" as const)
      : wifiConnected
        ? ("wifi" as const)
        : undefined,
    trim,
  };
  const oledSlot = isRobocar ? (
    /* R-17 (owner): the mirror reads best a little BIGGER — 180x90 keeps the
       2:1 aspect of the physical 128x64 OLED while giving the compact
       pixel-faithful rendering more room (A-49 single-scale rows still fit
       with margin). */
    <View
      style={{ width: 180, height: 90 }}
      className="overflow-hidden rounded-lg"
    >
      <OledDisplay
        {...oledCommonProps}
        compact
        topField={topField}
        previewMode={previewMode}
        previewModeAvail={
          previewMode
            ? modeAvailStatus(previewMode.token, carStubMap, carAvailMap)
            : undefined
        }
        steerLimit={steerLimit}
      />
    </View>
  ) : null;

  const renderReconnectBanner = () => {
    if (!showSppsRetry) return null;
    return (
      <View
        className="mx-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5"
        style={{ marginBottom: Math.max(insets.bottom, 8) }}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-xs font-bold text-amber-800">
              Connection lost
            </Text>
            <Text className="text-[10px] text-amber-600">
              Reconnect to your car?
            </Text>
          </View>
        </View>
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => {
              feedbackTap();
              void handleSppsRetry();
            }}
            className="rounded-full bg-gold px-3 py-1"
            hitSlop={6}
          >
            <Text className="text-[10px] font-bold text-white">Reconnect</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              feedbackTap();
              handleReconnectPromptCancel();
            }}
            className="rounded-full border border-line bg-card px-3 py-1"
            hitSlop={6}
          >
            <Text className="text-[10px] font-bold text-muted">Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-surface">
      <View
        className="flex-1 overflow-hidden px-3 pb-2"
        style={{ paddingTop: Math.max(insets.top, 8) + 4 }}
      >
        {/* ── Chrome row ── */}
        <View className="flex-shrink-0 flex-row items-center justify-between">
          <Pressable
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel={`${backLabel}`}
            hitSlop={10}
            android_ripple={{
              color: "rgba(255,255,255,0.15)",
              borderless: true,
              radius: 40,
            }}
          >
            <View className="rounded-full border border-line bg-card px-4 py-2.5">
              <Text className="text-sm font-bold text-ink dark:text-white">
                {backLabel}
              </Text>
            </View>
          </Pressable>

          <Text className="text-sm font-black uppercase tracking-[0.2em] text-muted">
            Remote
          </Text>

          {/* A-25: friendly BT name right of "Remote" — NEVER a raw hex
              address (sppService falls back to the MAC when a scan reports
              no name). Underscores prettify to spaces: WIRELESS_CAR →
              WIRELESS CAR. Over WiFi there is no BT name: tag the transport
              + live address so the deck always identifies which link it is
              on (a stale BT name from a former session must never label a
              WiFi link). */}
          <Text
            numberOfLines={1}
            className="max-w-[120px] shrink-0 text-[11px] font-bold text-navy dark:text-sky-300"
          >
            {deckLinkLabel}
          </Text>

          {isRobocar && (
            <View className="flex-row items-center gap-2">
              <ModeChooser
                activeMode={activeMode}
                onSelect={selectMode}
                onCycle={cycleMode}
                modes={carModes}
                carStubMap={carStubMap}
                carAvailMap={carAvailMap}
                highlighted={topField === "mode"}
                previewMode={previewMode}
                locked={navActiveBool}
              />
              {/* R-20 (owner): the top strip is the DEFAULT SPEED slider in
                  every mode — the 2WD1M steering slider is gone. Steering
                  limit + trim are edited in the Settings menu only. */}
              <ValueStrip
                label="Spd"
                value={clampStep(speed, SPEED_MIN, SPEED_MAX, SPEED_STEP)}
                min={SPEED_MIN}
                max={SPEED_MAX}
                canControl={canControl}
                locked={navActiveBool}
                highlight={topField === "speed"}
                onChange={handleSpeed}
                onCommit={commitSpeed}
                dark={themeMode === "dark"}
              />
            </View>
          )}

          {isRobocar && (
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => setShowSettings((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="Settings"
                hitSlop={10}
                android_ripple={{
                  color: "rgba(255,255,255,0.2)",
                  borderless: true,
                  radius: 28,
                }}
              >
                <View
                  className={`h-12 w-12 items-center justify-center rounded-full bg-navy ${showSettings ? "bg-navy-dark" : ""}`}
                >
                  <Feather name="settings" size={20} color="#fff" />
                </View>
              </Pressable>
            </View>
          )}
        </View>

        {/* ── A-25 sub-header: friendly name + status + telemetry + pills.
            Two compact lines: (1) link status, (2) telemetry + control pills.
            Constant height so drive deck never shifts.
            Phase 1 (owner 2026-10-12): NO disconnect here — the Connectivity
            panel's per-link BT / WiFi buttons are the ONE disconnect place. */}
        {isRobocar && (
          <View className="mt-1 flex-shrink-0">
            {/* Line 1: link status only (disconnect lives in Connectivity) */}
            <View className="flex h-7 flex-shrink-0 flex-row items-center gap-2 px-1">
              <View className="min-w-0 shrink flex-row items-center gap-1.5">
                <View
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${linked ? "bg-green-400" : "bg-slate-600"}`}
                />
                <Text
                  numberOfLines={1}
                  ellipsizeMode="middle"
                  className="min-w-0 shrink text-[10px] font-bold text-muted dark:text-slate-300"
                >
                  {deckLinkLabel}
                </Text>
              </View>
            </View>

            {/* Line 2: telemetry + control pills (D-pad / Joystick / Telemetry / Connectivity) */}
            <View className="flex h-7 flex-shrink-0 flex-row items-center gap-1 px-1">
              <TelemetryLine {...driveTelemetryArgs} />
              <View className="min-w-0 flex-1" />
              {activeMode.id === "website-server" || wifiConnected ? (
                <Pressable
                  onPress={handleOpenWebPage}
                  accessibilityRole="link"
                  accessibilityLabel={
                    telemetry.ip
                      ? `Open car web page at ${telemetry.ip}`
                      : onOwnHotspot
                        ? `Open car web page at ${DEFAULT_AP_IP} (AP)`
                        : "Car IP not available yet"
                  }
                  hitSlop={6}
                  className="shrink-0 flex-row items-center gap-1 rounded-full border border-line bg-card px-2 py-0.5"
                >
                  <Feather
                    name={wifiConnected ? "external-link" : "wifi"}
                    size={10}
                    color={wifiConnected ? "#0284c7" : "#64748b"}
                  />
                  <Text
                    className={`font-mono text-[9px] ${wifiConnected ? "text-sky-700 dark:text-sky-300" : "text-muted"}`}
                    numberOfLines={1}
                  >
                    {telemetry.ip
                      ? telemetry.ip
                      : onOwnHotspot
                        ? `${DEFAULT_AP_IP} (AP)`
                        : "—"}
                  </Text>
                </Pressable>
              ) : null}
              {/* Control pills */}
              <Pressable
                onPress={() => {
                  feedbackTap();
                  setShowJoystick(true);
                  setUseJoystick(false);
                }}
                className={`rounded-full px-2.5 py-0.5 ${showJoystick && !useJoystick ? "bg-navy" : "border border-line bg-card"}`}
              >
                <Text
                  className={`text-[9px] font-bold ${showJoystick && !useJoystick ? "text-white" : "text-muted"}`}
                >
                  D-pad
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  feedbackTap();
                  setShowJoystick(true);
                  setUseJoystick(true);
                }}
                className={`rounded-full px-2.5 py-0.5 ${showJoystick && useJoystick ? "bg-navy" : "border border-line bg-card"}`}
              >
                <Text
                  className={`text-[9px] font-bold ${showJoystick && useJoystick ? "text-white" : "text-muted"}`}
                >
                  Joystick
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  feedbackTap();
                  setShowJoystick(false);
                  setShowRouter(false);
                }}
                className={`rounded-full px-2.5 py-0.5 ${!showJoystick && !showRouter ? "bg-navy" : "border border-line bg-card"}`}
              >
                <Text
                  className={`text-[9px] font-bold ${!showJoystick && !showRouter ? "text-white" : "text-muted"}`}
                >
                  Telemetry
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  feedbackTap();
                  setShowJoystick(false);
                  setShowRouter(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Connectivity"
                accessibilityState={{ selected: showRouter }}
                className={`rounded-full px-2.5 py-0.5 ${showRouter ? "bg-navy" : "border border-line bg-card"} active:opacity-70`}
              >
                <Text
                  className={`text-[9px] font-bold ${showRouter ? "text-white" : "text-muted"}`}
                >
                  Connectivity
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Content area ── */}
        {isDrone || isNonRobocar ? (
          /* U-58 (owner report 2026-09-30 — "everything merging and overlapping
             in the landscape view"): the old branch was unbounded — the row had
             no flex height (so the mirror's max-h-[55%] resolved against an
             indefinite parent and was IGNORED), the deck card overflowed the
             screen bottom (clipped by overflow-hidden → "merged"), and decks
             drew their own DeckCard INSIDE the screen's card (double borders).
             Rebuilt with the robocar telemetry-view idiom: the row is flex-1
             min-h-0 (bounded heights) and the deck owns its ONE card, filling
             the row. Phase 3 (owner 2026-10-12): the OLED mirror column is
             REMOVED — the deck now fills the whole row. Robocar branch
             untouched. */
          <View className="mt-2 min-h-0 flex-1 flex-row items-stretch gap-3">
            <View className="min-h-0 min-w-0 flex-1">
              {isDrone ? (
                <View className="h-full rounded-2xl border border-line bg-card p-3 shadow-card dark:bg-black/20">
                  <DroneControls
                    canControl={canControl}
                    targetAltitude={targetAltitude}
                    gimbalPan={gimbalPan}
                    gimbalTilt={gimbalTilt}
                    onAltitude={handleAltitude}
                    onGimbalPan={handleGimbalPan}
                    onGimbalTilt={handleGimbalTilt}
                    onCommand={(c) => hub.sendCommand(c)}
                    onSetAltitude={(v) => handleAltitude(v)}
                  />
                </View>
              ) : hasDeck(activeCategory) ? (
                /* PLAN-2026-09-29 step ②: dedicated per-category deck —
                   ONLY this category's tiles, never the shared SensorGrid
                   fallback (owner decision ③). Every non-robocar, non-drone
                   category has a built deck; the screen maps slug →
                   deck component (tripwire cleared in deckkit.ts).
                   U-58: the deck draws its OWN DeckCard (flex={1} fills this
                   bounded column) — no second screen-level card wrapper. */
                (() => {
                  switch (activeCategory) {
                    case "smart-farm":
                      return (
                        <SmartFarmDeck
                          sensorData={sensorData}
                          relays={relays}
                          canControl={canControl}
                          onToggleRelay={toggleRelay}
                        />
                      );
                    case "smart-city":
                      return (
                        <SmartCityDeck
                          sensorData={sensorData}
                          relays={relays}
                          canControl={canControl}
                          onToggleRelay={toggleRelay}
                        />
                      );
                    case "smart-dustbin":
                      return (
                        <SmartDustbinDeck
                          sensorData={sensorData}
                          relays={relays}
                          canControl={canControl}
                          onToggleRelay={toggleRelay}
                        />
                      );
                    case "remote-controller":
                      return (
                        <HandheldDeck
                          sensorData={sensorData}
                          relays={relays}
                          canControl={canControl}
                          onToggleRelay={toggleRelay}
                        />
                      );
                    default:
                      return (
                        <SmartHomeDeck
                          sensorData={sensorData}
                          relays={relays}
                          canControl={canControl}
                          onToggleRelay={toggleRelay}
                        />
                      );
                  }
                })()
              ) : (
                <View className="h-full rounded-2xl border border-line bg-card p-3 shadow-card dark:bg-black/20">
                  <SensorGrid
                    canControl={canControl}
                    isDrone={false}
                    isNonRobocar
                    activeCategory={activeCategory}
                    sensorData={sensorData}
                    relays={relays}
                    telemetry={telemetry}
                    onToggleRelay={toggleRelay}
                  />
                </View>
              )}
            </View>
          </View>
        ) : (
          /* ── Robocar drive deck ── */
          <View key={boardKey} className="relative mt-2 min-h-0 flex-1">
            {showJoystick ? (
              <>
                <DriveControls
                  canControl={canControl}
                  isDrone={isDrone}
                  activeMode={activeMode}
                  speed={speed}
                  servo={servo}
                  pidKp={pidKp}
                  pidKi={pidKi}
                  pidKd={pidKd}
                  pidOut={pidOut}
                  pidOff={pidOff}
                  useJoystick={useJoystick}
                  onDirection={handleDirection}
                  onSpeed={handleSpeed}
                  onServo={handleServo}
                  onPid={applyPid}
                  onSignedDrive={is2wd1mActive ? handleStickDrive : undefined}
                  steerLimit={is2wd1mActive ? steerLimit : undefined}
                  safetyLimits={hub.safetyLimits}
                  compact
                  navActiveRef={navActiveRef}
                  onNavInput={navInput}
                  telemetrySlot={oledSlot}
                />
              </>
            ) : showRouter || activeMode.id === "website-server" ? (
              /* Phase 2 (owner 2026-10-12): the ONE "Connectivity" panel —
                   Bluetooth + Wi-Fi + router management in one place, renamed
                   from "WiFi & Router". Renders the same connection layer the
                   Control Panel used to, now with the full manager (it is the
                   single connection surface). */
              <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                style={{ flex: 1 }}
                className="min-h-0"
              >
                <ScrollView
                  ref={connScrollRef}
                  className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-line bg-card"
                  contentContainerStyle={{ padding: 10, gap: 6 }}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                >
                  <ConnectionSection
                    hub={hub}
                    method={connMethod}
                    onMethodChange={(m) => {
                      if (m != null) setConnMethod(m);
                    }}
                    feedbackTap={feedbackTap}
                    onInputFocus={() =>
                      connScrollRef.current?.scrollToEnd({ animated: true })
                    }
                    manage
                  />
                </ScrollView>
              </KeyboardAvoidingView>
            ) : activeMode.controls.includes("pid-auto") ? (
              <BalanceControls
                canControl={canControl}
                angle={telemetry.angle ?? null}
                telemetry={telemetry}
                kp={pidKp}
                ki={pidKi}
                kd={pidKd}
                out={pidOut}
                off={pidOff}
                onPid={applyPid}
                compact
                /* U-102 (owner: restore the AUTO telemetry dashboard in the
                   AUTO mode): the deck shows the OLED mirror again (the AUTO
                   Angle/P/D/OUT/I/OFF rows) instead of the readings grid that
                   wrapped into a tall column. Up/Heap/Sig live on the top
                   status line for every robocar mode already. */
                telemetrySlot={oledSlot}
              />
            ) : (
              /* A-50 (round-11): hidden modes without a dedicated panel show
                 the live readout — the "Pad hidden" placeholder is gone.
                 R-15 (owner review 2026-09-18 — "telemetry screen is not
                 standard, monotonous, does not use the space"): the readout
                 sits BESIDE a live column (mode / speed or steer / direction /
                 IP), so the landscape deck is used properly.
                 Phase 3 (owner 2026-10-12): the OLED mirror is REMOVED — the
                 left column is now the CAR's link/uptime/heap/signal telemetry. */
              <View className="min-h-0 flex-1 flex-row items-center justify-center gap-4 px-4 py-2">
                <View
                  className="max-h-full shrink self-center"
                  style={{ width: "46%", maxWidth: 480 }}
                >
                  <DriveTelemetry {...driveTelemetryArgs} />
                </View>
                <View className="min-w-[150px] max-w-[280px] flex-1 justify-center gap-2.5">
                  <Text
                    numberOfLines={2}
                    className="text-lg font-black uppercase tracking-wide text-ink dark:text-white"
                  >
                    {shownMode.name.split("·")[0].trim()}
                  </Text>
                  {/* R-20: the readout column shows SPEED in every mode (the
                      steering limit lives in Settings). */}
                  <View className="flex-row items-baseline justify-between gap-2 border-b border-line pb-1">
                    <Text className="text-[10px] font-black uppercase tracking-widest text-muted">
                      Speed
                    </Text>
                    <Text className="font-mono text-base font-bold text-ink dark:text-white">
                      {speed}
                    </Text>
                  </View>
                  {isShown2wd1m && (
                    <>
                      {/* R-19 (FIN-45): car-truth trip + max steer (STATE TRIP=/MSTEER=) */}
                      <View className="flex-row items-baseline justify-between gap-2 border-b border-line pb-1">
                        <Text className="text-[10px] font-black uppercase tracking-widest text-muted">
                          Trip
                        </Text>
                        <Text className="font-mono text-base font-bold text-ink dark:text-white">
                          {tripAvg || "—"}
                        </Text>
                      </View>
                      <View className="flex-row items-baseline justify-between gap-2 border-b border-line pb-1">
                        <Text className="text-[10px] font-black uppercase tracking-widest text-muted">
                          Max steer
                        </Text>
                        <Text className="font-mono text-base font-bold text-ink dark:text-white">
                          {maxSteer ? `${maxSteer}°` : "—"}
                        </Text>
                      </View>
                    </>
                  )}
                  <View className="flex-row items-baseline justify-between gap-2 border-b border-line pb-1">
                    <Text className="text-[10px] font-black uppercase tracking-widest text-muted">
                      Dir
                    </Text>
                    <Text
                      numberOfLines={1}
                      className="font-mono text-base font-bold text-ink dark:text-white"
                    >
                      {driveStatus || "Stop"}
                    </Text>
                  </View>
                  {(telemetry.ip || wifiConnected) && (
                    <View className="flex-row items-baseline justify-between gap-2">
                      <Text className="text-[10px] font-black uppercase tracking-widest text-muted">
                        IP
                      </Text>
                      <Text
                        numberOfLines={1}
                        className="font-mono text-base font-bold text-ink dark:text-white"
                      >
                        {telemetry.ip
                          ? telemetry.ip
                          : onOwnHotspot
                            ? `${DEFAULT_AP_IP} (AP)`
                            : carOnRouter
                              ? "—"
                              : DEFAULT_AP_IP}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      {/* ── Settings dropdown ── */}
      {showSettings && (
        <>
          <Pressable
            className="absolute inset-0 z-30 bg-black/40"
            onPress={() => setShowSettings(false)}
            accessibilityLabel="Close settings"
          />
          <ScrollView
            className="absolute right-3 z-40 w-64 rounded-2xl border border-line bg-card p-2.5 shadow-xl"
            style={{
              top: Math.max(insets.top, 8) + 48,
              maxHeight: height - 96,
            }}
            showsVerticalScrollIndicator={false}
          >
            <Text
              numberOfLines={1}
              ellipsizeMode="middle"
              className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-muted"
            >
              Settings ·{" "}
              {is2wd1mActive ? "2WD1M" : activeMode.name.split("·")[0].trim()}
            </Text>

            {/* U-105 (owner 2026-10-13): the car's THREE transport toggles replace the
                removed parallel + power-save settings (`WIFICFG;PARALLEL` /
                `WIFICFG;APSAVE` and their NVS keys are gone). Wi-Fi (`t_wifi`)
                and Bluetooth (`t_bt`) can never BOTH be off — the car clamps a
                both-off request, and here the toggle that would leave the pair
                at two-OFFs is disabled. Auto-join gates the boot hop to the
                last-switched router (`boot_autojoin`). Each mirrors the car's
                NVS and rides to DevicePrefs + cloud. */}
            <View className="mt-1 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Feather name="wifi" size={14} color="#64748b" />
                <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
                  Wi-Fi
                </Text>
              </View>
              <Switch
                value={hub.wifiEnabled === true}
                onValueChange={(on) => {
                  feedbackTap();
                  hub.setCarTransportToggle("WIFI", on);
                }}
                disabled={!linked || hub.btEnabled === false}
                trackColor={{ false: "#cbd5e1", true: "#1e3a8a" }}
                thumbColor="#ffffff"
                accessibilityLabel="Turn the car's Wi-Fi transport on or off"
              />
            </View>

            <View className="mt-1 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Feather name="bluetooth" size={14} color="#64748b" />
                <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
                  Bluetooth
                </Text>
              </View>
              <Switch
                value={hub.btEnabled === true}
                onValueChange={(on) => {
                  feedbackTap();
                  hub.setCarTransportToggle("BT", on);
                }}
                disabled={!linked || hub.wifiEnabled === false}
                trackColor={{ false: "#cbd5e1", true: "#1e3a8a" }}
                thumbColor="#ffffff"
                accessibilityLabel="Turn the car's Bluetooth transport on or off"
              />
            </View>

            <View className="mt-1 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Feather name="zap" size={14} color="#64748b" />
                <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
                  Boot auto-join
                </Text>
              </View>
              <Switch
                value={hub.bootAutojoin === true}
                onValueChange={(on) => {
                  feedbackTap();
                  hub.setCarTransportToggle("AUTOJOIN", on);
                }}
                disabled={!linked}
                trackColor={{ false: "#cbd5e1", true: "#1e3a8a" }}
                thumbColor="#ffffff"
                accessibilityLabel="Join the last router on power-up, else stay on the car's own hotspot"
              />
            </View>

            {/* U-R3 (owner 2026-10-12): smart-link auto-join — on car selection
                join the strongest saved router the car hears, else stay on its
                own access point. Mirrors DevicePrefs and cloud profile. */}
            <View className="mt-1 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Feather name="zap" size={14} color="#64748b" />
                <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
                  Auto-join saved router
                </Text>
              </View>
              <Switch
                value={autoJoinRouter}
                onValueChange={(on) => {
                  feedbackTap();
                  setAutoJoinRouter(on);
                }}
                disabled={!linked}
                trackColor={{ false: "#cbd5e1", true: "#1e3a8a" }}
                thumbColor="#ffffff"
                accessibilityLabel="Auto-join saved router on connect"
              />
            </View>

            {/* Steering limit + Trim (2WD1M only) */}
            <View
              className={`${is2wd1mActive ? "" : "opacity-40"}`}
              pointerEvents={is2wd1mActive ? "auto" : "none"}
            >
              <View className="mt-1.5 flex-row items-center justify-between">
                <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
                  Steering
                </Text>
                <View className="flex-row items-center gap-2">
                  <Text className="font-mono text-[10px] font-bold text-ink dark:text-white">
                    {steerLimit}°
                  </Text>
                  <View className="flex-row gap-1">
                    <StepperPill
                      onPress={() => adjustSteerLimit(-5)}
                      disabled={!canControl}
                      icon="minus"
                    />
                    <StepperPill
                      onPress={() => adjustSteerLimit(5)}
                      disabled={!canControl}
                      icon="plus"
                    />
                  </View>
                </View>
              </View>
              <View className="mt-1 flex-row items-center justify-between border-t border-line pt-1">
                <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
                  Trim
                </Text>
                <View className="flex-row items-center gap-2">
                  <Text className="font-mono text-[10px] font-bold text-ink dark:text-white">
                    {trim > 0 ? `+${trim}` : trim}°
                  </Text>
                  <View className="flex-row gap-1">
                    <StepperPill
                      onPress={() => adjustTrim(-1)}
                      disabled={!canControl}
                      icon="minus"
                    />
                    <StepperPill
                      onPress={() => adjustTrim(1)}
                      disabled={!canControl}
                      icon="plus"
                    />
                  </View>
                </View>
              </View>
            </View>
            {!is2wd1mActive && (
              <Text className="mt-1 text-[9px] leading-3 text-muted">
                Steering &amp; trim: 2WD1M only.
              </Text>
            )}
          </ScrollView>
        </>
      )}

      {/* Reconnect banner — anchored to the bottom so it never collides with
            the phone status bar/notch in landscape. Shows when connection
            drops and auto-reconnect is exhausted. */}
      {renderReconnectBanner()}
    </View>
  );
}
