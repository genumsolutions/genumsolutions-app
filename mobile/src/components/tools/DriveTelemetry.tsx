// =====================================================================
// DriveTelemetry — the compact link / uptime / heap / signal readout that
// replaced the app's OLED mirror (Phase 3, owner 2026-10-12).
//
// It renders the SAME four readings the OLED mirror's data came from, now
// placed around the drive controls: in the gamepad's center gap (compact)
// and beside the drive column in the telemetry view (full).
//
// Every number is formatted by the pure, tested `telemetryFormat.ts`, so the
// honesty rules there still hold here: an unknown reading dashes instead of
// rendering as 0, a real zero (a stopped car, 0 s uptime) is shown as itself,
// and the values are the CAR's own — never the app's optimistic guess.
// =====================================================================
import React from "react";
import { Text, View } from "react-native";
import {
  DASH,
  formatHeap,
  formatSignal,
  formatUptime,
} from "./telemetryFormat";

export type DriveTelemetryProps = {
  /** True when any transport is live (BT or Wi-Fi). */
  linked: boolean;
  /** Human label for the active transport ("Bluetooth" / "WiFi"). */
  linkLabel: string;
  /** Car's RSSI in dBm (JSON `rssi`) — preferred signal unit. */
  rssi?: number | null;
  /** Car's 0..100 signal % (JSON `signal`) — fallback when RSSI is absent. */
  signal?: number | null;
  /** Car's uptime ms (JSON `uptime_ms`). */
  uptimeMs?: number | null;
  /** Car's free heap bytes (JSON `free_heap`). */
  freeHeap?: number | null;
  /** Tighter 2×2 tile grid for the gamepad's center gap; the default is a
      roomier 2×2 grid of the same readings for the telemetry view. */
  compact?: boolean;
};

type Reading = { label: string; value: string };

function readings(p: DriveTelemetryProps): Reading[] {
  const off = !p.linked;
  const sig = formatSignal({ rssi: p.rssi, signal: p.signal });
  return [
    {
      label: "Link",
      value: off ? "Offline" : p.linkLabel.trim() || "Connected",
    },
    { label: "Uptime", value: off ? DASH : formatUptime(p.uptimeMs) },
    { label: "Heap", value: off ? DASH : formatHeap(p.freeHeap) },
    { label: "Signal", value: off ? DASH : sig.value },
  ];
}

export function DriveTelemetry(props: DriveTelemetryProps) {
  const items = readings(props);
  const compact = props.compact === true;

  return (
    <View
      className={
        compact
          ? "h-full w-full flex-row flex-wrap content-center rounded-lg bg-slate-900 px-1 py-1"
          : "w-full flex-row flex-wrap rounded-xl bg-slate-900 p-2"
      }
      style={{ gap: compact ? 2 : 8 }}
    >
      {items.map((it) => (
        <View
          key={it.label}
          className={compact ? "basis-1/2 px-0.5" : "basis-1/2"}
        >
          <View
            className={
              compact
                ? "rounded-md bg-slate-800/70 px-1.5 py-1"
                : "rounded-lg bg-slate-800/70 px-2 py-1.5"
            }
          >
            <Text
              numberOfLines={1}
              className={`font-black uppercase tracking-[0.16em] text-slate-400 ${
                compact ? "text-[9px]" : "text-[10px]"
              }`}
            >
              {it.label}
            </Text>
            <Text
              numberOfLines={1}
              className={`mt-0.5 font-mono font-bold text-emerald-300 ${
                compact ? "text-[13px]" : "text-[15px]"
              }`}
            >
              {it.value}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
