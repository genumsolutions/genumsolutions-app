// =====================================================================
// connection/ConnectionSection — the Control Panel's connection layer
// (U-68 rebuild, revised by U-69 on the owner's second review).
//
// Replaces the retired ConnectionBanner, the F-59 handoff card and
// TransportPicker. Since the 2026-10-12 connectivity rebuild it is the ONE
// connection surface, mounted on the Remote screen's Connectivity panel and on
// the Control Panel; the old RouterPanel is deleted (U-101).
//
// THE SHAPE. On the Remote screen this is a LANDSCAPE surface, so it is a
// two-pane layout rather than one full-width column that stretches every card
// across the whole width:
//
//   status  → U-108 (owner 2026-10-13): the old full-width status+disconnect
//             bar is GONE from this panel. The ONE link status now lives in the
//             Remote chrome (right of Back), and the per-link Bluetooth / Wi-Fi
//             disconnect buttons moved to the row right below Back (testIDs
//             `remote-disconnect-bt` / `remote-disconnect-wifi`). The
//             "Connection method" box is the method only.
//   METHOD  → two compact pills. U-97: *"show connection methods as three
//             equal cards"* — visible and comparable at a glance, and only the
//             selected method's setup card renders below them. (There were
//             three; the Internet card was removed 2026-10-14 by owner
//             directive, so the row now shows Bluetooth and Wi-Fi.)
//   setup   → the selected method's job, and nothing else
//   left-bottom → the THIS-CAR inventory, always visible (M1): paired cars
//             (Bluetooth, friendly names only) or added networks (Wi-Fi).
//             READ-ONLY — it answers "what does this car know", never "do it"
//             (U-121 C2: its rows used to repeat the right pane's switch action
//             on the very same list).
//   right   → the ONE manager for BOTH methods: "Switch networks" + add
//             (over a live BT link it manages the same registry). M1 gives it
//             a fixed heading so the list never appears heading-less, and the
//             "nearby" scan rows only appear after an explicit Search. The
//             entry card for other ESP / IoT projects is GONE (owner
//             2026-10-23/24: "remove the other esp /iot projects section
//             totally") — the add form in this pane is the one way in.
//
// U-101 (owner 2026-10-12): *"the fonts are too big and the sections are hogging
// up all the space ... use the split screen in landscape view, don't elongate
// everything across the big width."* So every card/pill/row here is compact
// (smaller type and padding), and the section splits into two flex panes that
// wrap on narrow screens and sit side-by-side in landscape.
//
// Every decision comes from the pure model in this folder. This file renders it
// and calls the hub; it never holds a second opinion about what is connected
// and never produces a URL (`resolveDial` is the only thing that does).
//
// ---------------------------------------------------------------------
// U-69 — TWO REAL BUGS THE OWNER HIT, both fixed here:
//
// 1. *"the bluetooth is not build in the app and i am not able to connect the
//     device to the app to test the device."* The cause was NOT a missing
//     permission or a missing native module. `handleConnect` and
//     `handleWifiConnect` stored their failure in the hub's `error` state and
//     RETURNED NORMALLY, and their only renderer was `ConnectionBanner` — which
//     U-68 deleted. With nothing to await and nothing to read, a FAILED connect
//     resolved like a successful one and this section announced "Connected to
//     <car>". Both handlers now return a `ConnectOutcome`, and this section
//     reports what actually happened. A fake success is worse than no success:
//     it sends the tester hunting for a link that does not exist (F-61/F-62).
//
// 2. *"the text and the background are merging and the texts are not visible
//     properly. please fix the contrast too for once and for all."* The cause
//     was off-palette colours: this app's palette is semantic tokens and defines
//     no error/success/selected pair, so failure surfaces reached for
//     `text-red-600` / `bg-emerald-500/10` / `bg-sky-500/5`. Those do NOT flip
//     with the theme — readable on a white card, near-invisible on the dark one.
//     Fixed at the TOKEN level (see ConnectionCard.tsx): `danger`, `success`,
//     `select-bg` and `select-ink` now exist in all three theme blocks, and
//     this folder uses semantic tokens only.
//
//     Note also `handleScan` below: scanning is the FIRST thing a user does, and
//     if it fails the list silently stays empty — so the scan reports its own
//     outcome here rather than leaving an empty box.
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

import {
  CONNECTION_METHODS,
  carIsOnOwnHotspot,
  methodOfTarget,
  normalizeRouters,
  planSwitch,
  resolveDial,
  targetUnavailableReason,
  validateRouterInput,
  type ConnectionMethodId,
  type ConnectionTarget,
  type ConnectionTargetId,
  type RouterEntry,
} from "./index";
import { ActionButton, ConnectionCard, InlineMessage } from "./ConnectionCard";
import { WifiPanel } from "./WifiPanel";
import { describeSecondLink } from "./linkOrder";
import { CAR_MDNS_HOST } from "./discoveryPlan";
import type { useControlHub } from "../useControlHub";
// U-121 B2 (owner 2026-10-24): the fleet's own AP address — the broadcast IP
// the control page is dialled at when the car is on its hotspot (and the
// last resort when it has reported nothing yet).
import { DEFAULT_AP_IP } from "../../../services/carProtocol";

// 2026-10-23 (U-121 A2, owner: "remove this box as the whole"): the
// "This phone" row and its `formatPhoneNetwork` re-export are GONE from this
// file. The phone's own network is rendered ONCE, on the Remote's first bar
// (`remote-phone-network`); keeping a second copy here is what the owner saw as
// "duplicate messages like the words, wifi network name hidden". If the label
// looks missing, check the Remote chrome — not here.

