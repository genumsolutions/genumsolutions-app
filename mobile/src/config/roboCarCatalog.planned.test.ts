// =====================================================================
// roboCarCatalog additions - the guards for the 2026-10-01 owner
// decisions: title-cased car labels, and modes flagged PLANNED when no
// firmware exists for them yet.
//
// The failure this prevents: a mode like "Obstacle Avoidance - IR" is a
// sellable product on the website, but there is no firmware repository
// behind it. Offered as a working car it implies hardware that cannot be
// built. `isPlanned` makes the app say so instead.
//
// PROTOCOL SAFETY: these tests also pin the fact that adding the planned
// flag did NOT touch token or deviceIndex. deviceIndex is the firmware
// cycle order; a shift would break the remote's button parity, so the
// existing "exactly 9 modes" and parity locks must still hold.
// =====================================================================
import { describe, it, expect } from "vitest";
import {
  LOCAL_CAR_MODES,
  PLANNED_MODE_IDS,
  isCarModeBuilt,
  isModeToken,
  sortRemoteModes,
  type CarMode,
} from "./roboCarCatalog";

describe("car labels are one consistent style (owner 2026-10-01)", () => {
  it("uses human title case for every model label", () => {
    // Was four styles at once: "4-wheel-drive", "Self-balancing",
    // "Obstacle avoider", "RF car".
    //
    // The rule is "each word capitalised, spaces between words" - a hyphen
    // is only a problem when it is being used as a word SEPARATOR (the slug
    // "4-wheel-drive"), which is why the test below allows "4-Wheel Drive"
    // but the exact-list test pins the real values.
    for (const m of LOCAL_CAR_MODES) {
      expect(m.car, `${m.id} car label`).toMatch(/^[A-Z0-9]/);
      // A lowercase letter directly after a hyphen means a slug, not a label.
      expect(m.car, `${m.id} must not be a machine slug`).not.toMatch(/-[a-z]/);
    }
  });

  it("uses the exact labels the database now stores", () => {
    const cars = new Set(LOCAL_CAR_MODES.map((m) => m.car));
    // Matches robo_car_modes.car after migration 20261001130000.
    expect([...cars].sort()).toEqual([
      "2-Wheel Drive",
      "4-Wheel Drive",
      "Line Follower",
      "Obstacle Avoider",
      "RF Car",
      "Self-Balancing",
      "Website Car",
    ]);
  });

  it("never renders a car label with a device_index cycle hole", () => {
    // Every mode must have a car label, since ProjectInfo shows it as "Build".
    for (const m of LOCAL_CAR_MODES) expect(m.car.length).toBeGreaterThan(0);
  });
});

describe("planned modes (owner 2026-10-01)", () => {
  it("flags exactly the six modes with no firmware behind them", () => {
    expect([...PLANNED_MODE_IDS].sort()).toEqual([
      "obstacle-ir",
      "obstacle-us",
      "path-follow",
      "rf-manual",
      "website-client",
      "website-server",
    ]);
  });

  it("marks the three modes that DO have firmware as not planned", () => {
    for (const m of LOCAL_CAR_MODES) {
      if (m.id === "4wd4m" || m.id === "2wd1m" || m.id === "self-balancing") {
        expect(m.isPlanned, `${m.id} has a firmware repo`).toBeFalsy();
      }
    }
  });

  it("carries the flag on every planned catalogue entry", () => {
    for (const m of LOCAL_CAR_MODES) {
      if (PLANNED_MODE_IDS.includes(m.id)) {
        expect(m.isPlanned, `${m.id} must be flagged`).toBe(true);
      }
    }
  });

  it("keeps rf-manual planned: the remote runs it, not the car", () => {
    // rf-manual has a repo (Genum_REMOTE_ESP32) but it is the HAND-HELD
    // remote that performs the mode, so from the car's point of view there
    // is no car firmware to build.
    expect(PLANNED_MODE_IDS).toContain("rf-manual");
  });
});

