// =====================================================================
// connection/ConnectionSection — the Control Panel's connection layer
// (U-68 rebuild, revised by U-69 on the owner's second review).
//
// Replaces, on the Control Panel only: ConnectionBanner, the F-59 handoff
// card, TransportPicker and RouterPanel. The drive decks, the Remote screen
// and every other page are untouched.
//
// THE SHAPE, and the three owner complaints that produced it:
//
//   status  → one bar, one truth, derived from the hub only
//   METHOD  → ONE dropdown. U-69: *"connections methods are scattered all over
//              the page. please only show one method at a time and use the drop
//              down menu for that and dont populate contents unnecessary."*
//              So there is no longer a card per method: there is one selector
//              showing the current method, and only that method's setup card.
//   setup   → the selected method's job, and nothing else
//   routers → ONE dropdown for "switch to a saved router" (six rows is
//              "overly populated"), with add/edit/remove behind one explicit
//              action — U-69: *"use the drop down menu where ever the things
//              are overly populated."*
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
  CAR_STATUS_URL,
  CAR_WS_URL,
  CONNECTION_METHODS,
  PROBE_TIMEOUT_MS,
  carIsOnOwnHotspot,
  findCarOnNetwork,
  methodOfTarget,
  normalizeRouters,
  probeCarStatus,
  planSwitch,
  resolveDial,
  subnetCandidates,
  targetUnavailableReason,
  validateRouterInput,
  type ConnectionMethodId,
  type ConnectionTarget,
  type ConnectionTargetId,
} from "./index";
import {
  ActionButton,
  ConnectionCard,
  InlineMessage,
  SelectRow,
} from "./ConnectionCard";
import { WifiPanel } from "./WifiPanel";
import type { useControlHub } from "../useControlHub";
import NetInfo from "@react-native-community/netinfo";

type Hub = ReturnType<typeof useControlHub>;

type Message = { tone: "error" | "ok" | "info"; text: string };

/**
 * U-70: the scan-result list is a BOUNDED scrolling window, not a page-ful.
 * The owner: *"the list of the bluetooth device found while scanning are too
 * long, please keep all those in a scrolling window."* Roughly five rows — the
 * page keeps its shape whatever the phone finds nearby, and the list scrolls
 * inside itself.
 */
const DEVICE_LIST_MAX_HEIGHT = 260;

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
  /** Scroll the focused input into view (F-69). */
  onInputFocus?: (y: number) => void;
  /** haptics/tap feedback, matching the rest of the page. */
  feedbackTap?: () => void;
};

