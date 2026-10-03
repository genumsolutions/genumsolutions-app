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
import { ScrollView, Text, TextInput, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import {
  CAR_STATUS_URL,
  CAR_WS_URL,
  CONNECTION_METHODS,
  PROBE_TIMEOUT_MS,
  canAddRouter,
  carIsOnOwnHotspot,
  defaultRouterSsid,
  findCarOnNetwork,
  methodOfTarget,
  normalizeRouters,
  probeCarStatus,
  planSwitch,
  resolveDial,
  subnetCandidates,
  switchableRouters,
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
    routerClearAll,
    // U-80: the car-switched-networks prompt + automatic discovery share this
    // handler with the WiFi method card.
    routerSwitchNotice,
    dismissRouterSwitchNotice,
  } = hub;

  const [targetId, setTargetId] = useState<ConnectionTargetId | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

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

  /** The target that is live RIGHT NOW — derived, never remembered. */
  const liveTarget: ConnectionTargetId | null = btLive
    ? "bt-spp"
    : wifiConnected
      ? onOwnHotspot
        ? "car-hotspot"
        : "home-router"
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
  const switchable = switchableRouters(routers);

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
    async (address: string, name?: string | null) => {
      tap();
      setBusy(true);
      setMessage(null);
      try {
        // U-69: the handler REPORTS. Before this it swallowed the failure and
        // resolved normally, so this function announced success on a failed
        // connect — the owner's "bluetooth is not built in the app".
        const outcome = await handleConnect({
          id: address,
          address,
          name: name ?? address,
          bonded: false,
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
          text:
            target === "home-router"
              ? "The car has not told us an address on your router yet. Switch it from its own hotspot first."
              : "There is no address to connect to yet.",
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
      await runOutcome(() => runSwitchPlan(plan));
    },
    [carApName, routers, runOutcome, runSwitchPlan, tap],
  );

  const deleteRouter = useCallback(
    async (ssid: string) => {
      tap();
      const ok = await runOutcome(() => requestRouter({ kind: "del", ssid }));
      if (ok) routerDelete(ssid);
    },
    [requestRouter, routerDelete, runOutcome, tap],
  );

  const clearAll = useCallback(async () => {
    tap();
    const ok = await runOutcome(() => requestRouter({ kind: "clear" }));
    if (ok) routerClearAll();
  }, [requestRouter, routerClearAll, runOutcome, tap]);

  const scanNearby = useCallback(async () => {
    tap();
    await runOutcome(() => requestScan());
  }, [requestScan, runOutcome, tap]);

  // -----------------------------------------------------------------------
  // STATUS — one bar, one truth
  // -----------------------------------------------------------------------
  const statusLabel = !anyLink
    ? "Not connected"
    : liveTarget === "bt-spp"
      ? `Bluetooth · ${sppStatusMsg || "the car"}`
      : liveTarget === "car-hotspot"
        ? `Car's hotspot · ${carApName ?? "the car's Wi-Fi"}`
        : `Home router · ${reportedSsid ?? "your router"}`;

  return (
    <View className="mt-3 gap-2.5">
      {/* ---- U-80: the car moved networks — move this phone too ----------
          Set the moment the car answers ROUTERS;USED on any transport. The
          owner asked for it SIMPLE: one line, one action, no extra screens.
          The AP link dropping during the switch is expected (one radio, one
          channel — U-74), so this prompt is exactly what the user needs when
          everything else appears to "stop working". */}
      {routerSwitchNotice ? (
        <ConnectionCard
          title="The car switched networks"
          subtitle={`It is joining "${routerSwitchNotice}" now`}
          icon="wifi"
          tone="busy"
          testID="conn-phone-switch-prompt"
        >
          <InlineMessage tone="info">
            Join <Text className="font-bold">{routerSwitchNotice}</Text> on this
            phone&apos;s WiFi settings, then reconnect here. This is expected —
            the car&apos;s hotspot drops while it moves to the router.
          </InlineMessage>
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
      >
        {linkVerified ? (
          <InlineMessage tone="ok">
            The car is answering on this link.
          </InlineMessage>
        ) : anyLink ? (
          <InlineMessage tone="info">
            Connecting… the car has not answered yet.
          </InlineMessage>
        ) : null}
        {/* U-69: the hub's own error had NO surface once ConnectionBanner was
            deleted, which is how a failed connect became invisible. It is
            rendered here so no failure can be silent again. */}
        {!anyLink && hubError ? (
          <InlineMessage tone="error">{hubError}</InlineMessage>
        ) : null}
        {anyLink ? (
          <View className="mt-2.5">
            <ActionButton
              label="Disconnect"
              variant="quiet"
              icon="power"
              onPress={() => void disconnect()}
              disabled={busy}
              testID="conn-disconnect"
            />
          </View>
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

      {/* ---- ONE method dropdown (U-69) ---------------------------------- */}
      <SelectRow<ConnectionMethodId>
        label="Connection method"
        value={method}
        options={CONNECTION_METHODS.map((m) => ({
          id: m.id,
          label: m.label,
          hint: m.targets.length > 1 ? `${m.targets.length} ways` : null,
        }))}
        onChange={(id) => {
          tap();
          onMethodChange(id);
          setTargetId(null);
          setMessage(null);
        }}
        testID="conn-method"
      />

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
          switchableSsid={switchable.map((r) => ({
            ssid: r.ssid,
            isActive: r.isActive,
          }))}
          onSwitchRouter={(s) => void switchRouter(s)}
        />
      ) : null}

      {/* ---- routers: WiFi ONLY (U-72) ------------------------------------
          Owner verbatim: *"keep the wifi things seperate from the bluetooth ones
          and dont mix the section in the control panel page"* and *"the other
          wifi router other than the own hotspot has no need to switch from the
          bluetooth mode. so please remove those unnecessary thing on that
          instant."*

          So this is gated on the SELECTED METHOD being WiFi, not on "is anything
          connected". In the Bluetooth view there is now no WiFi content at all:
          no saved-router list, no scan, no add form, and no way to begin a
          router switch from a Bluetooth session. That reverses the U-68 decision
          (D8/F-66) to expose router management on every method — defensible on
          capability grounds, since the commands do ride a Bluetooth link, but
          not what the user asked for, and a panel that shows WiFi machinery while
          you are connected over Bluetooth invites exactly the "which link is
          this using" confusion the rebuild was meant to remove. The CAPABILITY
          is untouched; only the OFFERING is separated. */}
      {method === "wifi" && anyLink ? (
        <RouterManager
          routers={routers}
          suggested={defaultRouterSsid(routers)}
          canAdd={canAddRouter(routers)}
          busy={busy}
          scanned={carScan ?? []}
          ownApName={carApName}
          onSwitch={(s) => void switchRouter(s)}
          onDelete={(s) => void deleteRouter(s)}
          onClearAll={() => void clearAll()}
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
                setMessage({
                  tone: "ok",
                  text: `Saved "${ssid}" and switching to it.`,
                });
              }
            })()
          }
          onScanNearby={() => void scanNearby()}
          onInputFocus={onInputFocus}
        />
      ) : null}

      {/* ---- ONE message surface for the whole section -------------------- */}
      {message ? (
        <InlineMessage tone={message.tone}>{message.text}</InlineMessage>
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
  switchableSsid,
  onSwitchRouter,
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
  onConnectBluetooth: (address: string, name?: string | null) => Promise<void>;
  onConnectWifi: (t: ConnectionTargetId) => Promise<void>;
  /** U-74: the last router lease the car reported — the one-tap way back to it
   *  after the hotspot link drops. A HINT, never an authority. */
  lastRouterIp: string | null;
  onConnectRouterLease: (ip: string) => Promise<void>;
  /** U-74b: sweep this phone's own /24 for the car. No native module. */
  onFindCarOnNetwork: () => Promise<void>;
  /** U-73: the saved routers, offered HERE so switching lives in ONE place. */
  switchableSsid: readonly { ssid: string; isActive: boolean }[];
  onSwitchRouter: (ssid: string) => void;
}) {
  // U-69: WiFi LAN has TWO targets, so it uses the same dropdown rule as
  // everything else rather than two buttons that both look tappable.
  if (hasAlternative && alternativeId) {
    return (
      <ConnectionCard title={method.label} subtitle={method.blurb} icon="wifi">
        <SelectRow<ConnectionTargetId>
          label="Where is the car?"
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
        {/*
          U-74 (2026-10-02), owner: *"the drive deck doesnt open when on other
          router is selected"*. When the car joins your router its hotspot moves
          to that router's channel - one radio, one channel - so this phone loses
          the link, and with no link the app has no address for the car. That is
          the whole reason the deck will not open, and it is not fixable in this
          screen alone.

          What IS fixable today, with no native module and no APK: the car
          broadcasts its router lease on the hotspot link for a moment before the
          drop, so we REMEMBER it. When the link is down but we know an address,
          offer it as one tap - once the phone is on the router. It is a HINT, not
          an authority: if it does not answer, the error says so plainly rather
          than pretending.
        */}
        {!linkLive && lastRouterIp ? (
          <View className="mt-2.5">
            <ActionButton
              label={`Connect to the car on your router (${lastRouterIp})`}
              icon="link"
              onPress={() => void onConnectRouterLease(lastRouterIp)}
              disabled={busy}
              testID="conn-router-lease"
            />
            <InlineMessage tone="info">
              Your phone left the car&apos;s hotspot when the car moved to your
              router. Join that router on this phone first, then tap the button
              above.
            </InlineMessage>
          </View>
        ) : null}
        {/* U-74b: no remembered lease, but we KNOW a car is reachable on this
            network (the Access-point tab connects to it), so its address is
            knowable in principle. Find it by sweeping this phone's own /24 -
            no native module, so no APK. */}
        {!linkLive && !lastRouterIp ? (
          <View className="mt-2.5">
            <ActionButton
              label="Find the car on this network"
              icon="search"
              onPress={() => void onFindCarOnNetwork()}
              disabled={busy}
              testID="conn-find-car"
            />
            <InlineMessage tone="info">
              Your phone is on the car&apos;s own hotspot. Join your router on
              this phone first, then tap the button above and the app will look
              for the car.
            </InlineMessage>
          </View>
        ) : null}
        {switchableSsid.length > 0 ? (
          <View className="mt-2.5">
            <SelectRow
              label="Switch the car to"
              value={null}
              options={switchableSsid.map((r) => ({
                id: r.ssid,
                label: r.ssid,
                hint: r.isActive ? "current" : null,
              }))}
              onChange={onSwitchRouter}
              testID="conn-router-switch"
            />
          </View>
        ) : null}
      </ConnectionCard>
    );
  }

  return (
    <ConnectionCard
      title={method.label}
      subtitle={method.unavailable ?? method.blurb}
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
  onConnectBluetooth: (address: string, name?: string | null) => Promise<void>;
  onConnectWifi: (t: ConnectionTargetId) => Promise<void>;
}) {
  const unavailable = targetUnavailableReason(target.id, {
    carOnOwnRouter: carOnRouter,
  });

  return (
    <View>
      <InlineMessage tone="info">{target.requirement}</InlineMessage>

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
                      onPress={() => void onConnectBluetooth(d.id, d.name)}
                      testID={`conn-bt-device-${d.id}`}
                    />
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : null}
        </View>
      ) : null}

      {target.id === "car-hotspot" || target.id === "home-router" ? (
        <View className="mt-2.5">
          <ActionButton
            label={`Connect to ${target.label.toLowerCase()}`}
            icon="wifi"
            onPress={() => void onConnectWifi(target.id)}
            disabled={busy || Boolean(unavailable)}
            testID={`conn-wifi-connect-${target.id}`}
          />
          {unavailable ? (
            <InlineMessage tone="info">{unavailable}</InlineMessage>
          ) : null}
          {target.id === "home-router" && carOnRouter && reportedSsid ? (
            <InlineMessage tone="ok">
              The car says it is on “{reportedSsid}”.
            </InlineMessage>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// =====================================================================
// RouterManager — available on EVERY method (D8), crowded things collapsed
// into dropdowns (U-69).
// =====================================================================

function RouterManager({
  routers,
  suggested,
  canAdd,
  busy,
  scanned,
  ownApName,
  onSwitch,
  onDelete,
  onClearAll,
  onAdd,
  onScanNearby,
  onInputFocus,
}: {
  routers: ReturnType<typeof normalizeRouters>;
  suggested: string | null;
  canAdd: boolean;
  busy: boolean;
  scanned: readonly { ssid: string; rssi: number; open: boolean }[];
  ownApName: string | null;
  onSwitch: (ssid: string) => void;
  onDelete: (ssid: string) => void;
  onClearAll: () => void;
  onAdd: (ssid: string, pass: string) => void;
  onScanNearby: () => void;
  onInputFocus?: (y: number) => void;
}) {
  const [ssid, setSsid] = useState("");
  const [pass, setPass] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const options = switchableRouters(routers);
  const ownAp = routers.find((r) => r.isOwnAp);
  const validation = validateRouterInput(ssid, pass, { ownApName: ownApName });

  const submit = () => {
    if (!validation.ok) {
      setFieldError(validation.reason);
      return;
    }
    setFieldError(null);
    onAdd(ssid.trim(), pass);
    // The password is never kept after it has been handed to the car (W-14).
    setPass("");
    setSsid("");
    setEditing(null);
    setShowForm(false);
  };

  return (
    <ConnectionCard
      title="The car's routers"
      subtitle={`${options.length} saved`}
      icon="list"
      testID="conn-routers"
    >
      {/* D1: the own AP is shown as the always-available default and is NEVER
          an option in the switch dropdown — switching to it is what erased the
          stored credentials. The dropdown in the connection card above is the
          ONLY place a switch can start, so no row here can offer it either. */}
      <InlineMessage tone="info">
        {ownAp
          ? `${ownAp.ssid} is always available if no router works.`
          : "The car's own hotspot stays available as a fallback."}
      </InlineMessage>

      {options.length === 0 ? (
        <InlineMessage tone="info">
          No routers saved on the car yet. Add one — the car keeps it after a
          power cycle.
        </InlineMessage>
      ) : (
        // U-73 (2026-10-02), owner: *"in the wifi lan method instant, there are
        // still confusing thing in the screen"* / *"the switching the router"*.
        // TWO controls both switched the router — one in the connection card and
        // one down here in the manager — so a single action appeared twice with
        // different wording and different hints, which is exactly the
        // "which one do I press" confusion. The SWITCH now lives only in the
        // connection card, directly under where the car is; this card only
        // MANAGES the list. One place to switch, one place to manage.
        <InlineMessage tone="info">
          {options.length} saved. Use &quot;Switch the car to&quot; in the card
          above to change which one the car joins.
        </InlineMessage>
      )}

      {/* scan — honest about needing the car (D3) */}
      <View className="mt-2.5">
        <ActionButton
          label="Find networks near the car"
          variant="quiet"
          icon="radio"
          onPress={onScanNearby}
          disabled={busy}
          testID="conn-scan"
        />
        {scanned.length > 0 ? (
          <View className="mt-2">
            <SelectRow
              label="Networks the car can see"
              value={null}
              options={scanned.map((n) => ({
                id: n.ssid,
                label: n.ssid,
                hint: `${n.rssi} dBm${n.open ? "" : " · locked"}`,
              }))}
              onChange={(id) => {
                setSsid(id);
                setShowForm(true);
              }}
              testID="conn-scanned"
            />
          </View>
        ) : null}
      </View>

      {/* ONE action opens the form, so the page is not a wall of inputs (U-69) */}
      {showForm ? (
        <View className="mt-2.5 gap-2" testID="conn-add-form">
          <Text className="text-[11px] font-bold text-ink">
            {editing ? `Edit “${editing}”` : "Add a router"}
          </Text>
          <View onLayout={(e) => onInputFocus?.(e.nativeEvent.layout.y)}>
            <TextInput
              value={ssid}
              onChangeText={(v) => {
                setSsid(v);
                setFieldError(null);
              }}
              placeholder="Router name"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Router name"
              maxLength={40}
              returnKeyType="next"
              className="h-11 rounded-lg border border-line bg-card px-3 text-[14px] text-ink"
              testID="conn-ssid"
            />
          </View>
          <View onLayout={(e) => onInputFocus?.(e.nativeEvent.layout.y)}>
            <TextInput
              value={pass}
              onChangeText={(v) => {
                setPass(v);
                setFieldError(null);
              }}
              placeholder="Password (blank if open)"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              accessibilityLabel="Router password"
              maxLength={72}
              returnKeyType="done"
              onSubmitEditing={submit}
              className="h-11 rounded-lg border border-line bg-card px-3 text-[14px] text-ink"
              testID="conn-pass"
            />
          </View>
          {fieldError ? (
            <InlineMessage tone="error">{fieldError}</InlineMessage>
          ) : null}
          <View className="flex-row gap-2">
            <ActionButton
              flex
              label={editing ? "Save and switch" : "Save and switch"}
              icon="check"
              onPress={submit}
              disabled={busy || !ssid.trim()}
              testID="conn-add-submit"
            />
            <ActionButton
              label="Cancel"
              variant="quiet"
              onPress={() => {
                setShowForm(false);
                setEditing(null);
                setSsid("");
                setPass("");
                setFieldError(null);
              }}
            />
          </View>
        </View>
      ) : (
        <View className="mt-2.5 flex-row gap-2">
          <ActionButton
            flex
            label="Add a router"
            icon="plus"
            onPress={() => {
              setShowForm(true);
              setEditing(null);
              setSsid("");
              setPass("");
              setFieldError(null);
            }}
            disabled={!canAdd}
            testID="conn-add-open"
          />
          {options.length > 0 ? (
            <ActionButton
              label="Remove"
              variant="danger"
              onPress={() => setEditing(options[0]!.ssid)}
              disabled={busy}
              testID="conn-edit-open"
            />
          ) : null}
        </View>
      )}

      {/* Manage (edit / delete / clear) — behind one explicit action so the
          common path stays short (U-69: don't populate unnecessary content). */}
      {options.length > 0 ? (
        <ManageRouters
          options={options}
          busy={busy}
          onStartEdit={(s) => {
            setEditing(s);
            setSsid(s);
            setPass("");
            setShowForm(true);
          }}
          onDelete={onDelete}
          onClearAll={onClearAll}
        />
      ) : null}
    </ConnectionCard>
  );
}

function ManageRouters({
  options,
  busy,
  onStartEdit,
  onDelete,
  onClearAll,
}: {
  options: readonly { ssid: string; isActive: boolean }[];
  busy: boolean;
  onStartEdit: (ssid: string) => void;
  onDelete: (ssid: string) => void;
  onClearAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <View className="mt-2.5 gap-2">
      <ActionButton
        label={open ? "Done" : "Manage saved routers"}
        variant="quiet"
        icon="settings"
        onPress={() => setOpen((v) => !v)}
        testID="conn-manage-toggle"
      />
      {open ? (
        <>
          <SelectRow
            label="Choose a router"
            value={picked}
            options={options.map((r) => ({
              id: r.ssid,
              label: r.ssid,
              hint: r.isActive ? "current" : null,
            }))}
            onChange={setPicked}
            testID="conn-manage-pick"
          />
          {picked ? (
            <View className="flex-row gap-2">
              <ActionButton
                flex
                label="Edit password"
                variant="quiet"
                onPress={() => {
                  onStartEdit(picked);
                  setOpen(false);
                }}
                disabled={busy}
              />
              <ActionButton
                flex
                label="Remove"
                variant="danger"
                onPress={() => {
                  onDelete(picked);
                  setPicked(null);
                }}
                disabled={busy}
                testID="conn-manage-delete"
              />
            </View>
          ) : null}
          <ActionButton
            label="Remove every router"
            variant="danger"
            onPress={onClearAll}
            disabled={busy}
            testID="conn-clear-all"
          />
          <InlineMessage tone="info">
            Removing every router also puts the car back on its own network.
          </InlineMessage>
        </>
      ) : null}
    </View>
  );
}
