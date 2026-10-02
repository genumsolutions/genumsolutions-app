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
  | "ready"
  /**
   * The link died mid-handoff (owner report 2026-10-02 evening: the car
   * reset — the unflashed cd3158f bug — and the card kept claiming "a few
   * seconds" forever). The card must say the car went away, not narrate
   * progress it cannot make.
   */
  | "car-dropped";

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
 *
 * `linkLive` (default true) is whether the link the handoff is riding is
 * still up. Before the dial, a dead link means the car went away while
 * switching — the card flips to `car-dropped` instead of narrating progress
 * forever (owner bench report 2026-10-02 evening). At `ready` the drop is
 * EXPECTED — the phone leaving the car's AP to join the router is step 3 —
 * so `ready` survives it.
 */
export function staPhase(
  t: StaTelemetry,
  ownApName: string,
  linkLive = true,
): StaPhase {
  const ssid = t.ssid?.trim() || null;
  const ip = t.ip?.trim() || null;

  // The car's own AP (or unknown truth) is step 1 — even if `connected`
  // was reported, an own-AP ssid means it is NOT on the router.
  if (!ssid || isOwnApSsid(ssid, ownApName)) {
    return linkLive ? "car-on-ap" : "car-dropped";
  }
  // The car names a router it is joined to. Without an IP it has nothing
  // to dial yet — step 2 waits for the STATE broadcast.
  if (!t.connected) return linkLive ? "car-on-ap" : "car-dropped";
  // Integration guard (app↔4WD4M audit, 2026-10-02 night): the car's JSON
  // `ip` is NEVER empty — on its own AP it reports the softAP gateway
  // (WebServerComm::currentIp → 192.168.245.1, R-13). With a router stored
  // but the car still ON its AP, `ssid` = the stored name and `connected`
  // = true (ANY transport up), so a naive ip-presence check read "ready"
  // and offered the car's HOTSPOT as the home-router dial. Ready requires
  // an IP that is not the own-AP gateway — i.e. the router actually handed
  // the car an address via DHCP.
  if (ip && !isOwnApGateway(ip)) return "ready";
  // A reported GATEWAY address proves the car is still on its own AP (the
  // gateway can never be a DHCP lease — R-13 reports it while apRunning_).
  // Honest phase is step 1: re-offer the join instead of waiting forever on
  // an address that will never come (failed password lands here too). An
  // ABSENT IP is different — the STATE broadcast may simply not have
  // carried it yet — so that stays step 2 (joined/waiting).
  if (ip) return linkLive ? "car-on-ap" : "car-dropped";
  return linkLive ? "joined" : "car-dropped";
}

/**
 * The car's own-AP gateway address (4WD4M: 192.168.245.1 since FIN-48; the
 * donor owns .244). The single subnet shape is a compile-time fact of the
 * fleet firmware (WebServerComm softAP config), so matching it here is
 * reading CAR truth, not inventing app-side policy. 192.168.4.x is forbidden
 * fleet-wide and is NOT in the set.
 */
export function isOwnApGateway(ip: string): boolean {
  return /^(192\.168\.24[45]\.1)$/.test(ip.trim());
}

/**
 * The ONE switch confirm (owner report 2026-10-02: "the app still doesn't
 * have switch ui ux standardly, n missing ok or confirm buttons while
 * switching routers").
 *
 * The defect this replaces: switching the car to a router had THREE entry
 * points and only one of them asked. The picker's STA pick opened the
 * handoff card, which had a real "Yes, join it" / Cancel. But the Home
 * router settings panel's per-row Switch fired `ROUTERS;USE` on the press
 * itself, and its Add button (labelled "Add + switch") fired `ROUTERS;ADD`
 * on the press itself - no confirm, no chance to back out, and the same
 * logical action wearing three different UIs.
 *
 * The rule (already recorded for U-64): a prompt that describes an action
 * must BE the confirm for that action - never narrate a command that already
 * went out. So every entry point now resolves to exactly one intent, and
 * exactly one card renders exactly one confirm for it. Nothing here sends
 * anything: this is the wording + which-command-would-run, decided purely so
 * it can be pinned in CI.
 */
export type SwitchIntent = {
  /** The SSID the car should end up on. */
  ssid: string;
  /**
   * Credentials to store on the car BEFORE the switch, or null for a router
   * the car already holds. A non-empty pass means the confirm covers two
   * commands (`ROUTERS;ADD` then `ROUTERS;USE`), so the wording says so.
   */
  pass: string | null;
};

export type SwitchConfirm =
  /** Nothing to confirm - the card shows its ordinary step-1 offer. */
  | { kind: "none" }
  /**
   * The car already holds this router: the confirm is a single `ROUTERS;USE`.
   * Reached from the picker's STA pick and from a panel row's Switch.
   */
  | { kind: "switch"; ssid: string; confirmLabel: string }
  /**
   * A router the car does not hold yet (or an edited password): the confirm
   * covers `ROUTERS;ADD` + `ROUTERS;USE`, so the button says it saves too.
   */
  | { kind: "save-and-switch"; ssid: string; confirmLabel: string };

/**
 * Resolve a requested switch into the ONE confirm the card should show.
 *
 * Degenerate intents collapse to `none` rather than offering a confirm that
 * cannot work: a blank SSID, and the car's OWN network (the firmware
 * reserves `WIFI_AP_NAME` and rejects it - `ROUTERS;ERROR;Reserved`, and
 * "use the own AP" is not a switch at all, it is staying put).
 *
 * A whitespace-only pass counts as no pass: the car stores it as an empty
 * password, and an open network is still "already saved" from the user's
 * point of view, so the confirm must not claim it will save anything.
 */
export function switchConfirm(
  intent: SwitchIntent | null | undefined,
  ownApName: string,
): SwitchConfirm {
  const ssid = intent?.ssid?.trim() ?? "";
  if (!intent || !ssid) return { kind: "none" };
  if (isOwnApSsid(ssid, ownApName)) return { kind: "none" };
  const pass = intent.pass?.trim() ?? "";
  return pass
    ? { kind: "save-and-switch", ssid, confirmLabel: "Save & switch" }
    : { kind: "switch", ssid, confirmLabel: "Switch now" };
}

/**
 * The ONE dial the handoff may make: the car's REPORTED router IP on the
 * fleet WS port. No IP means no dial — the card must never dial a guessed
 * or default address (that is the defect this handoff replaces). The car's
 * own-AP gateway is also refused: the JSON `ip` reports it while the car
 * sits on its hotspot (R-13), and dialing it would "verify" against the
 * very AP the switch was supposed to leave.
 */
export function staDialUrl(ip: string | null): string | null {
  const t = ip?.trim();
  if (!t) return null;
  if (/^wss?:\/\//i.test(t)) {
    return isOwnApGateway(t.replace(/^wss?:\/\//i, "").split(":")[0] ?? "")
      ? null
      : t;
  }
  if (isOwnApGateway(t)) return null;
  return t.includes(":") ? `ws://${t}` : `ws://${t}:${STA_WS_PORT}`;
}
