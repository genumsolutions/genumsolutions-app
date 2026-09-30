// =====================================================================
// commandEnvelope.ts — the JSON ⇄ wire-grammar translation layer
// (Connection-Manager round, 2026-09-30; plan §3.6 in
// guide/SESSION-2026-09-30-CONNECTION-MANAGER-PROMPT.md).
//
// WHY: the outside AI's brief asked for "commands always use a unified
// JSON schema regardless of protocol". The fleet ALREADY has a locked wire
// grammar (the 9-token registry + SPD/SERVO/STEER/TRIM/CFG/ROUTERS/REQ_STATE
// — FIN-23/24 parity lock across car/remote/app/website) and the recorded
// rules forbid a THIRD grammar (F-21 one entry point; F-23 protocol values
// never display strings; F-30's `caps` duplication is exactly what two
// grammars for one field cost us). So the answer to the brief is the
// ADDITIVE-ENVELOPE form: JSON in at the app edge, the EXISTING wire lines
// out to the car — and the reverse for parsing replies.
//
// What this module is:
//   • PURE — no react-native imports, no services, no I/O. Same testability
//     rule as deckkit.ts and linkManager.ts.
//   • VERSIONED — every envelope carries `v: 1`; unknown versions are
//     refused, not guessed (parse a field ONCE — F-30 lesson).
//   • ADDITIVE — nothing in the live command path imports this yet. The hub
//     and transports keep speaking wire lines; a future gated round (F-41
//     discipline: prove on the 4WD4M testbed first) may wire this as an
//     ALTERNATE front door. A module with zero call-sites is recorded as
//     intentionally-dormant here and in CONTINUITY.md — the U-25/F-45
//     dead-code liability rule is satisfied by this comment + the roadmap.
//
// Honest limits (the brief's ideas we deliberately do NOT implement):
//   • NO free-text mode names (`"mode":"obstacle_avoid"` is refused — the
//     fleet tokens are OBS_US/OBS_IR; FIN-23). canonicalCarToken() applies
//     the ONE legacy alias (BT→4WD4M) and nothing else.
//   • NO new wire tokens, NO second caps grammar, NO first-handshake
//     auto-selection (F-38/F-41 stand).
// =====================================================================

/** Envelope schema version. Bump ONLY with a migration note + tests. */
export const ENVELOPE_VERSION = 1 as const;

/** The wire grammar this module translates TO — never extended here. */
export type EnvelopeCommandType =
  | "drive" // F | B | L | R | S
  | "speed" // SPD<n>
  | "servo" // SERVO<n>
  | "steerLimit" // STEER<n>
  | "trim" // TRIM<n>
  | "estop" // ESTOP
  | "mode" // <bare token> (app/remote dialect; F-21)
  | "calibrate" // CFG;Kp:..;Ki:..;Kd:..;OUT:..;OFF:..
  | "requestState" // REQ_STATE
  | "router" // ROUTERS;OP;...
  | "wifiConfig"; // WIFICFG;ssid;pass

/** The friendly JSON shape a caller sends. Exactly ONE of `type`'s payloads. */
export type CommandEnvelope = {
  /** Schema version — must be ENVELOPE_VERSION. */
  v: number;
  /** Which command this is. */
  type: EnvelopeCommandType;
  // drive
  dir?: "F" | "B" | "L" | "R" | "S";
  // speed / servo / steerLimit / trim (integers, car-validated ranges)
  value?: number;
  // mode: a fleet token (canonicalized via canonicalCarToken on encode)
  token?: string;
  // calibrate
  pid?: { kp: number; ki: number; kd: number; out: number; off: number };
  // router
  routerOp?: "LIST" | "ADD" | "USE" | "DEL" | "CLEAR" | "SCAN";
  ssid?: string;
  /** Router password — accepted here so ADD works, but NEVER echoed back by
      toStringEnvelope / never logged; passwords never leave car/phone (W-14). */
  pass?: string;
  // wifiConfig
  wifiSsid?: string;
  wifiPass?: string;
};

export type EnvelopeEncodeResult =
  { ok: true; line: string } | { ok: false; error: string };

export type EnvelopeParseResult =
  { ok: true; envelope: CommandEnvelope } | { ok: false; error: string };

const DRIVE_DIRS: ReadonlySet<string> = new Set(["F", "B", "L", "R", "S"]);

