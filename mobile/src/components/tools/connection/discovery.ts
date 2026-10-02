// =====================================================================
// connection/discovery — FIND THE CAR ON THE ROUTER, with no native module.
//
// Owner report (2026-10-02): *"the drive deck doesnt open when on other router
// is selected"*.
//
// WHY THIS FILE EXISTS. The cause is structural, and worth writing down
// because it explains a whole family of "it worked on the hotspot" reports:
//
//   1. The phone is joined to the car's OWN hotspot, talking to it at
//      192.168.245.1.
//   2. The car joins the home router. In AP_STA the softAP and the STA share ONE
//      radio and therefore ONE channel, so the hotspot MOVES to that router's
//      channel — and the phone's link drops. (U-72 stopped the car fighting
//      that; the consequence itself is unavoidable and correct.)
//   3. With no link, the app has no address for the car. The router issued a DHCP
//      lease that nobody was told, so the app cannot dial it, so the deck does
//      not open.
//
// Two ways out. mDNS is the elegant one and the car half already advertises
// `genum-car.local` (car U-74) — but React Native cannot resolve a `.local`
// name without a NATIVE MODULE, and a native module cannot be delivered by an
// OTA. That is queued behind a new APK.
//
// This is the OTHER way, and it needs nothing new: the car already serves
// `GET /status` on port 80 with its identity in the JSON, and `@react-native-
// community/netinfo` (ALREADY a dependency, already in the APK) can tell us the
// PHONE's address. From that we know the /24, and the car is somewhere inside
// it. So: probe, in parallel, with a short timeout, and stop the moment
// something that is recognisably our car answers.
//
// This is deliberately NOT a background scan. It runs only on an explicit user
// action, only on the user's own network, only against /24 of that network,
// only on port 80, with a hard cap, and it stops at the first hit — the same
// posture as pressing "Find my car" over Bluetooth.
//
// Pure and testable: the address arithmetic and the "is this our car?" decision
// are separated from the I/O.
// =====================================================================

/** The car's status endpoint. Port 80 is the HTTP web server, always up. */
export const CAR_STATUS_URL = (host: string) => `http://${host}:80/status`;

/** The drive link. Port 81 is the WebSocket, always up. */
export const CAR_WS_URL = (host: string) => `ws://${host}:81`;

/** Per-probe timeout. Short: a wrong address should not hold the sweep up. */
export const PROBE_TIMEOUT_MS = 1200;
/** How many probes in flight at once. */
export const PROBE_CONCURRENCY = 24;
/** Never exceed this many candidates, whatever the caller asks for. */
export const MAX_CANDIDATES = 254;

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function parseIpv4(value: string | null | undefined): number[] | null {
  const m = IPV4.exec((value ?? "").trim());
  if (!m) return null;
  const parts = [m[1], m[2], m[3], m[4]].map((n) => Number(n));
  if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return parts;
}

/** True for the RFC1918 ranges a home router actually hands out. */
export function isPrivateIpv4(parts: readonly number[]): boolean {
  if (parts.length !== 4) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && typeof b === "number" && b >= 16 && b <= 31) return true;
  return false;
}

/**
 * The hosts to probe, from the PHONE's address.
 *
 * Only the /24 is swept — that is what a consumer router hands out, and a wider
 * sweep would be thousands of probes. The phone's own address is skipped, as is
 * the network address; the broadcast address is skipped too because a router
 * answering on it is not the car.
 *
 * Returns `[]` for a missing, malformed or non-private address: a phone on
 * cellular, on a VPN, or on a public network must never trigger a sweep.
 */
export function subnetCandidates(
  phoneIp: string | null | undefined,
  opts: { skipSelf?: boolean; max?: number } = {},
): string[] {
  const skipSelf = opts.skipSelf ?? true;
  const max = Math.min(opts.max ?? MAX_CANDIDATES, MAX_CANDIDATES);
  const me = parseIpv4(phoneIp);
  if (!me || !isPrivateIpv4(me)) return [];
  const [a, b, c] = me;
  const out: string[] = [];
  // 1..254 inclusive: .0 is the network, .255 is the broadcast.
  for (let host = 1; host <= 254 && out.length < max; host++) {
    if (skipSelf && host === me[3]) continue;
    out.push(`${a}.${b}.${c}.${host}`);
  }
  return out;
}

/**
 * Does this `/status` payload look like OUR car?
 *
 * Matched on identity, never on "something answered": a laptop, a printer and a
 * router all answer on port 80. Two positive signals, either sufficient:
 *   - `id` — the board-unique id the car stamps into every status frame (the
 *     same value behind the `fw:<id>` device profile key); OR
 *   - `ap` — the car's own AP broadcast name, which no other device sends.
 *
 * `ap` alone is the weaker signal (it is a name, so it could collide) but it is
 * what makes discovery work BEFORE the app has ever paired, which is the case
 * that matters here — the phone has no profile for a car it has never seen.
 */
export function looksLikeOurCar(
  payload: unknown,
  expect: { boardId?: string | null; apName?: string | null } = {},
): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;

  const id = typeof p.id === "string" ? p.id.trim().toUpperCase() : "";
  const wantId = (expect.boardId ?? "").trim().toUpperCase();
  if (wantId && id && id === wantId) return true;

  const ap = typeof p.ap === "string" ? p.ap.trim().toUpperCase() : "";
  const wantAp = (expect.apName ?? "").trim().toUpperCase();
  if (wantAp && ap && ap === wantAp) return true;

  return false;
}

/**
 * Probe candidates for our car, stopping at the first hit.
 *
 * Stops early on success (the common case is a handful of probes, not 254), and
 * tolerates individual failures — a closed port is a normal outcome, not an
 * error, so nothing here rejects on one dead address.
 *
 * `signal` is honoured: a cancelled sweep resolves to `null` rather than
 * continuing to hammer the network after the user has navigated away.
 */
export async function findCarOnNetwork(input: {
  candidates: readonly string[];
  expect?: { boardId?: string | null; apName?: string | null };
  fetchJson: (url: string, timeoutMs: number) => Promise<unknown>;
  concurrency?: number;
  signal?: { aborted: boolean };
}): Promise<string | null> {
  const concurrency = Math.max(
    1,
    Math.min(input.concurrency ?? PROBE_CONCURRENCY, 64),
  );
  const queue = [...input.candidates];
  if (queue.length === 0) return null;

  let found: string | null = null;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (found !== null) return;
      if (input.signal?.aborted) return;
      const host = queue.shift();
      if (host === undefined) return;
      try {
        const payload = await input.fetchJson(
          CAR_STATUS_URL(host),
          PROBE_TIMEOUT_MS,
        );
        if (looksLikeOurCar(payload, input.expect)) {
          found = host;
          return;
        }
      } catch {
        // A host that is not there, or not the car, is the expected majority.
        // Never treat it as a failure of the sweep.
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, worker),
  );
  return found;
}
