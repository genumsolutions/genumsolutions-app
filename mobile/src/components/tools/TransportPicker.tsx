// =====================================================================
// TransportPicker — the "pick your connection method" card.
//
// Owner 2026-09-28: "I want this app to be able to communicate and control
// all the types of wifi and bluetooth communications ... the user gets to
// choose to select one which they like at a time." Later the same round: the
// picker had grown a long repeated list of every method, so the top of the
// page read as duplicate connection-method content. It is now ONE dropdown
// ("Connection method") holding every registered method, each with a small
// ⓘ icon that opens a separate small window with how that method is used.
//
// The dropdown replaces a 2-way Bluetooth/WiFi segmented toggle that could
// not express the real choice space. Every possible method is REGISTERED so
// no option is missing, and each method has a help icon (ⓘ) that opens
// a small window with instructions on how to connect and what to expect.
//
// Selecting a method is the ONLY way a link becomes active, so the chosen
// method genuinely controls the link — the old `goBt ?? goWs` priority
// silently preferred Bluetooth and made a WiFi run impossible without
// unplugging BT in another screen.
//
// F-12: all state is read from the manager on every render; nothing is
// cached in local state except the scan results and the typed URL, which
// are inputs, not connection state.
// =====================================================================
import React from "react";
import {
  ActivityIndicator,
  Modal,
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
import { isSelectable } from "./transportGate";

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
  /**
   * R4-4 (owner): reports the method the user has CHOSEN in the dropdown
   * (pickedId, null before a choice / after Disconnect). The screen mounts
   * method-specific surfaces from this — the home-router method gets the
   * Router panel, and ONLY that method does, so AP/Bluetooth links never
   * show router-management UI (no method flavor mixing).
   */
  onPickedChange?: (id: TransportId | null) => void;
};

/** The dropdown groups methods by radio so the choice reads as
 *  "which radio, then which kind". `wired` was removed when the cable/USB
 *  -serial method was removed at the owner's request. */
const RADIO_LABEL = {
  bluetooth: "Bluetooth",
  wifi: "WiFi",
  internet: "Internet & cloud",
} as const;

type FeatherName = keyof typeof Feather.glyphMap;

const RADIO_ICON: Record<Transport["radio"], FeatherName> = {
  bluetooth: "bluetooth",
  wifi: "wifi",
  internet: "globe",
};

/** Capability chips, in a fixed order so the rows line up. */
const CAPABILITY_LABEL: Array<[TransportCapability, string]> = [
  ["drive", "Drive"],
  ["telemetry", "Data"],
  ["mode", "Mode"],
  ["wifiConfig", "WiFi setup"],
  ["ota", "Firmware"],
];

/**
 * PRIMARY methods (owner 2026-09-29): only these are selectable today. Every
 * other registered method renders dimmed with a "Coming Soon" tag — its ⓘ
 * help window stays fully readable, but picking it can never start a link
 * and cannot be dialled even where `isSupported()` would say yes. SPP + the
 * car access point are the proven paths; R4-3 (owner go 2026-09-29) adds the
 * home-router (STA) shape: the transport + adapter already existed and the
 * U-51 device round verified SPP + AP on the car, which was this gate's
 * stated condition for unlocking STA. It stays gated on `isSupported()`.
 *
 * The rule itself moved to ./transportGate so CI can prove the gate holds —
 * a gate over drive commands must not depend on a human noticing on a device.
 */

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

