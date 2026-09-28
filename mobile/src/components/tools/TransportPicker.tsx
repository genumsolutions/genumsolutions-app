// =====================================================================
// TransportPicker — the "pick your connection method" card.
//
// This is the control the owner asked for: "I want this app to be able to
// communicate and control all the types of wifi and bluetooth
// communications ... the user gets to choose to select one which they like
// at a time. The app already has the bluetooth and wifi setup, of which
// bluetooth set is working fine but doesn't show or allow to choose which
// type of communications the user is going to select."
//
// It replaces a 2-way Bluetooth/WiFi segmented toggle that could not
// express the real choice space. Every possible method is REGISTERED so no
// option is missing, and each row says whether it is live today:
//
//   Bluetooth   · Classic SPP   (paired car — the proven working link)
//   Bluetooth   · BLE GATT       (low power — registered; needs firmware)
//   WiFi        · Car access pt  (phone joins the car's own hotspot)
//   WiFi        · Home router    (car + phone on the same LAN)
//   Internet    · HTTP / REST    (drives the car's own web server)
//   Internet    · MQTT / cloud   (registered; roadmap — needs a broker)
//   Cable       · USB serial     (registered; roadmap — best bench tool)
//   ... plus mDNS, an internet relay and teaching-only items.
//
// A row marked "Not available on this build yet" is registered but its
// `isSupported()` is false, so it can never become the active link; the
// chevron opens its teaching + roadmap note.
//
// Selecting a row is the ONLY way a link becomes active, so "WiFi is
// selected" now genuinely means traffic goes over WiFi — the old
// `goBt ?? goWs` priority silently preferred Bluetooth and made a WiFi run
// impossible without unplugging BT in another screen.
//
// F-12: all state is read from the manager on every render; nothing is
// cached in local state except the scan results and the typed URL, which
// are inputs, not connection state.
// =====================================================================
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import {
  useActivateTransport,
  useActiveTransport,
  useTransportList,
} from "../../transports/linkManagerHooks";
import { linkManager } from "../../transports/linkManager";
import {
  hasCapability,
  type DiscoveredDevice,
  type Transport,
  type TransportCapability,
  type TransportConnectOptions,
  type TransportId,
  type TransportStatus,
} from "../../transports/types";
import { DEFAULT_AP_IP, DEFAULT_WS_URL } from "../../services/carProtocol";
import { WifiDiagnosticsPanel } from "./WifiDiagnosticsPanel";

export type TransportPickerProps = {
  /** Shown under the rows. Lets the screen own layout. */
  compact?: boolean;
  /**
   * OPTIONAL side-effect owner (F-17).
   *
   * When supplied, the screen performs the connect/disconnect itself
   * instead of the picker calling linkManager directly. This matters: the
   * Control Panel's `useControlHub` handlers own the authoritative
   * `connected` / `wifiConnected` / `linkVerified` state, the status dot,
   * the banners and the RemoteControl gating. A picker that connected
   * behind the hub's back would bring a live socket up while that state
   * stayed false — the classic "connected but the UI says no" desync.
   *
   * Omit it (e.g. in a standalone screen with no hub) and the picker
   * drives linkManager itself.
   */
  onActivate?: (
    id: TransportId,
    options: TransportConnectOptions,
  ) => Promise<void>;
  onDeactivate?: () => Promise<void>;
};

/** Rows group by radio so the choice reads as "which radio, then which kind". */
const RADIO_LABEL = {
  bluetooth: "Bluetooth",
  wifi: "WiFi",
  internet: "Internet & cloud",
  wired: "Cable",
} as const;

type FeatherName = keyof typeof Feather.glyphMap;

const RADIO_ICON: Record<Transport["radio"], FeatherName> = {
  bluetooth: "bluetooth",
  wifi: "wifi",
  internet: "globe",
  wired: "hard-drive",
};

/** Capability chips, in a fixed order so the rows line up. */
const CAPABILITY_LABEL: Array<[TransportCapability, string]> = [
  ["drive", "Drive"],
  ["telemetry", "Data"],
  ["mode", "Mode"],
  ["wifiConfig", "WiFi setup"],
  ["ota", "Firmware"],
];

const STATUS_META: Record<TransportStatus, { label: string; tint: string }> = {
  idle: { label: "Not connected", tint: "#64748b" },
  connecting: { label: "Connecting…", tint: "#0284c7" },
  connected: { label: "Connected", tint: "#059669" },
  error: { label: "Failed", tint: "#dc2626" },
};

function StatusDot({ status }: { status: TransportStatus }) {
  return (
    <View
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: STATUS_META[status].tint }}
    />
  );
}

