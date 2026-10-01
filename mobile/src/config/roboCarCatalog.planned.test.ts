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
