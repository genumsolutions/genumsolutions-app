// Pins for the router request/answer layer — the D2 fix.
//
// D2 (owner: "the adding the new router is not working"): the car answers
// every router command and the app DISCARDED the answer, so a successful add
// and a ROUTERS;FULL looked identical. These tests pin that an answer is
// parsed, matched and turned into an outcome the user sees (F-62), and that
// silence becomes a visible failure rather than a fake success.
import { describe, expect, it } from "vitest";

import {
  outcomeFor,
  parseRouterAnswer,
  parseScanLine,
  planSwitch,
  routerRequestLabel,
  routerRequestLine,
  timeoutOutcome,
  type RouterRequest,
} from "./commands";
import { normalizeRouters } from "./routerList";

const AP = "4WDCar_Wifi";

describe("requests use the one grammar owner (no forked wire strings)", () => {
  it("builds each request's exact line", () => {
    expect(routerRequestLine({ kind: "list" })).toBe("ROUTERS;LIST");
    expect(routerRequestLine({ kind: "scan" })).toBe("ROUTERS;SCAN");
    expect(routerRequestLine({ kind: "clear" })).toBe("ROUTERS;CLEAR");
    expect(routerRequestLine({ kind: "use", ssid: "HomeNet" })).toBe(
      "ROUTERS;USE;HomeNet",
    );
    expect(routerRequestLine({ kind: "del", ssid: "HomeNet" })).toBe(
      "ROUTERS;DEL;HomeNet",
    );
    expect(
      routerRequestLine({ kind: "add", ssid: "HomeNet", pass: "pw" }),
    ).toBe("ROUTERS;ADD;HomeNet;pw");
  });

  it("a semicolon in a field cannot break the grammar", () => {
    expect(routerRequestLine({ kind: "add", ssid: "Ho;me", pass: "p;w" })).toBe(
      "ROUTERS;ADD;Home;pw",
    );
  });

  it("every request has a human label naming its step", () => {
    const labels = (
      [
        { kind: "list" },
        { kind: "scan" },
        { kind: "add", ssid: "A", pass: "" },
        { kind: "use", ssid: "A" },
        { kind: "del", ssid: "A" },
        { kind: "clear" },
      ] as RouterRequest[]
    ).map(routerRequestLabel);
    expect(labels.every((l) => l.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("D2 - the car's answers are parsed, not dropped", () => {
  it("parses every success shape the firmware emits", () => {
    expect(parseRouterAnswer("ROUTERS;ADDED;HomeNet")).toEqual({
      kind: "added",
      ssid: "HomeNet",
    });
    expect(parseRouterAnswer("ROUTERS;USED;HomeNet")).toEqual({
      kind: "used",
      ssid: "HomeNet",
    });
    expect(parseRouterAnswer("ROUTERS;DELETED;HomeNet")).toEqual({
      kind: "deleted",
      ssid: "HomeNet",
    });
    expect(parseRouterAnswer("ROUTERS;CLEARED")).toEqual({ kind: "cleared" });
    expect(parseRouterAnswer("ROUTERS;FULL")).toEqual({ kind: "full" });
  });

  it("parses the saved list, which leads with the own AP", () => {
    expect(parseRouterAnswer(`ROUTERS;${AP};HomeNet`)).toEqual({
      kind: "list",
      ssids: [AP, "HomeNet"],
    });
    // Bare `ROUTERS` (the firmware's LIST reply for an empty registry).
    expect(parseRouterAnswer("ROUTERS")).toEqual({ kind: "list", ssids: [] });
  });

  it("parses the error shapes with their code and detail", () => {
    expect(parseRouterAnswer("ROUTERS;ERROR;Reserved")).toEqual({
      kind: "error",
      code: "Reserved",
      detail: "",
    });
    expect(parseRouterAnswer("ROUTERS;ERROR;Not saved:HomeNet")).toEqual({
      kind: "error",
      code: "Not saved",
      detail: "HomeNet",
    });
    expect(parseRouterAnswer("ROUTERS;ERROR;Password too long")).toEqual({
      kind: "error",
      code: "Password too long",
      detail: "",
    });
  });

  it("is case-insensitive on the verb", () => {
    expect(parseRouterAnswer("routers;used;HomeNet")).toMatchObject({
      kind: "used",
    });
  });

  it("a non-router line is null - it must not resolve a pending request", () => {
    expect(parseRouterAnswer("STATE;MODE=BT")).toBeNull();
    expect(parseRouterAnswer("")).toBeNull();
    expect(parseRouterAnswer("WIFICFG;STORED;HomeNet")).toBeNull();
  });
});

describe("an answer becomes a readable outcome - the fix for silent failure", () => {
  it("a success says what happened", () => {
    expect(
      outcomeFor(
        { kind: "added", ssid: "HomeNet" },
        { kind: "add", ssid: "HomeNet", pass: "" },
      ),
    ).toEqual({ ok: true, ssid: "HomeNet", message: 'Saved "HomeNet".' });
    expect(
      outcomeFor(
        { kind: "used", ssid: "HomeNet" },
        { kind: "use", ssid: "HomeNet" },
      ),
    ).toMatchObject({ ok: true, ssid: "HomeNet" });
  });

  it("FULL is a visible failure with the way out, not a fake success", () => {
    const o = outcomeFor(
      { kind: "full" },
      { kind: "add", ssid: "X", pass: "" },
    );
    expect(o.ok).toBe(false);
    expect(o.ok === false && o.reason).toMatch(/delete one first/i);
  });

  it("every firmware error code has a readable reason", () => {
    for (const code of [
      "Reserved",
      "Password too long",
      "SSID length",
      "Syntax",
      "Could not add router",
    ]) {
      const o = outcomeFor(
        { kind: "error", code, detail: "" },
        { kind: "list" },
      );
      expect(o.ok).toBe(false);
      if (o.ok === false) {
        expect(o.reason.length).toBeGreaterThan(10);
        expect(o.reason).not.toContain("undefined");
      }
    }
  });

  it("'Not saved' tells the user to add the router first", () => {
    const o = outcomeFor(
      { kind: "error", code: "Not saved", detail: "HomeNet" },
      { kind: "use", ssid: "HomeNet" },
    );
    expect(o.ok).toBe(false);
    expect(o.ok === false && o.reason).toMatch(/add it first/i);
  });

  it("'Syntax' names the flash - it is what an old binary says", () => {
    const o = outcomeFor(
      { kind: "error", code: "Syntax", detail: "" },
      { kind: "scan" },
    );
    expect(o.ok === false && o.reason).toMatch(/flash the car/i);
  });

  it("an unknown code still says something the user can read", () => {
    const o = outcomeFor(
      { kind: "error", code: "Martian", detail: "" },
      { kind: "list" },
    );
    expect(o.ok === false && o.reason).toContain("Martian");
  });

  it("SILENCE becomes a visible failure, never a fake success", () => {
    const o = timeoutOutcome({ kind: "use", ssid: "HomeNet" });
    expect(o.ok).toBe(false);
    expect(o.ok === false && o.reason).toMatch(/did not answer/i);
    expect(o.ok === false && o.reason).toContain("HomeNet");
  });
});

describe("the switch plan - ADD before USE, and never the own AP", () => {
  it("a router the car does not have: add, then use", () => {
    const p = planSwitch({
      target: "HomeNet",
      entries: normalizeRouters([AP]),
    });
    expect(p!.steps).toEqual([
      { kind: "add", ssid: "HomeNet", pass: "" },
      { kind: "use", ssid: "HomeNet" },
    ]);
  });

  it("a router the car already has: use only", () => {
    const entries = normalizeRouters([AP, "HomeNet"]);
    const p = planSwitch({ target: "HomeNet", entries });
    expect(p!.steps).toEqual([{ kind: "use", ssid: "HomeNet" }]);
  });

  it("a typed password re-ADDs (the firmware treats ADD as an upsert)", () => {
    const entries = normalizeRouters([AP, "HomeNet"]);
    const p = planSwitch({ target: "HomeNet", pass: "newpw", entries });
    expect(p!.steps.map((s) => s.kind)).toEqual(["add", "use"]);
  });

  it("a whitespace password is not a reason to re-ADD", () => {
    const entries = normalizeRouters([AP, "HomeNet"]);
    const p = planSwitch({ target: "HomeNet", pass: "   ", entries });
    expect(p!.steps.map((s) => s.kind)).toEqual(["use"]);
  });

  it("matching is case-insensitive against the car's list", () => {
    const entries = normalizeRouters([AP, "HomeNet"]);
    expect(planSwitch({ target: "homenet", entries })!.steps).toHaveLength(1);
  });

  it("REFUSES the car's own network - this is D1's fix, at the plan layer", () => {
    const entries = normalizeRouters([AP, "HomeNet"]);
    expect(planSwitch({ target: AP, entries })).toBeNull();
    expect(
      planSwitch({ target: "4w dcar_wifi".replace(" ", ""), entries }),
    ).toBeNull();
  });

  it("refuses a car-reported own-AP name", () => {
    expect(
      planSwitch({
        target: "GenumLab_AP",
        entries: normalizeRouters(["GenumLab_AP", "Home"]),
        ownApName: "GenumLab_AP",
      }),
    ).toBeNull();
  });

  it("refuses a blank target", () => {
    expect(planSwitch({ target: "  ", entries: [] })).toBeNull();
  });
});

describe("D3 - the scan answer shape is pinned before the firmware lands", () => {
  it("parses the SCAN line the firmware will send", () => {
    expect(parseScanLine("SCAN;HomeNet,-42,1;OfficeNet,-77,0")).toEqual([
      { ssid: "HomeNet", rssi: -42, open: true },
      { ssid: "OfficeNet", rssi: -77, open: false },
    ]);
  });

  it("an empty scan is an empty list, not a failure", () => {
    expect(parseScanLine("SCAN;NONE")).toEqual([]);
  });

  it("a non-scan line is null - a scan result never resolves a command", () => {
    expect(parseScanLine("STATE;MODE=BT")).toBeNull();
  });

  it("an unparseable rssi degrades to a weak reading rather than NaN", () => {
    expect(parseScanLine("SCAN;HomeNet,abc,1")).toEqual([
      { ssid: "HomeNet", rssi: -100, open: true },
    ]);
  });
});
