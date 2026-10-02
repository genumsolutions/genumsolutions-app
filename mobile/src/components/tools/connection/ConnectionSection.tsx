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
import { Text, TextInput, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import {
  CONNECTION_METHODS,
  canAddRouter,
  carIsOnOwnHotspot,
  defaultRouterSsid,
  methodOfTarget,
  normalizeRouters,
  planSwitch,
  resolveDial,
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

type Hub = ReturnType<typeof useControlHub>;

type Message = { tone: "error" | "ok" | "info"; text: string };

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
    routerDelete,
    routerClearAll,
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

  const disconnect = useCallback(async () => {
    tap();
    setBusy(true);
    setMessage(null);
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
          onScanBluetooth={() => void scanBluetooth()}
          onConnectBluetooth={connectBluetooth}
          onConnectWifi={connectWifi}
        />
      ) : null}

      {/* ---- routers: a property of the CONNECTION (D8) ------------------- */}
      {anyLink ? (
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
  onScanBluetooth,
  onConnectBluetooth,
  onConnectWifi,
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
  onScanBluetooth: () => void;
  onConnectBluetooth: (address: string, name?: string | null) => Promise<void>;
  onConnectWifi: (t: ConnectionTargetId) => Promise<void>;
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
          onScanBluetooth={onScanBluetooth}
          onConnectBluetooth={onConnectBluetooth}
          onConnectWifi={onConnectWifi}
        />
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

      {target.id === "bt-spp" ? (
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
          {sppDevices.length > 0 ? (
            <View className="gap-1.5">
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
          stored credentials. The dropdown is the ONLY place a switch can start,
          so there is no row anywhere that can offer it. */}
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
        <View className="mt-2">
          <SelectRow
            label="Switch the car to"
            value={null}
            options={options.map((r) => ({
              id: r.ssid,
              label: r.ssid,
              hint: r.isActive
                ? "current"
                : suggested === r.ssid
                  ? "suggested"
                  : null,
            }))}
            onChange={onSwitch}
            testID="conn-router-switch"
          />
        </View>
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