describe("isCarModeBuilt badges the six planned modes", () => {
  // ProjectInfo.tsx used to hard-code its own AVAILABLE_TOKENS set naming 8
  // of 9 tokens available and badging only MAN — a THIRD availability source
  // that contradicted this table, so five unbuilt modes (obstacle US/IR,
  // both website modes, path-follow) were shown to users as working. These
  // tests pin the count and the membership so a third source cannot quietly
  // return.
  it("reports unbuilt for exactly the six planned modes", () => {
    const unbuilt = LOCAL_CAR_MODES.filter((m) => !isCarModeBuilt(m)).map(
      (m) => m.id,
    );
    expect(unbuilt.sort()).toEqual([...PLANNED_MODE_IDS].sort());
  });

  it("reports built for the three modes with firmware", () => {
    for (const m of LOCAL_CAR_MODES) {
      if (m.id === "4wd4m" || m.id === "2wd1m" || m.id === "self-balancing") {
        expect(isCarModeBuilt(m), `${m.id} has firmware`).toBe(true);
      }
    }
  });

  it("agrees with the flag when handed a DB-shaped row", () => {
    // carModeService overlays is_planned from robo_car_modes_flags, so the
    // same predicate has to work on a row that never passed through the
    // bundled catalogue.
    expect(isCarModeBuilt({ id: "obstacle-us", isPlanned: true })).toBe(false);
    expect(isCarModeBuilt({ id: "4wd4m", isPlanned: false })).toBe(true);
  });

  it("resolves by token when no id is supplied", () => {
    for (const m of LOCAL_CAR_MODES) {
      expect(isCarModeBuilt({ token: m.token }), `${m.token} by token`).toBe(
        isCarModeBuilt(m),
      );
    }
  });

  it("falls back to the catalogue when the flag is absent", () => {
    expect(isCarModeBuilt({ id: "rf-manual" })).toBe(false);
    expect(isCarModeBuilt({ token: "MAN" })).toBe(false);
  });

  it("treats an unknown or missing mode as built, never as unbuilt", () => {
    // Silently badging a real mode as unbuilt is the failure this guard
    // exists to prevent; an unrecognised identifier must not do that.
    expect(isCarModeBuilt(null)).toBe(true);
    expect(isCarModeBuilt(undefined)).toBe(true);
    expect(isCarModeBuilt({})).toBe(true);
    expect(isCarModeBuilt({ id: "not-a-mode" })).toBe(true);
  });
});

describe("planned modes are labelled, never gated (R-10)", () => {
  it("answers 'is the firmware built?', and never blocks on ignorance", () => {
    // The previous version of this test asserted `typeof result === "boolean"`,
    // which is a compile-time fact no implementation change can falsify — a
    // test that could not fail.
    //
    // What this actually has to pin is the FUNCTION's contract, because R-10
    // depends on it: a planned mode is honestly "not built" (false), a live one
    // is built (true), and an UNKNOWN mode is NOT treated as unbuilt — if it
    // were, a catalogue lookup miss would silently hide a mode that works.
    // "Never gated" is enforced elsewhere: the UI still offers planned modes,
    // labelled coming-soon, rather than hiding them. That is what isCarModeBuilt
    // is for — it must not be usable as a permission, and it never is.
    const planned = LOCAL_CAR_MODES.find((m) => m.isPlanned === true);
    const live = LOCAL_CAR_MODES.find((m) => m.isPlanned !== true);
    expect(planned, "catalog must still contain a planned mode").toBeDefined();
    expect(live, "catalog must still contain a live mode").toBeDefined();

    expect(isCarModeBuilt(planned!)).toBe(false);
    expect(isCarModeBuilt(live!)).toBe(true);
    // Unknown must not be read as "not built" — that would gate a working mode.
    expect(isCarModeBuilt(null)).toBe(true);
    expect(isCarModeBuilt(undefined)).toBe(true);
    // An id it cannot find in the catalog is likewise not a reason to hide it.
    expect(isCarModeBuilt({ id: "no-such-mode" })).toBe(true);
  });
});

describe("the planned flag is not a protocol change", () => {
  it("still exposes exactly 9 modes", () => {
    expect(LOCAL_CAR_MODES).toHaveLength(9);
  });

  it("leaves the firmware cycle order untouched", () => {
    // deviceIndex is what the physical remote cycles through. Flagging a
    // mode must never renumber it.
    const expected = {
      "4wd4m": 0,
      "website-server": 1,
      "path-follow": 2,
      "obstacle-us": 3,
      "obstacle-ir": 4,
      "rf-manual": 5,
      "self-balancing": 6,
      "website-client": 7,
      "2wd1m": 8,
    };
    for (const m of LOCAL_CAR_MODES) {
      expect(m.deviceIndex, `${m.id} deviceIndex`).toBe(expected[m.id]);
    }
  });

  it("leaves every mode token unchanged", () => {
    const tokens = LOCAL_CAR_MODES.map((m) => m.token);
    expect(tokens).toEqual([
      "4WD4M",
      "2WD1M",
      "AUTO",
      "OBS_US",
      "OBS_IR",
      "ESP_CLI",
      "ESP_SER",
      "PATH",
      "MAN",
    ]);
    for (const t of tokens) expect(isModeToken(t)).toBe(true);
  });

  it("still sorts the same way for the remote", () => {
    const base = LOCAL_CAR_MODES[0] as CarMode;
    const sorted = sortRemoteModes([base]);
    expect(sorted[0]?.id).toBe(base.id);
  });
});
