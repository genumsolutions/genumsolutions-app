// =====================================================================
// connection/ConnectionSection — the Control Panel's connection layer,
// rebuilt (U-68, 2026-10-02).
//
// Replaces, on the Control Panel only: ConnectionBanner, the F-59 handoff
// card, TransportPicker and RouterPanel. The drive decks, the Remote screen
// and every other page are untouched (owner was explicit).
//
// WHY A REBUILD AND NOT A FIX — five defects, all live at once, four of them
// invisible from the UI:
//
//  D1  The car leads its router list with its OWN AP. The old flow's
//      "Yes, join it" used `carNetworks[0]`, so it fired
//      `ROUTERS;USE;4WDCar_Wifi` — which the firmware answers by ERASING the
//      stored credentials and reverting the car to its own AP. The user asks
//      to switch to the router; the app switches the car back to itself.
//  D2  Every `ROUTERS;*` answer was discarded, so a failed add looked exactly
//      like a successful one and the form cleared itself on a timer.
//  D4  Selecting the home-router method while disconnected blind-dialled the
//      car's AP address — the hotspot the switch was meant to leave.
//  D8  Router management was mounted for exactly one method, so on Bluetooth
//      or the car's own hotspot there was no way to add or switch a router at
//      all, even though the commands ride any live link.
//  U1  Four different card shapes on one page, each with its own behaviour.
//
// THE SHAPE, bottom-up (the owner asked for it "from the bottom"):
//
//   status  → one bar, one truth, computed from the hub only
//   method  → three uniform cards, from the pure model
//   setup   → ONE card whose body is the selected target's job
//   routers → available on EVERY method, because it is a property of the
//             connection and not of one method
//
// Every decision is made by the pure model in this folder. This file only
// renders it and calls the hub. It never holds a second opinion about what is
// connected, and it never produces a URL — `dial.resolveDial` is the only
// thing that does.
// =====================================================================

import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
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
  timeoutOutcome,
  validateRouterInput,
  type ConnectionMethodId,
  type ConnectionTarget,
  type ConnectionTargetId,
} from "./index";
import { ActionButton, ConnectionCard, InlineMessage } from "./ConnectionCard";
import type { useControlHub } from "../useControlHub";