export function ConnectionSection({
  hub,
  method,
  onMethodChange,
  onInputFocus,
  feedbackTap,
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
    showSppsRetry,
    wifiConnected,
    linkVerified,
    error: hubError,
    handleScan,
    handleSppsRetry,
    handleReconnectPromptCancel,
    handleConnect,
    handleDisconnect,
    handleWifiConnect,
    handleWifiDisconnect,
    requestRouter,
    runSwitchPlan,
    requestScan,
    lastRouterIp,
    routerDelete,
    // U-80: the car-switched-networks prompt + automatic discovery share this
    // handler with the WiFi method card.
    routerSwitchNotice,
    dismissRouterSwitchNotice,
    sendCommand,
  } = hub;

  const [targetId, setTargetId] = useState<ConnectionTargetId | null>(null);
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

  /** Only the SELECTED method's target is rendered (U-69). */
  const setupTarget: ConnectionTarget | null = useMemo(() => {
    if (!methodDef) return null;
    if (liveTarget && methodOfTarget(liveTarget) === methodDef.id) {
      return (
        CONNECTION_METHODS.flatMap((m) => m.targets).find(
          (t) => t.id === liveTarget,
        ) ?? null
      );
    }
    const chosen =
      targetId && methodOfTarget(targetId) === methodDef.id ? targetId : null;
    const id = chosen ?? methodDef.targets[0]?.id ?? null;
    return (
      CONNECTION_METHODS.flatMap((m) => m.targets).find((t) => t.id === id) ??
      null
    );
  }, [liveTarget, methodDef, targetId]);

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

  /**
   * U-74: dial the router lease the car last reported.
   *
   * This is the ONE piece of the "the drive deck doesn't open on the router"
   * problem that can be solved without a native module, so it is worth being
   * precise about what it is and is not. The phone loses the car when the car
   * joins a router (the hotspot moves to the router's channel — one radio, one
   * channel), so the app needs an address it did not have. The car broadcasts
   * its lease for a moment before that happens, so we remembered it, and this
   * dials it.
   *
   * It goes through the same `handleWifiConnect` every other WiFi dial uses, so
   * it is bounded, verified the same way, and reports a real failure — a lease
   * that has gone stale produces an honest error, not a fake "Connected".
   * Bypassing `resolveDial` here is deliberate and safe: `resolveDial` refuses
   * addresses that are not car-reported, and this IS a car-reported address,
   * just remembered from a moment ago.
   */
  const connectRouterLease = useCallback(
    async (ip: string) => {
      const host = ip.trim();
      if (!host) return;
      tap();
      setBusy(true);
      setMessage(null);
      try {
        const outcome = await handleWifiConnect(`ws://${host}:81`);
        setMessage(
          outcome.ok
            ? { tone: "ok", text: outcome.message }
            : {
                tone: "error",
                text:
                  outcome.reason ||
                  "Could not reach the car at that address. It may have been given a new one — check the car's screen.",
              },
        );
      } finally {
        setBusy(false);
      }
    },
    [handleWifiConnect, tap],
  );

  /**
   * U-74b: find the car on whatever network this phone is on, with no native
   * module and therefore no APK.
   *
   * Why this exists rather than the elegant fix: the car advertises
   * `genum-car.local` over mDNS (car U-74), but React Native cannot resolve a
   * `.local` name without a NATIVE MODULE, and a native module cannot be
   * delivered by an OTA. So this is the fallback that ships today — it uses two
   * things the app already has:
   *
   *   - `NetInfo` (already a dependency, already in the APK) to learn the PHONE's
   *     address, which tells us the /24 the car must be inside; and
   *   - the car's own `GET /status` on port 80 to tell our car from the router,
   *     the laptop and the printer that also answer there.
   *
   * Nothing invented: a DHCP lease is knowable exactly one way, and that is it.
   *
   * The bounds are deliberate and are the reason this is safe to leave in the
   * app: it runs only on an explicit tap, only on the user's own network, only
   * against the /24 the phone is genuinely on, only on port 80, in parallel,
   * with a short per-probe timeout, and it stops at the first hit.
   */
  const findCarOnThisNetwork = useCallback(async () => {
    tap();
    setBusy(true);
    setMessage(null);
    try {
      const state = await NetInfo.fetch();
      // Read defensively rather than narrowing: NetInfo's `details` type is a
      // loose union across transports, and only the WiFi shape carries
      // `ipAddress`. `subnetCandidates` re-validates it anyway, so anything
      // unusable simply falls through to an honest "no usable address" error.
      const details = state.details as Record<string, unknown> | undefined;
      const rawIp = details?.["ipAddress"];
      const phoneIp = typeof rawIp === "string" ? rawIp : null;
      const candidates = subnetCandidates(phoneIp);
      if (candidates.length === 0) {
        setMessage({
          tone: "error",
          text: "This phone has no usable WiFi address, so there is nothing to search. Join your router on this phone, then try again.",
        });
        return;
      }

      setMessage({
        tone: "info",
        text: `Looking for the car on your network (${candidates.length} addresses to check)...`,
      });

      const host = await findCarOnNetwork({
        candidates,
        // The AP name is what makes this work before the phone has ever paired
        // with this car - which is the case that actually matters, because the
        // phone has no profile for a car it has never seen.
        expect: { apName: "4WDCar_Wifi" },
        fetchJson: probeCarStatus,
      });

      if (!host) {
        setMessage({
          tone: "error",
          text: "No car answered on this network. Check the car's screen — it needs to be switched ON and joined to this same router.",
        });
        return;
      }

      const outcome = await handleWifiConnect(CAR_WS_URL(host));
      setMessage(
        outcome.ok
          ? { tone: "ok", text: outcome.message }
          : {
              tone: "error",
              text:
                outcome.reason ||
                `Found a car at ${host}, but the drive link did not open.`,
            },
      );
    } catch {
      setMessage({
        tone: "error",
        text: "Could not search this network. Check that this phone is on your router's WiFi, then try again.",
      });
    } finally {
      setBusy(false);
    }
  }, [handleWifiConnect, tap]);

  /**
   * Fetch one `/status`, bounded. A closed port is the expected majority, so the
   * caller treats a rejection as "not the car" rather than as an error.
   */
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
    <View className="mt-3 gap-2.5">
      {/* ---- U-97: the section had no heading (owner 2026-10-08). -------- */}
      <Text className="text-[15px] font-black text-ink">
        Connect to your car
      </Text>
      {/* ---- U-80: the car moved networks — move this phone too ----------
          Set the moment the car answers ROUTERS;USED on any transport. The
          owner asked for it SIMPLE: one line, one action, no extra screens.
          The AP link dropping during the switch is expected (one radio, one
          channel — U-74), so this prompt is exactly what the user needs when
          everything else appears to "stop working". */}
      {routerSwitchNotice ? (
        <ConnectionCard
          title={`Join "${routerSwitchNotice}"`}
          icon="wifi"
          tone="busy"
          testID="conn-phone-switch-prompt"
        >
          {/* U-86: one line, and it is an instruction the user has to act on -
              not a description of what just happened. The card title carries
              the network name, so the body does not repeat it. */}
          <Text className="text-[13px] leading-5 text-ink">
            The car is on that network now. Open this phone&apos;s Wi-Fi
            settings and join it to stay connected.
          </Text>
          <View className="mt-2 flex-row gap-2">
            <ActionButton
              flex
              label="I joined — find the car"
              icon="search"
              onPress={() => void findCarOnThisNetwork()}
              disabled={busy}
              testID="conn-phone-switch-find"
            />
            <ActionButton
              label="Dismiss"
              variant="quiet"
              onPress={() => {
                tap();
                dismissRouterSwitchNotice();
              }}
              testID="conn-phone-switch-dismiss"
            />
          </View>
        </ConnectionCard>
      ) : null}
      {/* ---- status ------------------------------------------------------ */}
      <ConnectionCard
        title="Connection"
        subtitle={statusLabel}
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
        {showSppsRetry ? (
          <View className="mt-2.5 gap-2">
            <InlineMessage tone="info">
              The car&apos;s Bluetooth link dropped. Reconnect to it?
            </InlineMessage>
            <View className="flex-row gap-2">
              <ActionButton
                flex
                label="Reconnect"
                icon="refresh-cw"
                onPress={() => void handleSppsRetry()}
                disabled={busy}
                testID="conn-bt-retry"
              />
              <ActionButton
                label="Not now"
                variant="quiet"
                onPress={() => {
                  tap();
                  handleReconnectPromptCancel();
                }}
              />
            </View>
          </View>
        ) : null}
      </ConnectionCard>

      {/* ---- U-97: THREE EQUAL METHOD CARDS, not a dropdown ---------------
          Owner (2026-10-08): *"show connection methods as three equal cards"*.
          Bluetooth, Wi-Fi and Internet are now visible and comparable at a
          glance; choosing one swaps the setup card below. This replaces the
          U-69 dropdown, which hid two thirds of the choice behind a closed
          row. Internet stays rendered (not hidden) but visibly disabled with
          its reason — a missing option is an unexplained absence. */}
      <View className="mt-1">
        <Text className="text-[11px] font-black uppercase tracking-widest text-muted">
          Connection method
        </Text>
        <View className="mt-2 flex-row gap-2" testID="conn-methods">
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
                  setTargetId(null);
                  setMessage(null);
                }}
                disabled={blocked}
                accessibilityRole="button"
                accessibilityLabel={m.label}
                accessibilityState={{ selected, disabled: blocked }}
                testID={`conn-method-${m.id}`}
                className={`min-w-0 flex-1 items-center gap-1.5 rounded-xl border p-2.5 ${
                  selected
                    ? "border-select-ink bg-select-bg"
                    : "border-line bg-card"
                } ${blocked ? "opacity-60" : "active:opacity-70"}`}
              >
                <Feather
                  name={METHOD_ICON[m.id]}
                  size={18}
                  color={selected ? "#1e3a8a" : "#475569"}
                />
                <Text
                  numberOfLines={1}
                  className={`text-[12px] font-black ${
                    selected ? "text-select-ink" : "text-ink"
                  }`}
                >
                  {m.label}
                </Text>
                <View
                  className={`h-1.5 w-1.5 rounded-full ${
                    selected && !blocked ? "bg-success" : "bg-border"
                  }`}
                />
              </Pressable>
            );
          })}
        </View>
        {methodDef && methodDef.blurb ? (
          <Text className="mt-2 text-[11px] leading-4 text-muted">
            {methodDef.blurb}
          </Text>
        ) : null}
      </View>

      {/* ---- the selected method's setup, and nothing else ---------------- */}
      {methodDef && setupTarget ? (
        <MethodSetup
          method={methodDef}
          target={setupTarget}
          busy={busy}
          hasAlternative={methodDef.targets.length > 1}
          alternativeId={
            methodDef.targets.find((t) => t.id !== setupTarget.id)?.id ?? null
          }
          onPickTarget={(id) => {
            tap();
            setTargetId(id);
          }}
          carOnRouter={carOnRouter}
          reportedSsid={reportedSsid}
          sppSupported={sppSupported}
          sppStatus={sppStatus}
          sppDevices={sppDevices}
          linkLive={anyLink}
          onScanBluetooth={() => void scanBluetooth()}
          onConnectBluetooth={connectBluetooth}
          onConnectWifi={connectWifi}
          lastRouterIp={lastRouterIp}
          onConnectRouterLease={connectRouterLease}
          onFindCarOnNetwork={findCarOnThisNetwork}
        />
      ) : null}

      {/* ---- ONE message surface for the whole section --------------------
          U-97c: moved ABOVE the Wi-Fi list. At the bottom it sat below the
          fold once the list was long, so a confirmation or a failure could be
          off-screen. One surface — but where it can actually be seen. */}
      {message ? (
        <InlineMessage tone={message.tone}>{message.text}</InlineMessage>
      ) : null}

      {/* ---- U-84: Wi-Fi is ONE list ---------------------------------------
          Owner: the Wi-Fi half was "too messy", full of "guidance text in
          subtitles", and split into a pointless "car hotspot vs home router"
          choice. Three controls did one job — the "Where is the car?" target
          dropdown, a "Connect to …" button for the chosen side, and the router
          manager's own scan/add/switch cluster — while four InlineMessages
          narrated the layout back at the user.

          All of it is now one list. Tapping a row switches the car; there is no
          second dropdown and no instruction text. The car's own hotspot stays
          visible in the same list, tagged, and is deliberately not a switch
          target (F-63).

          Shown whenever the Wi-Fi method is chosen — not only when a link is
          up — because "search for networks" is the first thing a user does,
          and it used to be hidden exactly when it was needed.

          U-96: the SAME list is the Bluetooth method's router management (the
          "Routers" target). The ROUTERS;… commands ride whatever link is live,
          so one list serves both methods. */}
      {method === "wifi" || (targetId === "bt-routers" && anyLink) ? (
        <WifiPanel
          routers={routers}
          scanned={carScan ?? []}
          busy={busy}
          reachable={anyLink}
          pendingSsid={pendingJoinSsid}
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
  hasAlternative,
  alternativeId,
  onPickTarget,
  carOnRouter,
  reportedSsid,
  sppSupported,
  sppStatus,
  sppDevices,
  linkLive,
  onScanBluetooth,
  onConnectBluetooth,
  onConnectWifi,
  lastRouterIp,
  onConnectRouterLease,
  onFindCarOnNetwork,
}: {
  method: (typeof CONNECTION_METHODS)[number];
  target: ConnectionTarget;
  busy: boolean;
  hasAlternative: boolean;
  alternativeId: ConnectionTargetId | null;
  onPickTarget: (id: ConnectionTargetId) => void;
  carOnRouter: boolean;
  reportedSsid: string | null;
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
  /** U-74: the last router lease the car reported — the one-tap way back to it
   *  after the hotspot link drops. A HINT, never an authority. */
  lastRouterIp: string | null;
  onConnectRouterLease: (ip: string) => Promise<void>;
  /** U-74b: sweep this phone's own /24 for the car. No native module. */
  onFindCarOnNetwork: () => Promise<void>;
}) {
  // U-84: the "Where is the car?" split is GONE. It asked the user to choose
  // between "The car's hotspot" and "Your home router" before they could do
  // anything, which is not a choice a person makes — a phone's Wi-Fi list does
  // not separate the hotspot from the router, it lists networks, and so does
  // this now. What remains below is the single connection action plus, for
  // Wi-Fi, the one unified list.
  if (hasAlternative && alternativeId) {
    return (
      <ConnectionCard
        title={method.label}
        icon={method.id === "bluetooth" ? "bluetooth" : "wifi"}
      >
        <SelectRow<ConnectionTargetId>
          label={
            method.id === "bluetooth"
              ? "What do you want to do?"
              : "Where is the car?"
          }
          value={target.id}
          options={method.targets.map((t) => ({
            id: t.id,
            label: t.label,
            hint: targetUnavailableReason(t.id, { carOnOwnRouter: carOnRouter })
              ? "not ready"
              : null,
          }))}
          onChange={onPickTarget}
          testID="conn-target"
        />
        <TargetBody
          target={target}
          busy={busy}
          carOnRouter={carOnRouter}
          reportedSsid={reportedSsid}
          sppSupported={sppSupported}
          sppStatus={sppStatus}
          sppDevices={sppDevices}
          linkLive={linkLive}
          onScanBluetooth={onScanBluetooth}
          onConnectBluetooth={onConnectBluetooth}
          onConnectWifi={onConnectWifi}
        />
        {/* U-84: the "Switch the car to" dropdown is GONE. It was a SECOND
            control for the one action the Wi-Fi list now performs by tapping a
            row, which is what produced "which one do I press" - and the router
            manager used to answer that question with a paragraph of guidance
            text. One list, one tap, one meaning. */}
      </ConnectionCard>
    );
  }

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
          reportedSsid={reportedSsid}
          sppSupported={sppSupported}
          sppStatus={sppStatus}
          sppDevices={sppDevices}
          linkLive={linkLive}
          onScanBluetooth={onScanBluetooth}
          onConnectBluetooth={onConnectBluetooth}
          onConnectWifi={onConnectWifi}
        />
      )}

      {/* ---- U-97b: the Wi-Fi recovery actions belong to the Wi-Fi method ---
          U-74 / U-74b (the remembered router lease + the bounded /24 sweep) are
          Wi-Fi-only: they exist because the phone loses the car when the car
          joins a router. They were previously rendered inside the Bluetooth
          branch (the only `hasAlternative` method), so they appeared in the
          Bluetooth card. They now render ONLY when the Wi-Fi method is selected
          and no link is up - one method's content never leaks into another. */}
      {method.id === "wifi" && !linkLive ? (
        <View className="mt-2.5">
          {lastRouterIp ? (
            <ActionButton
              label={`Connect to the car (${lastRouterIp})`}
              icon="link"
              onPress={() => void onConnectRouterLease(lastRouterIp)}
              disabled={busy}
              testID="conn-router-lease"
            />
          ) : (
            <ActionButton
              label="Find the car on this network"
              icon="search"
              onPress={() => void onFindCarOnNetwork()}
              disabled={busy}
              testID="conn-find-car"
            />
          )}
        </View>
      ) : null}

      {/* U-96: Bluetooth router management — switch/add/edit/delete routers over
          the live SPP link. The SAME ROUTERS;\u2026 commands the Wi-Fi panel sends,
          so the ONE unified Wi-Fi list above IS this method's router surface
          (rendered whenever the "Routers" target is picked and a link is up).
          All this card owes the user is the honest state when there is no link
          yet — the dead "Manage saved routers" button that used to live here
          did nothing at all. */}
      {target.id === "bt-routers" && !linkLive ? (
        <View className="mt-2.5">
          <InlineMessage tone="error">
            Connect to the car over Bluetooth first, then manage its routers.
          </InlineMessage>
        </View>
      ) : null}
    </ConnectionCard>
  );
}

function TargetBody({
  target,
  busy,
  carOnRouter,
  reportedSsid,
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
  reportedSsid: string | null;
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
        <View className="mt-2.5 gap-2">
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
                <View className="gap-1.5 pr-1">
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
      ) : null}

      {/* U-86: one Connect action, whatever network the car is on. */}
      {target.id === "car-wifi" ? (
        <View className="mt-2.5">
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
          {/* U-86: name the network the CAR reports, not "your home router". */}
          {carOnRouter && reportedSsid ? (
            <InlineMessage tone="ok">
              The car is on “{reportedSsid}”.
            </InlineMessage>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
