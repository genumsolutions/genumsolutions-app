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
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
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
import { BalanceControls } from "../components/tools/BalanceControls";
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
  InlineMessage,
} from "../components/tools/connection";
import {
  carWebPageIp,
  carWebPageUrl,
} from "../components/tools/connection/dial";
import { isCarPageReachable } from "../components/tools/CarPageServingState";
import { LOCAL_CAR_MODES, sortRemoteModes } from "../config/roboCarCatalog";
import {
  SPEED_MIN,
  SPEED_MAX,
  SPEED_STEP,
  canonicalCarToken,
  modeAvailStatus,
} from "../services/carProtocol";
import { feedbackTap } from "../services/hapticsService";

type Props = NativeStackScreenProps<RootStackParamList, "RemoteControl">;
type Route = RouteProp<RootStackParamList, "RemoteControl">;

const NAV_DEBOUNCE_MS = 120;

// U-113 P2 (owner issue 2, Open Question Q2 default = yes): the merged
// single row below Back carries [BT chip?] [Wi-Fi chip?] · telemetry … ·
// [D-pad][Joystick][Telemetry][Connectivity]. When the row gets tight the
// compact telemetry line (Up/Heap/Sig) drops FIRST — disconnect chips and
// tab pills are the controls, the readings are also on the Telemetry tab.
// Landscape phones start around 640 px; below this cut the line hides.
// U-124 ③ (owner 2026-10-24, MEASURED): the row's natural width at fontScale
// 1 was measured in headless Chrome — with the telemetry line ON it is ~864 px
// (needs 888 px of screen), and ~700 px (needs 724) without it. So at the
// 640-844 px landscape widths this screen actually runs at, the controls to the
// LEFT of the tabs pushed the tab strip past the right edge and its labels
// clipped — the owner's "tabs names … not fitting the text on its available
// space". After this round's size pass the ON width is ~791 px (815 of screen);
// 860 keeps telemetry showing only where the CONTROLS are provably safe, with
// headroom for a system font scale above 1. Q2's rule is unchanged — telemetry
// is still the first and only thing that drops.
const MERGED_ROW_TELEMETRY_MIN_PX = 860;

/**
 * A1 + A2 (owner 2026-11-19): the deck the Remote shows is ONE choice, not
 * three overlapping booleans. `dpad` / `joystick` are the two drive surfaces
 * (the driver preference persists per device); `telemetry` and `connectivity`
 * are inspection surfaces and live for the session only.
 */
type RemoteView = "dpad" | "joystick" | "telemetry" | "connectivity";

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
      className="h-10 w-10 items-center justify-center rounded-full border border-line bg-card disabled:opacity-40"
    >
      <Feather name={icon} size={14} color="#64748b" />
    </Pressable>
  );
}

/**
 * One group shape for the settings dropdown (owner 2026-10-24: "make the
 * setting too organized and proper size"). A divider, a small-caps header and
 * a fixed rhythm — the panel reads as SECTIONS instead of one undifferentiated
 * strip of switches. The Danger zone keeps its own red header (same shape,
 * destructive tone) and always renders LAST.
 */
