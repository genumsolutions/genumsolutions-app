// =====================================================================
// connection/routerList — the car's saved routers, NORMALISED ONCE.
//
// The defect this exists to kill (D1, owner report 2026-10-02: *"the car
// not switching to next router"*):
//
//   The car deliberately puts its OWN AP first in the `networks` list. The
//   old handoff card offered `Join "{carNetworks[0]}" now?` and fired
//   `ROUTERS;USE;4WDCar_Wifi` — which the firmware answers by ERASING the
//   stored credentials and reverting the car to its own AP. The user asks
//   to switch to the router; the app switches the car back to itself.
//
// So: a list whose first element is a reserved sentinel must never be
// indexed positionally by a UI (F-63). Every consumer goes through
// `normalizeRouters` and then through `switchableRouters` /
// `defaultRouterSsid`, and the own AP is never one of them.
//
// The list arrives from the car in two encodings and BOTH are parsed now
// (D6, F-66): the WebSocket JSON `"networks"` array and the `NETW;` line on
// every STATE (which is the only shape a Bluetooth link carries — the
// router feature used to exist on WiFi alone).
//
// Pure. Pinned by routerList.test.ts.
// =====================================================================

/** Firmware `MAX_SAVED_ROUTERS` (WebServerComm.h). Mirrored, never guessed. */
export const MAX_SAVED_ROUTERS = 6;
/** Firmware `ROUTER_SSID_LEN - 1`. */
export const MAX_SSID_LEN = 32;
/** Firmware `ROUTER_PASS_LEN - 1`. */
export const MAX_PASS_LEN = 64;

export type RouterEntry = {
  /** Exactly as the car reported it (trimmed) — this is what we send back. */
  readonly ssid: string;
  /** The car's own reserved network. Never a switch target (F-63). */
  readonly isOwnAp: boolean;
  /** The car names this as the router it has joined. */
  readonly isActive: boolean;
};

export type RouterValidation = { ok: true } | { ok: false; reason: string };

/** Case-insensitive own-AP match (F-64: the two old helpers disagreed). */
export function isOwnApName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim().toUpperCase();
  if (!n) return false;
  return OWN_AP_NAMES_UPPER.has(n);
}

/**
 * The fleet registry of own-AP names, upper-cased once. Mirrors
 * `carProtocol.OWN_AP_NAMES`; kept here so this module has no import cycle
 * and so the case-folding happens in exactly one place per layer.
 */
const OWN_AP_NAMES_UPPER: ReadonlySet<string> = new Set(
  ["WirelessCar_Wifi", "4WDCar_Wifi"].map((n) => n.toUpperCase()),
);

export function normalizeRouters(
  raw: ReadonlyArray<string | null | undefined>,
  ctx: {
    /** Extra own-AP name the car reported for itself (telemetry `ap`). */
    ownApName?: string | null;
    /** The SSID the car says it has joined (telemetry `ssid`). */
    activeSsid?: string | null;
  } = {},
): RouterEntry[] {
  const own = new Set(OWN_AP_NAMES_UPPER);
  const extra = (ctx.ownApName ?? "").trim().toUpperCase();
  if (extra) own.add(extra);

  const active = (ctx.activeSsid ?? "").trim().toUpperCase();
  const seen = new Set<string>();
  const out: RouterEntry[] = [];

  for (const item of raw) {
    const ssid = (item ?? "").trim();
    if (!ssid) continue;
    const key = ssid.toUpperCase();
    // Dedupe case-insensitively: the car could report "Home" and "home" and
    // the user must not see two rows that are one router.
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ssid,
      isOwnAp: own.has(key),
      isActive: Boolean(active) && key === active,
    });
  }
  return out;
}

/**
 * Parse the car's `NETW;<ownAP>;<ssid>;…` line (the encoding a Bluetooth
 * link carries). Returns the raw names; feed them to `normalizeRouters`.
 * Returns `null` for anything that is not a NETW line — a missing shape must
 * never be mistaken for "the car has no routers", which would make the UI
 * offer to add one to a full registry (or hide a populated one).
 */
export function parseNetwLine(line: string): string[] | null {
  const t = (line ?? "").trim();
  if (!t.toUpperCase().startsWith("NETW;")) return null;
  return t
    .slice("NETW;".length)
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The routers the user may actually switch to: the car's own AP removed.
 *
 * This is the ONLY list any switch affordance may render or act on.
 */
export function switchableRouters(
  entries: readonly RouterEntry[],
): RouterEntry[] {
  return entries.filter((e) => !e.isOwnAp);
}

/**
 * The router offered as "the one to switch to" when the user has not chosen.
 *
 * A NAMED rule, not `entries[0]` (F-63): the own AP is excluded, the one the
 * car has already joined is excluded (switching to it is a no-op), and what
 * remains is the car's own order. `null` when there is nothing to offer — and
 * the UI must then say so rather than fall back to the own AP.
 */
export function defaultRouterSsid(
  entries: readonly RouterEntry[],
): string | null {
  const candidate = switchableRouters(entries).find((e) => !e.isActive);
  return candidate?.ssid ?? switchableRouters(entries)[0]?.ssid ?? null;
}

/** True when the car can take one more router (it holds MAX_SAVED_ROUTERS). */
export function canAddRouter(entries: readonly RouterEntry[]): boolean {
  return switchableRouters(entries).length < MAX_SAVED_ROUTERS;
}

/**
 * Validate typed router credentials BEFORE anything is sent.
 *
 * This is the "network data login is not proper" complaint (U3) closed at the
 * model layer: the firmware's real caps are mirrored here, so an over-long
 * password fails in the form with a readable reason instead of silently
 * earning a discarded `ROUTERS;ERROR;Password too long` (D2).
 */
export function validateRouterInput(
  ssid: string,
  pass: string,
  ctx: { ownApName?: string | null } = {},
): RouterValidation {
  const s = ssid.trim();
  if (!s) return { ok: false, reason: "Enter the router name (SSID)." };
  if (
    isOwnApName(s) ||
    s.toUpperCase() === (ctx.ownApName ?? "").trim().toUpperCase()
  ) {
    return {
      ok: false,
      reason: "That is the car's own network. It is already the fallback.",
    };
  }
  if (s.length > MAX_SSID_LEN) {
    return {
      ok: false,
      reason: `The name is ${s.length} characters — the car accepts ${MAX_SSID_LEN}.`,
    };
  }
  if (s.includes(";")) {
    return {
      ok: false,
      reason: 'The name cannot contain ";" — it separates commands on the car.',
    };
  }
  if (pass.length > MAX_PASS_LEN) {
    return {
      ok: false,
      reason: `The password is ${pass.length} characters — the car accepts ${MAX_PASS_LEN}.`,
    };
  }
  if (pass.includes(";")) {
    return {
      ok: false,
      reason:
        'The password cannot contain ";" — it separates commands on the car.',
    };
  }
  return { ok: true };
}
