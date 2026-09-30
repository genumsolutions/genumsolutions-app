// =====================================================================
// envelopeWiring — the ONE place the JSON envelope meets the real
// wire grammar (Connection-Manager Phase B, 2026-09-30; plan §4 in
// guide/PLAN-2026-09-30-CONNECTION-MANAGER-ROADMAP.md).
//
// WHY this file exists separately from commandEnvelope.ts:
// Phase A deliberately kept commandEnvelope PURE with the protocol
// builders INJECTED, so the translation layer could never fork the
// grammar (F-30's `caps` string-vs-object bug is exactly what two
// grammars for one field cost us). That is right for the layer — but it
// leaves the app needing exactly one canonical BINDING of those deps to
// the real carProtocol functions. If each call-site built its own deps
// object, the first copy-paste that dropped a builder would silently
// change what reaches the car. So the binding lives here, once, and both
// LinkManager.sendEnvelope and the hub intake import it.
//
// WHAT Phase B adds (and only this):
//   1. LinkManager.sendEnvelope — decode → encode → the existing sendLine.
//   2. One flag-gated intake in useControlHub so BOTH dialects coexist.
//   3. Nothing else. No screen changes, no new wire token, no second
//      grammar, no change to any existing send path.
//
// The rules this file inherits and must not bend:
//   • F-41 — the intake is OFF by default and is NOT user-selectable.
//     Nothing on this screen can turn it on; activation is an explicit
//     programmatic flip after the 4WD4M testbed rows pass.
//   • F-21/F-23/FIN-23/24 — the envelope can only ever EMIT the existing
//     wire lines. It never introduces vocabulary of its own.
//   • R-4 fleet parity — the hub intake encodes to a line and then hands
//     it to the EXISTING sendCommand fan-out, so mode-based routing and
//     the EVERY_LINK_COMMANDS broadcast rules apply exactly as they do
//     for a hand-written line. That is what makes "no wire line differs
//     from the pre-envelope path" true BY CONSTRUCTION, not by testing.
//   • W-14 — a success result deliberately does NOT echo the encoded
//     line. For router ADD / wifiConfig that line CONTAINS the password,
//     and an echoed string is exactly how a credential ends up in a log
//     or a crash report. Callers that need to see the bytes read them off
//     the transport, which is the honest place for them.
// =====================================================================

import {
  buildCalibration,
  buildRouterCommand,
  buildServo,
  buildSpd,
  buildSteer,
  buildTrim,
  buildWifiConfigLine,
  canonicalCarToken,
  SPEED_MAX,
  SPEED_MIN,
} from "../services/carProtocol";
import {
  jsonToWireLine,
  type CommandEnvelope,
  type EnvelopeEncodeResult,
} from "./commandEnvelope";

/** The canonical deps — the real carProtocol builders, bound once. */
export const ENVELOPE_WIRE_DEPS = {
  buildSpd,
  buildServo,
  buildSteer,
  buildTrim,
  buildCalibration,
  buildRouterCommand,
  buildWifiConfigLine,
  canonicalCarToken,
  SPEED_MIN,
  SPEED_MAX,
} as const;

/** What a caller may hand the intake: an envelope object or its JSON. */
export type EnvelopeInput = CommandEnvelope | string | Record<string, unknown>;

/**
 * The result of an envelope send.
 *
 * `ok: true` carries NO line on purpose — see W-14 above. Errors are safe
 * to surface: every message the envelope produces names a field, a range
 * or a version, never a password (checked against commandEnvelope's error
 * paths).
 */
export type EnvelopeSendResult = { ok: true } | { ok: false; error: string };

// -------------------------------------------------------------------
// The gate (F-41)
// -------------------------------------------------------------------

let intakeEnabled = false;

/**
 * Whether the hub's envelope intake accepts commands. OFF until the
 * owner explicitly flips it, after the 4WD4M testbed rows pass.
 *
 * Deliberately NOT persisted: a flag that survives an app restart is a
 * flag a user can get stuck behind with no way to see it. Until there is
 * a visible switch for it, in-memory is the honest lifetime.
 */
export function isEnvelopeIntakeEnabled(): boolean {
  return intakeEnabled;
}

/**
 * Flip the intake. The single activation seam for Phase B.
 *
 * This is the ONLY way the intake turns on, and it is called by nothing
 * in the shipped UI — that is the point (F-41: nothing is selectable
 * until it is proven on the car).
 */
export function setEnvelopeIntakeEnabled(enabled: boolean): void {
  intakeEnabled = enabled;
}

/** @internal test-only reset, so one test cannot leak the flag into another. */
export function __resetEnvelopeIntakeForTests(): void {
  intakeEnabled = false;
}

// -------------------------------------------------------------------
// The encode step (shared by both call-sites)
// -------------------------------------------------------------------

/**
 * Decode + encode one envelope into the EXISTING wire grammar.
 *
 * Never throws: a malformed envelope comes back as a readable error and
 * NOTHING is emitted, so a bad envelope can never put a partial or
 * invented line on the wire (F-23).
 */
export function encodeEnvelopeWire(input: EnvelopeInput): EnvelopeEncodeResult {
  return jsonToWireLine(input, ENVELOPE_WIRE_DEPS);
}