function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mt-1.5 border-t border-line pt-1">
      <Text className="mb-0.5 text-[9px] font-black uppercase tracking-widest text-muted">
        {title}
      </Text>
      {children}
    </View>
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
        className={`text-[10px] font-black uppercase tracking-widest ${highlight ? "text-navy-dark" : "text-muted"}`}
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
        className={`w-7 shrink-0 text-right font-mono text-[12px] font-bold ${highlight ? "text-navy-dark" : "text-ink dark:text-white"}`}
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
  const { width, height } = useViewport();
  const insets = useSafeAreaInsets(); // ── 2026-10-24 (owner: "omit the space of the phone on the top where the
  // camera is situated as the black color by default and only use the
  // remaining space" + "the phone's status bar is missing on the top, show
  // that too in the remote screen").
  //
  // The top strip belongs to the PHONE, not to the deck: on an edge-to-edge
  // build (Android 15+) the system status bar and the punch-hole camera sit
  // INSIDE the app frame, and this screen was painting that strip with its own
  // `bg-surface` — white status icons over a light surface read as "the status
  // bar is missing", and the camera cutout sat on a light band.
  //
  // So the strip is claimed here: `cameraBand` is drawn SOLID BLACK (the
  // phone's own chrome, whatever the theme says), the system status bar is
  // asked for explicitly (light icons on that black band, never hidden), and
  // the screen's content starts at `fixed 8px` — i.e. only the REMAINING space
  // is used. Where the build is not edge-to-edge (`insets.top === 0`) the
  // status bar lives above the window: the same black is applied there at
  // runtime, so the strip looks the same either way.
  // ── 2026-10-24 (owner: "omit the space of the phone on the top where the
  // camera is situated as the black color by default and only use the
  // remaining space" + "the phone's status bar is missing on the top, show
  // that too in the remote screen").
  //
  // The top strip belongs to the PHONE, not to the deck: on an edge-to-edge
  // build (Android 15+) the system status bar and the punch-hole camera sit
  // INSIDE the app frame, and this screen was painting that strip with its own
  // `bg-surface` — white status icons over a light surface read as "the status
  // bar is missing", and the camera cutout sat on a light band.
  //
  // So the strip is claimed here: `cameraBand` is drawn SOLID BLACK (the
  // phone's own chrome, whatever the theme says), the system status bar is
  // asked for explicitly (light icons on that black band, never hidden), and
  // the screen's content starts at `fixed 8px` — i.e. only the REMAINING space
  // is used. Where the build is not edge-to-edge (`insets.top === 0`) the
  // status bar lives above the window: the same black is applied there at
  // runtime, so the strip looks the same either way.
  const { themeMode } = useApp();

  const {
    connected,
    wifiConnected,
    deviceName,
    canControl,
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
    isDrone,
    isNonRobocar,
    is2wd1mActive,
    reconnectDue,
    reconnectMethod,
    handleReconnectConfirm,
    handleReconnectPromptCancel,
    // U-108 Phase 4: the detected car-restart prompt. (phoneSsid is gone
    // from the Remote — U-113 P2 removed the "on <ssid>" chip, issue 4.)
    btLinked,
    carRestartNotice,
    autoJoinRouter,
    setAutoJoinRouter,
    connMethod,
    setConnMethod,
    // S-03: the one disconnect control's four inputs.
    disconnectingLink,
    linkOwner,
    handleBtDisconnect,
    handleWifiDisconnect,
  } = hub;

  const linked = connected || wifiConnected;
  // S-03: the one deliberate disconnect. Which radio to close is the CAR's fact
  // (`linkOwner`, adopted from ;LINK= / "link_owner"), because the car parks the
  // sibling transport the moment one owns the link — so "the live method" is
  // exactly what the car named. The fallbacks cover the two honest gaps: a
  // firmware too old to publish an owner, and the moment before the first STATE
  // lands. Nothing here guesses from the app's own memory of what it dialled.
  const disconnectLiveLink = useCallback(() => {
    if (disconnectingLink != null) return;
    feedbackTap();
    if (linkOwner === "wifi") {
      void handleWifiDisconnect();
      return;
    }
    if (linkOwner === "bt") {
      void handleBtDisconnect();
      return;
    }
    if (btLinked) {
      void handleBtDisconnect();
      return;
    }
    if (wifiConnected) void handleWifiDisconnect();
  }, [
    btLinked,
    disconnectingLink,
    handleBtDisconnect,
    handleWifiDisconnect,
    linkOwner,
    wifiConnected,
  ]);
  // S-12's app half: while the car says Bluetooth owns the link, its page server
  // is stopped (S-12 firmware half), so this app must not show a page that is
  // serving. `linkOwner` is adopted from the car, so this is a fact, not a guess
  // about what this phone dialled.
  const pageOffWhileBt = hub.linkOwner === "bt";
  // U-120: the local page-server truth gate. This screen derives `pageLinkReady`
  // from the HUB's public page-serving opinion only (`hub.carPageServing.current`).
  // Any other consumer of that truth (the page toggle, future reachability checks)
  // must use the same public opinion, not a separate pageOn/wifiUrl path, so the
  // Remote chip and that path cannot agree on different page states for the same link.
  // U-124 ⑫ (owner 2026-10-24, "the ip is not hidden anywhere"): TWO defects
  // met behind that report — the hub's opinion was a never-written ref object
  // (always truthy), and this gate had no live-link half despite the comment
  // and the storyboard promising "a live link AND the car serves its page".
  // The hub's opinion is now a real boolean (useControlHub, U-124 ⑫), and the
  // gate is the conjunction its own docs always described: no link or page
  // off ⇒ no chip, because there is no page to open.
  // U-105 (1.3.5, owner 2026-10-13): Bluetooth and Wi-Fi stay live TOGETHER by
  // default — the parallel + power-save settings are gone. Whenever both links
  // are open the strip and sub-header name BOTH at once (the car's OLED says
  // the same), not just the Bluetooth name.
  const parallelBoth = connected && wifiConnected;
  const isRobocar = !isDrone && !isNonRobocar;

  // U-113 P2 (owner issue 10): the chrome row shows the car's broadcast IP
  // as THE link to the car's page, so this is the ONE IP expression left.
  // Honesty kept from U-108/W5: a known STA IP first, the AP address (named
  // as such) only while the car is on its own hotspot, and a dash — never a
  // guess — otherwise. The old 1 s NAME⇄IP alternation and its second copy of
  // this expression died with the tabs-row chip (issue 4/10); the SSID still
  // shows on the OLED mirror and in the Connectivity panel.
  const pageIp = carWebPageIp({
    reportedIp: telemetry.ip,
    reportedSsid: telemetry.ssid ?? null,
    ownApName: carApName ?? null,
  });
  const pageLinkReady =
    linked &&
    isCarPageReachable(hub.carPageServing, hub.wifiEnabled) &&
    pageIp !== null;
  const ipChipText = pageIp ?? "";

  // U-121 (owner 2026-10-23, items 1+2): the chrome chip is THE BROADCAST IP
  // ALONE — no "BT+WiFi" transport label, no car network name — and it renders
  // ONLY while the car is actually serving its own web page (`pageOn`, car
  // truth adopted change-guarded from `;PAGE=`/`page_on` and queried on every
  // link-up) behind a live link. It resolves over ANY link: the car reports
  // `;IP=` on every STATE line over Bluetooth too (ModeManager), so a BT-only
  // link shows the same honest address the Wi-Fi link does — no more
  // "Bluetooth · —" until Wi-Fi comes up. Page off / no link ⇒ no chip at all,
  // because there is no page to open.
  // Owner (2026-10-23): the broadcast-IP chip shows only while the car is
  // serving its OWN webpage, and the Webpage on/off toggle controls that — over
  // ANY active link (Bluetooth or Wi-Fi). The car broadcasts its IP on every
  // STATE line over Bluetooth too, and its own page server is reachable from any
  // live link, so a BT-only session still shows the IP while the page is ON.
  // Page off / no link ⇒ no chip, because there is no page to open. The page
  // toggle itself is honest car truth (U-117): the app reads `;PAGE=` / `page_on`
  // and queries it on link-up, so the chip stops the instant the page is turned
  // off, regardless of which transport is connected.

  // A1 (owner 2026-11-19, "the D-pad … is not showing when the car is once
  // connected"): this effect used to re-apply the saved `joystickLayout` on
  // EVERY connect. Because the legacy default id was "dual" (which meant
  // joystick) and the setter also PERSISTED that choice, connecting a car
  // switched the deck to joysticks and nothing ever switched it back — the
  // D-pad simply disappeared. The layout is now SEEDED ONCE per mount (below)
  // and only the user's own tap changes it afterwards.
  //
  // `hub.selectJoystickLayout` is still the writer for the two drive surfaces
  // so the choice persists per device; it is no longer called on connect.

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
  // car's web page directly. The address is only advertised when the car's
  // current network gives us a usable page IP.
  const handleOpenWebPage = useCallback(() => {
    const url = carWebPageUrl(pageIp);
    if (url) {
      void Linking.openURL(url).catch(() => undefined);
    }
  }, [pageIp]);

  // Phase 2 (owner 2026-10-12): the router callbacks that used to feed
  // RouterPanel are gone — the Connectivity panel now renders ConnectionSection,
  // which drives the SAME ack-consuming hub API (`runSwitchPlan` / `requestRouter`
  // / `routerDelete`) itself. One connection surface, one manager.

  // ── Settings ──
  const [showSettings, setShowSettings] = useState(false);
  // A1 + A2 (owner 2026-11-19): ONE view owns the deck. `viewOverride` is the
  // user's explicit pick for THIS session; until they tap a pill the view is
  // DERIVED from the device profile, so no effect has to write state and no
  // connect event can override what is on screen.
  const [viewOverride, setViewOverride] = useState<RemoteView | null>(null);
  const savedUseJoystick = hub.savedPrefs?.useJoystick;
  const view: RemoteView =
    viewOverride ??
    (activeMode.id === "website-server"
      ? "connectivity"
      : savedUseJoystick
        ? "joystick"
        : "dpad");
  // The two drive surfaces persist per device; telemetry/connectivity are
  // inspection views and stay session-only.
  const selectView = (next: RemoteView) => {
    setViewOverride(next);
    if (next === "dpad") hub.setUseJoystick(false);
    else if (next === "joystick") hub.setUseJoystick(true);
  };
  // U-102 (owner: the Connectivity screen must open as the split DIRECTLY):
  // default the method to Bluetooth so the left=method / right=network panes
  // both render on open — a null default left the panel as one full-width
  // column until a method was picked ("two separate formats").
  //
  // U-124 (owner item ⑧): the pick is the HUB's, not this screen's — it is
  // persisted per device (`DevicePrefs.connMethod`), so reopening the Remote
  // shows the method the user last raised (bluetooth first on a fresh device),
  // and a connect raised through it is the radio `routeCommand` prefers when
  // both links are live.

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

  // The reconnect prompt is a centered modal over the drive deck, not a banner
  // pinned to the bottom edge.
  const renderPromptShell = (
    tone: "amber" | "sky",
    title: string,
    body: React.ReactNode,
    actions: React.ReactNode,
  ) => (
    <Modal
      transparent
      visible
      animationType="fade"
      onRequestClose={handleReconnectPromptCancel}
    >
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

  // ONE prompt-state decision drives the deck. `resolveLinkPrompt` only returns
  // a prompt for an unexpected drop; a restart notice can adjust its copy but
  // cannot make the dialog appear on its own.
  const linkPrompt = resolveLinkPrompt({
    linked,
    btLinked,
    wifiConnected,
    reconnectDue,
    method: reconnectMethod,
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
            // U-120 Phase C: the ONLY reconnect path — routes through the
            // method that dropped (Bluetooth retry / Wi-Fi re-dial) and runs
            // only because the user tapped Reconnect.
            void handleReconnectConfirm();
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
      {/* ① + ⑤: the phone's own strip — black by default, status bar shown
          over it (RN's StatusBar is stack-ordered, so the values set here
          apply while this screen is mounted and revert on leaving it). */}
      <StatusBar
        hidden={false}
        barStyle="light-content"
        backgroundColor="#000000"
      />
      {/* 2026-10-24: `Math.max(insets.top, 8)` replaces the fixed 8px — the
          inset itself is now the black band above, so the content starts
          below it with the same 8 px breathing room. */}
      <View
        className="flex-1 overflow-hidden"
        style={{
          paddingTop: Math.max(insets.top, 8),
          paddingLeft: 12,
          paddingRight: 12,
          paddingBottom: Math.max(insets.bottom, 8),
        }}
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

          {/* U-121 (owner 2026-10-23, items 1+2) + owner clarification
              (2026-10-23): the ONE chip right of Back is the BROADCAST IP ALONE
              — no transport label, no car network name — and only while the car
              is serving its own web page behind a live link (`pageLinkReady`).
              The Webpage on/off toggle controls it over ANY active link (BT or
              Wi-Fi): the car reports its IP on STATE over Bluetooth too, and its
              own page server is reachable from any live link, so a BT-only
              session still shows the IP while the page is ON. Tap opens the
              car's page (A-36 kept): the reachable STA IP directly, the car's
              own AP page only when the car reports that it is on its AP. */}
          {pageLinkReady ? (
            <Pressable
              onPress={handleOpenWebPage}
              accessibilityRole="link"
              accessibilityLabel={
                pageIp
                  ? `Open car web page at ${pageIp}`
                  : "Car IP not available yet"
              }
              testID="deck-link-status"
              hitSlop={8}
              className="min-w-0 shrink flex-row items-center gap-1.5 active:opacity-70"
            >
              <View className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" />
              <Text
                numberOfLines={1}
                className="min-w-0 shrink text-[12px] font-bold text-navy dark:text-sky-300"
              >
                {ipChipText}
              </Text>
            </Pressable>
          ) : null}

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
              {/* S-03 (owner bench report 2026-11-23: *"the app is missing the
                  disconnect button on the remote screen"*): U-107c deleted the
                  two per-method chips because the car parks the sibling
                  transport automatically, and that reasoning was sound — but it
                  left the owner with NO way to drop a link on purpose, which is
                  also the only way to exercise the reconnect path. So the
                  control comes back as ONE button, not two chips: it closes the
                  link the CAR says owns the link (linkOwner, adopted from
                  STATE), and falls back to whichever radio is actually up.
                  Closing only that transport is exactly what the hub's
                  per-method handlers already do (U-113 issue 3), so a live
                  sibling link survives. Single-shot: it disables and shows
                  pending while the teardown runs, so a double tap cannot send a
                  second teardown over a link that is already closing. */}
              {linked ? (
                <Pressable
                  onPress={disconnectLiveLink}
                  disabled={hub.disconnectingLink != null}
                  accessibilityRole="button"
                  accessibilityLabel="Disconnect the car"
                  accessibilityState={{
                    disabled: hub.disconnectingLink != null,
                  }}
                  testID="remote-disconnect"
                  hitSlop={8}
                >
                  <View
                    className={`h-11 flex-row items-center gap-1.5 rounded-full border border-line px-3 ${hub.disconnectingLink != null ? "opacity-50" : "bg-card"}`}
                  >
                    <Feather
                      name="slash"
                      size={14}
                      color={themeMode === "dark" ? "#fca5a5" : "#b91c1c"}
                    />
                    <Text className="text-[11px] font-bold text-muted">
                      {hub.disconnectingLink != null
                        ? "Closing…"
                        : "Disconnect"}
                    </Text>
                  </View>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => setShowSettings((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="Settings"
                hitSlop={12}
                android_ripple={{
                  color: "rgba(255,255,255,0.2)",
                  borderless: true,
                  radius: 32,
                }}
              >
                {/* 2026-10-24 (hierarchy): 56 px made the settings gear the
                    biggest thing in the chrome row — bigger than Back, bigger
                    than the drive controls it configures. 44 px is still a
                    full touch target; the row's tallest element is now the
                    mode/speed group the screen is actually about. */}
                <View
                  className={`h-11 w-11 items-center justify-center rounded-full bg-navy ${showSettings ? "bg-navy-dark" : ""}`}
                >
                  <Feather name="settings" size={18} color="#fff" />
                </View>
              </Pressable>
            </View>
          )}
        </View>
        {/* ── U-113 P2 (owner issues 2/3/4), rebuilt by U-121 (2026-10-23):
            the ONE merged row below Back. Order = the Q2 overflow priority:
            disconnect chips (only for LIVE methods, each tearing down ONLY
            its own transport — issue 3) > tab pills > the compact telemetry
            line (hidden first on narrow screens). Constant height so the deck
            never shifts. U-121 (items 5+6): the row grew h-7 → h-9 and the
            pills/chips carry real tap sizes with a REAL disconnect mark
            (transport icon + name + ✕), per the owner's "too small to click"
            and "not proper disconnect icon". */}
        {/* 2026-10-24: no per-row px — both this row and the chrome row above
            start at the SAME shell inset, so the two bars line up on the left
            edge (the old px-1 pushed this row 4 px right of Back). */}
        <View className="mt-1 flex h-9 flex-shrink-0 flex-row items-center gap-1">
          {/* Wi-Fi / Bluetooth disconnect chips removed — the car now parks the
              other transport automatically when one connects (exclusive mode).
              No manual disconnect needed; both broadcast again when idle. */}
          {isRobocar && width >= MERGED_ROW_TELEMETRY_MIN_PX ? (
            <TelemetryLine {...driveTelemetryArgs} />
          ) : null}
          <View className="min-w-0 flex-1" />
          {/* Control pills (robocar only — decks drive themselves) */}
          {isRobocar ? (
            // 2026-10-24 (owner: "organize … the tabs under this screen like
            // connectivity and the others too"): the four views are ONE
            // SEGMENTED tab strip — a single bordered pill container, active
            // view filled navy — instead of four loose bordered pills that
            // read as more status chips. Tap sizes stay what U-121 left them
            // (px-3 py-1.5, 11 px bold — U-124 ③) and every tab now carries a selected
            // accessibility state.
            <View
              accessibilityRole="tablist"
              accessibilityLabel="Control views"
              className="flex-shrink-0 flex-row items-center gap-0.5 rounded-full border border-line bg-card p-0.5"
            >
              {(
                [
                  { id: "dpad" as const, label: "D-pad" },
                  { id: "joystick" as const, label: "Joystick" },
                  { id: "telemetry" as const, label: "Telemetry" },
                  { id: "connectivity" as const, label: "Connectivity" },
                ] satisfies { id: RemoteView; label: string }[]
              ).map((tab) => {
                const selected = view === tab.id;
                return (
                  <Pressable
                    key={tab.id}
                    onPress={() => {
                      feedbackTap();
                      selectView(tab.id);
                    }}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={tab.label}
                    accessibilityState={{ selected }}
                    testID={`remote-tab-${tab.id}`}
                    className={`rounded-full px-3 py-1.5 ${selected ? "bg-navy" : "bg-transparent"} active:opacity-70`}
                  >
                    <Text
                      className={`text-[11px] font-bold ${selected ? "text-white" : "text-muted"}`}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
        {/* U-113 P2 (issue 2): the tab pills MOVED into the single merged row
            above — the second h-7 row below Back is gone and the drive deck
            gains its ~28 px. */}
        {/* U-121 Phase D (owner 2026-10-23): "the car freezes and the app
            doesn't know about that." A link being up says nothing about a
            live car — the owner's freeze (BT on, Wi-Fi drop, heap collapse)
            keeps the transport nominally up while the car answers NOTHING.
            The hub's pure `isCarSilent` detector names that state honestly,
            and this strip says what to do about it. */}
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
                /* Control-panel kinds plan step ②: dedicated per-category deck —
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
            {view === "dpad" || view === "joystick" ? (
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
                  useJoystick={view === "joystick"}
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
            ) : view === "connectivity" ? (
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
                  {pageLinkReady && pageIp ? (
                    <View className="flex-row items-baseline justify-between gap-2">
                      <Text className="text-[10px] font-black uppercase tracking-widest text-muted">
                        IP
                      </Text>
                      <Text
                        numberOfLines={1}
                        className="font-mono text-base font-bold text-ink dark:text-white"
                      >
                        {pageIp}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            )}
          </View>
        )}
        {/* A3 + A4 (owner 2026-11-19: "the status message … shifts and moves the
            screens at bottom" and "that space is too much for the notification"):
            this strip used to sit IN the flex column after the deck, so every
            message appearing resized the drive deck underneath it. It is now a
            zero-flow OVERLAY pinned to the bottom of the deck: the deck's height
            never changes, and the note is a single compact pill over the
            controls (pointerEvents none, so driving is never blocked). */}
        {hub.connectionMessage || hub.carSilent ? (
          <View
            pointerEvents="none"
            accessibilityLiveRegion="polite"
            testID="remote-status-overlay"
            className="absolute bottom-2 left-0 right-0 items-center px-2"
          >
            <View className="w-full max-w-[460px]">
              <InlineMessage
                tone={
                  hub.connectionMessage && hub.connectionMsgType !== "error"
                    ? "ok"
                    : "error"
                }
              >
                {hub.connectionMessage ??
                  "The car has not answered for a while — it may have frozen. Check its power and reconnect when it is ready."}
              </InlineMessage>
            </View>
          </View>
        ) : null}
      </View>

      {/* ── Settings dropdown ── */}
      {showSettings && (
        <>
          <Pressable
            className="absolute inset-0 z-30 bg-black/40"
            onPress={() => setShowSettings(false)}
            accessibilityLabel="Close settings"
          />
          {/* 2026-10-24 (owner: "make the setting too organized and proper
              size" + "mind the spaces of the status bar … and the position of
              the camera"): the dropdown is INSET-ANCHORED — its right edge and
              its floor follow the safe-area insets (a landscape punch-hole
              camera sits on the side edge), and its content is GROUPED
              (connection / driving / danger) behind one header row with a real
              close mark, instead of one undifferentiated strip of switches. U-123: the scroll
              indicator is ON — on a short landscape screen the Danger zone
              sits below the fold and must stay discoverable.

              S-07 (owner bench report 2026-11-23: *"the reset car is also not
              properly displayed in that space of the settings, its bottom
              overlaps the bottom border of the setting page"*): the Danger zone
              is the LAST child of this scroll view, so on the shortest landscape
              height it lands exactly at the sheet's floor and its red border
              reads as sitting on the panel's own bottom border. The sheet owns
              that floor gap below (paddingBottom), because it cannot come from
              the child - a scrolled-to-end child has nothing beneath it. */}
          <ScrollView
            className="absolute z-40 w-96 max-w-[94%] rounded-2xl border border-line bg-card p-3 shadow-xl"
            style={{
              top: 56,
              right: Math.max(insets.right, 12),
              maxHeight: height - 56 - Math.max(insets.bottom, 8) - 12,
            }}
            contentContainerStyle={{
              paddingBottom: 10,
            }}
            showsVerticalScrollIndicator={true}
          >
            <View className="flex-row items-center justify-between gap-2 pb-1">
              <Text
                numberOfLines={1}
                ellipsizeMode="middle"
                className="min-w-0 flex-1 text-[10px] font-black uppercase tracking-wide text-muted"
              >
                Settings ·{" "}
                {is2wd1mActive ? "2WD1M" : activeMode.name.split("·")[0].trim()}
              </Text>
              <Pressable
                onPress={() => setShowSettings(false)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close settings"
                testID="remote-settings-close"
              >
                <Feather name="x" size={15} color="#64748b" />
              </Pressable>
            </View>

            {/* Group 1 — Car connection: Webpage server + remember-last-router.
                Wi-Fi and Bluetooth transport toggles are REMOVED here — the car
                now serves one method at a time automatically (exclusive mode).
                When one client connects, the other transport parks itself; when
                idle, both broadcast again. No user switches needed. */}
            <SettingsGroup title="Car connection">
              {/* Webpage — turn the car-hosted webpage (:80/:81) on or off.
                Webpage ONLY: this does not touch the Wi-Fi transport toggle
                (WIFICFG;WIFI;ON|OFF / t_wifi) or the Bluetooth transport toggle
                (WIFICFG;BT;ON|OFF / t_bt). The app sends WIFICFG;WIFI;PAGE;ON
                / OFF; the car only flips pageOff_ (pageServerIsOn = !pageOff_).
                2026-10-24: this comment used to sit ABOVE THE FACTORY-RESET
                block (a cut/paste residue of an earlier rectification) — it
                belongs here, on the toggle it explains. */}
              <View className="mt-1 min-h-11 flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <Feather name="eye" size={14} color="#64748b" />
                  <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
                    Webpage
                  </Text>
                </View>
                {/* U-128 (owner 2026-11-21: "when the wifi is off the webpage
                  should be default off in the setting menu"): the page server
                  is hosted ON the Wi-Fi transport, so with Wi-Fi OFF there is
                  nothing to serve. Showing a remembered ON here would offer a
                  switch that cannot do anything; it reads OFF and is disabled,
                  and the car reports page_on=0 in that state too, so the next
                  connect adopts the same truth. The stored choice comes back
                  on its own when Wi-Fi is turned on again. */}
                <Switch
                  value={
                    hub.wifiEnabled === false || pageOffWhileBt
                      ? false
                      : hub.pageOn === true
                  }
                  onValueChange={(on) => {
                    feedbackTap();
                    hub.setPageOn(on);
                  }}
                  disabled={
                    !linked || hub.wifiEnabled === false || pageOffWhileBt
                  }
                  trackColor={{ false: "#cbd5e1", true: "#1e3a8a" }}
                  thumbColor="#ffffff"
                  accessibilityLabel="Turn the car's web page on or off"
                />
              </View>
              {/* S-12 (owner 2026-11-23: "when bluetooth is connected the webpage
                should be off by default"): the car now reports page_on=0 while
                Bluetooth owns the link, because suspendAP() really has stopped
                the server. Without this line the switch would flip itself off and
                the owner would read it as broken - so the reason is named, and
                the switch is disabled rather than offering a tap that cannot
                take effect until the BT client disconnects. The stored choice is
                untouched; the page returns by itself on the disconnect. */}
              {pageOffWhileBt ? (
                <Text className="-mt-0.5 pb-1 text-[9px] leading-tight text-muted">
                  Off while Bluetooth is connected — it comes back when the
                  car's Bluetooth client disconnects.
                </Text>
              ) : null}

              {/* The car checks the remembered router at boot and keeps its
                own access point when the router is absent. */}
              <View className="mt-1 min-h-11 flex-row items-center justify-between gap-2">
                <View className="min-w-0 flex-1 flex-row items-center gap-2">
                  <Feather name="refresh-cw" size={14} color="#64748b" />
                  <View className="min-w-0 flex-1">
                    <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
                      Remember last used router
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
                  accessibilityLabel="Remember the last used router at power-up; keep the car's own access point if it is unavailable"
                />
              </View>
            </SettingsGroup>

            {/* Group 2 — Driving: steering limit + trim (2WD1M only). It
                renders BEFORE the danger zone — a destructive action never
                sits above the settings it belongs with. */}
            <SettingsGroup title="Driving">
              {/* Steering limit + Trim (2WD1M only) */}
              <View
                className={`${is2wd1mActive ? "" : "opacity-40"}`}
                pointerEvents={is2wd1mActive ? "auto" : "none"}
              >
                <View className="mt-1 min-h-11 flex-row items-center justify-between">
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
                <View className="mt-1 min-h-11 flex-row items-center justify-between border-t border-line pt-1">
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
            </SettingsGroup>

            {/* Group 3 — Danger zone, LAST. 2026-10-24: it used to sit between
                the connection toggles and the steering rows, so a stray tap in
                routine settings could reach a factory reset. Same red header
                shape, now at the bottom of the panel where a destructive
                action belongs. */}
            <View className="mt-2 border-t border-line pt-2">
              <View className="mb-1 flex-row items-center gap-1.5">
                <Feather name="alert-triangle" size={12} color="#dc2626" />
                <Text className="text-[9px] font-black uppercase tracking-widest text-red-600 dark:text-red-400">
                  Danger zone
                </Text>
              </View>
              <View className="rounded-lg border border-red-500/40 bg-red-500/5 p-2">
                <TouchableOpacity
                  testID="reset-car-data"
                  accessibilityRole="button"
                  accessibilityLabel="Reset car data"
                  onPress={async () => {
                    Alert.alert(
                      "Factory reset the car?",
                      "This erases saved Wi-Fi networks, the car name and settings, and removes the car from this phone. Restart the car to finish.",
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
                  className="h-11 items-center justify-center rounded-md border border-red-500 bg-red-500/10"
                >
                  <Text className="text-[10px] font-black uppercase tracking-wide text-red-600 dark:text-red-400">
                    Reset car
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </>
      )}

      {/* A single decision picks at most one centered modal. It appears only
          after an unexpected disconnect and offers Reconnect or Cancel. */}
      {renderLinkPrompt()}
    </View>
  );
}
