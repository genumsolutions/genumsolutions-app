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
 * - `car-wifi` → whatever address the car REPORTS. U-86 merged the old
 *   `car-hotspot` and `home-router` targets into this one, so there is no longer
 *   a question of "which kind of Wi-Fi" to answer: the car is either reachable
 *   at an address it told us, or it is not reachable and we say so.
 *
 * The AP constant is the fallback ONLY when the car has reported nothing. It is
 * not a guess about which network the car is on — it is the address the car's
 * own setup hotspot is on by construction, and it is the one thing we can still
 * reach when the car is on a router we cannot see.
 */
export function resolveDial(ctx: DialContext): Dial {
  if (ctx.target === "bt-spp") return null;

  const reported = (ctx.reportedIp ?? "").trim();
  if (reported) {
    // A reported address is car truth: use it whether it is the car's own
    // hotspot gateway or a router lease.
    const host = hostOf(reported);
    if (host) {
      return {
        url: `ws://${host}:${CAR_WS_PORT}`,
        source: "car-reported",
        reportedIp: reported,
      };
    }
  }
  // Nothing reported. The AP constant is honest here and only here.
  return {
    url: CAR_AP_WS_URL,
    source: "car-ap-constant",
    reportedIp: null,
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
