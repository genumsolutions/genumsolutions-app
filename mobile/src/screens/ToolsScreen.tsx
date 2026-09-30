// =====================================================================
// ToolsScreen — the Control Panel.
//
// Category organizer with category selector, detail card, connection
// card, and Remote window handoff. This is the single entry point
// from Menu → Control Panel and Projects → Control.
// =====================================================================
import React, { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  Linking,
} from "react-native";
import {
  useRoute,
  type RouteProp,
  useNavigation,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import type { RootStackParamList } from "../navigation/types";
import { useControlHub } from "../components/tools/useControlHub";
import { ProjectInfo } from "../components/tools/ProjectInfo";
import { TransportPicker } from "../components/tools/TransportPicker";
import { ConnectionBanner } from "../components/tools/ConnectionBanner";
import { CarProfileCard } from "../components/tools/CarProfileCard";
import { RouterPanel } from "../components/tools/RouterPanel";
import { DEFAULT_AP_IP } from "../services/carProtocol";
import { useActiveTransport } from "../transports/linkManagerHooks";
import { linkManager } from "../transports/linkManager";
import type { TransportConnectOptions, TransportId } from "../transports/types";
import type { SppDevice } from "../services/sppService";
import { feedbackTap } from "../services/hapticsService";
import {
  KIND_GROUPS,
  PROJECT_CATEGORIES,
  PRODUCT_CATEGORY_TO_SLUG,
  type ProjectCategory,
} from "../config/project-catalog";
import { getProjectCategories } from "../services/projectCategoryService";
import { sppService } from "../services/sppService";
import { wifiService } from "../services/wifiService";

type Route = RouteProp<RootStackParamList, "Tools">;

type FeatherIcon = ComponentProps<typeof Feather>["name"];

const CATEGORY_ICONS: Record<string, FeatherIcon> = {
  robocar: "cpu",
  "home-automation": "home",
  "smart-farm": "droplet",
  "smart-city": "zap",
  drones: "send",
};

const CAPABILITY_LABELS: Record<string, string> = {
  directional: "Directional drive",
  servo: "Servo steering",
  pid: "PID tuning",
  "start-stop": "Run / Stop routines",
  relay: "Relay outputs",
  sensor: "Live sensors",
  weblink: "Web dashboard link",
  slider: "Sliders",
  gimbal: "Gimbal pan/tilt",
  altitude: "Altitude control",
};

export function ToolsScreen() {
  const route = useRoute<Route>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // DB-driven categories with hardcoded fallback
  const [categories, setCategories] =
    useState<ProjectCategory[]>(PROJECT_CATEGORIES);
  // U-48: pull-to-refresh — re-read the admin-editable category list.
  const [refreshing, setRefreshing] = useState(false);
  const loadCategories = useCallback(async () => {
    try {
      setCategories(await getProjectCategories());
    } catch {
      // keep the bundled fallback
    }
  }, []);
  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadCategories();
    } finally {
      setRefreshing(false);
    }
  }, [loadCategories]);

  const routeCategory = (() => {
    const raw = route.params?.category;
    if (!raw) return undefined;
    if (PRODUCT_CATEGORY_TO_SLUG[raw]) return PRODUCT_CATEGORY_TO_SLUG[raw];
    if (categories.some((c) => c.slug === raw)) return raw;
    return undefined;
  })();

  // Shared hook — connection state + everything the Remote window handoff
  // needs (the window runs its own hub instance on the same transports).
  const hub = useControlHub(routeCategory);
  const {
    connected,
    sppStatus,
    deviceName,
    sppSupported,
    sppDevices,
    handleConnect,
    handleDisconnect,
    wifiConnected,
    setWifiUrl,
    handleWifiConnect,
    handleWifiDisconnect,
    error,
    sppStatusMsg,
    activeMode,
    showSppsRetry,
    handleSppsRetry,
    handleReconnectPromptCancel,
    telemetry,
    carApName,
    carSsid,
    canControl,
    carNetworks,
    routerUse,
    routerAdd,
    routerDelete,
    routerClearAll,
    setWifiSsid,
  } = hub;

  // The banner's "which link" truth comes from the SAME manager the picker
  // uses (one source — this round's whole point). It is live-subscribed so
  // it can never claim a link the selection did not actually make.
  const managerLink = useActiveTransport();
  const activeLinkLabel = managerLink.id
    ? (linkManager.get(managerLink.id)?.label ?? null)
    : null;

  const anyLinked = sppStatus === "connected" || wifiConnected;
  const linkVerified = hub.linkVerified || sppStatus === "connected";

  // R4-4 (owner): the home-router (STA) method gets the SAME router-management
  // surface the remote's webserver mode hosts (RouterPanel), plus an
  // edit-password affordance (the car stores one password per SSID, so an
  // edit is a re-ADD — T-48a) and a "connect the car to this router" action
  // (USE). The car-AP method NEVER renders it — the AP method's own steps
  // live in the picker; this is the no-mixing rule.
  const [pickedMethod, setPickedMethod] = useState<TransportId | null>(null);
  // R4-4: which saved router is open for an edit (re-ADD upsert). Null when
  // the form is in plain add mode.
  const [editingRouter, setEditingRouter] = useState<string | null>(null);
  const onPickedChange = useCallback((id: TransportId | null) => {
    setPickedMethod(id);
    // A method change closes any open router edit — the edit belongs to the
    // method surface that opened it.
    setEditingRouter(null);
  }, []);
  const isHomeRouterMethod = pickedMethod === "wifi-sta-ws";
  const handleOpenWebPage = useCallback(() => {
    const ip = telemetry.ip?.trim();
    void Linking.openURL(`http://${ip || DEFAULT_AP_IP}`).catch(
      () => undefined,
    );
  }, [telemetry.ip]);
  const carIdentityId = telemetry.id ?? null;
  // STA truth only when the CAR says it joined a router (JSON `connected`).
  const staSsid =
    telemetry.connected === true
      ? telemetry.ssid?.trim() || carSsid || null
      : null;
  const apName = staSsid ? null : carApName?.trim() || "4WDCar_Wifi";

  // ---------------------------------------------------------------------
  // Transport picker bridge (F-17 — one owner for connection side effects).
  //
  // The picker chooses the METHOD; this screen still performs the connect,
  // because `useControlHub` owns the authoritative `connected` /
  // `wifiConnected` / `linkVerified` state that the status dot, the banners
  // and the RemoteControl gating all read. Connecting from the picker
  // straight into the services would bring a link up while that state
  // stayed false — "connected but the UI says no". Classic Bluetooth and
  // the two WiFi shapes therefore route through the EXACT handlers the
  // legacy cards used; only the new transports fall through to the manager.
  // ---------------------------------------------------------------------
  const onTransportActivate = useCallback(
    async (id: TransportId, options: TransportConnectOptions) => {
      if (id === "bt-classic") {
        if (!options.address) {
          throw new Error("Scan for the car first, then pick it.");
        }
        // The hub's handler takes the scanned SppDevice (it needs id/name/
        // bonded for display). Resolve it from the CURRENT scan results when
        // they still hold the address — but NEVER fail the connect because a
        // mutable in-memory list lost the row (owner 2026-09-29: a paired car
        // that was really in range was refused with "That car is no longer in
        // the scan list. Rescan." — a false error). A MAC address is all the
        // dial needs: fall through to a direct SppDevice built from the
        // scanned row's name (or the address) and let sppService.connect()
        // validate + bond like the legacy path always did.
        const scanned = sppDevices.find((d) => d.address === options.address);
        const device: SppDevice = scanned ?? {
          id: options.address,
          name: options.name || options.address,
          address: options.address,
          bonded: true,
        };
        await handleConnect(device);
        // F-34b: tell the manager (no re-dial) so the picker's selection,
        // active chip and Disconnect capsule match the live link.
        if (sppService.isConnected) {
          await linkManager.adopt("bt-classic", { address: device.address });
        }
        return;
      }
      if (id === "wifi-ap-ws" || id === "wifi-sta-ws") {
        // The hub reads the address from its own state, so mirror it first.
        if (options.url) setWifiUrl(options.url);
        await handleWifiConnect();
        // Only record an actually-verified link (socket + car answered).
        if (wifiService.isConnected && wifiService.linkVerified) {
          await linkManager.adopt(id, { url: options.url || undefined });
        }
        return;
      }
      // bt-ble has no hub bookkeeping yet — the manager owns it.
      await linkManager.activate(id, options);
    },
    [handleConnect, handleWifiConnect, setWifiUrl, sppDevices],
  );

  const onTransportDeactivate = useCallback(async () => {
    if (connected) await handleDisconnect();
    else if (wifiConnected) await handleWifiDisconnect();
    // Always clear the manager too: adopted links have no dial to undo, and
    // deactivate() on an idle manager is a no-op. Keeps the picker's active
    // chip in step with the teardown that just happened.
    await linkManager.deactivate();
  }, [connected, wifiConnected, handleDisconnect, handleWifiDisconnect]);

  // Category organizer
  const [selectedSlug, setSelectedSlug] = useState<string>(
    routeCategory && categories.some((c) => c.slug === routeCategory)
      ? routeCategory
      : categories[0]!.slug,
  );
  const category: ProjectCategory =
    categories.find((c) => c.slug === selectedSlug) ?? categories[0]!;

  const isRobocarCat = category.slug === "robocar";
  const remoteLabel = isRobocarCat
    ? "Drive deck"
    : category.slug === "drones"
      ? "Flight deck"
      : "Relay & sensor deck";

  // A1 (2026-09-24): DB capability_labels (admin-editable per category) win;
  // unknown keys fall back to the static map, then the raw key.
  const capabilityLabel = useCallback(
    (cap: string) =>
      category.capabilityLabels?.[cap] ?? CAPABILITY_LABELS[cap] ?? cap,
    [category.capabilityLabels],
  );

  // Connection tab:
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const confirmDisconnect = useCallback(() => {
    feedbackTap();
    setShowDisconnectConfirm(false);
    handleDisconnect();
  }, [handleDisconnect]);

  return (
    // F-47: a flex-1 SCREEN-WIDE root wrapping the ScrollView. The disconnect
    // confirm used to live INSIDE the ScrollView, so its "absolute inset-0"
    // mapped to the whole scrollable PAGE (taller than the screen) and the
    // dialog centered on the page — far below the fold in portrait. Rendered
    // as a SIBLING of the ScrollView under this root, "inset-0" is the
    // visible screen and the dialog truly centers on the phone.
    <View className="flex-1 bg-mist">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View className="flex-row items-center justify-between">
          <View className="min-w-0 flex-1">
            <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
              Control Panel
            </Text>
            <Text className="mt-2 font-display text-2xl font-bold text-ink">
              Test &amp; control your projects
            </Text>
          </View>
        </View>

        {/* Category selector — grouped by KIND (PLAN-2026-09-29 §2): two slim
            section headers above the same 7 pills in the SAME order as before.
            Kinds are visual labels only — nothing merges, nothing moves. */}
        {KIND_GROUPS.map((group) => {
          const pills = categories.filter((c) => group.slugs.includes(c.slug));
          if (pills.length === 0) return null;
          return (
            <View key={group.label} className="mt-5">
              <Text className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">
                {group.label}
              </Text>
              <View className="mt-2 flex-row flex-wrap gap-2">
                {pills.map((c) => {
                  const active = c.slug === selectedSlug;
                  return (
                    <Pressable
                      key={c.slug}
                      onPress={() => setSelectedSlug(c.slug)}
                      accessibilityRole="button"
                      accessibilityLabel={`Select category ${c.name}`}
                      accessibilityState={{ selected: active }}
                      className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-2 ${active ? "bg-navy" : "border border-line bg-card"}`}
                    >
                      <Feather
                        name={CATEGORY_ICONS[c.slug] ?? "box"}
                        size={13}
                        color={active ? "#fff" : "#1e3a8a"}
                      />
                      <Text
                        numberOfLines={1}
                        className={`text-xs font-bold ${active ? "text-white" : "text-navy"}`}
                      >
                        {c.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}

        {/* Category detail card */}
        <View
          key={category.slug}
          className="mt-4 rounded-2xl border border-line bg-card p-5 shadow-card"
        >
          <View className="flex-row items-start">
            <View className="h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-light">
              <Feather
                name={CATEGORY_ICONS[category.slug] ?? "box"}
                size={18}
                color="#1e3a8a"
              />
            </View>
            <View className="ml-3 min-w-0 flex-1">
              <Text
                numberOfLines={1}
                className="font-display text-lg font-bold text-ink"
              >
                {category.name}
              </Text>
              <Text
                numberOfLines={1}
                className="mt-0.5 text-xs font-semibold text-navy"
              >
                {category.tagline}
              </Text>
            </View>
          </View>
          <Text className="mt-3 text-sm leading-5 text-muted">
            {category.description}
          </Text>

          <View className="mt-3 flex-row flex-wrap gap-1.5">
            {category.hardware.map((h) => (
              <Text
                key={h}
                className="rounded-full bg-mist px-2.5 py-1 text-[10px] font-bold text-navy"
              >
                {h}
              </Text>
            ))}
          </View>

          <View className="mt-3 flex-row flex-wrap gap-x-4 gap-y-1.5">
            {category.capabilities.map((cap) => (
              <View key={cap} className="flex-row items-center gap-1.5">
                <Feather name="check-circle" size={12} color="#059669" />
                <Text className="text-xs font-semibold text-ink">
                  {capabilityLabel(cap)}
                </Text>
              </View>
            ))}
          </View>

          <Pressable
            onPress={() =>
              navigation.navigate("RemoteControl", { category: category.slug })
            }
            accessibilityRole="button"
            accessibilityLabel={`Open ${category.name} remote window`}
            className="mt-4 flex-row items-center justify-center gap-2 rounded-full bg-navy py-3"
          >
            <Feather name="target" size={15} color="#fff" />
            <Text className="text-sm font-black text-white">
              Open {remoteLabel} · {category.name}
            </Text>
            <Feather name="arrow-right" size={15} color="#fff" />
          </Pressable>
          <Text className="mt-1.5 text-center text-[11px] text-muted">
            Drive controls and speed live in the Remote window — this page stays
            a clean organizer.
          </Text>
        </View>

        {/* Connections — the ONE connection surface (owner ①⑥) */}
        <View className="mt-6">
          <View className="flex-row items-center justify-between">
            <View className="min-w-0 flex-1">
              <Text className="text-xs font-black uppercase tracking-widest text-navy">
                Connections
              </Text>
              <Text className="mt-0.5 text-[11px] leading-4 text-muted">
                One method at a time — pick it, verify it, drive.
              </Text>
            </View>
            {(sppStatus === "connected" || wifiConnected) && (
              <Pressable
                onPress={() => {
                  feedbackTap();
                  setShowDisconnectConfirm(true);
                }}
                className="shrink-0"
                hitSlop={8}
              >
                <Text className="text-sm font-bold text-gold underline">
                  Disconnect
                </Text>
              </Pressable>
            )}
          </View>

          <View className="mt-3">
            <ConnectionBanner
              linked={anyLinked}
              verified={linkVerified}
              linkLabel={activeLinkLabel}
              carLabel={
                sppStatus === "connected"
                  ? deviceName || null
                  : wifiConnected
                    ? apName
                    : null
              }
              carId={carIdentityId}
              staSsid={staSsid}
              apName={apName}
              signal={telemetry.signal ?? null}
              rssi={telemetry.rssi ?? null}
              error={error || (anyLinked ? null : sppStatusMsg)}
            />
          </View>

          {sppStatusMsg && sppStatus !== "connected" && !wifiConnected && (
            <View
              className={`mt-3 rounded-xl px-4 py-3 ${
                sppStatus === "error" || sppStatus === "disconnected"
                  ? "bg-red-50 border border-red-200"
                  : "bg-navy/10 border border-navy/20"
              }`}
            >
              <Text
                numberOfLines={2}
                className={`text-sm font-bold ${sppStatus === "error" || sppStatus === "disconnected" ? "text-red-600" : "text-navy"}`}
              >
                {sppStatusMsg}
              </Text>
            </View>
          )}

          {/* Hub-level connect errors sit WITH the feedback cluster above the
            picker (owner 2026-09-29 UI/UX pass) — they used to render at the
            very bottom of the section, under the profile card, where the
            failure and its message were never on screen together. */}
          {sppSupported && error && !connected && !wifiConnected && (
            <View className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <Text className="text-xs leading-5 text-red-600">{error}</Text>
            </View>
          )}

          {/* Reconnect banner — shown when connection drops and auto-reconnect exhausted */}
          {showSppsRetry && (
            <View className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <Text className="text-sm font-bold text-amber-800">
                Connection lost
              </Text>
              <Text className="mt-0.5 text-xs text-amber-600">
                Reconnect to your car?
              </Text>
              <View className="mt-2 flex-row gap-2">
                <Pressable
                  onPress={() => {
                    feedbackTap();
                    void handleSppsRetry();
                  }}
                  className="rounded-full bg-gold px-4 py-1.5"
                  hitSlop={6}
                >
                  <Text className="text-xs font-bold text-white">
                    Reconnect
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    feedbackTap();
                    handleReconnectPromptCancel();
                  }}
                  className="rounded-full border border-line bg-card px-4 py-1.5"
                  hitSlop={6}
                >
                  <Text className="text-xs font-bold text-muted">Cancel</Text>
                </Pressable>
              </View>
            </View>
          )}

          <View className="mt-3">
            <TransportPicker
              onActivate={onTransportActivate}
              onDeactivate={onTransportDeactivate}
              onPickedChange={onPickedChange}
            />
          </View>

          {/* R4-4: the home-router method's OWN surface — the same RouterPanel
              the remote's webserver mode hosts (owner: "make this just like it
              is in the remote screen inside, in the webserver mode"), plus an
              edit-password affordance (car stores one password per SSID → an
              edit is a re-ADD, T-48a) and a USE action. It mounts ONLY for the
              home-router method: the car-AP method never shows router-editing
              UI, and BT/other methods never do either (no method mixing). */}
          {isHomeRouterMethod && (
            <View className="mt-3">
              <Text className="text-xs font-black uppercase tracking-widest text-navy">
                Home router settings
              </Text>
              <Text className="mt-0.5 text-[11px] leading-4 text-muted">
                Routers saved on the car — switch, edit the stored password, or
                remove them. The car needs a live link to apply changes.
              </Text>
              <View className="mt-3">
                <RouterPanel
                  canControl={canControl}
                  linked={anyLinked}
                  onStartEdit={(ssid) => {
                    feedbackTap();
                    setEditingRouter(ssid);
                    setWifiSsid(ssid);
                  }}
                  editingSsid={editingRouter}
                  carSsid={staSsid}
                  carApName={apName}
                  ip={telemetry.ip ?? null}
                  networks={carNetworks}
                  onUse={(ssid) => {
                    feedbackTap();
                    routerUse(ssid);
                    setWifiSsid(ssid);
                  }}
                  onAdd={(ssid, pass) => {
                    feedbackTap();
                    routerAdd(ssid, pass);
                    // An add OR an edit-save clears the editing state — the
                    // car's next `networks` echo re-syncs the list either way.
                    setEditingRouter(null);
                  }}
                  onDelete={routerDelete}
                  onClear={routerClearAll}
                  onOpenWebPage={handleOpenWebPage}
                />
              </View>
            </View>
          )}

          <View className="mt-3">
            <CarProfileCard
              profileKey={hub.profileKey}
              savedPrefs={hub.savedPrefs}
              autoJoinRouter={hub.autoJoinRouter}
              setAutoJoinRouter={(v) => {
                feedbackTap();
                hub.setAutoJoinRouter(v);
              }}
              profileSync={hub.profileSync}
              modeName={
                hub.savedPrefs?.modeId
                  ? (hub.carModes.find((m) => m.id === hub.savedPrefs?.modeId)
                      ?.name ?? null)
                  : null
              }
              carLabel={
                sppStatus === "connected"
                  ? deviceName || null
                  : wifiConnected
                    ? apName
                    : null
              }
              carId={carIdentityId}
              staSsid={staSsid}
              apName={apName}
            />
          </View>
        </View>

        {/* About this project — the page now ENDS here (owner 2026-09-29:
          the teaching card after it is gone; mt-6 matches the Connections
          section rhythm). */}
        <View className="mt-6">
          <ProjectInfo mode={activeMode} categorySlug={category.slug} />
        </View>
      </ScrollView>

      {/* Disconnect confirmation — OUTSIDE the ScrollView (F-47), so the
        overlay fills the visible screen and the dialog centers on the phone. */}
      {showDisconnectConfirm && (
        <>
          <Pressable
            className="absolute inset-0 z-30 bg-black/30"
            onPress={() => setShowDisconnectConfirm(false)}
            accessibilityLabel="Cancel disconnect"
          />
          <View className="absolute inset-0 z-40 items-center justify-center px-8">
            <View className="w-full max-w-sm rounded-2xl border border-line bg-card p-5 shadow-xl">
              <Text className="text-center text-base font-black text-ink">
                Disconnect now?
              </Text>
              <Text className="mt-1 text-center text-xs leading-4 text-muted">
                The car will stop safely before the link closes. Your saved
                settings stay remembered for next time.
              </Text>
              <View className="mt-4 flex-row justify-center gap-3">
                <Pressable
                  onPress={() => setShowDisconnectConfirm(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Keep connection"
                  hitSlop={8}
                >
                  <View className="rounded-full border border-line bg-surface px-6 py-2.5">
                    <Text className="text-sm font-bold text-ink">Cancel</Text>
                  </View>
                </Pressable>
                <Pressable
                  onPress={confirmDisconnect}
                  accessibilityRole="button"
                  accessibilityLabel="Disconnect"
                  hitSlop={8}
                >
                  <View className="rounded-full bg-red-600 px-6 py-2.5">
                    <Text className="text-sm font-black text-white">
                      Disconnect
                    </Text>
                  </View>
                </Pressable>
              </View>
            </View>
          </View>
        </>
      )}
    </View>
  );
}