type Hub = ReturnType<typeof useControlHub>;

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
    showSppsRetry,
    wifiConnected,
    linkVerified,
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
  const [message, setMessage] = useState<{
    tone: "error" | "ok" | "info";
    text: string;
  } | null>(null);

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

  // Which target is live RIGHT NOW, derived from the link — never a stored
  // preference. A stale selection must not be able to claim a link is up.
  const liveTarget: ConnectionTargetId | null = btLive
    ? "bt-spp"
    : wifiConnected
      ? onOwnHotspot
        ? "car-hotspot"
        : "home-router"
      : null;

  // The target being SET UP: the live one if there is one, else the one the
  // user picked in this method, else the method's only/first target.
  const methodTargets = useMemo(
    () => CONNECTION_METHODS.find((m) => m.id === method)?.targets ?? [],
    [method],
  );
  const setupTarget: ConnectionTarget | null = useMemo(() => {
    if (liveTarget && methodOfTarget(liveTarget) === method) {
      return (
        CONNECTION_METHODS.flatMap((m) => m.targets).find(
          (t) => t.id === liveTarget,
        ) ?? null
      );
    }
    if (targetId && methodOfTarget(targetId) === method) {
      return (
        CONNECTION_METHODS.flatMap((m) => m.targets).find(
          (t) => t.id === targetId,
        ) ?? null
      );
    }
    return methodTargets[0] ?? null;
  }, [liveTarget, method, methodTargets, targetId]);

  const routers = useMemo(
    () =>
      normalizeRouters(carNetworks, {
        ownApName: carApName,
        activeSsid: carOnRouter ? reportedSsid : null,
      }),
    [carNetworks, carApName, carOnRouter, reportedSsid],
  );
  const switchable = switchableRouters(routers);
  const suggested = defaultRouterSsid(routers);

  const tap = useCallback(() => {
    feedbackTap?.();
  }, [feedbackTap]);

  const run = useCallback(
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
        await handleConnect({
          id: address,
          address,
          name: name ?? address,
          bonded: false,
        });
        setMessage({ tone: "ok", text: `Connected to ${name || address}.` });
      } catch (e) {
        setMessage({
          tone: "error",
          text: e instanceof Error ? e.message : "Could not connect.",
        });
      } finally {
        setBusy(false);
      }
    },
    [handleConnect, tap],
  );

  const connectWifi = useCallback(
    async (target: ConnectionTargetId) => {
      // D4: the ONLY place a URL is produced. Null means there is no honest
      // address, and the UI must say why rather than dial something.
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
        await handleWifiConnect(dial.url);
        setMessage({ tone: "ok", text: "Connected." });
      } catch (e) {
        setMessage({
          tone: "error",
          text: e instanceof Error ? e.message : "Could not connect.",
        });
      } finally {
        setBusy(false);
      }
    },
    [carApName, handleWifiConnect, reportedIp, reportedSsid, tap],
  );

  const disconnect = useCallback(async () => {
    tap();
    setBusy(true);
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
      await run(() => runSwitchPlan(plan));
    },
    [carApName, routers, run, runSwitchPlan, tap],
  );

  const deleteRouter = useCallback(
    async (ssid: string) => {
      tap();
      // Ask the car first, then mirror — the old path cleared the row first
      // and reported nothing, so a refused delete looked like a success.
      const ok = await run(() => requestRouter({ kind: "del", ssid }));
      if (ok) routerDelete(ssid);
    },
    [requestRouter, routerDelete, run, tap],
  );

  const clearAll = useCallback(async () => {
    tap();
    const ok = await run(() => requestRouter({ kind: "clear" }));
    if (ok) routerClearAll();
  }, [requestRouter, routerClearAll, run, tap]);

  const scanNearby = useCallback(async () => {
    tap();
    await run(() => requestScan());
  }, [requestScan, run, tap]);

  // -----------------------------------------------------------------------
  // STATUS — one bar, one truth
  // -----------------------------------------------------------------------
  const statusLabel = !anyLink
    ? "Not connected"
    : liveTarget === "bt-spp"
      ? `Bluetooth · ${deviceTitle()}`
      : liveTarget === "car-hotspot"
        ? `Car's hotspot · ${carApName ?? "the car's Wi-Fi"}`
        : `Home router · ${reportedSsid ?? "your router"}`;
  const statusTone = !anyLink ? "idle" : linkVerified ? "live" : "busy";

  function deviceTitle(): string {
    return sppStatusMsg || sppDevices.find((d) => d.bonded)?.name || "the car";
  }

  return (
    <View className="mt-3 gap-2.5">
      {/* ---- status ------------------------------------------------------ */}
      <ConnectionCard
        title="Connection"
        subtitle={statusLabel}
        icon="radio"
        tone={statusTone}
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
        {/* The Bluetooth auto-reconnect prompt, kept (it is a real feature) but
            moved INTO the one status surface. It used to be a fifth card
            stacked between the banner and the picker with its own styling and
            its own button shapes — the F-67 complaint, exactly. */}
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

      {/* ---- the three methods ------------------------------------------- */}
      {CONNECTION_METHODS.map((m) => {
        const isMethod = method === m.id;
        const methodLive =
          liveTarget !== null && methodOfTarget(liveTarget) === m.id;
        return (
          <ConnectionCard
            key={m.id}
            title={m.label}
            subtitle={m.unavailable ?? m.blurb}
            icon={
              m.id === "bluetooth"
                ? "bluetooth"
                : m.id === "wifi"
                  ? "wifi"
                  : "globe"
            }
            tone={methodLive ? "live" : isMethod ? "busy" : "idle"}
            selected={isMethod}
            testID={`conn-method-${m.id}`}
            onPress={() => {
              tap();
              onMethodChange(m.id);
              setTargetId(null);
              setMessage(null);
            }}
          >
            {m.targets.length > 1 ? (
              <View className="flex-row gap-2">
                {m.targets.map((t) => {
                  const reason = targetUnavailableReason(t.id, {
                    carOnOwnRouter: carOnRouter,
                  });
                  const isTarget = setupTarget?.id === t.id;
                  return (
                    <ActionButton
                      key={t.id}
                      flex
                      label={t.label}
                      variant={isTarget ? "primary" : "quiet"}
                      disabled={Boolean(reason) || busy}
                      onPress={() => {
                        tap();
                        setTargetId(t.id);
                      }}
                      testID={`conn-target-${t.id}`}
                    />
                  );
                })}
              </View>
            ) : null}
            {m.unavailable ? (
              <InlineMessage tone="info">{m.unavailable}</InlineMessage>
            ) : null}
          </ConnectionCard>
        );
      })}

      {/* ---- the setup card for the selected target ---------------------- */}
      {method && setupTarget ? (
        <SetupCard
          target={setupTarget}
          busy={busy}
          onConnectBluetooth={connectBluetooth}
          onConnectWifi={connectWifi}
          onScanBluetooth={() => void handleScan()}
          onScanBluetoothInternal={scanNearby}
          sppStatus={sppStatus}
          sppDevices={sppDevices}
          carOnRouter={carOnRouter}
          reportedSsid={reportedSsid}
          onInputFocus={onInputFocus}
        />
      ) : null}

      {/* ---- routers: a property of the CONNECTION, not of one method ----- */}
      {anyLink ? (
        <RouterManager
          routers={routers}
          suggested={suggested}
          canAdd={canAddRouter(routers)}
          busy={busy}
          scanned={carScan ?? []}
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
              const ok = await run(() => runSwitchPlan(plan));
              if (ok)
                setMessage({
                  tone: "ok",
                  text: `Saved "${ssid}" and switching to it.`,
                });
            })()
          }
          onScanNearby={() => void scanNearby()}
          onInputFocus={onInputFocus}
        />
      ) : (
        <ConnectionCard
          title="Routers on the car"
          subtitle="Connect first to manage them."
          icon="list"
        >
          <InlineMessage tone="info">
            The car's saved routers appear here once you are connected — over
            Bluetooth or WiFi.
          </InlineMessage>
        </ConnectionCard>
      )}

      {/* ---- ONE message surface for the whole section -------------------- */}
      {message ? (
        <InlineMessage tone={message.tone}>{message.text}</InlineMessage>
      ) : null}
    </View>
  );
}

