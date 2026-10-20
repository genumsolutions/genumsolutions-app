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
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
  Alert,
  TouchableOpacity,
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
import { resolveLinkPrompt } from "../components/tools/linkPrompt";
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

// U-113 P2 (owner issue 2, Open Question Q2 default = yes): the merged
// single row below Back carries [BT chip?] [Wi-Fi chip?] · telemetry … ·
// [D-pad][Joystick][Telemetry][Connectivity]. When the row gets tight the
// compact telemetry line (Up/Heap/Sig) drops FIRST — disconnect chips and
// tab pills are the controls, the readings are also on the Telemetry tab.
// Landscape phones start around 640 px; below this cut the line hides.
const MERGED_ROW_TELEMETRY_MIN_PX = 700;

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

// A-25/A-38 (device rounds 5/8): "the chrome label must be FRIENDLY — never
// a raw hex MAC, never an invented name" — kept by CONSTRUCTION since
// U-113 P2 (owner issue 10): the link chip renders the short link label +
// IP and NO device name at all, so there is no name to sanitize and the
// `friendlyBtName` helper that used to live here is deleted with its caller
// (`deckLinkLabel`, the "BT · name + WiFi · ip (AP)" line the owner called
// gibberish). The BT name still shows where a name belongs: the OLED mirror.

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
    // U-108 Phase 4: the detected car-restart prompt. (phoneSsid is gone
    // from the Remote — U-113 P2 removed the "on <ssid>" chip, issue 4.)
    btLinked,
    carRestartNotice,
    autoJoinRouter,
    setAutoJoinRouter,
    // U-113 P2 (issue 3): per-method disconnects — each chip tears down ONLY
    // its own transport. (The full `handleDisconnect` is no longer used here:
    // the BT chip used to call it and killed the Wi-Fi link too.)
    handleBtDisconnect,
    handleWifiDisconnect,
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

  // U-113 P2 (owner issue 10): the chrome row shows the car's broadcast IP
  // as THE link to the car's page, so this is the ONE IP expression left.
  // Honesty kept from U-108/W5: a known STA IP first, the AP address (named
  // as such) only while the car is on its own hotspot, and a dash — never a
  // guess — otherwise. The old 1 s NAME⇄IP alternation and its second copy of
  // this expression died with the tabs-row chip (issue 4/10); the SSID still
  // shows on the OLED mirror and in the Connectivity panel.
  const ipChipText = telemetry.ip
    ? telemetry.ip
    : onOwnHotspot
      ? `${DEFAULT_AP_IP} (AP)`
      : "—";

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
  // U-117: the web-page state joins them — without this query the Webpage
  // switch showed an ASSUMED off after every (re)connect while the car kept
  // serving, which is exactly the "toggle is broken" report.
  useEffect(() => {
    if (linked) {
      hub.queryCarTransportToggle("WIFI");
      hub.queryCarTransportToggle("BT");
      hub.queryCarTransportToggle("AUTOJOIN");
      hub.queryCarTransportToggle("PAGE");
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
  // U-113 P2 (owner issue 10): the long `deckLinkLabel` ("BT · name + WiFi ·
  // ip (AP)") is GONE — the chrome chip renders the short `linkLabel` +
  // `ipChipText` and IS the page link. `linkLabel` stays the ONE transport
  // name (M2): both links together under parallel, never a raw hex MAC.
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

  // U-110 (owner 2026-10-14): the reconnect / restart prompts are now CENTERED
  // MODAL overlays — a dimmed card in the middle of the screen over the drive
  // deck, not a banner pinned to the bottom edge (the owner asked for a
  // "separate screen" in the middle). Both prompts share one shell so they read
  // identically.
  const renderPromptShell = (
    tone: "amber" | "sky",
    title: string,
    body: React.ReactNode,
    actions: React.ReactNode,
  ) => (
    <Modal transparent visible animationType="fade">
      <View
        className="flex-1 items-center justify-center px-6"
        style={{ backgroundColor: "rgba(15,23,42,0.7)" }}
      >
        {/* U-113 P2 (owner issue 14 — "merges with background text"): the card
            is OPAQUE in BOTH themes — a solid surface, a strong 2 px border and
            a shadow, never a translucent tint the screen text can read through.
            Copy is a readable 13 px on high contrast, not the old 11 px
            grey-on-tint. */}
        <View
          className={`rounded-2xl border-2 px-5 py-4 shadow-2xl ${
            tone === "amber"
              ? "border-amber-400 bg-white dark:border-amber-300 dark:bg-slate-900"
              : "border-sky-400 bg-white dark:border-sky-300 dark:bg-slate-900"
          }`}
          style={{ width: "100%", maxWidth: 380 }}
        >
          <Text
            className={`text-base font-black ${
              tone === "amber"
                ? "text-amber-900 dark:text-amber-100"
                : "text-sky-900 dark:text-sky-100"
            }`}
          >
            {title}
          </Text>
          <View className="mt-1">{body}</View>
          <View className="mt-4 flex-row justify-end gap-2">{actions}</View>
        </View>
      </View>
    </Modal>
  );

  // P1 (owner 2026-10-17): ONE prompt-state decision drives the deck. The pure
  // `resolveLinkPrompt` owns "which prompt belongs on screen right now?" from
  // the live facts; this renderer only paints what it returns. That kills the
  // two independent gates (a stale prompt can no longer outlive its cause) and
  // removes the restart card's third action.
  const linkPrompt = resolveLinkPrompt({
    linked,
    btLinked,
    wifiConnected,
    sppRetryDue: showSppsRetry,
    restart: carRestartNotice,
    linkLabel,
    ipText: linked ? ipChipText : null,
  });

  const renderLinkPrompt = () => {
    if (!linkPrompt) return null;

    // U-118 (owner 2026-10-20): "the reconnect shows the last reset thing —
    // remove that." The old `restart` card (Boot N → N+1 · reset REASON ·
    // crashes + its own two actions) is GONE from the deck. There is exactly
    // ONE prompt now, and the restart only reaches it as a plain cause
    // sentence inside `linkPrompt.body`. The reset record itself still leads
    // the Control Panel's "Last restart record" (P2, ToolsScreen) — it was
    // never removed from where an owner acts on it.
    // kind === "reconnect"
    return renderPromptShell(
      "amber",
      linkPrompt.title,
      <Text className="text-[13px] leading-5 text-amber-800 dark:text-amber-200">
        {linkPrompt.body}
      </Text>,
      <>
        <Pressable
          onPress={() => {
            feedbackTap();
            void handleSppsRetry();
          }}
          className="rounded-full bg-gold px-3 py-1.5"
          hitSlop={6}
          testID="reconnect-retry"
        >
          <Text className="text-[11px] font-bold text-white">Reconnect</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            feedbackTap();
            handleReconnectPromptCancel();
          }}
          className="rounded-full border border-line bg-card px-3 py-1.5"
          hitSlop={6}
          testID="reconnect-cancel"
        >
          <Text className="text-[11px] font-bold text-muted">Cancel</Text>
        </Pressable>
      </>,
    );
  };

  return (
    <View className="flex-1 bg-surface">
      <View
        className="flex-1 overflow-hidden px-3 pb-2"
        style={{ paddingTop: Math.max(insets.top, 8) }}
      >
        {/* ── Chrome row ── */}
        <View className="flex-shrink-0 flex-row items-center gap-2">
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

          {/* U-113 P2 (owner issue 10): the ONE link status lives RIGHT OF BACK
              — and the broadcast IP there IS the link to the car's page (the
              duplicate page chip in the row below is gone). Short label only
              (BT+WiFi / Bluetooth / WiFi + IP): no device name renders here at
              all, so a stale BT name can never label a Wi-Fi link and a raw
              hex MAC cannot appear either (A-25/A-38 by construction). One dot,
              one status (U-108 ruling kept). Tap opens the car's web page
              (A-36: with a reachable STA IP the page directly; offline/AP the
              car's own AP page — "nothing happens" is gone). */}
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
            testID="deck-link-status"
            hitSlop={8}
            className="min-w-0 shrink flex-row items-center gap-1.5 active:opacity-70"
          >
            <View
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${linked ? "bg-green-400" : "bg-slate-600"}`}
            />
            <Text
              numberOfLines={1}
              className="min-w-0 shrink text-[11px] font-bold text-navy dark:text-sky-300"
            >
              {linkLabel}
              {linked ? ` · ${ipChipText}` : ""}
            </Text>
          </Pressable>

          <Text className="shrink-0 text-sm font-black uppercase tracking-[0.2em] text-muted">
            Remote
          </Text>

          <View className="min-w-0 flex-1" />

          {isRobocar && (
            <View className="shrink-0 flex-row items-center gap-2">
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
            <View className="shrink-0 flex-row items-center gap-2">
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

        {/* ── U-113 P2 (owner issues 2/3/4): the ONE merged row below Back —
            the old U-108 disconnect row and the tab-pills row are combined,
            giving the drive deck the ~28 px both used to take. Order = the Q2
            overflow priority: disconnect chips (only for LIVE methods, each
            tearing down ONLY its own transport — issue 3) > tab pills > the
            compact telemetry line (hidden first on narrow screens). Constant
            height so the deck never shifts. The "on <phone-ssid>" chip is
            gone (issue 4 — useless here); its NetInfo discovery stays for
            smart-link switching. */}
        <View className="mt-1 flex h-7 flex-shrink-0 flex-row items-center gap-1.5 px-1">
          {btLinked ? (
            <Pressable
              onPress={() => {
                feedbackTap();
                void handleBtDisconnect();
              }}
              accessibilityRole="button"
              accessibilityLabel="Disconnect Bluetooth"
              testID="remote-disconnect-bt"
              hitSlop={6}
              className="shrink-0 flex-row items-center gap-1 rounded-full border border-line bg-card px-2 py-0.5 active:opacity-70"
            >
              <Feather name="bluetooth" size={10} color="#64748b" />
              <Text className="text-[9px] font-bold text-muted">Bluetooth</Text>
            </Pressable>
          ) : null}
          {wifiConnected ? (
            <Pressable
              onPress={() => {
                feedbackTap();
                void handleWifiDisconnect();
              }}
              accessibilityRole="button"
              accessibilityLabel="Disconnect Wi-Fi"
              testID="remote-disconnect-wifi"
              hitSlop={6}
              className="shrink-0 flex-row items-center gap-1 rounded-full border border-line bg-card px-2 py-0.5 active:opacity-70"
            >
              <Feather name="wifi" size={10} color="#64748b" />
              <Text className="text-[9px] font-bold text-muted">Wi-Fi</Text>
            </Pressable>
          ) : null}
          {/* Q2 default (owner): the compact telemetry line is the FIRST
              thing dropped when the row gets tight — the disconnect chips and
              the tab pills are controls and always fit. The same readings are
              on the Telemetry tab and the readout column. */}
          {isRobocar && width >= MERGED_ROW_TELEMETRY_MIN_PX ? (
            <TelemetryLine {...driveTelemetryArgs} />
          ) : null}
          <View className="min-w-0 flex-1" />
          {/* Control pills (robocar only — decks drive themselves) */}
          {isRobocar ? (
            <>
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
            </>
          ) : null}
        </View>

        {/* U-113 P2 (issue 2): the tab pills MOVED into the single merged row
            above — the second h-7 row below Back is gone and the drive deck
            gains its ~28 px. */}

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
            className="absolute right-3 z-40 w-80 rounded-2xl border border-line bg-card p-2.5 shadow-xl"
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

            {/* U-105 (owner 2026-10-13): the car's transport toggles replace the
                removed parallel + power-save settings (`WIFICFG;PARALLEL` /
                `WIFICFG;APSAVE` and their NVS keys are gone). Wi-Fi (`t_wifi`)
                and Bluetooth (`t_bt`) can never BOTH be off — the car clamps a
                both-off request, and here the toggle that would leave the pair
                at two-OFFs is disabled. Each mirrors the car's NVS and rides to
                DevicePrefs + cloud. (P3 2026-10-15: the third toggle here, the
                CAR's boot auto-join, was removed — see below.) */}
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
                <Feather name="eye" size={14} color="#64748b" />
                <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
                  Webpage
                </Text>
              </View>
              <Switch
                value={hub.pageOn === true}
                onValueChange={(on) => {
                  feedbackTap();
                  hub.setPageOn(on);
                }}
                disabled={!linked}
                trackColor={{ false: "#cbd5e1", true: "#1e3a8a" }}
                thumbColor="#ffffff"
                accessibilityLabel="Turn the car's web page on or off"
              />
            </View>

            {/* P3 · Q1 (owner, 2026-10-15): the CAR's boot auto-join toggle
                (`WIFICFG;AUTOJOIN`, NVS `boot_autojoin`) was REMOVED from this
                panel — it only ever rejoined the last router, which the owner
                called useless (issue 12). The firmware half of Q1's default
                (stop the boot hop) rides P5; the app's smart-link auto-join
                below is now the ONLY auto-join control here. */}

            {/* U-R3 (owner 2026-10-12): smart-link auto-join — the APP's setting.
                On car selection the app joins the strongest saved router the car
                hears, else stays on its own access point. Mirrors DevicePrefs and
                the cloud profile. */}
            <View className="mt-1.5 flex-row items-center justify-between gap-2">
              <View className="min-w-0 flex-1 flex-row items-center gap-2">
                <Feather name="refresh-cw" size={14} color="#64748b" />
                <View className="min-w-0 flex-1">
                  <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
                    Auto-join saved router (app)
                  </Text>
                  <Text className="text-[9px] leading-tight text-muted">
                    When you open the car, the APP switches it to the strongest
                    saved router it hears.
                  </Text>
                </View>
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
                accessibilityLabel="App auto-join: on connect, switch the car to the strongest saved router it hears"
              />
            </View>

            {/* Webpage — turn the car-hosted webpage (:80/:81) on or off.
                Webpage ONLY: this does not touch the Wi-Fi transport toggle
                (WIFICFG;WIFI;ON|OFF / t_wifi) or the Bluetooth transport toggle
                (WIFICFG;BT;ON|OFF / t_bt). The app sends WIFICFG;WIFI;PAGE;ON
                / OFF; the car only flips pageOff_ (pageServerIsOn = !pageOff_). */}
            <View className="mt-2.5 border-t border-line pt-2">
              <View className="mb-1 flex-row items-center gap-1.5">
                <Feather name="alert-triangle" size={12} color="#dc2626" />
                <Text className="text-[9px] font-black uppercase tracking-widest text-red-600 dark:text-red-400">
                  Danger zone
                </Text>
              </View>
              <View className="rounded-lg border border-red-500/40 bg-red-500/5 p-2">
                <Text className="text-[10px] font-bold uppercase tracking-wide text-red-600 dark:text-red-400">
                  Factory reset the car
                </Text>
                <Text className="mt-0.5 text-[9px] leading-tight text-muted">
                  Erases everything the car remembers — saved Wi-Fi routers, its
                  name and settings — and removes it from this phone. Restart
                  the car afterwards. This cannot be undone.
                </Text>
                <TouchableOpacity
                  testID="reset-car-data"
                  onPress={async () => {
                    Alert.alert(
                      "Factory reset the car?",
                      "The car erases its saved Wi-Fi routers, name and settings, and this phone forgets the car. Restart the car afterwards to finish. This cannot be undone.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Reset car",
                          style: "destructive",
                          onPress: async () => {
                            const result = await hub.resetCarData();
                            if (!result.ok) {
                              Alert.alert(
                                "Reset failed",
                                result.error ?? "unknown",
                              );
                            } else {
                              hub.showConnectionMessage(
                                "Car data reset — power cycle the car for a fresh start",
                                "success",
                              );
                            }
                          },
                        },
                      ],
                    );
                  }}
                  className="mt-1.5 items-center rounded-md border border-red-500 bg-red-500/10 py-1.5"
                >
                  <Text className="text-[10px] font-black uppercase tracking-wide text-red-600 dark:text-red-400">
                    Reset car data
                  </Text>
                </TouchableOpacity>
              </View>
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

      {/* P1 (owner 2026-10-17): the reconnect / car-restart prompt. A single
            decision (`resolveLinkPrompt`) picks at most ONE centered modal —
            the reconnect card only while no link is up, the restart card while
            a boot-count change is pending. Each carries exactly Reconnect +
            Cancel. */}
      {renderLinkPrompt()}
    </View>
  );
}