function MethodOption({
  transport,
  active,
  status,
  onSelect,
  onHelp,
}: {
  transport: Transport;
  active: boolean;
  status: TransportStatus;
  onSelect: (id: TransportId) => void;
  onHelp: (t: Transport) => void;
}) {
  const meta = STATUS_META[status];
  const selectable = isSelectable(transport);
  // A compact row inside the dropdown: label, status, and a small ⓘ icon.
  return (
    <View
      className={`mb-1.5 flex-row items-center gap-2 rounded-lg border px-2.5 py-2 ${
        active ? "border-sky-500 bg-sky-500/10" : "border-line bg-card"
      } ${selectable ? "" : "opacity-60"}`}
    >
      <Pressable
        onPress={() => onSelect(transport.id)}
        disabled={!selectable}
        accessibilityRole="radio"
        accessibilityState={{ selected: active, disabled: !selectable }}
        accessibilityLabel={`${transport.label}. ${meta.label}`}
        className="min-w-0 flex-1 flex-row items-center gap-2"
      >
        <Feather
          name={RADIO_ICON[transport.radio]}
          size={14}
          color={active ? "#0284c7" : "#64748b"}
        />
        <Text
          className={`min-w-0 flex-1 text-[13px] font-black ${
            active
              ? "text-sky-700 dark:text-sky-300"
              : "text-ink dark:text-white"
          }`}
          numberOfLines={1}
        >
          {transport.label}
        </Text>
        {active ? <StatusDot status={status} /> : null}
        {!selectable ? (
          <Text className="shrink-0 text-[10px] font-bold text-amber-600 dark:text-amber-400">
            Coming Soon
          </Text>
        ) : null}
      </Pressable>
      {/* Small help icon — opens a separate small window with the details. */}
      <Pressable
        onPress={() => onHelp(transport)}
        accessibilityRole="button"
        accessibilityLabel={`How ${transport.label} works`}
        hitSlop={6}
        className="h-6 w-6 items-center justify-center rounded-full active:opacity-60"
      >
        <Feather name="help-circle" size={15} color="#0284c7" />
      </Pressable>
    </View>
  );
}

/** The per-method help window — a small modal showing what the method is, what
 *  it needs, when to use it, and how to connect + verify. Reached from the ⓘ
 *  icon on any dropdown option. */
