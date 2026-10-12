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

/**
 * 2026-10-12 (owner): the top connection-status line now carries the readings,
 * so the gamepad's centre gap is free to show the OLED mirror again (restored
 * there). `TelemetryLine` is the compact horizontal form of the SAME readings —
 * uptime / heap / signal — laid inline so it reads as one status line rather
 * than a box. "Link" is dropped here because the line already names the link
 * (the friendly device name / WiFi address just to the left).
 *
 * Honesty rules are unchanged: an unknown reading still dashes, a real zero is
 * still shown as itself, and nothing is inferred from the app's own state.
 */
export function TelemetryLine(props: DriveTelemetryProps) {
  const off = !props.linked;
  const sig = formatSignal({ rssi: props.rssi, signal: props.signal });
  const parts: Reading[] = [
    { label: "Up", value: off ? DASH : formatUptime(props.uptimeMs) },
    { label: "Heap", value: off ? DASH : formatHeap(props.freeHeap) },
    { label: "Sig", value: off ? DASH : sig.value },
  ];

  return (
    <View className="min-w-0 flex-row items-center gap-2.5">
      {parts.map((p) => (
        <View key={p.label} className="flex-row items-center gap-1">
          <Text className="text-[8px] font-black uppercase tracking-[0.14em] text-muted">
            {p.label}
          </Text>
          <Text
            numberOfLines={1}
            className="font-mono text-[11px] font-bold text-ink dark:text-white"
          >
            {p.value}
          </Text>
        </View>
      ))}
    </View>
  );
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
