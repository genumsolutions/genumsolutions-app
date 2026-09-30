// F-41 method gate — the single place that decides which registered method the
// user may actually pick and dial.
//
// Extracted from TransportPicker.tsx so the rule is testable WITHOUT mounting
// the screen. Before this, "is the gate still holding?" could only be answered
// by a human on a device (old row T18), which is a poor place to discover that a
// gated method leaked into the picker. A gate that guards drive commands to a
// car must be verifiable in CI.
//
// The rule has two halves and BOTH must hold:
//   1. the method is in the owner-approved PRIMARY set, and
//   2. the method's own adapter says it is supported (`isSupported()`).
// Half 1 is policy, half 2 is honesty about the firmware. A method can pass
// (2) and still be parked by (1) — that is exactly the state HTTP and BLE are
// in: their adapters could work against a future firmware, but nothing is
// proven on a car yet, so they stay dimmed with a "Coming Soon" tag.

import type { Transport, TransportId } from "../../transports/types";

/**
 * PRIMARY methods (owner 2026-09-29, extended 2026-09-30): only these are
 * selectable today. Every other registered method renders dimmed with a
 * "Coming Soon" tag — its help window stays fully readable, but picking it can
 * never start a link and cannot be dialled even where `isSupported()` would say
 * yes.
 *
 * - `bt-classic`  — SPP, proven on the car.
 * - `wifi-ap-ws`   — the car's own access point, proven on the car.
 * - `wifi-sta-ws`  — home router; the U-51 device round verified SPP + AP,
 *                    which was this gate's stated condition for unlocking STA.
 *
 * NOT here, and the reason is the point:
 * - `http`      — F-41 parked pending the owner's T15–T18 bench round. Its
 *                 adapter had two real defects (F-51) which are now fixed, but
 *                 "fixed" is not "proven on a car".
 * - `bt-ble`    — no BLE server exists in the 4WD4M firmware at all.
 * - `mdns`, `mqtt`, `cloud-relay` — roadmap placeholders, no firmware / no broker.
 */
export const PRIMARY_METHODS: ReadonlySet<TransportId> = new Set<TransportId>([
  "bt-classic",
  "wifi-ap-ws",
  "wifi-sta-ws",
]);

/** A method the user may actually pick and dial right now. */
export function isSelectable(t: Transport): boolean {
  return PRIMARY_METHODS.has(t.id) && t.isSupported();
}
