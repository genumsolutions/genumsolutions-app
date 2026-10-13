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
//   METHOD  → three compact pills. U-97: *"show connection methods as three
//             equal cards"* — visible and comparable at a glance, and only the
//             selected method's setup card renders below them. Internet stays
//             rendered but visibly disabled with its reason.
//   setup   → the selected method's job, and nothing else
//   left-bottom → the THIS-CAR inventory, always visible (M1): paired cars
//             (Bluetooth, friendly names only) or added networks (Wi-Fi).
//   right   → the ONE manager for BOTH methods: "Switch networks" + add
//             (over a live BT link it manages the same registry), plus the
//             entry card for other ESP / IoT projects. M1 gives it a fixed
//             heading so the list never appears heading-less, and the "nearby"
//             scan rows only appear after an explicit Search.
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
import type { useControlHub } from "../useControlHub";

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

/** U-97: the icon for each of the three methods (there are exactly three). */
const METHOD_ICON: Record<
  ConnectionMethodId,
  React.ComponentProps<typeof Feather>["name"]
> = {
  bluetooth: "bluetooth",
  wifi: "wifi",
  internet: "globe",
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
  // M1: bumped by the "Other ESP / IoT projects" card to open the add form.
  const [iotAddTick, setIotAddTick] = useState(0);

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
  const reportedIp = telemetry.ip ?? null;
  const reportedSsid = telemetry.ssid ?? carSsid ?? null;
  const onOwnHotspot = carIsOnOwnHotspot({
    reportedSsid,
    ownApName: carApName,
  });
  const carOnRouter = anyLink && !onOwnHotspot && Boolean(reportedIp);

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
      method now has exactly one (or, for Internet, none), so there is no
      per-method choice left: the live link's target when it belongs to this
      method, otherwise the method's first target. */
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
        setMessage(
          outcome.ok
            ? { tone: "ok", text: outcome.message }
            : { tone: "error", text: outcome.reason },
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
            : { tone: "error", text: outcome.reason },
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
  // STATUS — U-108 (owner 2026-10-13): this panel no longer draws a status bar.
  // The ONE link status lives in the Remote chrome (right of Back); the panel is
  // method / setup / inventory only. `anyLink` and `btLive` stay for the
  // reachability gates below.
  // -----------------------------------------------------------------------

  // Only paired/known devices for Bluetooth — no scan results list.
  // Pairing is done in phone Settings; the app observes bonded devices.
  const knownDevices = sppDevices.filter((d) => d.bonded);

  return (
    <View className="mt-2 flex-wrap flex-row items-start gap-2">
      {/* U-108 (owner 2026-10-13): the status + disconnect strip that used to
          sit here is gone — the link status is in the Remote chrome (right of
          Back) and the Bluetooth / Wi-Fi disconnect buttons are on the row
          right below Back (`remote-disconnect-bt` / `remote-disconnect-wifi`).
          This panel is method / setup / inventory only. */}

      {/* ── LEFT pane: method select + setup + the this-car inventory ── */}
      <View className="min-w-[210px] w-[42%] max-w-[300px] flex-1 gap-2">
        {/* M1: the method row is the METHOD ONLY — no status text, no
            disconnect, no Bluetooth details (all in the strip above). */}
        <Text className="text-[10px] font-black uppercase tracking-widest text-navy">
          Connection method
        </Text>

        {/* U-97: the three methods, equal cards. Choosing one swaps the setup
            card below (and the right pane follows). */}
        <View className="flex-row gap-1.5" testID="conn-methods">
          {CONNECTION_METHODS.map((m) => {
            const selected = m.id === method;
            const blocked = Boolean(m.unavailable);
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
                disabled={blocked}
                accessibilityRole="button"
                accessibilityLabel={m.label}
                accessibilityState={{ selected, disabled: blocked }}
                testID={`conn-method-${m.id}`}
                className={`min-w-0 flex-1 items-center gap-1 rounded-lg border px-1.5 py-1.5 ${
                  selected
                    ? "border-select-ink bg-select-bg"
                    : "border-line bg-card"
                } ${blocked ? "opacity-60" : "active:opacity-70"}`}
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
                    selected && !blocked ? "bg-success" : "bg-border"
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
            linkLive={anyLink}
            onScanBluetooth={() => void scanBluetooth()}
            onConnectBluetooth={connectBluetooth}
            onConnectWifi={connectWifi}
          />
        ) : null}

        {/* ONE message surface for the whole section — above the right pane so a
            confirmation or a failure is never below the fold. */}
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
          <AddedNetworksInventory
            routers={routers}
            reachable={anyLink}
            busy={busy}
            onSwitch={(s) => void switchRouter(s)}
          />
        ) : null}
      </View>

      {/* ── RIGHT pane: the manager. M1 (owner 2026-10-13): BOTH Wi-Fi and
          Bluetooth render the SAME "Switch networks" surface (over BT it
          manages the same registry through the live link), with a fixed
          heading — the network list never appears "with no heading" again —
          plus add-connection for other ESP / IoT projects. Nearby scan rows
          appear only after an explicit Search (WifiPanel `showScanned`).
          Internet: its honest reason, nothing else. */}
      <View className="min-w-[240px] min-w-0 flex-1 gap-1.5">
        {method === "internet" ? (
          <View className="rounded-lg border border-line bg-card p-2">
            <InlineMessage tone="info">
              {methodDef?.unavailable ?? "Not available yet."}
            </InlineMessage>
          </View>
        ) : method === "wifi" || method === "bluetooth" ? (
          <>
            <Text className="text-[10px] font-black uppercase tracking-widest text-navy">
              Switch networks
            </Text>

            <WifiPanel
              routers={routers}
              scanned={carScan ?? []}
              busy={busy}
              reachable={anyLink}
              pendingSsid={pendingJoinSsid}
              manage={manage}
              showScanned={scanShown}
              addRequestKey={iotAddTick}
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

            {/* M1: the honest entry for other ESP / IoT projects — a network
                saved here is kept ON THE CAR, and any ESP in the fleet can
                switch to it. The button opens the same add form above. */}
            <IotEntryCard onAdd={() => setIotAddTick((t) => t + 1)} />
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
// =====================================================================
function AddedNetworksInventory({
  routers,
  reachable,
  busy,
  onSwitch,
}: {
  routers: readonly RouterEntry[];
  reachable: boolean;
  busy: boolean;
  onSwitch: (ssid: string) => void;
}) {
  return (
    <View className="gap-1" testID="conn-added-networks">
      <Text className="text-[10px] font-black uppercase tracking-widest text-navy">
        Added networks
      </Text>
      {routers.length === 0 ? (
        <Text className="py-0.5 text-[11px] text-muted">
          No networks added yet — add one under Switch networks.
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
            const canTap = reachable && !busy && !r.isActive;
            return (
              <Pressable
                key={r.ssid}
                onPress={() => {
                  if (canTap) onSwitch(r.ssid);
                }}
                disabled={!canTap}
                accessibilityRole="button"
                accessibilityLabel={
                  r.isActive ? `${r.ssid}, connected` : `Use ${r.ssid}`
                }
                accessibilityState={{ disabled: !canTap }}
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
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

// =====================================================================
// IotEntryCard — the honest entry for other ESP / IoT projects (M1). A
// network saved here is kept ON THE CAR, and any ESP in the fleet can switch
// to it; the button opens the same add form in the right pane. This is the
// "add connection for other projects" surface the owner asked for, without
// inventing a second manager.
// =====================================================================
function IotEntryCard({ onAdd }: { onAdd: () => void }) {
  return (
    <View
      className="rounded-lg border border-line bg-card p-2"
      testID="conn-iot-entry"
    >
      <View className="flex-row items-center gap-1.5">
        <Feather name="cpu" size={12} color="#475569" />
        <Text className="min-w-0 flex-1 text-[11px] font-black text-ink">
          Other ESP / IoT projects
        </Text>
      </View>
      <Text className="mt-0.5 text-[10px] leading-3 text-muted">
        A network saved here is kept on the car, and any ESP on the fleet can
        switch to it — this is the connection point for multi-ESP projects.
      </Text>
      <Pressable
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel="Add a network for this or another project"
        className="mt-1 flex-row items-center gap-1"
        testID="conn-iot-add"
      >
        <Feather name="plus" size={11} color="#1e3a8a" />
        <Text className="text-[11px] font-bold text-navy">Add a network</Text>
      </Pressable>
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
  linkLive,
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
  /** U-70: a link is already up, so the scan affordances must be hidden. */
  linkLive: boolean;
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
      tone={method.unavailable ? "idle" : "busy"}
      testID={`conn-setup-${method.id}`}
    >
      {method.unavailable ? (
        <InlineMessage tone="info">{method.unavailable}</InlineMessage>
      ) : (
        <TargetBody
          target={target}
          busy={busy}
          carOnRouter={carOnRouter}
          sppSupported={sppSupported}
          sppStatus={sppStatus}
          linkLive={linkLive}
          onScanBluetooth={onScanBluetooth}
          onConnectBluetooth={onConnectBluetooth}
          onConnectWifi={onConnectWifi}
        />
      )}

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
  linkLive,
  onScanBluetooth,
  onConnectBluetooth,
  onConnectWifi,
}: {
  target: ConnectionTarget;
  busy: boolean;
  carOnRouter: boolean;
  sppSupported: boolean;
  sppStatus: string;
  /** U-70: a link is already up, so the scan affordances must be hidden. */
  linkLive: boolean;
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
  });

  return (
    <View>
      {/* U-84: the per-target "requirement" paragraph is gone. It was guidance
          text describing the control directly beneath it — the owner named
          subtitles like this as part of the mess. If a target genuinely cannot
          be used, TargetBody says why in place, where it applies. */}
      {target.id === "bt-spp" && !linkLive ? (
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
              disabled={busy || sppStatus === "scanning"}
              testID="conn-bt-scan"
            />
          )}
          {/* U-70: the FOUND-device LIST moved to the section's RIGHT pane
              (2026-10-12): left = the method + this one action, right = the
              method's own results. Paired/added devices render above the scroll,
              the rest behind one bounded window; and the whole list hides once a
              link is up (connecting a second car to a live session is not a
              wanted state). */}
        </View>
      ) : null}{" "}
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