// 2026-10-10: NetInfo / CAR_WS_URL / CAR_STATUS_URL / PROBE_TIMEOUT_MS /
// findCarOnNetwork / probeCarStatus / subnetCandidates are gone from this file.
// They existed only for `findCarOnThisNetwork`, which was a second copy of the
// hub's `findCarForUser` — same NetInfo read, same /24 sweep, same /status
// probe — and it had its own button, which is the "multiple things" the owner
// objected to. The hub's copy stays and runs automatically on both connect
// failure paths, so the discovery is still there; only the duplicate is not.

type Hub = ReturnType<typeof useControlHub>;

type Message = { tone: "error" | "ok" | "info"; text: string };

/**
 * U-70: the scan-result list is a BOUNDED scrolling window, not a page-ful.
 * The owner: *"the list of the bluetooth device found while scanning are too
 * long, please keep all those in a scrolling window."* Roughly five rows — the
 * page keeps its shape whatever the phone finds nearby, and the list scrolls
 * inside itself.
 */
const DEVICE_LIST_MAX_HEIGHT = 200;

// M1 (owner 2026-10-13): the Connectivity list and the Remote must never show
// a raw Bluetooth MAC address — that belongs on a profile/control surface, not
// here. sppService falls back to the MAC when a scan reports no friendly
// name, so a MAC-shaped string is rendered as a neutral generonym instead.
const MAC_ADDRESS_RE =
  /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$|^([0-9A-Fa-f]{2}-){5}[0-9A-Fa-f]{2}$/;

function friendlyBtDeviceName(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n || MAC_ADDRESS_RE.test(n) || n.length <= 2) return "Paired car";
  return n.replace(/_/g, " ");
}

/** The SSID this phone is currently joined to, if any (NetInfo truth). */
function phoneWifiSsid(state: NetInfoState): string | null {
  if (state.type !== "wifi" || state.isConnected !== true || !state.details) {
    return null;
  }
  const d = state.details as { ssid?: string | null };
  return typeof d.ssid === "string" && d.ssid ? d.ssid : null;
}

/** The structural subset of an SPP device the inventories need. */
type KnownBtDevice = {
  id: string;
  name: string;
  address: string;
  bonded: boolean;
};

// =====================================================================
// (U-80) probeCarStatus moved to ./discovery.ts — the hub's automatic
// discovery shares it, and the pure module is its home.
// =====================================================================

/** U-97: the icon for each method (there are exactly two). */
const METHOD_ICON: Record<
  ConnectionMethodId,
  React.ComponentProps<typeof Feather>["name"]
> = {
  bluetooth: "bluetooth",
  wifi: "wifi",
};

export type ConnectionSectionProps = {
  hub: Hub;
  /** Selected method — owned by the screen so it survives this section. */
  method: ConnectionMethodId | null;
  onMethodChange: (m: ConnectionMethodId | null) => void;
  /** Scroll the focused input into view (F-69). No argument: the host scrolls
      its own pane to keep the keyboard off the field. */
  onInputFocus?: () => void;
  /** haptics/tap feedback, matching the rest of the page. */
  feedbackTap?: () => void;
  /**
   * Phase 2 (owner 2026-10-12): this section is the ONE Connectivity panel and
   * now lives on the Remote screen, so the Wi-Fi list owns the full manager
   * (add/edit/forget) there. The Control Panel no longer mounts this section.
   * Default false keeps any reduced-mode caller honest.
   */
  manage?: boolean;
};