function TransportRow({
  transport,
  active,
  status,
  onSelect,
}: {
  transport: Transport;
  active: boolean;
  status: TransportStatus;
  onSelect: (id: TransportId) => void;
}) {
  const meta = STATUS_META[status];
  const supported = transport.isSupported();
  const teaching = transport.teaching;
  const [expanded, setExpanded] = React.useState(false);
  // Placeholder rows are disabled (connecting would throw) but their chevron
  // must still open the teaching, so the "details" Pressable is always live.
  return (
    <View
      className={`mb-2 rounded-xl border p-3 ${
        active ? "border-sky-500 bg-sky-500/10" : "border-line bg-card"
      } ${supported ? "" : "opacity-60"}`}
    >
      <Pressable
        onPress={() => onSelect(transport.id)}
        disabled={!supported}
        accessibilityRole="radio"
        accessibilityState={{ selected: active, disabled: !supported }}
        accessibilityLabel={`${transport.label}. ${meta.label}`}
      >
        <View className="flex-row items-center gap-2">
          <Feather
            name={RADIO_ICON[transport.radio]}
            size={15}
            color={active ? "#0284c7" : "#64748b"}
          />
          <Text
            className={`flex-1 text-[13px] font-black ${
              active
                ? "text-sky-700 dark:text-sky-300"
                : "text-ink dark:text-white"
            }`}
          >
            {transport.label}
          </Text>
          <StatusDot status={status} />
          <Text className="text-[11px] font-bold text-muted">{meta.label}</Text>
        </View>
        <Text className="mt-1 text-[11px] leading-4 text-muted">
          {transport.blurb}
        </Text>
        {/* Capabilities are DECLARED per transport, so the user can see what a
            method can and cannot do before choosing it (the point of the
            Transport contract). Notably no link can push firmware today. */}
        <View className="mt-1.5 flex-row flex-wrap items-center gap-1">
          {CAPABILITY_LABEL.map(([cap, label]) => {
            const on = hasCapability(transport, cap);
            return (
              <View
                key={cap}
                className={`rounded-full px-1.5 py-0.5 ${
                  on ? "bg-sky-500/15" : "bg-line/40"
                }`}
              >
                <Text
                  className={`text-[9px] font-black uppercase tracking-wide ${
                    on ? "text-sky-700 dark:text-sky-300" : "text-muted"
                  }`}
                >
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
        {!supported ? (
          <Text className="mt-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
            Not available on this build yet
          </Text>
        ) : null}
      </Pressable>
      {teaching ? (
        <>
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={`How ${transport.label} works`}
            hitSlop={4}
            className="mt-2 flex-row items-center gap-1 self-start"
          >
            <Feather
              name={expanded ? "chevron-up" : "chevron-down"}
              size={12}
              color="#0284c7"
            />
            <Text className="text-[11px] font-black text-sky-700 dark:text-sky-300">
              {expanded ? "Hide details" : "How this works + what it needs"}
            </Text>
          </Pressable>
          {expanded ? (
            <View className="mt-2 rounded-lg border border-line bg-mist p-2.5">
              <Text className="text-[12px] leading-4 text-ink dark:text-white">
                {teaching.intro}
              </Text>
              <Text className="mt-2 text-[10px] font-black uppercase tracking-wide text-muted">
                What you need
              </Text>
              <Text className="text-[12px] leading-4 text-muted">
                {teaching.needs}
              </Text>
              <Text className="mt-2 text-[10px] font-black uppercase tracking-wide text-muted">
                When to use it
              </Text>
              <Text className="text-[12px] leading-4 text-muted">
                {teaching.when}
              </Text>
              <Text className="mt-2 text-[10px] font-black uppercase tracking-wide text-muted">
                Connect + verify
              </Text>
              {teaching.steps.map((s, i) => (
                <View key={i} className="flex-row gap-1.5">
                  <Text className="text-[12px] leading-4 text-sky-700 dark:text-sky-300">
                    {i + 1}
                  </Text>
                  <Text className="flex-1 text-[12px] leading-4 text-ink dark:text-white">
                    {s}
                  </Text>
                </View>
              ))}
              {transport.roadmapNote ? (
                <View className="mt-2 flex-row gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2">
                  <Feather name="clock" size={12} color="#d97706" />
                  <Text className="flex-1 text-[11px] font-bold leading-4 text-amber-700 dark:text-amber-400">
                    {transport.roadmapNote}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** The scan result list. Extracted to keep the picker shallow — F-9 (one
 *  subscription/owner per concern) and it removes a 6-level JSX nest that
 *  proved hostile to edit. */
function DeviceList({
  devices,
  busy,
  onPick,
}: {
  devices: DiscoveredDevice[];
  busy: boolean;
  onPick: (d: DiscoveredDevice) => void;
}) {
  return (
    <ScrollView className="mt-2" style={{ maxHeight: 200 }} nestedScrollEnabled>
      {devices.map((d) => (
        <Pressable
          key={d.id}
          onPress={() => onPick(d)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Connect to ${d.name}`}
          className="mt-1.5 flex-row items-center gap-2 rounded-lg border border-line bg-mist px-2.5 py-2"
        >
          <Feather name="bluetooth" size={13} color="#64748b" />
          <Text
            className="min-w-0 flex-1 text-[13px] font-bold text-ink dark:text-white"
            numberOfLines={1}
          >
            {d.name}
          </Text>
          {d.detail ? (
            <Text className="shrink-0 text-[11px] text-muted">{d.detail}</Text>
          ) : null}
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function TransportPicker({
  compact = false,
  onActivate,
  onDeactivate,
}: TransportPickerProps) {
  const transports = useTransportList();
  const link = useActiveTransport();
  const activate = useActivateTransport();

  // Inputs, not connection state (F-12).
  const [url, setUrl] = React.useState(DEFAULT_WS_URL);
  const [devices, setDevices] = React.useState<DiscoveredDevice[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selected = link.id
    ? (transports.find((t) => t.id === link.id) ?? null)
    : null;
  const isSelected = (t: Transport) => link.id === t.id;
  const isWifi = selected?.radio === "wifi";
  const isBluetooth = selected?.radio === "bluetooth";
  // WiFi and HTTP are the two address-driven methods; the rest dial directly.
  const needsUrl = isWifi || selected?.id === "http";
  // Only a link with a device scan offers one.
  const canScan = Boolean(selected?.scan);

  // Keep one typed address per URL-shaped method, so switching WiFi → HTTP
  // never carries a ws:// value into the HTTP box (or vice versa).
  const urlByTransport = React.useRef<Record<string, string>>({});
  React.useEffect(() => {
    if (!selected) return;
    const stored = urlByTransport.current[selected.id];
    setUrl(
      stored ??
        (selected.radio === "wifi"
          ? DEFAULT_WS_URL
          : selected.id === "http"
            ? `http://${DEFAULT_AP_IP}:80`
            : ""),
    );
  }, [selected]);

  const onUrlChange = React.useCallback(
    (v: string) => {
      setUrl(v);
      if (selected) urlByTransport.current[selected.id] = v;
    },
    [selected],
  );

  const run = React.useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  // The screen may own the side effects (see onActivate). Either way the
  // manager is kept in step so the picker keeps showing the right state.
  const activateTransport = React.useCallback(
    (id: TransportId, options: TransportConnectOptions) =>
      onActivate
        ? onActivate(id, options)
        : activate(id, options).then(() => undefined),
    [activate, onActivate],
  );

  const onSelect = React.useCallback(
    (id: TransportId) => {
      const t = transports.find((x) => x.id === id);
      if (!t) return;
      setDevices(null);
      setError(null);
      // WiFi and HTTP need an address; Bluetooth needs a device from a scan.
      if (t.radio === "wifi" || t.id === "http") {
        void run(() =>
          activateTransport(id, url.trim() ? { url: url.trim() } : {}),
        );
      } else {
        void run(() => activateTransport(id, {}));
      }
    },
    [activateTransport, run, transports, url],
  );

  const onScan = React.useCallback(() => {
    if (!selected?.scan) return;
    void run(async () => {
      const found = await selected.scan!();
      setDevices(found);
      if (found.length === 0) {
        setError("No devices found. Is the car powered on?");
      }
    });
  }, [run, selected]);

  const onConnectDevice = React.useCallback(
    (d: DiscoveredDevice) => {
      if (!selected) return;
      void run(() => activateTransport(selected.id, { address: d.id }));
    },
    [activateTransport, run, selected],
  );

  const onDisconnect = React.useCallback(() => {
    void run(() => (onDeactivate ? onDeactivate() : linkManager.deactivate()));
  }, [onDeactivate, run]);

  const statusOf = (t: Transport): TransportStatus =>
    isSelected(t) ? link.status : t.getStatus();

  // Rows grouped by radio.
  const radios: Array<Transport["radio"]> = [
    "bluetooth",
    "wifi",
    "internet",
    "wired",
  ];

  return (
    <View className="rounded-2xl border border-line bg-mist p-3">
      <Text className="text-xs font-black uppercase tracking-widest text-muted">
        Connection method
      </Text>
      <Text className="mt-0.5 text-[11px] leading-4 text-muted">
        Pick how the app talks to the car. One at a time.
      </Text>

      {radios.map((radio) => (
        <View key={radio} className="mt-3">
          <Text className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-muted">
            {RADIO_LABEL[radio]}
          </Text>
          {transports
            .filter((t) => t.radio === radio)
            .map((t) => (
              <TransportRow
                key={t.id}
                transport={t}
                active={isSelected(t)}
                status={statusOf(t)}
                onSelect={onSelect}
              />
            ))}
        </View>
      ))}

      {/* --- per-transport connection details ------------------------- */}
      {needsUrl ? (
        <View className="mt-1 rounded-xl border border-line bg-card p-3">
          <Text className="text-[11px] font-black uppercase tracking-wide text-muted">
            Car address
          </Text>
          <TextInput
            value={url}
            onChangeText={onUrlChange}
            editable={!busy}
            placeholder={
              selected?.id === "http"
                ? `http://${DEFAULT_AP_IP}:80`
                : DEFAULT_WS_URL
            }
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            accessibilityLabel="Car address"
            className="mt-1.5 h-11 rounded-lg border border-line bg-mist px-3 text-[14px] text-ink dark:text-white"
            placeholderTextColor="#64748b"
          />
          <Text className="mt-1.5 text-[11px] leading-4 text-muted">
            {selected?.id === "http"
              ? "HTTP: point at the car's own web server. Default " +
                "http://192.168.245.1:80 works while the phone is on " +
                "4WDCar_Wifi; use the car's LAN address over a router."
              : "Access point: join the car's WiFi first, then use the default " +
                "address. Router: enter the address the car reports in its " +
                "IP row."}
          </Text>
          <Pressable
            onPress={() => onSelect(selected ? selected.id : "wifi-ap-ws")}
            disabled={busy}
            accessibilityRole="button"
            className="mt-2 h-11 flex-row items-center justify-center gap-1.5 rounded-full bg-sky-700 disabled:opacity-50"
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="link" size={14} color="#fff" />
            )}
            <Text className="text-[13px] font-black text-white">
              {busy ? "Connecting…" : "Connect"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {isBluetooth ? (
        <View className="mt-1 rounded-xl border border-line bg-card p-3">
          <Text className="text-[11px] font-black uppercase tracking-wide text-muted">
            {canScan ? "Choose a car" : "Bluetooth"}
          </Text>
          {canScan ? (
            <>
              <Pressable
                onPress={onScan}
                disabled={busy}
                accessibilityRole="button"
                className="mt-2 h-11 flex-row items-center justify-center gap-1.5 rounded-full border border-sky-500/50 bg-sky-500/15 disabled:opacity-50"
              >
                {busy ? (
                  <ActivityIndicator size="small" color="#0284c7" />
                ) : (
                  <Feather name="search" size={14} color="#0284c7" />
                )}
                <Text className="text-[13px] font-black text-sky-700 dark:text-sky-300">
                  {busy ? "Scanning…" : "Scan for cars"}
                </Text>
              </Pressable>
              {devices && devices.length > 0 ? (
                <DeviceList
                  devices={devices}
                  busy={busy}
                  onPick={onConnectDevice}
                />
              ) : null}
            </>
          ) : (
            <Text className="mt-1.5 text-[11px] leading-4 text-muted">
              Classic Bluetooth uses the phone's own paired-car list. Pair the
              car in Android Bluetooth settings, then pick it above.
            </Text>
          )}
        </View>
      ) : null}

      {/* --- active-link footer -------------------------------------- */}
      {selected ? (
        <View className="mt-3 flex-row items-center gap-2">
          <StatusDot status={link.status} />
          <Text
            className="min-w-0 flex-1 text-[12px] font-bold text-ink dark:text-white"
            numberOfLines={1}
          >
            {link.verified
              ? `Verified — ${selected.getTargetLabel() ?? selected.label}`
              : (link.error ??
                `${selected.label} — ${STATUS_META[link.status].label}`)}
          </Text>
          <Pressable
            onPress={onDisconnect}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Disconnect"
            hitSlop={6}
            className="rounded-full border border-line bg-card px-3 py-1.5 disabled:opacity-40"
          >
            <Text className="text-[11px] font-black text-muted">
              Disconnect
            </Text>
          </Pressable>
        </View>
      ) : null}

      {error ? (
        <View className="mt-2 flex-row gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 p-2.5">
          <Feather name="alert-circle" size={13} color="#dc2626" />
          <Text className="flex-1 text-[12px] font-bold leading-4 text-red-700 dark:text-red-300">
            {error}
          </Text>
        </View>
      ) : null}

      {isWifi && !compact ? (
        <View className="mt-3">
          <WifiDiagnosticsPanel
            link={{
              url: selected?.getTargetLabel() ?? null,
              isConnected: link.status === "connected",
              linkVerified: link.verified,
              lastError: link.error,
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
