// =====================================================================
// projectDetails.ts — the three project-only detail blocks the admin
// console edits under Projects, and where they live.
//
// 2026-11-18 (owner): the Projects tab became hierarchical — Category,
// Pricing, Code details, 3D material details, Coding procedure. The
// first two already had homes:
//   • category  → products.project_category
//   • pricing   → project_pricing (one row per package)
// The last three are new *content* blocks. They are stored inside the
// products table's existing `import_meta` jsonb bag (exposed on both
// clients as `importMeta`), under `projectDetails`:
//
//   import_meta = {
//     ...import provenance (sourceSite, creator, structuredSpecs, …),
//     projectDetails: {
//       code:      { language, repositoryUrl, libraries, notes },
//       material:  { printer, filament, layerHeight, infill, printTime, notes },
//       procedure: { steps: string[], notes },
//     },
//   }
//
// 2026-11-18 (later the same day): the columns now exist as a migration
// (website repo, supabase/migrations/20261118180000_project_details_columns.sql,
// runbook in its docs/PROJECT_DETAILS_COLUMNS.md). The JSON bag remains
// the compatibility copy, so this module reads BOTH:
//   • readProjectDetails(importMeta, row) prefers a column value per field
//     and falls back to the JSON value for that same field.
//   • projectDetailColumns(details) builds the column payload.
// The writer sends the columns only when the database has them (see
// projectDetailColumnsAvailable in services/adminService) — a write that
// names a column which does not exist yet is a hard 42703 error, so the
// gate has to be explicit. Per-field fallback is what makes the ordering
// safe: a product whose JSON copy is newer than its columns still shows
// the newer value.
//
// Never assume either side exists: rows saved before today, rows saved by
// the website, and rows created before the migration may carry only one.
// =====================================================================

export type ProjectCodeDetails = {
  /** Language / toolchain, e.g. "Arduino C++ (ESP32 core)". */
  language: string;
  /** Repository or firmware archive link. */
  repositoryUrl: string;
  /** Libraries / dependencies, one per line in the editor. */
  libraries: string;
  /** Free-form notes (pin mapping, flashing caveats…). */
  notes: string;
};

export type ProjectMaterialDetails = {
  printer: string;
  filament: string;
  layerHeight: string;
  infill: string;
  printTime: string;
  notes: string;
};

export type ProjectCodingProcedure = {
  /** Ordered programming/flashing steps. */
  steps: string[];
  notes: string;
};

export type ProjectDetails = {
  code: ProjectCodeDetails;
  material: ProjectMaterialDetails;
  procedure: ProjectCodingProcedure;
};

export const blankProjectDetails = (): ProjectDetails => ({
  code: { language: "", repositoryUrl: "", libraries: "", notes: "" },
  material: {
    printer: "",
    filament: "",
    layerHeight: "",
    infill: "",
    printTime: "",
    notes: "",
  },
  procedure: { steps: [], notes: "" },
});

const text = (value: unknown): string =>
  typeof value === "string" ? value : "";

const lines = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((line): line is string => typeof line === "string")
    : [];

const bag = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * The products columns the migration adds, in schema order. Kept here (not in
 * the service) so the reader, the writer and the migration agree on spelling.
 */
export const PROJECT_DETAIL_COLUMN_KEYS = [
  "project_code_language",
  "project_code_repository",
  "project_code_libraries",
  "project_code_notes",
  "project_material_printer",
  "project_material_filament",
  "project_material_layer_height",
  "project_material_infill",
  "project_material_print_time",
  "project_material_notes",
  "project_procedure_steps",
  "project_procedure_notes",
] as const;

/**
 * A products row as far as this module cares: any object that MAY carry the
 * columns above. Before the migration it carries none of them.
 */
export type ProjectDetailRow = Record<string, unknown> | undefined | null;

