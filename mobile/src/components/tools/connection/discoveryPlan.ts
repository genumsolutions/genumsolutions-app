// =====================================================================
// discoveryPlan — the pure ORDER of "where might the car be" (P8, owner
// item E, 2026-10-17). Before this, discovery was one shape: a bounded /24
// sweep of the phone's own subnet, fired only on a genuine phone-network
// MOVE. The owner's ask was "let the user say where the car's network is,
// or make it automatic" — the honest answer is BOTH, in a fixed order:
//
//   1. the user's own hint ("Car network" — an IP/host or SSID, per car)
//   2. the car's advertised mDNS name (genum-car.local — one cheap probe;
//      resolution depends on the OS, and a miss just falls through)
//   3. the last router lease the car reported (one probe)
//   4. the bounded /24 sweep of the phone's subnet
//
// WHY PURE AND ORDERED. This module only decides the plan; the hub executes
// it (probe → miss → next). Pure means the ordering is testable without
// radio, and it is one place to change when the fleet gains a new
// discovery method (F-38's discipline: the decision lives in the model).
//
// F-91 — "a user can always say where the car is": the hint comes FIRST
// and its probe result is authoritative — a live hit at the user's address
// ends the search before any automatic method runs.
// =====================================================================

export const CAR_MDNS_HOST = "genum-car.local";

export type DiscoveryVia = "hint" | "mdns" | "lease";

export type DiscoveryProbe = {
  host: string;
  via: DiscoveryVia;
};

export type DiscoveryPlan = {
  /** Probes in the order to run them; the first hit ends the search. */
  probes: DiscoveryProbe[];
  /** The bounded subnet sweep runs after the probes (never before). */
  sweep: boolean;
};

const isHostish = (s: string): boolean =>
  /^[\w.-]+$/.test(s) && !s.includes(" ");

/**
 * Build the ordered plan from the live facts. `hint` is the user's "Car
 * network" (per car — the caller scopes it, F-90's shape: never another
 * car's memory); `leaseHost` is the last router address the car reported
 * (never the car's own AP gateway — the caller excludes that).
 *
 * Normalisation, stated: a hint is trimmed and used as-is when it looks
 * like a host (IP or name). An SSID-looking hint is NOT a host — it is
 * still honoured by ordering the sweep after it and keeping the plan's
 * shape honest, because dialling a SSID as a hostname can only fail
 * slowly. Empty/whitespace hints are dropped, never probed.
 */
export function buildDiscoveryPlan(input: {
  hint?: string | null;
  leaseHost?: string | null;
  mdnsHost?: string;
}): DiscoveryPlan {
  const probes: DiscoveryProbe[] = [];
  const mdns = input.mdnsHost ?? CAR_MDNS_HOST;

  const hint = (input.hint ?? "").trim();
  if (hint && isHostish(hint)) {
    // F-91: the manual override wins — it is probed first, always.
    probes.push({ host: hint, via: "hint" });
    // If the user typed the mDNS name itself, do not probe it twice.
    if (hint.toLowerCase() !== mdns.toLowerCase()) {
      probes.push({ host: mdns, via: "mdns" });
    }
  } else {
    probes.push({ host: mdns, via: "mdns" });
  }

  const lease = (input.leaseHost ?? "").trim();
  if (lease && isHostish(lease)) {
    // A lease the user's hint supersedes stays in the plan only when it is
    // a DIFFERENT address — the same address is already probed.
    const already = probes.some(
      (p) => p.host.toLowerCase() === lease.toLowerCase(),
    );
    if (!already) probes.push({ host: lease, via: "lease" });
  }

  // The sweep is the bounded last resort: it runs after every probe and
  // never before one (a probe costs one request; a sweep costs a subnet).
  return { probes, sweep: true };
}