// =====================================================================
// Setup card — one card, body varies by target
// =====================================================================

function SetupCard({
  target,
  busy,
  onConnectBluetooth,
  onConnectWifi,
  onScanBluetooth,
  sppStatus,
  sppDevices,
  carOnRouter,
  reportedSsid,
  onInputFocus,
}: {
  target: ConnectionTarget;
  busy: boolean;
  onConnectBluetooth: (address: string, name?: string | null) => Promise<void>;
  onConnectWifi: (t: ConnectionTargetId) => Promise<void>;
  onScanBluetooth: () => void;
  onScanBluetoothInternal: () => void;
  sppStatus: string;
  sppDevices: readonly { id: string; name: string; bonded?: boolean }[];
  carOnRouter: boolean;
  reportedSsid: string | null;
  onInputFocus?: (y: number) => void;
}) {
  const unavailable = targetUnavailableReason(target.id, {
    carOnOwnRouter: carOnRouter,
  });

  return (
    <ConnectionCard
      title={target.label}
      subtitle={target.blurb}
      icon="settings"
      tone={unavailable ? "idle" : "busy"}
      testID={`conn-setup-${target.id}`}
    >
      <InlineMessage tone="info">{target.requirement}</InlineMessage>

      {target.id === "bt-spp" ? (
        <View className="mt-2.5 gap-2">
          <ActionButton
            label={sppStatus === "scanning" ? "Scanning…" : "Find my car"}
            icon="bluetooth"
            onPress={onScanBluetooth}
            disabled={busy || sppStatus === "scanning"}
            testID="conn-bt-scan"
          />
          {sppDevices.length > 0 ? (
            <View className="gap-1.5">
              {sppDevices.map((d) => (
                <ConnectionCard
                  key={d.id}
                  title={d.name || d.id}
                  subtitle={d.bonded ? "Paired" : d.id}
                  onPress={() => void onConnectBluetooth(d.id, d.name)}
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
          {target.id === "home-router" && carOnRouter && reportedSsid ? (
            <InlineMessage tone="ok">
              The car says it is on “{reportedSsid}”.
            </InlineMessage>
          ) : null}
        </View>
      ) : null}
    </ConnectionCard>
  );
}

// =====================================================================
// Router manager — available on EVERY method (D8)
// =====================================================================

function RouterManager({
  routers,
  suggested,
  canAdd,
  busy,
  scanned,
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
  const [showAdd, setShowAdd] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const validation = validateRouterInput(ssid, pass);

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
    setShowAdd(false);
  };

  return (
    <ConnectionCard
      title="Routers on the car"
      subtitle={`${switchableRouters(routers).length} saved · add, switch or remove`}
      icon="list"
      testID="conn-routers"
    >
      {/* D1: the own AP is shown as the pinned default but is NEVER offered
          as a switch target — switching to it is what erased the stored
          credentials. */}
      {routers
        .filter((r) => r.isOwnAp)
        .map((r) => (
          <ConnectionCard
            key={r.ssid}
            title={r.ssid}
            subtitle="The car's own network · always available"
            icon="wifi"
          />
        ))}

      {switchableRouters(routers).map((r) => (
        <ConnectionCard
          key={r.ssid}
          title={r.ssid}
          subtitle={
            r.isActive
              ? "The car is on this one"
              : suggested === r.ssid
                ? "Suggested"
                : null
          }
          icon="wifi"
          tone={r.isActive ? "live" : "idle"}
        >
          <View className="flex-row gap-2">
            <ActionButton
              flex
              label={r.isActive ? "On this one" : "Switch to it"}
              variant={r.isActive ? "quiet" : "primary"}
              disabled={busy || r.isActive}
              onPress={() => onSwitch(r.ssid)}
              testID={`conn-router-switch-${r.ssid}`}
            />
            <ActionButton
              label="Edit"
              variant="quiet"
              disabled={busy}
              onPress={() => {
                setEditing(r.ssid);
                setSsid(r.ssid);
                setPass("");
                setShowAdd(true);
              }}
            />
            <ActionButton
              label="Remove"
              variant="danger"
              disabled={busy}
              onPress={() => onDelete(r.ssid)}
              testID={`conn-router-del-${r.ssid}`}
            />
          </View>
        </ConnectionCard>
      ))}

      {switchableRouters(routers).length === 0 ? (
        <InlineMessage tone="info">
          No routers saved on the car yet. Add one below — the car joins it and
          keeps it even after a power cycle.
        </InlineMessage>
      ) : null}

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
          <View className="mt-2 gap-1.5">
            {scanned.map((n) => (
              <ConnectionCard
                key={n.ssid}
                title={n.ssid}
                subtitle={`${n.rssi} dBm${n.open ? "" : " · locked"}`}
                onPress={() => {
                  setSsid(n.ssid);
                  setShowAdd(true);
                }}
              />
            ))}
          </View>
        ) : null}
      </View>

      {/* add / edit form — keyboard-safe (F-69) */}
      {showAdd ? (
        <View className="mt-2.5 gap-2" testID="conn-add-form">
          <Text className="text-[11px] font-bold text-ink dark:text-white">
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
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Router name"
              maxLength={40}
              returnKeyType="next"
              className="h-11 rounded-lg border border-line bg-card px-3 text-[14px] text-ink dark:text-white"
              placeholderTextColor="#64748b"
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
              placeholder="Password (leave blank if open)"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              accessibilityLabel="Router password"
              maxLength={72}
              returnKeyType="done"
              onSubmitEditing={submit}
              className="h-11 rounded-lg border border-line bg-card px-3 text-[14px] text-ink dark:text-white"
              placeholderTextColor="#64748b"
              testID="conn-pass"
            />
          </View>
          {fieldError ? (
            <InlineMessage tone="error">{fieldError}</InlineMessage>
          ) : null}
          <View className="flex-row gap-2">
            <ActionButton
              flex
              label={editing ? "Save & switch" : "Save & switch"}
              icon="check"
              onPress={submit}
              disabled={busy || !ssid.trim()}
              testID="conn-add-submit"
            />
            <ActionButton
              label="Cancel"
              variant="quiet"
              onPress={() => {
                setShowAdd(false);
                setEditing(null);
                setSsid("");
                setPass("");
                setFieldError(null);
              }}
            />
          </View>
        </View>
      ) : (
        <View className="mt-2.5">
          <ActionButton
            label="Add a router"
            icon="plus"
            onPress={() => {
              setShowAdd(true);
              setEditing(null);
              setSsid("");
              setPass("");
              setFieldError(null);
            }}
            disabled={!canAdd}
            testID="conn-add-open"
          />
          {!canAdd ? (
            <InlineMessage tone="info">
              The car already holds the maximum number of routers. Remove one
              first.
            </InlineMessage>
          ) : null}
        </View>
      )}

      {switchableRouters(routers).length > 0 ? (
        <View className="mt-2.5">
          <ActionButton
            label="Remove all routers"
            variant="danger"
            onPress={onClearAll}
            disabled={busy}
          />
          <InlineMessage tone="info">
            This also puts the car back on its own network.
          </InlineMessage>
        </View>
      ) : null}
    </ConnectionCard>
  );
}
