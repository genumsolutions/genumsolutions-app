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
// Why not new columns: `import_meta` is already written whole by both
// clients (admin_service `productToRow` on the app, content-store
// `productToRow` on the website), so the shape round-trips today on
// every surface with no schema change. Adding dedicated columns would
// need a Supabase DDL migration, which is unavailable from this
// environment (expired management token, no DB URL). When one is
// available the blocks can be promoted to columns without touching the
// admin UI — this module is the only reader/writer.
//
// Never assume the key exists: rows saved before today, and rows saved
// by the website, may carry no projectDetails at all.
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

/** Read projectDetails out of an importMeta bag, filling every gap. */
export function readProjectDetails(
  meta: Record<string, unknown> | undefined | null,
): ProjectDetails {
  const details = bag(bag(meta).projectDetails);
  const code = bag(details.code);
  const material = bag(details.material);
  const procedure = bag(details.procedure);
  return {
    code: {
      language: text(code.language),
      repositoryUrl: text(code.repositoryUrl),
      libraries: text(code.libraries),
      notes: text(code.notes),
    },
    material: {
      printer: text(material.printer),
      filament: text(material.filament),
      layerHeight: text(material.layerHeight),
      infill: text(material.infill),
      printTime: text(material.printTime),
      notes: text(material.notes),
    },
    procedure: {
      steps: lines(procedure.steps),
      notes: text(procedure.notes),
    },
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
