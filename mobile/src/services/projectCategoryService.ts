// =====================================================================
// projectCategoryService - reads the `project_categories` Supabase table
// so the app's Control Panel hub selector shows the same categories the
// website manages. Falls back to the bundled project-catalog.ts when
// Supabase is not configured or unreachable.
//
// RLS: project_categories has a public-read policy, so the app's anon
// key can SELECT without a session.
// =====================================================================
import { supabase, supabaseConfigured } from "../config/supabase";
import {
  PROJECT_CATEGORIES,
  type ProjectCategory,
  type ControlCapability,
} from "../config/project-catalog";

// A1 (2026-09-24): the DB table has NO tagline/description columns (live
// probe: column does not exist) — but ToolsScreen renders both directly.
// With DB rows resolving, that rendered EMPTY text blocks (owner: "some
// text are missing"). Copy lives ONLY in the bundled catalog today, so DB
// rows fall back to the bundled category's copy by slug; a future DB
// migration that adds real columns will win automatically.

type ProjectCategoryRow = {
  id: string;
  name: string | null;
  icon: string | null;
  car_type: string | null;
  hardware: unknown;
  capabilities: unknown;
  capability_labels: unknown;
  capability_notes: unknown;
  car_mode_ids: unknown;
  sort_order: number | null;
};

const CAPABILITY_KINDS: ControlCapability[] = [
  "directional",
  "servo",
  "pid",
  "start-stop",
  "relay",
  "sensor",
  "weblink",
  "slider",
  "gimbal",
  "altitude",
];

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseRecord(value: unknown): Record<string, string> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, string>;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    } catch {
      // ignore
    }
  }
  return {};
}

function mapRow(row: ProjectCategoryRow): ProjectCategory | null {
  if (!row.id || !row.name) return null;
  // Bundled copy fallback by slug (see the A1 note above): tagline and
  // description render on the Control Panel; empty strings would render
  // blank text blocks. Admin-created slugs without a bundled twin keep
  // empty copy — callers render nothing rather than a blank gap.
  const bundled = PROJECT_CATEGORIES.find((c) => c.slug === row.id);
  const capabilityLabels = parseRecord(row.capability_labels);
  return {
    slug: row.id,
    name: row.name,
    tagline: bundled?.tagline ?? "",
    description: bundled?.description ?? "",
    // DB rows store hardware/capabilities entries that may be plain strings
    // OR structured objects ({name, role}) managed by the website admin. The
    // app renders these as text lines, so object entries are flattened to
    // "name — role" strings here (raw objects inside <Text> crash React
    // Native: "objects are not valid as a react child").
    hardware: parseList(row.hardware).map(flattenEntry),
    capabilities: parseList(row.capabilities)
      .map(flattenEntry)
      .filter((c): c is ControlCapability =>
        (CAPABILITY_KINDS as readonly string[]).includes(c),
      ),
    // A1: per-category admin labels (e.g. relay → "Pump control") now
    // surface; screens fall back to their static map when a label is absent.
    capabilityLabels:
      Object.keys(capabilityLabels).length > 0 ? capabilityLabels : undefined,
    carType: row.car_type ?? undefined,
  };
}

/** Flatten a string OR {name, role}-style object entry to display text. */
function flattenEntry(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name : "";
    const role = typeof rec.role === "string" ? rec.role : "";
    if (name && role) return `${name} — ${role}`;
    if (name) return name;
    if (role) return role;
    return "";
  }
  return value == null ? "" : String(value);
}

/** Fetch project categories DB-first with the bundled list as fallback. */
export async function getProjectCategories(): Promise<ProjectCategory[]> {
  if (!supabaseConfigured) return PROJECT_CATEGORIES;
  try {
    const { data, error } = await supabase
      .from("project_categories")
      .select(
        "id,name,icon,car_type,hardware,capabilities,capability_labels,capability_notes,car_mode_ids",
      )
      .order("sort_order", { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0) return PROJECT_CATEGORIES;
    const categories = data
      .map((row) => mapRow(row as ProjectCategoryRow))
      .filter((c): c is ProjectCategory => c !== null);
    if (categories.length === 0) return PROJECT_CATEGORIES;
    return categories;
  } catch {
    return PROJECT_CATEGORIES;
  }
}
