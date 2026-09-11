// =====================================================================
// projectCategoryService - reads the `project_categories` Supabase table
// so the app's Control Panel hub selector shows the same categories the
// website manages. Falls back to the bundled project-catalog.ts when
// Supabase is not configured or unreachable.
//
// RLS: project_categories has a public-read policy, so the app's anon
// key can SELECT without a session.
// =====================================================================
import { supabase, supabaseConfigured } from '../config/supabase';
import {
  PROJECT_CATEGORIES,
  type ProjectCategory,
  type ControlCapability,
} from '../config/project-catalog';

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
  'directional',
  'servo',
  'pid',
  'start-stop',
  'relay',
  'sensor',
  'weblink',
  'slider',
  'gimbal',
  'altitude',
];

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === 'string' && value.trim()) {
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
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, string>;
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
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
  return {
    slug: row.id,
    name: row.name,
    tagline: '', // DB doesn't store tagline; use hardcoded fallback if needed
    description: '',
    hardware: parseList(row.hardware),
    capabilities: parseList(row.capabilities).filter(
      (c): c is ControlCapability =>
        (CAPABILITY_KINDS as readonly string[]).includes(c)
    ),
    carType: row.car_type ?? undefined,
  };
}

/** Fetch project categories DB-first with the bundled list as fallback. */
export async function getProjectCategories(): Promise<ProjectCategory[]> {
  if (!supabaseConfigured) return PROJECT_CATEGORIES;
  try {
    const { data, error } = await supabase
      .from('project_categories')
      .select('id,name,icon,car_type,hardware,capabilities,capability_labels,capability_notes,car_mode_ids')
      .order('sort_order', { ascending: true });
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
