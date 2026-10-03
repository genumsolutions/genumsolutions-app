// =====================================================================
// The Control Panel's instrument readings — pure, no React, no NativeWind.
//
// Split out of `TelemetryStrip.tsx` so it can be tested: this project's vitest
// setup does not transform `react-native`, so a test may not import a `.tsx`
// component. The convention throughout the tools/ folder is the same —
// `routerMemory.ts`, `routerPanelOutcome.ts`, `commands.ts` are all pure `.ts`
// with the view on top.
//
// The formatting rules are the substance here, and each is a place a UI like
// this usually lies by accident:
//
//   * an unknown reading DASHES — it never renders as 0, and a page that has
//     no numbers fills the space with words instead (taglines, capability
//     lists), which is what the old Control Panel did;
//   * a REAL zero does not dash. Speed 0 means the car is stopped; a car that
//     booted a moment ago has 0 s uptime. Showing "—" for those would be its
//     own kind of lie;
//   * the displayed mode is the car's REPORTED mode, never the app's
//     optimistic guess, so a refused mode cannot be papered over.
// =====================================================================

export type TelemetryTone = "normal" | "good" | "bad" | "muted";

export type TelemetryField = {
  readonly label: string;
  readonly value: string;
  readonly tone: TelemetryTone;
  /** Short second line. Omitted rather than padded when there is nothing to say. */
  readonly hint?: string;
};

export const DASH = "—";

/** `3814000` -> `1h 03m`. Dashes when the car has not said. */
export function formatUptime(uptimeMs?: number | null): string {
  if (
    typeof uptimeMs !== "number" ||
    !Number.isFinite(uptimeMs) ||
    uptimeMs < 0
  )
    return DASH;
  const total = Math.floor(uptimeMs / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

/**
 * Signal from RSSI in dBm (negative: -30 strong .. -90 unusable).
 *
 * Also accepts the 0-100 `signal` some cars report instead, preferring dBm
 * because it is the honest unit. A bare `rssi: 0` is treated as UNKNOWN:
 * several firmwares send 0 to mean "no reading", and printing "0 dBm" would
 * look like the strongest possible signal.
 */
export function formatSignal(args: {
  rssi?: number | null;
  signal?: number | null;
}): { value: string; quality: string | null; tone: TelemetryTone } {
  const { rssi, signal } = args;
  if (typeof rssi === "number" && Number.isFinite(rssi) && rssi !== 0) {
    const quality =
      rssi >= -55
        ? "Excellent"
        : rssi >= -65
          ? "Good"
          : rssi >= -75
            ? "Fair"
            : "Weak";
    const tone: TelemetryTone =
      rssi >= -65 ? "good" : rssi >= -75 ? "normal" : "bad";
    return { value: `${rssi} dBm`, quality, tone };
  }
  if (typeof signal === "number" && Number.isFinite(signal) && signal > 0) {
    const pct = Math.max(0, Math.min(100, Math.round(signal)));
    return {
      value: `${pct}%`,
      quality: pct >= 66 ? "Good" : pct >= 33 ? "Fair" : "Weak",
      tone: pct >= 66 ? "good" : pct >= 33 ? "normal" : "bad",
    };
  }
  return { value: DASH, quality: null, tone: "muted" };
}

/** Free heap in bytes -> `40 kB`. This is the CAR's heap, not the phone's. */
export function formatHeap(bytes?: number | null): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0)
    return DASH;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} kB`;
}

/** A speed of 0 is a real, meaningful reading (stopped) and must not dash. */
export function formatSpeed(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return DASH;
  return String(Math.round(value));
}

/** The one line under the title: who this car is and where it is. */
export function describeCar(args: {
  id?: string | null;
  mode?: string | null;
  ssid?: string | null;
  ip?: string | null;
}): string {
  const bits = [args.mode, args.ssid, args.ip].filter(
    (b): b is string => typeof b === "string" && b.trim().length > 0,
  );
  return bits.length > 0 ? bits.join("  ·  ") : "No car reporting yet";
}

export type BuildTelemetryArgs = {
  readonly connected: boolean;
  readonly mode?: string | null;
  readonly speed?: number | null;
  readonly rssi?: number | null;
  readonly signal?: number | null;
  readonly uptimeMs?: number | null;
  readonly freeHeap?: number | null;
  /** The transport in use, shown on the Link tile. */
  readonly linkLabel?: string | null;
};

/** The six readings, in a fixed order. This is the tested part. */
export function buildCarTelemetry(args: BuildTelemetryArgs): TelemetryField[] {
  const off = !args.connected;
  const sig = formatSignal({ rssi: args.rssi, signal: args.signal });
  return [
    {
      label: "Mode",
      value: off ? DASH : args.mode?.trim() || DASH,
      tone: off ? "muted" : "normal",
    },
    {
      label: "Speed",
      value: off ? DASH : formatSpeed(args.speed),
      tone: off ? "muted" : "normal",
    },
    {
      label: "Signal",
      value: off ? DASH : sig.value,
      tone: off ? "muted" : sig.tone,
      ...(off || !sig.quality ? {} : { hint: sig.quality }),
    },
    {
      label: "Uptime",
      value: off ? DASH : formatUptime(args.uptimeMs),
      tone: off ? "muted" : "normal",
    },
    {
      label: "Heap",
      value: off ? DASH : formatHeap(args.freeHeap),
      tone: off ? "muted" : "normal",
    },
    {
      label: "Link",
      value: off ? "Offline" : args.linkLabel?.trim() || "Connected",
      tone: args.connected ? "good" : "bad",
    },
  ];
}
