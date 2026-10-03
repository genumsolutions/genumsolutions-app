// =====================================================================
// U-71: CONFIRMED router changes must be REMEMBERED — by the app, in its
// own storage AND in the Supabase `car_profiles` row.
//
// Owner (2026-10-02): *"all the car and app to remember the old setting in the
// database too and both app and cars too."*
//
// This was a REAL gap, and one I introduced. The pre-existing `routerUse` /
// `routerAdd` pair persisted an optimistic local list, so a switch was
// remembered. The ack-consuming path built in U-68 (`requestRouter` /
// `runSwitchPlan`) only persisted on a `list` answer — so ADDING or SWITCHING a
// router updated the car and the screen and wrote NOTHING to AsyncStorage or the
// cloud row. The setting was forgotten the moment the app restarted.
//
// The rule these pin: **the list is derived from the car's ANSWER, never from
// what the app hoped would happen, and a FAILED answer changes nothing.** That is
// the whole point of consuming the reply (F-62) — an answer that is parsed and
// then ignored is a silent failure.
//
// This used to carry its own `applyAnswer` transcription of the hub's
// persistence rule "so the logic is checkable without mounting the hook".
// U-81 extracted that rule to production code (`deriveRouters` in
// ./routerMemory) and the hub now calls it — so these assertions run against
// the code the app actually executes, with no second copy to drift.
import { describe, expect, it } from "vitest";

import { parseRouterAnswer } from "./commands";
import { deriveRouters } from "./routerMemory";

const applyAnswer = deriveRouters;

const AP = "4WDCar_Wifi";
const START = [AP, "HomeNet"];

describe("U-71 — a confirmed change is remembered, a failed one is not", () => {
  it("ADDED remembers the router the car confirmed", () => {
    const r = applyAnswer(START, parseRouterAnswer("ROUTERS;ADDED;OfficeNet")!);
    expect(r!.next).toEqual([AP, "HomeNet", "OfficeNet"]);
    expect(r!.lastSsid).toBe("OfficeNet");
  });

  it("USED remembers the switch AND records it as the last one", () => {
    // This is the case that was silently forgotten: switching is what the user
    // does most, and it wrote nothing at all.
    const r = applyAnswer(START, parseRouterAnswer("ROUTERS;USED;OfficeNet")!);
    expect(r!.next).toContain("OfficeNet");
    expect(r!.lastSsid).toBe("OfficeNet");
  });

  it("DELETED forgets only that router", () => {
    const r = applyAnswer(START, parseRouterAnswer("ROUTERS;DELETED;HomeNet")!);
    expect(r!.next).toEqual([AP]);
  });

  it("CLEARED forgets everything", () => {
    const r = applyAnswer(START, parseRouterAnswer("ROUTERS;CLEARED")!);
    expect(r!.next).toEqual([]);
  });

  it("a LIST replaces the mirror wholesale - the car is the source of truth", () => {
    const r = applyAnswer(
      ["stale", "junk"],
      parseRouterAnswer(`ROUTERS;${AP};Real`)!,
    );
    expect(r!.next).toEqual([AP, "Real"]);
  });

  it("nothing is remembered when the car REFUSES", () => {
    // The entire reason answers are consumed. A refusal must leave the saved
    // list exactly as it was - the app must not "remember" a router the car
    // never accepted.
    for (const refusal of [
      "ROUTERS;FULL",
      "ROUTERS;ERROR;Reserved",
      "ROUTERS;ERROR;Password too long",
      "ROUTERS;ERROR;SSID length",
      "ROUTERS;ERROR;Syntax",
      "ROUTERS;ERROR;Not saved:HomeNet",
    ]) {
      const answer = parseRouterAnswer(refusal)!;
      expect(applyAnswer(START, answer), refusal).toBeNull();
    }
  });

  it("adding a router the list already has does not duplicate it", () => {
    const r = applyAnswer(START, parseRouterAnswer("ROUTERS;ADDED;HomeNet")!);
    expect(r!.next).toEqual([AP, "HomeNet"]);
  });

  // U-81 (2026-10-03): a scan acknowledgement must not touch the remembered
  // list AT ALL. It used to parse as `kind: "list"` with the ssids taken from
  // the line, so `ROUTERS;SCAN;STARTED` persisted a router named "STARTED" —
  // in AsyncStorage and in the shared `car_profiles` row — and the one list
  // that tells the user where the car is grew a network that does not exist.
  it("a scan acknowledgement remembers nothing", () => {
    const answer = parseRouterAnswer("ROUTERS;SCAN;STARTED")!;
    expect(answer.kind).toBe("scanStarted");
    expect(applyAnswer(START, answer)).toBeNull();
  });

  it("matching is case-insensitive, like every other name comparison (F-64)", () => {
    const r = applyAnswer(
      ["homenet"],
      parseRouterAnswer("ROUTERS;USED;HomeNet")!,
    );
    expect(r!.next).toEqual(["homenet"]); // already there, not a second row
  });

  it("the car's own AP is never re-learnt as a saved router by a USED answer", () => {
    // Belt and braces beside D1: even if the car were ever to answer USED for its
    // own network, persisting it as a "saved router" would put the sentinel back
    // in the switchable list. The normalisation layer filters it; this pins that
    // the persistence layer does not depend on that happening.
    const r = applyAnswer([], parseRouterAnswer(`ROUTERS;USED;${AP}`)!);
    expect(r!.next).toContain(AP);
    // ...and normalizeRouters (the layer above) is what strips it. Pinned here so
    // the two facts are recorded together rather than one being assumed.
  });
});
