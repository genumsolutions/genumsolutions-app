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
//   status  → one bar, one truth, derived from the hub only
//   METHOD  → three compact pills. U-97: *"show connection methods as three
//             equal cards"* — visible and comparable at a glance, and only the
//             selected method's setup card renders below them. Internet stays
//             rendered but visibly disabled with its reason.
//   setup   → the selected method's job, and nothing else
//   routers → the ONE unified networks list, in the RIGHT pane (it doubles as
//             Bluetooth router management). Kept narrow and bounded so it does
//             not elongate across the screen.
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

import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

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
    sppStatusMsg,
    sppDevices,
    sppSupported,
    wifiConnected,
    linkVerified,
    error: hubError,
    handleScan,
    handleConnect,
    handleDisconnect,
    handleWifiConnect,
    handleWifiDisconnect,
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

  const disconnect = useCallback(async () => {
    try {
      if (btLive) await handleDisconnect();
      if (wifiConnected) await handleWifiDisconnect();
      setMessage({ tone: "info", text: "Disconnected." });
    } finally {
      setBusy(false);
    }
  }, [btLive, handleDisconnect, handleWifiDisconnect, tap, wifiConnected]);

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
    await runOutcome(() => requestScan());
  }, [requestScan, runOutcome, tap]);

  // -----------------------------------------------------------------------
  // STATUS — one bar, one truth
  // -----------------------------------------------------------------------
  // U-86: the status names the network the CAR reports, never a generic
  // "home router" - that phrase is exactly what the owner objected to, because
  // it was shown even when the car was joined to something else.
  const statusLabel = !anyLink
    ? "Not connected"
    : liveTarget === "bt-spp"
      ? `Bluetooth · ${sppStatusMsg || "the car"}`
      : onOwnHotspot
        ? `Car hotspot · ${carApName ?? "the car's Wi-Fi"}`
        : `Wi-Fi · ${reportedSsid ?? "the car's network"}`;

  return (
    <View className="mt-2 flex-row flex-wrap items-start gap-2">
      {/* ── LEFT pane: one truth + the chosen method ── */}
      <View className="min-w-[220px] flex-1 gap-2">
        {/* ---- status ------------------------------------------------------ */}
        <ConnectionCard
          title="Connection"
          icon="radio"
          tone={!anyLink ? "idle" : linkVerified ? "live" : "busy"}
          testID="conn-status"
          // U-98: the disconnect action lives on the TITLE row (the card's
          // `right` slot), not as a loose full-width button under the status
          // text — the card owns its own action, so the body stays status-only.
          right={
            anyLink ? (
              <ActionButton
                compact
                label="Disconnect"
                variant="quiet"
                icon="power"
                onPress={() => void disconnect()}
                disabled={busy}
                testID="conn-disconnect"
              />
            ) : null
          }
        >
          {/* U-86: "The car is answering on this link." removed. The status line above
              already says Connected / Not connected with the network name, so
              this restated it in a second place with different words. */}
          {anyLink && !linkVerified ? (
            <InlineMessage tone="info">Connecting…</InlineMessage>
          ) : null}
          {/* U-69: the hub's own error had NO surface once ConnectionBanner was
              deleted, which is how a failed connect became invisible. It is
              rendered here so no failure can be silent again. */}
          {!anyLink && hubError ? (
            <InlineMessage tone="error">{hubError}</InlineMessage>
          ) : null}
        </ConnectionCard>

        {/* ---- U-97: THREE COMPACT METHOD PILLS -------------------------------
            Owner (2026-10-08): *"show connection methods as three equal cards"*.
            Bluetooth, Wi-Fi and Internet are now visible and comparable at a
            glance; choosing one swaps the setup card below. This replaces the
            U-69 dropdown, which hid two thirds of the choice behind a closed
            row. Internet stays rendered (not hidden) but visibly disabled with
            its reason — a missing option is an unexplained absence. */}
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
            sppDevices={sppDevices}
            linkLive={anyLink}
            onScanBluetooth={() => void scanBluetooth()}
            onConnectBluetooth={connectBluetooth}
            onConnectWifi={connectWifi}
          />
        ) : null}

        {/* ---- ONE message surface for the whole section --------------------
            U-97c: moved ABOVE the Wi-Fi list. At the bottom it sat below the
            fold once the list was long, so a confirmation or a failure could be
            off-screen. One surface — but where it can actually be seen. */}
        {message ? (
          <InlineMessage tone={message.tone}>{message.text}</InlineMessage>
        ) : null}
      </View>

      {/* ── RIGHT pane: the ONE networks list ──
          2026-10-12 (owner): Bluetooth gets the SAME split as Wi-Fi — connect
          on the left, the networks / "switch to" list on the right — so the
          Bluetooth view is no longer one full-width column. The list is the
          SAME ROUTERS;… surface (it doubles as Bluetooth router management);
          when no link is up it shows its honest empty state. */}
      {method === "wifi" || method === "bluetooth" ? (
        <View className="min-w-[240px] flex-1 gap-1.5">
          {/* The caption belongs HERE — above the list it names. */}
          <Text className="text-[10px] font-black uppercase tracking-widest text-navy">
            Available networks
          </Text>
          <WifiPanel
            routers={routers}
            scanned={carScan ?? []}
            busy={busy}
            reachable={anyLink}
            pendingSsid={pendingJoinSsid}
            manage={manage}
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
        </View>
      ) : null}
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
  sppDevices,
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
  sppDevices: readonly { id: string; name: string; bonded?: boolean }[];
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
          sppDevices={sppDevices}
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
  sppDevices,
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
  sppDevices: readonly { id: string; name: string; bonded?: boolean }[];
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
          {/*
            U-70 (2026-10-02): *"the list of the bluetooth device found while
            scanning are too long, please keep all those in a scrolling window.
            and also the list shoulnt be displayed when connected to any one of
            those devices."*

            Two fixes, both about the list being a page-ful rather than a
            control:
              - a BOUNDED scrolling window (maxHeight + its own ScrollView), so
                twenty nearby devices cannot push the rest of the page off the
                screen. The outer page ScrollView cannot do this job: a nested
                vertical scroller of unbounded height just grows forever.
              - hidden entirely once a link is up, along with the scan button. A
                scan list next to a live connection is not information, it is a
                way to connect a SECOND car to a session that already has one.
          */}
          {sppDevices.length > 0 ? (
            <View
              className="mt-1"
              testID="conn-bt-list"
              style={{ maxHeight: DEVICE_LIST_MAX_HEIGHT }}
            >
              <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
              >
                <View className="gap-1 pr-1">
                  {sppDevices.map((d) => (
                    <ConnectionCard
                      key={d.id}
                      title={d.name || d.id}
                      subtitle={d.bonded ? "Paired" : d.id}
                      onPress={() =>
                        void onConnectBluetooth(d.id, d.name, d.bonded)
                      }
                      testID={`conn-bt-device-${d.id}`}
                    />
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : null}
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