function MethodHelpModal({
  transport,
  onClose,
}: {
  transport: Transport;
  onClose: () => void;
}) {
  const teaching = transport.teaching;
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close help"
        className="flex-1 items-center justify-center bg-black/60 px-6"
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          accessibilityViewIsModal
          className="max-h-[80%] w-full max-w-md rounded-2xl border border-line bg-card p-4"
        >
          <View className="flex-row items-center gap-2">
            <Feather
              name={RADIO_ICON[transport.radio]}
              size={15}
              color="#0284c7"
            />
            <Text className="min-w-0 flex-1 text-[14px] font-black text-ink dark:text-white">
              {transport.label}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={6}
              className="h-6 w-6 items-center justify-center rounded-full active:opacity-60"
            >
              <Feather name="x" size={16} color="#64748b" />
            </Pressable>
          </View>

          <ScrollView
            className="mt-2"
            style={{ maxHeight: 420 }}
            nestedScrollEnabled
          >
            <Text className="text-[12px] leading-4 text-muted">
              {transport.blurb}
            </Text>
            {teaching ? (
              <>
                <Text className="mt-3 text-[12px] leading-4 text-ink dark:text-white">
                  {teaching.intro}
                </Text>
                <Text className="mt-2.5 text-[10px] font-black uppercase tracking-wide text-muted">
                  What you need
                </Text>
                <Text className="text-[12px] leading-4 text-muted">
                  {teaching.needs}
                </Text>
                <Text className="mt-2.5 text-[10px] font-black uppercase tracking-wide text-muted">
                  When to use it
                </Text>
                <Text className="text-[12px] leading-4 text-muted">
                  {teaching.when}
                </Text>
                {teaching.serverClient ? (
                  <>
                    <Text className="mt-2.5 text-[10px] font-black uppercase tracking-wide text-muted">
                      Who connects to whom
                    </Text>
                    <Text className="text-[12px] leading-4 text-muted">
                      {teaching.serverClient}
                    </Text>
                  </>
                ) : null}
                <Text className="mt-2.5 text-[10px] font-black uppercase tracking-wide text-muted">
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
              </>
            ) : null}
            {!isSelectable(transport) ? (
              <View className="mt-3 flex-row gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2">
                <Feather name="clock" size={12} color="#d97706" />
                <Text className="flex-1 text-[11px] font-bold leading-4 text-amber-700 dark:text-amber-400">
                  {transport.roadmapNote ??
                    "Coming Soon — this method is registered but not opened for selection yet. Classic Bluetooth (SPP) and the car's access point are the verified paths; more methods unlock after they are proven on the car."}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          {/* What it can do — declared capabilities, same source as the row. */}
          <View className="mt-3 flex-row flex-wrap items-center gap-1">
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** The scan result list. Extracted to keep the picker shallow — F-9 (one
 *  subscription/owner per concern) and it removes a 6-level JSX nest that
 *  proved hostile to edit.
 *
 *  Owner 2026-10-01: the rows were too small to hit reliably on a phone —
 *  a thin pill with the whole row as the tap area. Two changes, both
 *  additive: every row is now at least a 48 dp touch target (py-3 +
 *  minHeight), and each row carries its OWN "Connect" button on the right
 *  so the target does not depend on hitting the row precisely. The row's
 *  onPress stays (tapping the name is still a shortcut), but the explicit
 *  button is what a thumb aims for. `hitSlop` widens the button's tap area
 *  past its visual bounds so the small right-hand capsule is comfortable.
 *  Paired state reads as a chip rather than bare text, because "Not
 *  paired" and a signal number ("-57 dBm", BLE) are different kinds of
 *  fact and the pairing one is the actionable one. */
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
    <ScrollView className="mt-2" style={{ maxHeight: 240 }} nestedScrollEnabled>
      {devices.map((d) => {
        const paired = d.detail === "Paired";
        return (
          <Pressable
            key={d.id}
            onPress={() => onPick(d)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Connect to ${d.name}`}
            // 48 dp minimum touch target (Android/Apple guidance) — the row
            // was ~30 dp tall and missed taps under a moving thumb.
            style={{ minHeight: 48 }}
            className="mt-1.5 flex-row items-center gap-2 rounded-lg border border-line bg-mist px-3 py-3 disabled:opacity-50"
          >
            <Feather name="bluetooth" size={13} color="#64748b" />
            <View className="min-w-0 flex-1">
              <Text
                className="text-[13px] font-bold text-ink dark:text-white"
                numberOfLines={1}
              >
                {d.name}
              </Text>
              <View className="mt-0.5 flex-row items-center gap-1.5">
                {paired ? (
                  <View className="rounded-full bg-emerald-500/15 px-1.5 py-0.5">
                    <Text className="text-[10px] font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                      Paired
                    </Text>
                  </View>
                ) : null}
                {d.detail && !paired ? (
                  <Text className="text-[11px] text-muted" numberOfLines={1}>
                    {d.detail}
                  </Text>
                ) : null}
              </View>
            </View>
            <Pressable
              onPress={() => onPick(d)}
              disabled={busy}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Connect to ${d.name}`}
              accessibilityState={{ disabled: busy, busy }}
              className="h-11 shrink-0 items-center justify-center rounded-full bg-sky-700 px-4 disabled:opacity-40"
            >
              <Text className="text-[12px] font-black text-white">Connect</Text>
            </Pressable>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function TransportPicker({
  compact = false,
  onActivate,
  onDeactivate,
  onPickedChange,
}: TransportPickerProps) {
  const transports = useTransportList();
  const link = useActiveTransport();
  const activate = useActivateTransport();

  // Inputs, not connection state (F-12).
  const [url, setUrl] = React.useState(DEFAULT_WS_URL);
  const [devices, setDevices] = React.useState<DiscoveredDevice[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // The dropdown is the ONE list of methods; the help window is a modal on top.
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [help, setHelp] = React.useState<Transport | null>(null);
  // The method the user has CHOSEN in the dropdown. Tracked separately from the
  // active link on purpose: before the first connect there is no active link,
  // so deriving the connection UI from it left the scan button and the address
  // box invisible on a freshly opened Control Panel — the "scanning is missing
  // from the control page" report. Choosing a method now always shows that
  // method's own steps, connected or not.
  const [pickedId, setPickedId] = React.useState<TransportId | null>(null);
  // R4-2 (owner 2026-10-02): changing method while a link is live is a TEARDOWN
  // decision, so it stays confirmed — but it is no longer refused. Picking a
  // different method queues it here instead of silently dropping the tap, and
  // the inline strip asks once before the link comes down. Deliberately an
  // inline strip and NOT a fixed/absolute overlay: this card renders inside the
  // Control Panel ScrollView, where an inset-0 overlay maps to the whole
  // scrollable page and lands far below the fold (the F-47 lesson).
  const [pendingSwitch, setPendingSwitch] = React.useState<TransportId | null>(
    null,
  );

  // R4-4: publish the chosen method upward (screen-level surfaces). The
  // effect, not a render-phase call — a parent setState during render would
  // throw. onPickedChange is expected to be stable (useCallback upstream).
  React.useEffect(() => {
    onPickedChange?.(pickedId);
  }, [pickedId, onPickedChange]);

  const active = link.id
    ? (transports.find((t) => t.id === link.id) ?? null)
    : null;
  // The chosen method: what the dropdown is set to, falling back to the live
  // link (so a link that comes up on its own still shows its own steps).
  const selected =
    (pickedId ? transports.find((t) => t.id === pickedId) : null) ?? active;
  const isSelected = (t: Transport) => selected?.id === t.id;
  const isWifi = selected?.radio === "wifi";
  const isBluetooth = selected?.radio === "bluetooth";
  // WiFi and HTTP are the two address-driven methods; the rest dial directly.
  const needsUrl = isWifi || selected?.id === "http";
  // Only a link with a device scan offers one.
  const canScan = Boolean(selected?.scan);
  // The live link is the chosen method only while it is actually up.
  const isActiveLink = Boolean(active && active.id === selected?.id);
  // R4-2 (owner, revised 2026-10-02): a live link used to LOCK this dropdown,
  // which left "change the communication method while connected" impossible from
  // the page that owns the method choice. It is now a CONFIRMED teardown: the
  // chip stays tappable while connected, picking a different method queues a
  // switch behind the inline confirm, and onSelect dials the new method only
  // after the old link is down. Re-picking the live method stays a no-op, and a
  // "Coming Soon" row is refused before it can touch the link.

  // Every method once, in registry order, grouped by radio. The cable group is
  // gone with the USB-serial method. De-duplicated by id on purpose (owner:
  // "dont display dublicates") — a transport registered twice must still show
  // as a single choice.
  const RADIOS: Array<Transport["radio"]> = ["bluetooth", "wifi", "internet"];
  const seen = new Set<TransportId>();
  const methodGroups = RADIOS.map((radio) => ({
    radio,
    items: transports.filter(
      (t) => t.radio === radio && !seen.has(t.id) && !!seen.add(t.id),
    ),
  })).filter((g) => g.items.length > 0);

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

  // Apply the pick and put the link up. Shared by the plain path and the
  // confirmed-switch path so both behave identically once the teardown is done.
  const pickAndDial = React.useCallback(
    async (id: TransportId, t: Transport) => {
      setDevices(null);
      setError(null);
      setMenuOpen(false);
      setPendingSwitch(null);
      // Remember the choice first, so its connection steps (address box, scan)
      // show immediately — the user chose it, so its UI is what they need.
      setPickedId(id);
      // A device-driven method (Bluetooth) is NOT dialled on selection: the car
      // is only reachable at an address the user has to pick from a scan, and
      // connecting blind just raised "Pick a car from the Bluetooth list" as if
      // the method were broken. Pick it, show the scan, connect on the tap.
      if (t.scan) return;
      // WiFi and HTTP need an address; the rest dial the car directly.
      if (t.radio === "wifi" || t.id === "http") {
        await activateTransport(id, url.trim() ? { url: url.trim() } : {});
      } else {
        await activateTransport(id, {});
      }
    },
    [activateTransport, url],
  );

  const teardownLink = React.useCallback(async () => {
    await (onDeactivate ? onDeactivate() : linkManager.deactivate());
  }, [onDeactivate]);

  // The user confirmed the switch: the OLD link comes down first, then the new
  // method is picked and dialled. Order matters — dialling first would leave two
  // live transports and the banner could only report one of them.
  const onConfirmSwitch = React.useCallback(() => {
    const id = pendingSwitch;
    if (!id) return;
    const t = transports.find((x) => x.id === id);
    if (!t) {
      setPendingSwitch(null);
      return;
    }
    void run(async () => {
      await teardownLink();
      await pickAndDial(id, t);
    });
  }, [pendingSwitch, pickAndDial, run, teardownLink, transports]);

  const onCancelSwitch = React.useCallback(() => {
    setPendingSwitch(null);
  }, []);

  const onSelect = React.useCallback(
    (id: TransportId) => {
      const t = transports.find((x) => x.id === id);
      if (!t) return;
      // PRIMARY-method gate (owner 2026-09-29) runs BEFORE anything else: a
      // "Coming Soon" row must never be able to tear a working link down.
      if (!isSelectable(t)) return;
      // R4-2 (owner 2026-10-02): a live link no longer refuses the switch, it
      // confirms it. Re-picking the method that is ALREADY live is a no-op —
      // that must never drop a working connection.
      if (link.id) {
        setMenuOpen(false);
        if (link.id === id) return;
        setPendingSwitch(id);
        return;
      }
      void run(() => pickAndDial(id, t));
    },
    [link.id, pickAndDial, run, transports],
  );

  const onScan = React.useCallback(() => {
    if (!selected?.scan || !isSelectable(selected)) return;
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
      if (!selected || !isSelectable(selected)) return;
      // Name rides along so a screen-side connect (SPP bridge) can label the
      // car without re-reading this mutable scan list.
      void run(() =>
        activateTransport(selected.id, { address: d.id, name: d.name }),
      );
    },
    [activateTransport, run, selected],
  );

  const onDisconnect = React.useCallback(() => {
    setPickedId(null);
    setDevices(null);
    void run(() => (onDeactivate ? onDeactivate() : linkManager.deactivate()));
  }, [onDeactivate, run]);

  const statusOf = (t: Transport): TransportStatus =>
    t.id === active?.id ? link.status : t.getStatus();

  return (
    <View className="rounded-2xl border border-line bg-mist p-3">
      <Text className="text-xs font-black uppercase tracking-widest text-muted">
        Connection method
      </Text>
      <Text className="mt-0.5 text-[11px] leading-4 text-muted">
        Pick how the app talks to the car. One at a time. Tap ⓘ on any method
        for how it works.
      </Text>

      {/* --- the single dropdown: all methods, one at a time ------------ */}
      <Pressable
        onPress={() => {
          // R4-2 (revised): the chip opens even while a link is live — choosing
          // a different method now goes through the inline confirm below, so the
          // method can be changed from the page that owns the choice.
          setMenuOpen((v) => !v);
        }}
        accessibilityRole="combobox"
        accessibilityState={{ expanded: menuOpen, disabled: busy }}
        accessibilityLabel="Connection method"
        className="mt-2.5 flex-row items-center gap-2 rounded-xl border border-line bg-card px-3 py-2.5"
      >
        {selected ? (
          <>
            <Feather
              name={RADIO_ICON[selected.radio]}
              size={15}
              color="#0284c7"
            />
            <Text
              className="min-w-0 flex-1 text-[13px] font-black text-ink dark:text-white"
              numberOfLines={1}
            >
              {selected.label}
            </Text>
            {isActiveLink ? (
              <>
                <StatusDot status={link.status} />
                <Text className="shrink-0 text-[11px] font-bold text-muted">
                  {STATUS_META[link.status].label}
                </Text>
              </>
            ) : (
              <Text className="shrink-0 text-[11px] font-bold text-muted">
                Not connected
              </Text>
            )}
          </>
        ) : (
          <>
            <Feather name="link" size={15} color="#64748b" />
            <Text className="min-w-0 flex-1 text-[13px] font-bold text-muted">
              Choose a method
            </Text>
          </>
        )}
        <Feather
          name={menuOpen ? "chevron-up" : "chevron-down"}
          size={15}
          color="#64748b"
        />
      </Pressable>

      {menuOpen ? (
        <View className="mt-2 rounded-xl border border-line bg-card p-2">
          {methodGroups.map((g) => (
            <View key={g.radio} className="mb-1">
              <Text className="mb-1 px-1 text-[10px] font-black uppercase tracking-wide text-muted">
                {RADIO_LABEL[g.radio]}
              </Text>
              {g.items.map((t) => (
                <MethodOption
                  key={t.id}
                  transport={t}
                  active={isSelected(t)}
                  status={statusOf(t)}
                  onSelect={onSelect}
                  onHelp={setHelp}
                />
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {/* R4-2 (revised): the confirmed method switch. Inline, not an overlay —
          an inset-0 overlay inside this ScrollView centers below the fold
          (F-47). Says exactly what is about to go down, and names the method
          being switched to. */}
      {pendingSwitch ? (
        <View className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <Text className="text-[12px] font-black text-amber-900">
            Switch to{" "}
            {transports.find((t) => t.id === pendingSwitch)?.label ??
              "another method"}
            ?
          </Text>
          <Text className="mt-1 text-[11px] leading-4 text-amber-800">
            This disconnects {active?.label ?? "the current link"} first. The
            car stops safely and your saved settings are remembered.
          </Text>
          <View className="mt-2.5 flex-row gap-2">
            <Pressable
              onPress={onConfirmSwitch}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Confirm method switch"
              accessibilityState={{ disabled: busy, busy }}
              className="h-11 flex-1 items-center justify-center rounded-full bg-sky-700 px-4 disabled:opacity-40"
            >
              <Text className="text-[13px] font-black text-white">Switch</Text>
            </Pressable>
            <Pressable
              onPress={onCancelSwitch}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Cancel method switch"
              accessibilityState={{ disabled: busy }}
              className="h-11 flex-1 items-center justify-center rounded-full border border-line bg-card px-4 disabled:opacity-40"
            >
              <Text className="text-[13px] font-bold text-ink">Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* --- per-transport connection details ------------------------- */}
      {/* Owner 2026-10-01: parity with the Bluetooth path — once a link is
          live the address box + Connect button are dead weight (the method
          chip above is locked and already reads "Connected", and the footer
          below carries the Disconnect). Hiding them on `link.id` keeps the
          post-connect surface identical whichever method was chosen. */}
      {needsUrl && !link.id ? (
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
            disabled={busy || (selected ? !isSelectable(selected) : false)}
            accessibilityRole="button"
            accessibilityState={{
              disabled: busy || (selected ? !isSelectable(selected) : false),
            }}
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
              {devices &&
              devices.length > 0 &&
              !link.id &&
              link.status !== "connected" ? (
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
      {active ? (
        <View className="mt-3 flex-row items-center gap-2">
          <StatusDot status={link.status} />
          <Text
            className="min-w-0 flex-1 text-[12px] font-bold text-ink dark:text-white"
            numberOfLines={1}
          >
            {link.verified
              ? `Verified — ${active.getTargetLabel() ?? active.label}`
              : (link.error ??
                `${active.label} — ${STATUS_META[link.status].label}`)}
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

      {/* --- the per-method help window (small, separate) ------------- */}
      {help ? (
        <MethodHelpModal transport={help} onClose={() => setHelp(null)} />
      ) : null}
    </View>
  );
}
