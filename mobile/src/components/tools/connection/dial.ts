// =====================================================================
// connection/dial — the ONE place a connection address is produced.
//
// The rule this file exists to make unbreakable:
//
//   A DIAL IS ONLY EVER BUILT FROM AN ADDRESS THE CAR REPORTED.
//
// with exactly one exception, which is a compile-time fact rather than a
// guess: the car BROADCASTS its own hotspot, so when the target IS that
// hotspot the known gateway address is correct by construction. That
// exception is tagged `car-ap-constant` so a reader can see it is a constant
// and not a default.
//
// The defect this replaces (D4, owner report: *"the method switching was
// not working"*): selecting the home-router method while disconnected
// blind-dialled `ws://192.168.245.1:81` — the car's own AP — because
// `transportPickerFlow.DEFAULT_URL_BY_METHOD["wifi-sta-ws"]` was set to the
// AP address, contradicting the adapter's own deliberately empty default. So
// the phone dialled the hotspot it was supposed to have left, "verified",
// and every tile below it starved.
//
// Pure. Pinned by dial.test.ts.
// =====================================================================

import type { ConnectionTargetId } from "./methods";

/** The fleet WebSocket port (car v2: HTTP :80 + WS :81, always on). */
export const CAR_WS_PORT = 81;
/** The car's web page port. */
export const CAR_HTTP_PORT = 80;

/**
 * The cars' own-hotspot gateways. 4WD4M sits on .245, the donor owns .244;
 * 192.168.4.x is forbidden fleet-wide (FIN-48).
 */
const CAR_AP_GATEWAYS: readonly string[] = ["192.168.245.1", "192.168.244.1"];

export function isCarApGateway(ip: string | null | undefined): boolean {
  const t = (ip ?? "").trim();
  if (!t) return false;
  const host = t.replace(/^wss?:\/\//i, "").split(":")[0] ?? "";
  return CAR_AP_GATEWAYS.includes(host);
}

/** The car's own-hotspot WebSocket address. A constant, not a default. */
export const CAR_AP_WS_URL = `ws://${CAR_AP_GATEWAYS[0]}:${CAR_WS_PORT}`;

export type DialSource = "car-reported" | "car-ap-constant";

export type Dial = {
  readonly url: string;
  readonly source: DialSource;
  /** The raw address the car reported, when that is what was used. */
  readonly reportedIp: string | null;
} | null;

export type DialContext = {
  /** What the user picked. */
  readonly target: ConnectionTargetId;
  /** The IP the car last reported, if any. */
  readonly reportedIp: string | null;
  /** The SSID the car last reported. */
  readonly reportedSsid: string | null;
  /** The car's own AP name, so "on its hotspot" can be judged. */
  readonly ownApName: string | null;
};

function hostOf(address: string): string {
  return (
    address
      .replace(/^wss?:\/\//i, "")
      .split("/")[0]
      ?.split(":")[0] ?? ""
  );
}

/** True when the car says it is sitting on its own broadcast hotspot. */
export function carIsOnOwnHotspot(ctx: {
  reportedSsid: string | null;
  ownApName: string | null;
}): boolean {
  const ssid = (ctx.reportedSsid ?? "").trim().toUpperCase();
  const own = (ctx.ownApName ?? "").trim().toUpperCase();
  if (own && ssid === own) return true;
  if (ssid && CAR_AP_NAMES_UPPER.has(ssid)) return true;
  // No usable SSID: fall back to the address. The gateway is only ever
  // reported while the car is on its own hotspot, so a gateway address with
  // no contradicting SSID is honest evidence of that state.
  return false;
}

const CAR_AP_NAMES_UPPER: ReadonlySet<string> = new Set(
  ["WirelessCar_Wifi", "4WDCar_Wifi"].map((n) => n.toUpperCase()),
);

/**
 * The single dial for a target, or `null` when no honest dial exists.
 *
 * - `bt-spp` has no URL: it dials a MAC through the Bluetooth service, so
 *   returning `null` here is correct and keeps the URL path WiFi-only.
 * - `car-hotspot` → the AP constant. Always available: the car broadcasts it.
 * - `home-router` → ONLY a car-reported address that is not the own-AP
 *   gateway. If the car has not reported one, this returns `null` and the UI
 *   must show the target's `requirement` instead of a Connect button.
 */
export function resolveDial(ctx: DialContext): Dial {
  if (ctx.target === "bt-spp") return null;

  if (ctx.target === "car-hotspot") {
    // Prefer whatever the car actually reports while on its hotspot (it is
    // the truth, and a future car may not be on .245), and fall back to the
    // constant, which is correct for this target by construction.
    const reported = (ctx.reportedIp ?? "").trim();
    if (reported && isCarApGateway(reported)) {
      return {
        url: `ws://${hostOf(reported)}:${CAR_WS_PORT}`,
        source: "car-reported",
        reportedIp: reported,
      };
    }
    return {
      url: CAR_AP_WS_URL,
      source: "car-ap-constant",
      reportedIp: reported || null,
    };
  }

  // home-router
  const reported = (ctx.reportedIp ?? "").trim();
  if (!reported) return null;
  if (isCarApGateway(reported)) return null; // still on its own hotspot
  const host = hostOf(reported);
  if (!host) return null;
  return {
    url: `ws://${host}:${CAR_WS_PORT}`,
    source: "car-reported",
    reportedIp: reported,
  };
}

/** The car's web page, for the "open the car's page" affordance. */
export function carWebPageUrl(reportedIp: string | null): string | null {
  const t = (reportedIp ?? "").trim();
  if (!t) return null;
  const host = hostOf(t);
  if (!host) return null;
  return `http://${host}:${CAR_HTTP_PORT}`;
}
