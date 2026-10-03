// =====================================================================
// The remembered-router rule, in ONE place, as production code.
//
// Until U-81 this rule lived ONLY inside `routerMemory.test.ts`, described as
// "a pure transcription of the hub's persistence rule so the logic is
// checkable without mounting the hook". That is a trap: a test that pins its
// own transcription proves the transcription is self-consistent, not that the
// app behaves that way. Twenty-odd assertions could all be green while the
// production branch did something else — which is what a transcription is for.
//
// And it happened. U-81 found the app growing a saved router literally named
// "STARTED", because `ROUTERS;SCAN;STARTED` parsed as a router LIST and the
// derivation then persisted it to AsyncStorage and the shared `car_profiles`
// row — a phantom network in the one list that tells the user where the car is.
//
// So the rule is now here, exported, and called by the hub AND asserted by the
// tests. There is no second copy to drift.
//
// The rule (U-71, unchanged):
//   the remembered list is derived from the car's ANSWER, never from what the
//   app hoped would happen, and an answer that reports NO change changes
//   NOTHING. `null` means "remember nothing" — it is not "remember an empty
//   list", which would silently wipe a working setup because a car said FULL.
// =====================================================================
import type { RouterAnswer } from "./commands";

export type RouterMemory = {
  /** The list to remember. */
  readonly next: readonly string[];
  /** The ssid to remember as `lastWifiSsid`, when the answer names one. */
  readonly lastSsid?: string;
};

/** Name equality is case-insensitive everywhere else (F-64); keep it here too. */
function withName(list: readonly string[], s: string): string[] {
  return list.some((n) => n.toUpperCase() === s.toUpperCase())
    ? list.slice()
    : [...list, s];
}

function withoutName(list: readonly string[], s: string): string[] {
  return list.filter((n) => n.toUpperCase() !== s.toUpperCase());
}

/**
 * How the remembered router list changes because of `answer`.
 *
 * Returns `null` for every answer that changes nothing — `full`, `error`, and
 * `scanStarted`. This is the load-bearing part: a refusal must leave the
 * user's saved routers exactly as they were.
 */
export function deriveRouters(
  current: readonly string[],
  answer: RouterAnswer,
): RouterMemory | null {
  switch (answer.kind) {
    case "list":
      return { next: answer.ssids.slice() };
    case "added":
      return { next: withName(current, answer.ssid), lastSsid: answer.ssid };
    case "used":
      return { next: withName(current, answer.ssid), lastSsid: answer.ssid };
    case "deleted":
      return { next: withoutName(current, answer.ssid) };
    case "cleared":
      return { next: [] };
    default:
      // full / error / scanStarted — a scan finds networks, it does not
      // save them, so it must never reach the remembered list.
      return null;
  }
}
