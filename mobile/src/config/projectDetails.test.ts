import { describe, expect, it } from "vitest";
import {
  blankProjectDetails,
  PROJECT_DETAIL_COLUMN_KEYS,
  projectDetailColumns,
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

  // ── Columns vs the JSON copy (2026-11-18 migration) ────────────────────
  // The migration adds products.project_* columns; the JSON copy stays as the
  // compatibility side. These pin the merge rule: a column with a value wins
  // per field, an empty column falls back to JSON, and a row with no columns
  // at all (pre-migration) behaves exactly as before.

  it("prefers a column value over the JSON copy for the same field", () => {
    const details = readProjectDetails(
      { projectDetails: { code: { language: "JSON language" } } },
      { project_code_language: "Column language" },
    );
    expect(details.code.language).toBe("Column language");
  });

  it("falls back per field, not per block", () => {
    const details = readProjectDetails(
      {
        projectDetails: {
          code: { language: "JSON language", notes: "JSON notes" },
          material: { printer: "JSON printer" },
        },
      },
      {
        project_code_language: "Column language",
        // Empty columns are what the migration's DEFAULT produced on rows that
        // were never backfilled with a value, so they must not win.
        project_code_notes: "",
        project_material_printer: "Column printer",
      },
    );
    expect(details.code).toEqual({
      language: "Column language",
      repositoryUrl: "",
      libraries: "",
      notes: "JSON notes",
    });
    expect(details.material.printer).toBe("Column printer");
  });

  it("takes procedure steps from the columns only when they are non-empty", () => {
    const json = {
      projectDetails: { procedure: { steps: ["JSON step"], notes: "" } },
    };
    expect(
      readProjectDetails(json, { project_procedure_steps: ["Column step"] })
        .procedure.steps,
    ).toEqual(["Column step"]);
    // The migration's '[]' default must not erase a populated JSON copy.
    expect(
      readProjectDetails(json, { project_procedure_steps: [] }).procedure.steps,
    ).toEqual(["JSON step"]);
  });

  it("behaves exactly as before when the row has no columns", () => {
    const meta = { projectDetails: { code: { language: "Arduino C++" } } };
    expect(readProjectDetails(meta, {})).toEqual(readProjectDetails(meta));
  });

  it("builds the column payload the migration defines, blanks included", () => {
    const details = {
      ...blankProjectDetails(),
      code: { ...blankProjectDetails().code, language: "Arduino C++" },
      procedure: { steps: ["Flash", "  "], notes: "Hold BOOT" },
    };
    const columns = projectDetailColumns(details);

    // Every key the migration adds must be written, so clearing a field in the
    // console clears the column instead of leaving the old value behind.
    expect(Object.keys(columns).sort()).toEqual(
      [...PROJECT_DETAIL_COLUMN_KEYS].sort(),
    );
    expect(columns.project_code_language).toBe("Arduino C++");
    expect(columns.project_code_notes).toBe("");
    expect(columns.project_procedure_steps).toEqual(["Flash"]);
    expect(columns.project_procedure_notes).toBe("Hold BOOT");
  });

  it("reads back what projectDetailColumns wrote", () => {
    const details = {
      ...blankProjectDetails(),
      material: { ...blankProjectDetails().material, printer: "P1S" },
      procedure: { steps: ["Flash"], notes: "" },
    };
    expect(readProjectDetails({}, projectDetailColumns(details))).toEqual(
      details,
    );
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