export function ConnectionSection({
  hub,
  method,
  onMethodChange,
  onInputFocus,
  feedbackTap,
  manage = false,
}: ConnectionSectionProps) {
  const {
    telemetry,
    carApName,
    carSsid,
    carNetworks,
    carScan,
    sppStatus,
    sppDevices,
    sppSupported,
    wifiConnected,
    // P3: the second-link raise is derived from the hub's live link facts —
    // which transport is in flight and what the car said about it.
    btLinked,
    connecting,
    connectingAddress,
    // P8 (owner item E / F-91): the user's own "Car network" answer for THIS
    // car, and the only writer that persists it into the profile.
    carNetworkHint,
    setCarNetworkHint,
    // U-121 B2 (owner 2026-10-24): the SSID half of the same card — the
    // Wi-Fi network the car is at, auto-filled from car truth, with the
    // owner's typed override as the fallback.
    carSsidAnswer,
    setCarSsidAnswer,
    // P5 (firmware 1.3.13): the car's LINK-CAPACITY verdict. `false` = the car
    // itself refused a second link; `null`/`true` = nothing denied (F-88:
    // an absent field means CAPABLE — this gate never reads a mere null).
    linkCap,
    linkVerified,
    error: hubError,
    handleScan,
    handleConnect,
    handleWifiConnect,
    requestRouter,
    runSwitchPlan,
    requestScan,
    routerDelete,
    sendCommand,
  } = hub;

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  // U-84: after the car moves to another network this phone is on the wrong
  // one, and Android will not join a network silently. Remember the target so
  // the list can say so ONCE, in one place, with one action — instead of the
  // old narration that told the user which other control to press.
  const [pendingJoinSsid, setPendingJoinSsid] = useState<string | null>(null);
  // M1 (owner 2026-10-13): the "nearby networks" scan rows only render after
  // an EXPLICIT "Search for networks" tap — never because the car broadcast
  // its own antennas' results at link-up (smart-link). Reset on method change.
  const [scanShown, setScanShown] = useState(false);
  // P8 (owner item E / F-91): the "Car network" input — edited locally,
  // saved by the guarded hub writer (which persists it per car).
  const [hintDraft, setHintDraft] = useState<string | null>(null);
  // U-121 B2: the "Wi-Fi network the car is on" input — edited locally, saved
  // by the guarded hub writer. While null the field SHOWS CAR TRUTH (below),
  // so the common case needs no typing at all.
  const [ssidDraft, setSsidDraft] = useState<string | null>(null);

  // M1: auto-sync the network section with the PHONE's network. When the
  // phone actually joins the pending router, the "Join <ssid> on this phone"
  // card is cleared by itself — no stale instruction once the phone is there.
  useEffect(() => {
    if (!pendingJoinSsid) return;
    return NetInfo.addEventListener((state) => {
      const ssid = phoneWifiSsid(state);
      if (ssid && ssid.toUpperCase() === pendingJoinSsid.toUpperCase()) {
        setPendingJoinSsid(null);
      }
    });
  }, [pendingJoinSsid]);

  const tap = useCallback(() => {
    feedbackTap?.();
  }, [feedbackTap]);

  // ---- the ONE truth about the link -------------------------------------
  const btLive = sppStatus === "connected";
  const anyLink = btLive || wifiConnected;
  // P5 (owner item F, 2026-10-17 / firmware 1.3.13): the car's own admission
  // verdict. When the car REPORTED that it cannot host a second link
  // (`linkCap === false`, strict — F-88: absent means capable) and exactly one
  // link is live (`btLive !== wifiConnected`), the next connect action would
  // raise the SECOND transport the car just refused. Disabling that action
  // with the car's own reason (the model's `targetUnavailableReason`) is
  // cheaper than starting an MQTT-refused dial; re-connecting the link that is
  // live, and the FIRST connect when nothing is up, are never gated — the car
  // never refuses those.
  const secondLinkRefused = linkCap === false && btLive !== wifiConnected;
  // P3 (owner item A, 2026-10-17): the in-flight SECOND raise, described —
  // "Wi-Fi coming up…" while it negotiates, and the CAR's own refusal as
  // soon as its LINKCAP latch reports it (a raise pending beside a refusal
  // verdict will not open; saying so beats waiting for the native failure).
  // Zero or two links live ⇒ there is no second raise ⇒ the line is null.
  const secondLink = describeSecondLink({
    btLinked,
    wifiConnected,
    connecting,
    connectingAddress,
    linkCap,
  });
  const reportedIp = telemetry.ip ?? null;
  // Car truth first (what the car is broadcasting right now), then the SSID it
  // has configured, then the owner's own answer — so the field is auto-filled
  // the moment anything real is known, and the typed answer is only what fills
  // the gap when the car cannot say (no link / stale telemetry).
  const reportedSsid = telemetry.ssid ?? carSsid ?? carSsidAnswer ?? null;
  const onOwnHotspot = carIsOnOwnHotspot({
    reportedSsid,
    ownApName: carApName,
  });
  const carOnRouter = anyLink && !onOwnHotspot && Boolean(reportedIp);
  // U-121 B2: the broadcast IP FOR THE CONTROL PAGE — the car's own AP address
  // while it sits on its hotspot, the STA IP it reports while on a router, and
  // the fleet default only as a last resort (the P8 promise in the card's
  // comment: both connection facts, auto-filled, in one place).
  const controlIp = (onOwnHotspot ? null : reportedIp) ?? DEFAULT_AP_IP;

  // U-86: Wi-Fi is one target now. The car being on its own hotspot or on a
  // router is a fact about the car, not a mode the user picks, so there is
  // nothing to choose here - the list below shows the real network names.
  // Bluetooth has two targets (connect + router management); when already
  // connected over SPP the connect target is live, and router management is
  // available as the second action.
  const liveTarget: ConnectionTargetId | null = btLive
    ? "bt-spp"
    : wifiConnected
      ? "car-wifi"
      : null;

  const methodDef = useMemo(
    () => CONNECTION_METHODS.find((m) => m.id === method) ?? null,
    [method],
  );

  /** Only the SELECTED method's own connect target is rendered (U-69). Each
      method now has exactly one, so there is no per-method choice left: the
      live link's target when it belongs to this method, otherwise the method's
      first target. */
  const setupTarget: ConnectionTarget | null = useMemo(() => {
    if (!methodDef) return null;
    if (liveTarget && methodOfTarget(liveTarget) === methodDef.id) {
      return (
        CONNECTION_METHODS.flatMap((m) => m.targets).find(
          (t) => t.id === liveTarget,
        ) ?? null
      );
    }
    return methodDef.targets[0] ?? null;
  }, [liveTarget, methodDef]);

  const routers = useMemo(
    () =>
      normalizeRouters(carNetworks, {
        ownApName: carApName,
        activeSsid: carOnRouter ? reportedSsid : null,
      }),
    [carNetworks, carApName, carOnRouter, reportedSsid],
  );

  /** Run a hub action and report its REAL outcome (U-69). */
  const runOutcome = useCallback(
    async (
      fn: () => Promise<{ ok: boolean; message?: string; reason?: string }>,
    ) => {
      setBusy(true);
      setMessage(null);
      try {
        const outcome = await fn();
        setMessage(
          outcome.ok
            ? { tone: "ok", text: outcome.message ?? "Done." }
            : { tone: "error", text: outcome.reason ?? "That did not work." },
        );
        return outcome.ok;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  // ---- connect / disconnect ---------------------------------------------

  const connectBluetooth = useCallback(
    async (address: string, name?: string | null, bonded?: boolean) => {
      tap();
      setBusy(true);
      setMessage(null);
      try {
        // U-69: the handler REPORTS. Before this it swallowed the failure and
        // resolved normally, so this function announced success on a failed
        // connect — the owner's "bluetooth is not built in the app".
        // U-97b: carry the device's REAL bonded flag. It was hardcoded false, so
        // the app never knew the car was already paired and (on the native
        // connect) could re-trigger the OS pairing dialog on every attempt.
        const outcome = await handleConnect({
          id: address,
          address,
          name: name ?? address,
          bonded: bonded === true,
        });
        // U-69 fixed: the hub now returns a ConnectOutcome, so a FAILED link
        // is impossible to mistake for success. The message card always shows
        // the REAL result of the action, never the old "Connected to <car>".
        setMessage(
          outcome.ok
            ? { tone: "ok", text: outcome.message }
            : { tone: "error", text: outcome.reason ?? "Connection failed." },
        );
      } finally {
        setBusy(false);
      }
    },
    [handleConnect, tap],
  );

  const scanBluetooth = useCallback(async () => {
    tap();
    setBusy(true);
    setMessage(null);
    try {
      await handleScan();
      setMessage(null); // the device list below is the result
    } catch (e) {
      setMessage({
        tone: "error",
        text: e instanceof Error ? e.message : "Could not search for cars.",
      });
    } finally {
      setBusy(false);
    }
  }, [handleScan, tap]);

  const connectWifi = useCallback(
    async (target: ConnectionTargetId) => {
      // D4: the ONLY place a URL is produced. Null means no honest address, and
      // the UI says why rather than dialling something.
      const dial = resolveDial({
        target,
        reportedIp,
        reportedSsid,
        ownApName: carApName,
      });
      if (!dial) {
        setMessage({
          tone: "error",
          text: "The car has not reported an address yet.",
        });
        return;
      }
      tap();
      setBusy(true);
      setMessage(null);
      try {
        const outcome = await handleWifiConnect(dial.url);
        setMessage(
          outcome.ok
            ? { tone: "ok", text: outcome.message }
            : { tone: "error", text: outcome.reason ?? "Connection failed." },
        );
      } finally {
        setBusy(false);
      }
    },
    [carApName, handleWifiConnect, reportedIp, reportedSsid, tap],
  );

  // ---- router actions, all through the ack-consuming API ----------------

  const switchRouter = useCallback(
    async (ssid: string) => {
      tap();
      const plan = planSwitch({
        target: ssid,
        entries: routers,
        ownApName: carApName,
      });
      if (!plan) {
        setMessage({
          tone: "error",
          text: "That network cannot be switched to.",
        });
        return;
      }
      const ok = await runOutcome(() => runSwitchPlan(plan));
      // U-84: the phone is on the old network now, so record what to join.
      // Only on a real outcome - never optimistically, or a refused switch
      // would tell the user to follow a network the car never joined.
      if (ok) setPendingJoinSsid(ssid);
    },
    [carApName, routers, runOutcome, runSwitchPlan, tap],
  );

  const deleteRouter = useCallback(
    async (ssid: string) => {
      tap();
      // U-93: ONE command, ONE answer. This used to call `routerDelete`
      // (which sent the DEL line itself) AFTER the ack path had already sent
      // it — the car received the same DEL twice and answered
      // `ROUTERS;ERROR;Not saved:<ssid>` the second time: a working delete
      // reporting failure. The ack path alone sends; `consumeRouterAnswer`
      // derives the mirror from the CONFIRMED answer; this final mirror call
      // only tidies local state that the answer may not cover (offline).
      const ok = await runOutcome(() => requestRouter({ kind: "del", ssid }));
      if (ok) routerDelete(ssid);
    },
    [requestRouter, routerDelete, runOutcome, tap],
  );

  // U-93 (owner: *"not able to edit those"*): Edit = set a NEW password for
  // the saved name. The car treats ADD as an upsert by SSID (U-88 bench:
  // "ADD again → ADDED"), so the plan is the switch plan with a password —
  // an ADD step (the upsert) followed by the USE confirmation.
  const editRouter = useCallback(
    async (ssid: string, newPass: string) => {
      tap();
      const plan = planSwitch({
        target: ssid,
        pass: newPass,
        entries: routers,
        ownApName: carApName,
      });
      if (!plan) {
        setMessage({ tone: "error", text: "That network cannot be edited." });
        return;
      }
      const ok = await runOutcome(() => runSwitchPlan(plan));
      if (ok) {
        setMessage({
          tone: "ok",
          text: `Password for “${ssid}” saved on the car.`,
        });
      }
    },
    [carApName, routers, runOutcome, runSwitchPlan, tap],
  );

  // U-84: "clear all" is gone. It was reachable only from the old manager's
  // Manage card, and a bulk destructive action does not belong in a list whose
  // whole point is that each row does one obvious thing. Removing a network is
  // a per-row action now.

  const scanNearby = useCallback(async () => {
    tap();
    const ok = await runOutcome(() => requestScan());
    // M1: the car acknowledged the search — only then do the found networks
    // earn rows (owner 2026-10-13: nearby beacons must not appear otherwise).
    if (ok) setScanShown(true);
  }, [requestScan, runOutcome, tap]);

  // -----------------------------------------------------------------------
  // STATUS — U-108: this panel no longer draws a status bar.
  // The ONE link status lives in the Remote chrome (right of Back); the panel is
  // method / setup / inventory only. `anyLink` and `btLive` stay for the
  // reachability gates below.
  // -----------------------------------------------------------------------

  // Only paired/known devices for Bluetooth — no scan results list.
  // Pairing is done in phone Settings; the app observes bonded devices.
  // U-120 Phase D (owner item 6, 2026-10-22): "the list of the paired device
  // contains dummy name paired car which is not needed." friendlyBtDeviceName
  // INVENTS "Paired car" for a device with no usable name (empty, a raw MAC —
  // sppService falls back to the MAC when the OS reports no name — or ≤2
  // chars). Those invented placeholders ARE the dummy rows: exclude exactly
  // them, so every remaining row shows a real name. (The previous guard tested
  // `d.address`, which is ALWAYS a MAC — it emptied the whole list.)
  const knownDevices = sppDevices.filter(
    (d) => d.bonded && friendlyBtDeviceName(d.name) !== "Paired car",
  );

  return (
    // 2026-10-24 (owner: "some of the sections got increased in the space twice
    // or more … during rectification"): the section's own top margin is GONE.
    // Its only host (the Remote's Connectivity panel) already gives the pane
    // padding:10, so this mt-2 stacked on top of it — 18 px above the method
    // row where every other gap on the panel is 6-8 px. The panes' gap does the
    // spacing; the host owns the outer edge.
    <View className="flex-wrap flex-row items-start gap-2">
      {/* U-108 (owner 2026-10-13): the status + disconnect strip that used to
          sit here is gone — the link status is in the Remote chrome (right of
          Back) and the Bluetooth / Wi-Fi disconnect buttons are on the row
          right below Back (`remote-disconnect-bt` / `remote-disconnect-wifi`).
          This panel is method / setup / inventory only. */}

      {/* ── LEFT pane: method select + setup + the this-car inventory ── */}
      <View className="min-w-[210px] w-[42%] max-w-[300px] flex-1 gap-2">
        {/* M1: the method row is the METHOD ONLY — no status text, no
            disconnect, no Bluetooth details (all in the strip above). */}

        {/* U-97: the two methods, equal cards. Choosing one swaps the setup
            card below (and the right pane follows). */}
        <View className="flex-row gap-1.5" testID="conn-methods">
          {CONNECTION_METHODS.map((m) => {
            const selected = m.id === method;
            return (
              <Pressable
                key={m.id}
                onPress={() => {
                  if (selected) return;
                  tap();
                  onMethodChange(m.id);
                  setMessage(null);
                  // M1: a method swap is a fresh surface — drop the explicit
                  // scan rows and any stale "join this network" instruction.
                  setScanShown(false);
                  setPendingJoinSsid(null);
                }}
                accessibilityRole="button"
                accessibilityLabel={m.label}
                accessibilityState={{ selected }}
                testID={`conn-method-${m.id}`}
                className={`min-w-0 flex-1 items-center gap-1 rounded-lg border px-1.5 py-1.5 ${
                  selected
                    ? "border-select-ink bg-select-bg"
                    : "border-line bg-card"
                } active:opacity-70`}
              >
                <Feather
                  name={METHOD_ICON[m.id]}
                  size={13}
                  color={selected ? "#1e3a8a" : "#475569"}
                />
                <Text
                  numberOfLines={1}
                  className={`text-[10px] font-black ${
                    selected ? "text-select-ink" : "text-ink"
                  }`}
                >
                  {m.label}
                </Text>
                <View
                  className={`h-1 w-1 rounded-full ${
                    selected ? "bg-success" : "bg-border"
                  }`}
                />
              </Pressable>
            );
          })}
        </View>

        {methodDef && setupTarget ? (
          <MethodSetup
            method={methodDef}
            target={setupTarget}
            busy={busy}
            carOnRouter={carOnRouter}
            sppSupported={sppSupported}
            sppStatus={sppStatus}
            secondLinkRefused={secondLinkRefused}
            onScanBluetooth={() => void scanBluetooth()}
            onConnectBluetooth={connectBluetooth}
            onConnectWifi={connectWifi}
          />
        ) : null}

        {/* P3: the in-flight second-link raise, named while it runs. Tone
            follows the car's verdict: a REPORTED refusal (F-88: only an
            explicit `false` can say this) is an error, a plain pending raise
            is information. */}
        {secondLink.line ? (
          <InlineMessage tone={secondLink.refusedByCar ? "error" : "info"}>
            {secondLink.line}
          </InlineMessage>
        ) : null}

        {/* ONE message surface for the whole section — it sits at the top of
            the LEFT pane so a confirmation or a failure is never below the
            fold of either pane. */}
        {message ? (
          <InlineMessage tone={message.tone}>{message.text}</InlineMessage>
        ) : null}

        {/* ── LEFT-bottom inventory: what THIS car knows, ALWAYS visible
            (M1, owner 2026-10-13: the paired list must not vanish when a link
            comes up — it lives in the left-bottom half, with the switch/add
            tools in the right half feeding it). */}
        {method === "bluetooth" ? (
          <BtInventory
            devices={knownDevices}
            busy={busy}
            onConnect={connectBluetooth}
          />
        ) : method === "wifi" ? (
          <AddedNetworksInventory routers={routers} />
        ) : null}
      </View>

      {/* ── RIGHT pane: the manager. M1 (owner 2026-10-13): BOTH Wi-Fi and
          Bluetooth render the SAME "Switch networks" surface (over BT it
          manages the same registry through the live link), with a fixed
          heading — the network list never appears "with no heading" again —
          and it is the ONLY place a network can be switched, added, edited or
          forgotten (the left-bottom inventory only displays them). Nearby scan
          rows appear only after an explicit Search (WifiPanel `showScanned`).
          The "Other ESP / IoT projects" entry card is deleted per the owner
          (2026-10-23/24); the in-place add form below is the way in. */}
      <View className="min-w-[240px] min-w-0 flex-1 gap-1.5">
        {method === "wifi" || method === "bluetooth" ? (
          <>
            <Text className="text-[10px] font-black uppercase tracking-widest text-navy">
              {manage ? "Switch networks" : "Networks"}
            </Text>

            <WifiPanel
              routers={routers}
              scanned={carScan ?? []}
              busy={busy}
              reachable={anyLink}
              pendingSsid={pendingJoinSsid}
              manage={manage}
              showScanned={scanShown}
              sendCmd={sendCommand}
              onSwitch={(s) => void switchRouter(s)}
              onForget={(s) => void deleteRouter(s)}
              onEdit={(s, p) => void editRouter(s, p)}
              onAdd={(ssid, pass) =>
                void (async () => {
                  const plan = planSwitch({
                    target: ssid,
                    pass,
                    entries: routers,
                    ownApName: carApName,
                  });
                  if (!plan) {
                    setMessage({
                      tone: "error",
                      text: "That network cannot be used.",
                    });
                    return;
                  }
                  const ok = await runOutcome(() => runSwitchPlan(plan));
                  if (ok) {
                    setPendingJoinSsid(ssid);
                    setMessage({
                      tone: "ok",
                      text: `The car is switching to “${ssid}”.`,
                    });
                  }
                })()
              }
              onScan={() => void scanNearby()}
              onInputFocus={onInputFocus}
            />

            {/* P8 (owner item E / F-91) + owner 2026-10-23: the car-network
                section now shows BOTH where the car is AND the broadcast IP for
                the control page, in the same card. The wifi network the car is
                at is picked by NAME from the car's own list (its own hotspot
                first, then every saved router); the broadcast IP is read from
                the car and autofilled most of the time (the car's own AP
                address when it is on the hotspot, its reported STA IP when it
                is on a router, the fleet default only as a last resort). */}
            <View
              className="rounded-lg border border-line bg-card p-2"
              testID="car-network-card"
            >
              <View className="flex-row items-center gap-1">
                <Feather name="map-pin" size={12} color="#475569" />
                <Text className="text-[10px] font-black text-ink">
                  Car network
                </Text>
                {carNetworkHint || carSsidAnswer ? (
                  <Text className="ml-auto text-[9px] font-bold text-success">
                    saved
                  </Text>
                ) : null}
              </View>

              {/* U-121 B2 (owner 2026-10-24): *"add the feature of the entering
                  the wifi network the car is at for the user along with the
                  broadcast ip address for the control and most of the time set
                  automatically and auto filled too"* — BOTH facts, in this one
                  card, auto-filled most of the time:
                    1. THE CAR'S WI-FI NETWORK — editable, persisted per car
                       (carSsidAnswer), auto-filled from car truth so the
                       common case needs no typing;
                    2. THE BROADCAST IP FOR THE CONTROL — read-only, read from
                       the car, the fleet default only as a last resort (never
                       a free-text guess: the car uses it to find its own WS
                       client, not to be reconfigured). */}
              <Text className="mt-1.5 text-[10px] font-black text-ink">
                The car is on
              </Text>
              <View className="mt-0.5 flex-row items-center gap-1.5">
                <TextInput
                  value={ssidDraft ?? reportedSsid ?? ""}
                  onChangeText={setSsidDraft}
                  onFocus={onInputFocus}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="the network the car is on"
                  placeholderTextColor="#94a3b8"
                  className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-[11px] text-ink"
                  testID="car-network-ssid-input"
                />
                <Feather
                  name="check"
                  size={16}
                  color="#1e3a8a"
                  onPress={() => {
                    tap();
                    setCarSsidAnswer(ssidDraft ?? "");
                    setSsidDraft(null);
                    setMessage({
                      tone: "ok",
                      text: (ssidDraft ?? "").trim()
                        ? "Car's network saved — used whenever the car cannot report it."
                        : "Car's network cleared — the app follows the car's own report.",
                    });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Save the car's Wi-Fi network"
                  testID="car-network-ssid-save"
                />
              </View>
              <Text className="mt-0.5 text-[9px] leading-3 text-muted">
                {reportedSsid
                  ? `Auto-filled from the car ("${reportedSsid}") — type only when it cannot say.`
                  : "The car has not reported it yet — type the network it is on."}
              </Text>

              <View
                className="mt-1.5 flex-row items-center gap-1"
                testID="car-network-ip"
              >
                <Feather name="radio" size={11} color="#475569" />
                <Text className="text-[10px] font-black text-ink">
                  Control address
                </Text>
                <Text
                  numberOfLines={1}
                  className="ml-auto text-[10px] font-bold text-navy"
                >
                  {controlIp}
                </Text>
              </View>
              <Text className="mt-0.5 text-[9px] leading-3 text-muted">
                The broadcast IP the control page is dialled at — read from the
                car whenever it reports one.
              </Text>

              <Text className="mt-1.5 text-[10px] leading-3 text-muted">
                Where is the car? Its IP or name (e.g. 192.168.1.42 or{" "}
                {CAR_MDNS_HOST}). Discovery looks here first; empty = let the
                app find it automatically.
              </Text>
              <View className="mt-1 flex-row items-center gap-1.5">
                <TextInput
                  value={hintDraft ?? carNetworkHint ?? ""}
                  onChangeText={setHintDraft}
                  onFocus={onInputFocus}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="IP or hostname"
                  placeholderTextColor="#94a3b8"
                  className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-[11px] text-ink"
                  testID="car-network-input"
                />
                <Feather
                  name="check"
                  size={16}
                  color="#1e3a8a"
                  onPress={() => {
                    tap();
                    setCarNetworkHint(hintDraft ?? "");
                    setHintDraft(null);
                    setMessage({
                      tone: "ok",
                      text: (hintDraft ?? "").trim()
                        ? "Car network saved — discovery will look there first."
                        : "Car network cleared — discovery is automatic again.",
                    });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Save the car network"
                  testID="car-network-save"
                />
              </View>
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

// =====================================================================
// BtInventory — the paired/known cars, ALWAYS visible left-bottom.
// Friendly names only (M1: no raw hex MAC here — that belongs on a profile
// surface). U-70's bounded window is kept: a long paired list scrolls inside
// its own box and never stretches the page ("the list of the bluetooth device
// found while scanning are too long, please keep all those in a scrolling
// window").
// =====================================================================
function BtInventory({
  devices,
  busy,
  onConnect,
}: {
  devices: readonly KnownBtDevice[];
  busy: boolean;
  onConnect: (
    address: string,
    name?: string | null,
    bonded?: boolean,
  ) => Promise<void>;
}) {
  return (
    <View className="gap-1" testID="conn-bt-paired">
      <Text className="text-[10px] font-black uppercase tracking-widest text-navy">
        Paired cars
      </Text>
      {devices.length === 0 ? (
        <Text className="py-0.5 text-[11px] text-muted">
          No paired cars here yet — scan to find the car.
        </Text>
      ) : (
        <ScrollView
          className="overflow-hidden rounded-lg border border-line bg-card"
          style={{ maxHeight: DEVICE_LIST_MAX_HEIGHT }}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          {devices.map((d, i) => (
            <Pressable
              key={d.id}
              onPress={() => void onConnect(d.id, d.name, d.bonded)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Connect to ${friendlyBtDeviceName(d.name)}`}
              accessibilityState={{ disabled: busy }}
              testID={`conn-bt-device-${d.id}`}
              className={`flex-row items-center gap-1.5 px-2 py-2 ${
                i === 0 ? "" : "border-t border-line"
              }`}
            >
              <Feather name="bluetooth" size={12} color="#1e3a8a" />
              <Text
                numberOfLines={1}
                className="min-w-0 flex-1 text-[12px] font-semibold text-ink"
              >
                {friendlyBtDeviceName(d.name)}
              </Text>
              <Text className="shrink-0 text-[10px] text-muted">Paired</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// =====================================================================
// AddedNetworksInventory — the networks THIS CAR has added (its own hotspot +
// every saved router), always visible left-bottom for the Wi-Fi method, so
// the car's own relationship never disappears once a link is up. M1: only
// added/saved names — scan results live in the right pane's Switch networks,
// behind an explicit Search.
//
// U-121 C2 (owner 2026-10-24: "remove … duplicates and unnecessary thing"): it
// is READ-ONLY now. Its rows used to be a second set of tap-to-switch buttons
// for the SAME `routers` the right pane already manages — two lists, one list
// of actions, on the same screen. The inventory answers "what does this car
// know"; the right pane is the only place that DOES anything to it. Nothing is
// lost: every row's switch is one pane over, always rendered.
// =====================================================================
function AddedNetworksInventory({
  routers,
}: {
  routers: readonly RouterEntry[];
}) {
  return (
    <View className="gap-1" testID="conn-added-networks">
      <Text className="text-[10px] font-black uppercase tracking-widest text-navy">
        Added networks
      </Text>
      {routers.length === 0 ? (
        <Text className="py-0.5 text-[11px] text-muted">
          No networks added yet — add one from the list on the right.
        </Text>
      ) : (
        <ScrollView
          className="overflow-hidden rounded-lg border border-line bg-card"
          style={{ maxHeight: DEVICE_LIST_MAX_HEIGHT }}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          {routers.map((r, i) => {
            return (
              <View
                key={r.ssid}
                accessibilityRole="text"
                accessibilityLabel={`${r.ssid}, ${
                  r.isActive ? "connected" : r.isOwnAp ? "car hotspot" : "saved"
                }`}
                testID={`conn-added-network-${r.ssid}`}
                className={`flex-row items-center gap-1.5 px-2 py-2 ${
                  i === 0 ? "" : "border-t border-line"
                }`}
              >
                <Feather
                  name={r.isActive ? "check-circle" : "wifi"}
                  size={12}
                  color={r.isActive ? "#059669" : "#1e3a8a"}
                />
                <Text
                  numberOfLines={1}
                  className={`min-w-0 flex-1 text-[12px] ${
                    r.isActive ? "font-bold text-ink" : "font-semibold text-ink"
                  }`}
                >
                  {r.ssid}
                </Text>
                <Text className="shrink-0 text-[10px] text-muted">
                  {r.isActive
                    ? "Connected"
                    : r.isOwnAp
                      ? "Car hotspot"
                      : "Saved"}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

// =====================================================================
// MethodSetup — the selected method's card. Nothing from any other method.
// =====================================================================

function MethodSetup({
  method,
  target,
  busy,
  carOnRouter,
  sppSupported,
  sppStatus,
  secondLinkRefused,
  onScanBluetooth,
  onConnectBluetooth,
  onConnectWifi,
}: {
  method: (typeof CONNECTION_METHODS)[number];
  target: ConnectionTarget;
  busy: boolean;
  carOnRouter: boolean;
  sppSupported: boolean;
  sppStatus: string;
  /** P5: the raise this card offers would be the car-refused SECOND link. */
  secondLinkRefused: boolean;
  onScanBluetooth: () => void;
  onConnectBluetooth: (
    address: string,
    name?: string | null,
    bonded?: boolean,
  ) => Promise<void>;
  onConnectWifi: (t: ConnectionTargetId) => Promise<void>;
}) {
  // U-84: the "Where is the car?" split is GONE, and 2026-10-12 the Bluetooth
  // "What do you want to do?" chooser is gone with it. Each method now renders
  // ONE connect card on the LEFT; the router / "switch to" list lives on the
  // RIGHT pane (the section renders it for both Wi-Fi AND Bluetooth). One
  // action per method, one list — the same shape for both, exactly like the
  // phone's own Wi-Fi settings.
  return (
    <ConnectionCard
      title={method.label}
      icon={method.id === "bluetooth" ? "bluetooth" : "wifi"}
      tone="busy"
      testID={`conn-setup-${method.id}`}
    >
      <TargetBody
        target={target}
        busy={busy}
        carOnRouter={carOnRouter}
        sppSupported={sppSupported}
        sppStatus={sppStatus}
        secondLinkRefused={secondLinkRefused}
        onScanBluetooth={onScanBluetooth}
        onConnectBluetooth={onConnectBluetooth}
        onConnectWifi={onConnectWifi}
      />

      {/* 2026-10-10 (owner: "it show multiple things like connect and find
          the car on the network ..."). The two buttons that used to sit here -
          "Connect to the car (<ip>)" and "Find the car on this network" - were
          redundant, not extra capability: handleWifiConnect already runs the
          same remembered-lease + /24 sweep on BOTH failure paths (refused and
          half-open), and resolveDial already dials the car-reported lease.
          Connect is now the single action, and it covers what both did. */}

      {/* 2026-10-12: the Bluetooth router surface moved OUT of this card — the
          SAME networks list (ROUTERS;… commands over the live link) now always
          renders in the section's RIGHT pane for Bluetooth, mirroring Wi-Fi. */}
    </ConnectionCard>
  );
}

function TargetBody({
  target,
  busy,
  carOnRouter,
  sppSupported,
  sppStatus,
  secondLinkRefused,
  onScanBluetooth,
  onConnectBluetooth,
  onConnectWifi,
}: {
  target: ConnectionTarget;
  busy: boolean;
  carOnRouter: boolean;
  sppSupported: boolean;
  sppStatus: string;
  /** P5: the raise this card offers would be the car-refused SECOND link. */
  secondLinkRefused: boolean;
  onScanBluetooth: () => void;
  onConnectBluetooth: (
    address: string,
    name?: string | null,
    bonded?: boolean,
  ) => Promise<void>;
  onConnectWifi: (t: ConnectionTargetId) => Promise<void>;
}) {
  const unavailable = targetUnavailableReason(target.id, {
    carOnOwnRouter: carOnRouter,
    // P5: a second-link raise the CAR refused is offered with the reason,
    // not as a button that can only fail (same F-65 discipline as the
    // needs-car-on-router reason below).
    linkCapRefused: secondLinkRefused,
  });

  // P6 / issue 1 (2026-10-16): the Bluetooth scan is hidden only when
  // BLUETOOTH is the live link — NOT when any link is. The old shared gate
  // (`!linkLive` = "no link up at all") hid the scan the moment Wi-Fi
  // connected, so a phone sitting on the car's own hotspot could never raise
  // the Bluetooth transport as the SECOND link — which is exactly the dual
  // link issue 1 asks for. Wi-Fi is the mirror case: its Connect button is
  // never gated on Bluetooth.
  const btLive = sppStatus === "connected";

  return (
    <View>
      {/* U-84: the per-target "requirement" paragraph is gone. It was guidance
          text describing the control directly beneath it — the owner named
          subtitles like this as part of the mess. If a target genuinely cannot
          be used, TargetBody says why in place, where it applies. */}
      {target.id === "bt-spp" && !btLive ? (
        <View className="mt-2 gap-1.5">
          {/* U-69: if classic Bluetooth is not in this build, say so HERE with
              the reason, instead of offering a button that can only fail. */}
          {sppSupported === false ? (
            <InlineMessage tone="error">
              Classic Bluetooth is not available in this build of the app. It
              needs the latest APK — an update over Wi-Fi cannot add it. Use
              WiFi (LAN) in the meantime.
            </InlineMessage>
          ) : (
            <ActionButton
              label={sppStatus === "scanning" ? "Searching…" : "Find my car"}
              icon="bluetooth"
              onPress={onScanBluetooth}
              disabled={
                busy || sppStatus === "scanning" || Boolean(unavailable)
              }
              testID="conn-bt-scan"
            />
          )}
          {/* P5: the car refused the second link — say WHY before the button
              (an F-65 message, not a silent disabled control). */}
          {unavailable ? (
            <InlineMessage tone="info">{unavailable}</InlineMessage>
          ) : null}
          {/* The found-device LIST is not rendered here (U-70 put it in the
              RIGHT pane, M1 then moved it to the left-bottom BtInventory where
              "the paired list must not vanish when a link comes up"). This
              card is the ONE action; keeping a list comment here as a warning,
              because every earlier layout left a copy of the list behind when
              it moved. */}
        </View>
      ) : null}
      {/* U-86: one Connect action, whatever network the car is on. */}
      {target.id === "car-wifi" ? (
        <View className="mt-2">
          <ActionButton
            label="Connect"
            icon="wifi"
            onPress={() => void onConnectWifi(target.id)}
            disabled={busy || Boolean(unavailable)}
            testID={`conn-wifi-connect-${target.id}`}
          />
          {unavailable ? (
            <InlineMessage tone="info">{unavailable}</InlineMessage>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
