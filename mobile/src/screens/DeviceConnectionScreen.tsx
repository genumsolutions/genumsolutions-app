// =====================================================================
// DeviceConnectionScreen — shows ONE connection kind with its own
// placeholder settings and a "Continue", then opens the Remote window.
//
// Per-method setup rows:
//   • bluetooth-spp   — built: Classic Bluetooth SPP (the hand-held remote).
//   • bluetooth-ble   — placeholder: BLE layer for the ESP remote, not wired.
//   • wifi-ap         — placeholder: the ESP remote control path via the phone.
//   • wifi-ap-own     — built: WS drive over the car's own AP.
//   • wifi-sta        — built: WS drive over a provisioned router, with the
//                        U-120 item 7 / U-121 Phase B car-network selector:
//                        a proper always-rendered radio-row list (the car's
//                        own hotspot + every saved router, by NAME) beside
//                        the broadcast-IP field, so the user can tell the
//                        app where the car is.
// The screen also carries the U-120 item 9 phone-network row (this phone's
// own network, known BEFORE any link is dialed). Placeholders say so in place.
// =====================================================================
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import type { RootStackParamList } from "../navigation/types";
import { useControlHub } from "../components/tools/useControlHub";
import { feedbackTap } from "../services/hapticsService";
import { DEFAULT_AP_IP, DEFAULT_WS_URL } from "../services/carProtocol";
import type { SppDevice } from "../services/sppService";

type Route = RouteProp<RootStackParamList, "DeviceConnection">;

type Props = NativeStackScreenProps<RootStackParamList, "DeviceConnection">;

