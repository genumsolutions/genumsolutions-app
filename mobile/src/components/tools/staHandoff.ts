// =====================================================================
// staHandoff — the HOME-ROUTER HANDOFF (F-59, owner report 2026-10-02).
//
// "Switch to home router" is NOT a teardown-and-redial. The car can only
// join the router when something tells it (`ROUTERS;USE`) — and that
// command needs the very link a teardown would destroy. So the switch is
// a HANDOFF, guided by a card on the Control Panel:
//
//   step 1  car is on its own AP  → send `ROUTERS;USE;<ssid>` over the
//          LIVE link (the panel's router list / Add form already speak
//          this); the car joins the router.
//   step 2  car joined, no IP yet → the card waits; the car's STATE
//          broadcast reports the router IP within seconds.
//   step 3  car joined WITH an IP → join the same router on the phone,
//          then dial `ws://<that-ip>:81`. No guessing, ever: the dial
//          uses the IP the CAR reported (staDialUrl), never a default.
//
// This module is the pure core of that card: staPhase() reads the car's
// own telemetry truth (the JSON `connected` flag = the car says it
// joined; `ssid` = the router it named; `ip` = the address it reports),
// and staDialUrl() builds the one dial the handoff may make. The own-AP
// name comes from the CALLER (the hub's OWN_AP_NAMES-resolved
// carApName) — no hand-written name list here (F-51 rule 2).
//
// Pinned by staHandoff.test.ts.
// =====================================================================

/** The fleet WebSocket port (car v2: HTTP :80 + WS :81, always on). */
const STA_WS_PORT = 81;

export type StaTelemetry = {
  /** The car's own "I joined a router" flag (WS JSON `connected`). */
  connected: boolean;
  /** The SSID the car reports being on (its own AP name while on the AP). */
  ssid: string | null;
  /** The IP the car reports (its AP address while on the AP, router IP once joined). */
  ip: string | null;
};

export type StaPhase =
  /** Step 1: the car is on its own AP (or truth is unknown) — offer/join a router. */
  | "car-on-ap"
  /** Step 2: the car joined the router but has not reported an IP yet — wait. */
  | "joined"
  /** Step 3: the car joined AND reported its router IP — the dial may be offered. */
  | "ready";

/** Own-AP match, case-insensitive: the car has reported the name in both cases. */
export function isOwnApSsid(ssid: string | null, ownApName: string): boolean {
  const a = ssid?.trim().toUpperCase();
  const b = ownApName.trim().toUpperCase();
  return Boolean(a) && a === b;
}

/**
 * Which step of the handoff the car is actually at. Reads ONLY car truth —
 * the card must never claim a step the car has not reported (F-53: no
 * invented state). Unknown/degenerate truth fails open to `car-on-ap`,
 * because step 1 is always safe to show.
 */
export function staPhase(t: StaTelemetry, ownApName: string): StaPhase {
  const ssid = t.ssid?.trim() || null;
  const ip = t.ip?.trim() || null;

  // The car's own AP (or unknown truth) is step 1 — even if `connected`
  // was reported, an own-AP ssid means it is NOT on the router.
  if (!ssid || isOwnApSsid(ssid, ownApName)) return "car-on-ap";
  // The car names a router it is joined to. Without an IP it has nothing
  // to dial yet — step 2 waits for the STATE broadcast.
  if (!t.connected) return "car-on-ap";
  return ip ? "ready" : "joined";
}

/**
 * The ONE dial the handoff may make: the car's REPORTED router IP on the
 * fleet WS port. No IP means no dial — the card must never dial a guessed
 * or default address (that is the defect this handoff replaces).
 */
export function staDialUrl(ip: string | null): string | null {
  const t = ip?.trim();
  if (!t) return null;
  if (/^wss?:\/\//i.test(t)) return t;
  return t.includes(":") ? `ws://${t}` : `ws://${t}:${STA_WS_PORT}`;
}
