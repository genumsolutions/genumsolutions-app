// =====================================================================
// projectMaterialsService — the per-project materials checklist.
//
// The catalog already lists what each project package needs
// (`materialsRequired`). What was missing is the user's own tracking: which
// parts they already have, and the extra parts they bought. This stores that
// checklist on the phone, keyed by the canonical project id, and keeps it
// valid when the catalog list changes (new required parts appear unticked,
// removed ones drop out, user-added parts survive).
// =====================================================================
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ProjectMaterial = {
  /** Display label — the catalog part name or the user's own text. */
  label: string;
  /** True when the user has this part. */
  done: boolean;
  /** True when the user added it (catalog edits never remove it). */
  custom?: boolean;
};

const KEY_PREFIX = "genum.projectMaterials.";

function norm(label: string): string {
  return label.trim().toLowerCase();
}

/**
 * Merge the catalog's required parts with what the user saved:
 * saved tick state wins, required parts the user has never seen are added
 * unticked, catalog parts that disappeared are dropped, custom parts stay.
 */
export function mergeProjectMaterials(
  required: string[],
  saved: ProjectMaterial[],
): ProjectMaterial[] {
  const savedByLabel = new Map<string, ProjectMaterial>();
  for (const item of saved) {
    const key = norm(item.label);
    if (key) savedByLabel.set(key, item);
  }
  const out: ProjectMaterial[] = [];
  const seen = new Set<string>();
  for (const label of required) {
    const key = norm(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const prior = savedByLabel.get(key);
    out.push({ label: label.trim(), done: prior?.done ?? false });
  }
  for (const item of saved) {
    const key = norm(item.label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ label: item.label.trim(), done: item.done, custom: true });
  }
  return out;
}

/** Toggle one part by label (pure; returns a new list). */
export function toggleProjectMaterial(
  items: ProjectMaterial[],
  label: string,
): ProjectMaterial[] {
  const key = norm(label);
  return items.map((item) =>
    norm(item.label) === key ? { ...item, done: !item.done } : item,
  );
}

/** Append a user part; ignores blanks and duplicates (pure). */
export function addProjectMaterial(
  items: ProjectMaterial[],
  label: string,
): ProjectMaterial[] {
  const trimmed = label.trim();
  if (!trimmed) return items;
  const key = norm(trimmed);
  if (items.some((item) => norm(item.label) === key)) return items;
  return [...items, { label: trimmed, done: false, custom: true }];
}

/** Read the saved checklist for a project, merged with the catalog list. */
export async function loadProjectMaterials(
  projectKey: string,
  required: string[],
): Promise<ProjectMaterial[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + projectKey);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const saved: ProjectMaterial[] = Array.isArray(parsed)
      ? parsed.flatMap((entry) => {
          if (!entry || typeof entry !== "object") return [];
          const row = entry as Record<string, unknown>;
          if (typeof row.label !== "string" || !row.label.trim()) return [];
          return [
            {
              label: row.label,
              done: row.done === true,
              custom: row.custom === true,
            },
          ];
        })
      : [];
    return mergeProjectMaterials(required, saved);
  } catch {
    return mergeProjectMaterials(required, []);
  }
}

/** Persist the checklist for a project (best effort; never throws). */
export async function saveProjectMaterials(
  projectKey: string,
  items: ProjectMaterial[],
): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PREFIX + projectKey, JSON.stringify(items));
  } catch {
    /* the checklist stays usable in memory for this session */
  }
}