// Setup panels keyed by the chosen kind. The Wi-Fi drafts live in the hub so
// the shared socket dials exactly what the user typed here.
function SetupPanel({
  kind,
  deviceName,
  wifiUrl,
  onWifiUrlChange,
  sppDevices,
  scanning,
  onScan,
  onConnect,
  carNetworks,
  carApName,
  carSsid,
  carIp,
  linked,
  pickedNetwork,
  onPickNetwork,
}: {
  kind: string;
  deviceName: string;
  wifiUrl: string;
  onWifiUrlChange: (value: string) => void;
  sppDevices: SppDevice[];
  scanning: boolean;
  onScan: () => void;
  onConnect: (device: SppDevice) => void;
  /** The car's known networks (savedRouters mirror; car truth once linked). */
  carNetworks: string[];
  /** The car's own AP broadcast id — its fallback network, fixed address. */
  carApName: string | null;
  /** The network the car is actually on right now, or null (no link yet). */
  carSsid: string | null;
  /** The car's reported IP — where it lives on that network — or null. */
  carIp: string | null;
  /** Any link is up — the only state in which the car can be told to move. */
  linked: boolean;
  /** The network picked in the selector (U-120 Phase D item 7). */
  pickedNetwork: string | null;
  /** Pick the car's network by NAME, next to the broadcast-IP field. */
  onPickNetwork: (ssid: string) => void;
}) {
  const [label, setLabel] = useState(deviceName);

  // U-121 Phase B (owner 2026-10-23, item 7): the car-network selector is a
  // PROPER list — always rendered, one radio row per network, the car's own
  // hotspot first (its fixed fallback network) then every saved router by
  // name. The row that says where the car IS is marked; the pick itself is
  // the user's answer to "which network is the car at?".
  const selectorRows: { ssid: string; onCar: boolean }[] = [
    ...(carApName
      ? [
          {
            ssid: carApName,
            // Linked with no joined SSID = the car sits on its own AP.
            onCar: linked && (carSsid == null || carSsid === ""),
          },
        ]
      : []),
    ...carNetworks
      .filter((s) => s !== carApName)
      .map((ssid) => ({ ssid, onCar: carSsid === ssid })),
  ];

  switch (kind) {
    case "bluetooth-spp": {
      return (
        <>
          <Text className="text-xs font-black uppercase tracking-[0.2em] text-muted">
            Bluetooth Classic SPP — built
          </Text>
          <Text className="mt-1 text-xs leading-4 text-muted">
            The hand-held remote&apos;s path. Pair the car&apos;s broadcast name
            (4WD4M Car) — if Android asks for a PIN, it is 1234.
          </Text>
          <Pressable
            onPress={onScan}
            accessibilityRole="button"
            className="mt-3 flex-row items-center justify-center gap-2 rounded-full border border-navy px-4 py-2.5"
          >
            <Feather name="search" size={14} color="#1e3a8a" />
            <Text className="text-xs font-black text-navy">
              {scanning ? "Scanning…" : "Scan for cars"}
            </Text>
          </Pressable>
          {sppDevices.length === 0 ? (
            <Text className="mt-2 text-[10px] leading-3 text-muted">
              No cars found yet — press scan, keep the car powered.
            </Text>
          ) : (
            <View className="mt-2 gap-1.5">
              {sppDevices.map((device) => (
                <Pressable
                  key={device.address}
                  onPress={() => onConnect(device)}
                  accessibilityRole="button"
                  className="flex-row items-center justify-between rounded-xl border border-line bg-mist px-3 py-2.5"
                >
                  <Text className="text-xs font-bold text-ink">
                    {device.name || "Unnamed car"}
                  </Text>
                  <Feather name="chevron-right" size={14} color="#94a3b8" />
                </Pressable>
              ))}
            </View>
          )}
        </>
      );
    }
    case "bluetooth-ble": {
      return (
        <>
          <Text className="text-xs font-black uppercase tracking-[0.2em] text-muted">
            Bluetooth LE (BLE) — placeholder
          </Text>
          <Text className="mt-1 text-xs leading-4 text-muted">
            ESP remote BLE approach; the BLE layer is being built. Set the
            device name, then continue when ready.
          </Text>
          <View
            className={`mt-2 rounded-xl border border-line bg-mist p-3 ${!deviceName ? "opacity-40" : ""}`}
          >
            <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
              Device name
            </Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="GENUM Car BLE"
              placeholderTextColor="#94a3b8"
              className="mt-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink"
            />
          </View>
          <Text className="mt-2 text-[10px] leading-3 text-amber-600">
            × Placeholder — BLE widget not available yet.
          </Text>
        </>
      );
    }
    case "wifi-ap": {
      return (
        <>
          <Text className="text-xs font-black uppercase tracking-[0.2em] text-muted">
            Wi-Fi / ESP Remote — placeholder
          </Text>
          <Text className="mt-1 text-xs leading-4 text-muted">
            ESP remote control via the phone bridge. Enter the ESP remote's
            address or placeholder metadata.
          </Text>
          <View
            className={`mt-2 rounded-xl border border-line bg-mist p-3 ${!deviceName ? "opacity-40" : ""}`}
          >
            <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
              ESP remote name
            </Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="GENUM ESP Remote"
              placeholderTextColor="#94a3b8"
              className="mt-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink"
            />
          </View>
          <Text className="mt-2 text-[10px] leading-3 text-amber-600">
            × Placeholder — ESP remote path not wired yet.
          </Text>
        </>
      );
    }
    case "wifi-ap-own": {
      return (
        <>
          <Text className="text-xs font-black uppercase tracking-[0.2em] text-muted">
            Wi-Fi AP (own AP) — built
          </Text>
          <Text className="mt-1 text-xs leading-4 text-muted">
            Join the car's own AP (4WD4MCar_WiFi) on the phone, then connect.
            The WS drive and the website page use this one socket.
          </Text>
          <TextInput
            value={wifiUrl}
            onChangeText={onWifiUrlChange}
            placeholder={DEFAULT_WS_URL}
            autoCapitalize="none"
            className="mt-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink"
          />
          <Text className="mt-2 text-[10px] leading-3 text-muted">
            Car AP address is {DEFAULT_AP_IP} (WebSocket on port 81).
          </Text>
        </>
      );
    }
    case "wifi-sta": {
      return (
        <>
          <Text className="text-xs font-black uppercase tracking-[0.2em] text-muted">
            Wi-Fi STA (router) — built
          </Text>
          <Text className="mt-1 text-xs leading-4 text-muted">
            After provisioning the car broadcasts its router IP. Enter that IP
            to drive over the same WebSocket.
          </Text>
          <TextInput
            value={wifiUrl}
            onChangeText={onWifiUrlChange}
            placeholder="ws://192.168.1.42:81"
            autoCapitalize="none"
            className="mt-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink"
          />
          <Text className="mt-2 text-[10px] leading-3 text-muted">
            Send WIFICFG over Bluetooth to put the car on your router.
          </Text>

          {/* U-120 Phase D (owner item 7, 2026-10-22) → U-121 Phase B
              (owner 2026-10-23: "that doesn't have the proper saved network
              selector so that user can let the app know which network the car
              is currently at"). The selector is now a PROPER one: always
              rendered (an honest empty state instead of disappearing), radio
              rows at real tap size, the car's own hotspot plus every saved
              router by NAME, and the row the car is actually on is marked.
              Picking resolves where the car is — its own reported lease when
              it is on that network, or ROUTERS;USE over a live link so the
              car joins the picked network and reports its new IP. */}
          <View
            className="mt-3 rounded-xl border border-line bg-mist p-3"
            testID="car-network-selector"
          >
            <View className="flex-row items-center gap-1.5">
              <Feather name="map-pin" size={12} color="#475569" />
              <Text className="text-[10px] font-black uppercase tracking-wide text-muted">
                Car network — where is the car?
              </Text>
            </View>
            <Text className="mt-1 text-[10px] leading-3 text-muted">
              Pick the network the car is on — its IP fills in from the car
              itself. Picking another saved network tells the car to join it.
            </Text>
            {selectorRows.length === 0 ? (
              <Text className="mt-2 text-[11px] leading-4 text-muted">
                No saved networks known yet — the list fills in once the car
                answers over a link.
              </Text>
            ) : (
              <View className="mt-2 gap-1.5">
                {selectorRows.map((row) => {
                  const picked = pickedNetwork === row.ssid;
                  return (
                    <Pressable
                      key={row.ssid}
                      onPress={() => onPickNetwork(row.ssid)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: picked }}
                      accessibilityLabel={`Select car network ${row.ssid}${row.onCar ? " — the car is on it" : ""}`}
                      className={`flex-row items-center gap-2 rounded-lg border px-3 py-2.5 ${
                        picked
                          ? "border-select-ink bg-select-bg"
                          : "border-line bg-card"
                      }`}
                      testID={`car-network-pick-${row.ssid}`}
                    >
                      <Feather
                        name={picked ? "check-circle" : "circle"}
                        size={14}
                        color={picked ? "#1e3a8a" : "#94a3b8"}
                      />
                      <Text
                        numberOfLines={1}
                        className={`min-w-0 flex-1 text-[13px] ${
                          picked
                            ? "font-bold text-select-ink"
                            : "font-semibold text-ink"
                        }`}
                      >
                        {row.ssid}
                      </Text>
                      {row.onCar ? (
                        <Text className="shrink-0 text-[10px] font-bold text-success">
                          car is here
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
            {pickedNetwork ? (
              <Text className="mt-1.5 text-[10px] leading-3 text-muted">
                {pickedNetwork === carApName
                  ? `The car's own hotspot (${DEFAULT_AP_IP}) is in the field — join ${carApName} on this phone to reach it.`
                  : pickedNetwork === carSsid
                    ? carIp
                      ? `The car is on ${pickedNetwork} at ${carIp} — that is the address in the field.`
                      : `The car is on ${pickedNetwork}.`
                    : linked
                      ? `Telling the car to join ${pickedNetwork} — its new IP arrives automatically.`
                      : `Connect first — the car joins ${pickedNetwork} and reports where it is.`}
              </Text>
            ) : null}
          </View>
        </>
      );
    }
    default: {
      return (
        <>
          <Text className="text-xs font-black uppercase tracking-[0.2em] text-muted">
            {kind} — placeholder
          </Text>
          <Text className="mt-1 text-xs leading-4 text-muted">
            Not built yet. Select the built method or come back later.
          </Text>
        </>
      );
    }
  }
}

export function DeviceConnectionScreen({}: Props) {
  const { kind, deviceName } = useRoute<Route>().params;
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  // The ONE shared hub: Bluetooth, the WiFi WebSocket and the remote window
  // all read the same link, so connecting here drives the remote that opens
  // next.
  const {
    connected,
    wifiConnected,
    linkVerified,
    connecting,
    scanning,
    error,
    wifiUrl,
    sppDevices,
    carNetworks,
    carApName,
    carSsid,
    routerUse,
    telemetry,
    setWifiUrl,
    handleScan,
    handleConnect,
    handleWifiConnect,
    handleWifiDisconnect,
  } = useControlHub(undefined);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const isBluetooth = kind === "bluetooth-spp";
  const isWifi = kind === "wifi-ap-own" || kind === "wifi-sta";
  // A link is only "ready to drive" when the car has actually answered:
  // Bluetooth needs the SPP link, WiFi needs the socket AND a car frame.
  const linkReady = isBluetooth
    ? connected
    : isWifi
      ? wifiConnected && linkVerified
      : false;

  const connect = useCallback(async () => {
    feedbackTap();
    setBusy(true);
    try {
      if (isWifi) {
        // The panels keep their draft address in the hub, so the shared socket
        // dials exactly what the user typed.
        // U-69: await the handler's ConnectOutcome. The app must never show
        // "Connected" when the link is actually closed — a failure now surfaces
        // through the hub error, which is the only failure surface this screen
        // renders (error -> the red box below). Without the await, the old
        // handler returned normally on a failure and this button also reported
        // success (the bug this fix targets).
        await handleWifiConnect();
      } else if (isBluetooth) {
        await handleScan();
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [handleScan, handleWifiConnect, isBluetooth, isWifi]);

  const goRemote = useCallback(() => {
    feedbackTap();
    navigation.replace("RemoteControl", { category: "robocar" });
  }, [navigation]);

  // U-120 Phase D (owner item 7, 2026-10-22) → U-121 Phase B: pick the
  // car's network by NAME in the proper selector, and let the app know where
  // the car is:
  //   * the car's OWN HOTSPOT picked → its address is fixed (DEFAULT_AP_IP):
  //     prefill it directly, no guessing;
  //   * the car is ON the picked network → its reported lease is where it
  //     lives: prefill the dial target from the car's own IP (no guessing);
  //   * the car is elsewhere → select by name means TELL it to join
  //     (ROUTERS;USE over the live link); its new IP arrives on STATE;IP and
  //     the hub's smart-link auto-dial prefills the target itself.
  const [pickedNetwork, setPickedNetwork] = useState<string | null>(null);
  const pickCarNetwork = useCallback(
    (ssid: string) => {
      feedbackTap();
      setPickedNetwork(ssid);
      if (ssid === carApName) {
        setWifiUrl(`ws://${DEFAULT_AP_IP}:81`);
        return;
      }
      if (carSsid === ssid) {
        const bare = (telemetry.ip ?? "")
          .replace(/^wss?:\/\//, "")
          .replace(/:\d+$/, "")
          .replace(/\/.*$/, "")
          .trim();
        if (bare) setWifiUrl(`ws://${bare}:81`);
        return;
      }
      if (connected || wifiConnected) routerUse(ssid);
    },
    [
      carApName,
      carSsid,
      telemetry.ip,
      connected,
      wifiConnected,
      routerUse,
      setWifiUrl,
    ],
  );

  return (
    <ScrollView
      className="flex-1 bg-mist"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      {/* Header */}
      <View className="mb-5 flex-row items-center justify-between">
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
            {kind}
          </Text>
          <Text className="mt-2 font-display text-2xl font-bold text-ink">
            {deviceName}
          </Text>
        </View>
      </View>

      {/* Setup */}
      <View className="mt-4 rounded-2xl border border-line bg-card p-4 shadow-card">
        <SetupPanel
          kind={kind}
          deviceName={deviceName}
          wifiUrl={wifiUrl}
          onWifiUrlChange={setWifiUrl}
          sppDevices={sppDevices}
          scanning={scanning}
          onScan={() => {
            feedbackTap();
            void handleScan();
          }}
          onConnect={(device) => {
            feedbackTap();
            void handleConnect(device);
          }}
          carNetworks={carNetworks}
          carApName={carApName}
          carSsid={carSsid}
          carIp={telemetry.ip ?? null}
          linked={connected || wifiConnected}
          pickedNetwork={pickedNetwork}
          onPickNetwork={pickCarNetwork}
        />
      </View>

      {/* Connect + status */}
      <View className="mt-4 flex-row gap-3">
        {isBluetooth || isWifi ? (
          <Pressable
            onPress={connect}
            disabled={busy || connecting}
            accessibilityRole="button"
            className="flex-1 flex-row items-center justify-center gap-2 rounded-full bg-navy px-6 py-3.5 disabled:opacity-60"
          >
            {busy || connecting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="link" size={14} color="#fff" />
            )}
            <Text className="text-sm font-black text-white">
              {busy || connecting ? "Connecting…" : "Connect"}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={linkReady ? goRemote : connect}
          disabled={busy}
          accessibilityRole="button"
          className={`flex-1 flex-row items-center justify-center gap-2 rounded-full px-6 py-3.5 disabled:opacity-60 ${
            linkReady ? "bg-gold" : "border border-line bg-card"
          }`}
        >
          <Feather
            name={linkReady ? "arrow-right" : "link"}
            size={14}
            color={linkReady ? "#0f172a" : "#94a3b8"}
          />
          <Text
            className={`text-sm font-black ${linkReady ? "text-ink" : "text-muted"}`}
          >
            {linkReady ? "Continue to remote" : "Connect first"}
          </Text>
        </Pressable>
      </View>

      {error && (
        <View className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <Text className="text-xs leading-5 text-red-600">{error}</Text>
        </View>
      )}

      {/* Disconnect an established link */}
      {linkReady && (
        <Pressable
          onPress={() => {
            feedbackTap();
            if (isWifi) void handleWifiDisconnect();
          }}
          accessibilityRole="button"
          className="mt-3 self-center"
        >
          <Text className="text-xs font-bold text-muted underline">
            Disconnect
          </Text>
        </Pressable>
      )}

      <Text className="mt-3 text-center text-[11px] text-muted">
        {linkReady
          ? "Linked — the remote window drives over this same connection."
          : "Connect to unlock the remote window."}
      </Text>
    </ScrollView>
  );
}