function isFiniteInt(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Encode one envelope into the EXISTING wire grammar.
 *
 * Ranges mirror carProtocol constants (the CAR remains the final validator —
 * this layer only refuses values the car would certainly reject, so a bad
 * envelope fails HERE with a readable reason instead of on the wire):
 *   SPD: SPEED_MIN..SPEED_MAX (100..255); SERVO/STEER: 0..180; TRIM: −90..90.
 */
export function encodeCommandEnvelope(
  env: CommandEnvelope,
  deps: {
    buildSpd: (v: number) => string;
    buildServo: (v: number) => string;
    buildSteer: (v: number) => string;
    buildTrim: (v: number) => string;
    buildCalibration: (p: {
      kp: number;
      ki: number;
      kd: number;
      out: number;
      off: number;
    }) => string;
    buildRouterCommand: (
      op: "LIST" | "ADD" | "USE" | "DEL" | "CLEAR" | "SCAN",
      ssid: string,
      pass?: string,
    ) => string;
    buildWifiConfigLine: (ssid: string, password: string) => string;
    canonicalCarToken: (t: string | null | undefined) => string;
    SPEED_MIN: number;
    SPEED_MAX: number;
  },
): EnvelopeEncodeResult {
  if (!env || typeof env !== "object")
    return { ok: false, error: "Envelope must be an object." };
  if (env.v !== ENVELOPE_VERSION)
    return {
      ok: false,
      error: `Unsupported envelope version ${String(env.v)} (expected ${ENVELOPE_VERSION}).`,
    };
  if (!env.type || typeof env.type !== "string")
    return { ok: false, error: "Envelope is missing `type`." };

  switch (env.type) {
    case "drive": {
      if (!env.dir || !DRIVE_DIRS.has(env.dir))
        return {
          ok: false,
          error: `drive.dir must be one of F|B|L|R|S (got ${String(env.dir)}).`,
        };
      return { ok: true, line: env.dir };
    }
    case "speed": {
      if (!isFiniteInt(env.value))
        return { ok: false, error: "speed.value must be an integer." };
      if (env.value < deps.SPEED_MIN || env.value > deps.SPEED_MAX)
        return {
          ok: false,
          error: `speed.value must be ${deps.SPEED_MIN}..${deps.SPEED_MAX}.`,
        };
      return { ok: true, line: deps.buildSpd(env.value) };
    }
    case "servo": {
      if (!isFiniteInt(env.value) || env.value < 0 || env.value > 180)
        return { ok: false, error: "servo.value must be 0..180." };
      return { ok: true, line: deps.buildServo(env.value) };
    }
    case "steerLimit": {
      if (!isFiniteInt(env.value) || env.value < 0 || env.value > 180)
        return { ok: false, error: "steerLimit.value must be 0..180." };
      return { ok: true, line: deps.buildSteer(env.value) };
    }
    case "trim": {
      if (!isFiniteInt(env.value) || env.value < -90 || env.value > 90)
        return { ok: false, error: "trim.value must be -90..90." };
      return { ok: true, line: deps.buildTrim(env.value) };
    }
    case "estop":
      return { ok: true, line: "ESTOP" };
    case "requestState":
      return { ok: true, line: "REQ_STATE" };
    case "mode": {
      if (!env.token || typeof env.token !== "string")
        return { ok: false, error: "mode.token must be a fleet token string." };
      const tok = deps.canonicalCarToken(env.token);
      if (!/^[A-Z0-9_]{2,10}$/.test(tok))
        return {
          ok: false,
          error: `mode.token "${env.token}" is not a fleet token (see FIN-23 registry).`,
        };
      // F-21: the app/remote dialect is the BARE token.
      return { ok: true, line: tok };
    }
    case "calibrate": {
      const p = env.pid;
      if (
        !p ||
        !isFiniteInt(p.kp) ||
        !isFiniteInt(p.ki) ||
        !isFiniteInt(p.kd) ||
        !isFiniteInt(p.out) ||
        !isFiniteInt(p.off)
      )
        return {
          ok: false,
          error: "calibrate.pid needs numeric kp/ki/kd/out/off.",
        };
      return { ok: true, line: deps.buildCalibration(p) };
    }
    case "router": {
      if (!env.routerOp)
        return { ok: false, error: "router.routerOp is required." };
      return {
        ok: true,
        line: deps.buildRouterCommand(
          env.routerOp,
          env.ssid ?? "",
          env.pass ?? "",
        ),
      };
    }
    case "wifiConfig": {
      if (!env.wifiSsid)
        return { ok: false, error: "wifiConfig.wifiSsid is required." };
      return {
        ok: true,
        line: deps.buildWifiConfigLine(env.wifiSsid, env.wifiPass ?? ""),
      };
    }
    default:
      return {
        ok: false,
        error: `Unknown envelope type "${String(env.type)}".`,
      };
  }
}

/**
 * Decode a JSON string (or object) into a validated envelope. Refuses
 * unknown versions and shapes instead of guessing (F-30: parse a field
 * ONCE — a malformed envelope must fail loudly, not partially).
 */
export function decodeCommandEnvelope(
  input: string | Record<string, unknown>,
): EnvelopeParseResult {
  let obj: Record<string, unknown>;
  if (typeof input === "string") {
    try {
      obj = JSON.parse(input) as Record<string, unknown>;
    } catch {
      return { ok: false, error: "Envelope is not valid JSON." };
    }
  } else if (input && typeof input === "object") {
    obj = input;
  } else {
    return { ok: false, error: "Envelope must be a JSON string or object." };
  }
  const v = obj.v;
  if (v !== ENVELOPE_VERSION)
    return {
      ok: false,
      error: `Unsupported envelope version ${String(v)} (expected ${ENVELOPE_VERSION}).`,
    };
  const type = obj.type;
  if (typeof type !== "string")
    return { ok: false, error: "Envelope is missing `type`." };
  // Pass through as the envelope; field validation happens in encode().
  return { ok: true, envelope: obj as unknown as CommandEnvelope };
}

/**
 * Convenience one-shot: decode → encode. The call-site contract for the
 * future gated wiring round (one function to test, one error surface).
 */
export function jsonToWireLine(
  input: string | Record<string, unknown>,
  deps: Parameters<typeof encodeCommandEnvelope>[1],
): EnvelopeEncodeResult {
  const parsed = decodeCommandEnvelope(input);
  if (!parsed.ok) return parsed;
  return encodeCommandEnvelope(parsed.envelope, deps);
}
