import { describe, expect, it } from "vitest";
import {
  blankProjectDetails,
  readProjectDetails,
  writeProjectDetails,
} from "./projectDetails";

describe("projectDetails", () => {
  it("returns an empty shape for a product with no importMeta", () => {
    expect(readProjectDetails(undefined)).toEqual(blankProjectDetails());
    expect(readProjectDetails(null)).toEqual(blankProjectDetails());
    expect(readProjectDetails({})).toEqual(blankProjectDetails());
  });

  it("fills missing sections without dropping the ones that exist", () => {
    const details = readProjectDetails({
      projectDetails: { code: { language: "Arduino C++" } },
    });
    expect(details.code.language).toBe("Arduino C++");
    expect(details.code.repositoryUrl).toBe("");
    expect(details.procedure.steps).toEqual([]);
  });

  it("round-trips the three blocks and keeps import provenance", () => {
    const meta = { sourceSite: "makerworld", structuredSpecs: [] as unknown[] };
    const details = {
      code: {
        language: "Arduino C++",
        repositoryUrl: "https://example.com/repo",
        libraries: "ESP32Servo\nWiFi.h",
        notes: "Motor driver on GPIO 25/26",
      },
      material: {
        printer: "Bambu Lab P1S",
        filament: "PLA 1.75 mm",
        layerHeight: "0.2 mm",
        infill: "20%",
        printTime: "6 h 20 m",
        notes: "Chassis upright, no supports",
      },
      procedure: {
        steps: ["Open the sketch", "Pick the ESP32 board"],
        notes: "Hold BOOT while flashing",
      },
    };

    const written = writeProjectDetails(meta, details);
    expect(written.sourceSite).toBe("makerworld");
    expect(readProjectDetails(written)).toEqual(details);
  });

  it("drops blank procedure steps and never mutates the input bag", () => {
    const meta = { creator: "Genum" };
    const details = {
      ...blankProjectDetails(),
      procedure: { steps: ["Flash", "  ", ""], notes: "" },
    };
    const written = writeProjectDetails(meta, details);
    expect(
      (written.projectDetails as { procedure: { steps: string[] } }).procedure
        .steps,
    ).toEqual(["Flash"]);
    expect(meta).toEqual({ creator: "Genum" });
  });

  it("ignores hostile shapes rather than throwing", () => {
    const details = readProjectDetails({
      projectDetails: {
        code: "not an object",
        material: ["nope"],
        procedure: { steps: "not a list", notes: 42 },
      },
    });
    expect(details).toEqual(blankProjectDetails());
  });
});
