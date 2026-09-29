// =====================================================================
// ConnectionBanner — the "what is actually linked right now" hero of the
// Control Panel's dedicated Connections surface.
//
// It only ever says what is TRUE:
//   • App link   — the transport that is live (Bluetooth / the two WiFi
//                  shapes are distinguished by linkManager's selection,
//                  never by a shared-socket guess — see adapters.ts).
//   • Car        — the car's name and, when the firmware reports it, the
//                  board-unique id.
//   • Network    — STA truth: "car is on your home router <ssid>" with
//                  dBm signal bars, all read from car telemetry; otherwise
//                  "car is its own access point". Never both.
// This replaces the old two-card duplication (owner ① ② ③).
// =====================================================================
import React from "react";
import { Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";

export type ConnectionBannerProps = {
  /** Any link (BT or WiFi) is up at the transport level. */
  linked: boolean;
  /** The active link has actually been verified by the car (telemetry). */
  verified: boolean;
  /** Human label of the chosen transport (from the picker/manager). */
  linkLabel: string | null;
  /** The car's display name (BT device name or WiFi AP name). */
  carLabel: string | null;
  /** Board-unique id from firmware (ESP.getEfuseMac, last 6 hex) — v2. */
  carId: string | null;
  /** STA truth: the router SSID the CAR joined, or null when not on one. */
  staSsid: string | null;
  /** Own-AP truth: the car's own hotspot name when it is not on a router. */
  apName: string | null;
  /** Signal % when the car reports it (0..100), else null. */
  signal: number | null;
  /** RSSI dBm when the car reports it, else null. */
  rssi: number | null;
  /** Current link error message, if the last attempt failed. */
  error: string | null;
};

const BAR_COLORS = ["#dc2626", "#f59e0b", "#84cc16", "#10b981", "#059669"];

function SignalBars({ signal }: { signal: number | null }) {
  if (signal === null) return null;
  const bars = Math.min(5, Math.max(1, Math.ceil(signal / 20)));
  return (
    <View className="flex-row items-end gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <View
          key={i}
          className="w-1.5 rounded-sm"
          style={{
            height: 6 + i * 3,
            backgroundColor:
              i < bars ? BAR_COLORS[Math.min(bars - 1, 4)] : "#cbd5e1",
          }}
        />
      ))}
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  sub,
  trailing,
  children,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value?: React.ReactNode;
  sub?: React.ReactNode;
  /** Right-aligned accessory that is NOT body text (e.g. signal bars). */
  trailing?: React.ReactNode;
  children?: React.ReactNode;
}) {
  // F-48: body content (children) lives INSIDE the flex-1 text column, not
  // beside it. As a sibling column the Car/Network lines split the row in
  // two — in portrait the long line was crushed into a sliver next to a
  // mostly-empty label column (the "lots of space" the owner saw), while
  // landscape's extra width accidentally hid the bug.
  return (
    <View className="flex-row items-center gap-3 border-t border-line/70 py-2.5">
      <View className="h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mist">
        <Feather name={icon} size={14} color="#1e3a8a" />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-[10px] font-black uppercase tracking-wide text-muted">
          {label}
        </Text>
        {value}
        {sub}
        {children}
      </View>
      {trailing}
    </View>
  );
}

export function ConnectionBanner({
  linked,
  verified,
  linkLabel,
  carLabel,
  carId,
  staSsid,
  apName,
  signal,
  rssi,
  error,
}: ConnectionBannerProps) {
  const linkTint = linked ? (verified ? "#059669" : "#0284c7") : "#94a3b8";
  const linkWord = !linked
    ? "No link"
    : verified
      ? "Linked & verified"
      : "Linked — waiting for the car";
  const networkKind = staSsid ? "sta" : apName ? "ap" : null;

  return (
    <View className="rounded-2xl border border-line bg-card p-4 shadow-card">
      {/* Live link row */}
      <View className="flex-row items-center gap-2">
        <View
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: linkTint }}
        />
        <Text className="flex-1 text-[13px] font-black text-ink dark:text-white">
          {linkWord}
        </Text>
        {!linked ? (
          <Text className="shrink-0 text-[11px] font-bold text-muted">
            Pick a method below
          </Text>
        ) : (
          <Text className="shrink-0 text-[11px] font-bold text-sky-700 dark:text-sky-300">
            {linkLabel}
          </Text>
        )}
      </View>

      {error ? (
        <Text className="mt-1.5 text-[11px] font-bold leading-4 text-red-600 dark:text-red-400">
          {error}
        </Text>
      ) : null}

      {linked ? (
        <View className="mt-2">
          <Row icon="cpu" label="Car">
            <Text className="text-[13px] font-bold text-ink dark:text-white">
              {carLabel ?? "Connected car"}
            </Text>
            {carId ? (
              <Text className="text-[11px] font-mono text-muted">#{carId}</Text>
            ) : null}
          </Row>

          <Row icon="wifi" label="Network on the car">
            {networkKind === "sta" ? (
              <>
                <Text className="text-[13px] font-bold text-ink dark:text-white">
                  On your router · {staSsid}
                </Text>
                <Text className="text-[11px] leading-4 text-muted">
                  The car joined your home WiFi (STA) and the phone reaches it
                  there. Range = router range.
                </Text>
              </>
            ) : networkKind === "ap" ? (
              <>
                <Text className="text-[13px] font-bold text-ink dark:text-white">
                  Own access point · {apName}
                </Text>
                <Text className="text-[11px] leading-4 text-muted">
                  The car is broadcasting its own hotspot (AP). Join {apName} to
                  talk to it directly.
                </Text>
              </>
            ) : (
              <Text className="text-[13px] font-bold text-ink dark:text-white">
                WiFi truth not reported
              </Text>
            )}
          </Row>

          {signal !== null ? (
            <Row
              icon="bar-chart-2"
              label="Signal"
              sub={
                <Text className="text-[11px] text-muted">
                  {signal}%{rssi !== null ? ` · ${rssi} dBm` : ""}
                </Text>
              }
              trailing={<SignalBars signal={signal} />}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