const columnText = (
  row: ProjectDetailRow,
  key: (typeof PROJECT_DETAIL_COLUMN_KEYS)[number],
  fallback: string,
): string => {
  const value = row && typeof row === "object" ? row[key] : undefined;
  return typeof value === "string" && value !== "" ? value : fallback;
};

/**
 * Read projectDetails out of an importMeta bag, filling every gap.
 *
 * When a products row is passed as the second argument, each field takes the
 * column value if it has one and the JSON value otherwise. The fallback is
 * per field on purpose: a row whose columns were backfilled and then edited
 * on one surface can still carry a newer JSON copy for another field.
 */
export function readProjectDetails(
  meta: Record<string, unknown> | undefined | null,
  columns?: ProjectDetailRow,
): ProjectDetails {
  const details = bag(bag(meta).projectDetails);
  const code = bag(details.code);
  const material = bag(details.material);
  const procedure = bag(details.procedure);
  const columnSteps = columns?.project_procedure_steps;
  const jsonSteps = lines(procedure.steps);
  return {
    code: {
      language: columnText(
        columns,
        "project_code_language",
        text(code.language),
      ),
      repositoryUrl: columnText(
        columns,
        "project_code_repository",
        text(code.repositoryUrl),
      ),
      libraries: columnText(
        columns,
        "project_code_libraries",
        text(code.libraries),
      ),
      notes: columnText(columns, "project_code_notes", text(code.notes)),
    },
    material: {
      printer: columnText(
        columns,
        "project_material_printer",
        text(material.printer),
      ),
      filament: columnText(
        columns,
        "project_material_filament",
        text(material.filament),
      ),
      layerHeight: columnText(
        columns,
        "project_material_layer_height",
        text(material.layerHeight),
      ),
      infill: columnText(
        columns,
        "project_material_infill",
        text(material.infill),
      ),
      printTime: columnText(
        columns,
        "project_material_print_time",
        text(material.printTime),
      ),
      notes: columnText(
        columns,
        "project_material_notes",
        text(material.notes),
      ),
    },
    procedure: {
      // An empty array in the column (the migration default) must not hide a
      // populated JSON copy, so only a non-empty array wins.
      steps:
        Array.isArray(columnSteps) && columnSteps.length > 0
          ? lines(columnSteps)
          : jsonSteps,
      notes: columnText(
        columns,
        "project_procedure_notes",
        text(procedure.notes),
      ),
    },
  };
}

/**
 * The columns to write for these details (snake_case, exactly the migration's
 * names). Empty strings and an empty steps array are written as-is: the columns
 * have NOT NULL defaults, and "cleared" has to be expressible.
 */
export function projectDetailColumns(
  details: ProjectDetails,
): Record<string, unknown> {
  return {
    project_code_language: details.code.language,
    project_code_repository: details.code.repositoryUrl,
    project_code_libraries: details.code.libraries,
    project_code_notes: details.code.notes,
    project_material_printer: details.material.printer,
    project_material_filament: details.material.filament,
    project_material_layer_height: details.material.layerHeight,
    project_material_infill: details.material.infill,
    project_material_print_time: details.material.printTime,
    project_material_notes: details.material.notes,
    project_procedure_steps: details.procedure.steps.filter((step) =>
      step.trim(),
    ),
    project_procedure_notes: details.procedure.notes,
  };
}

/**
 * Write projectDetails back into an importMeta bag. Returns a NEW bag so the
 * caller can `patch({ importMeta: writeProjectDetails(...) })` without
 * mutating the product being edited. Import provenance keys are preserved.
 */
export function writeProjectDetails(
  meta: Record<string, unknown> | undefined | null,
  details: ProjectDetails,
): Record<string, unknown> {
  return {
    ...bag(meta),
    projectDetails: {
      code: { ...details.code },
      material: { ...details.material },
      procedure: {
        steps: details.procedure.steps.filter((step) => step.trim()),
        notes: details.procedure.notes,
      },
    },
  };
}
