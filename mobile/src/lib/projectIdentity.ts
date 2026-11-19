// =====================================================================
// projectIdentity — turn a car's canonical project id (`FW_PROJECT`, e.g.
// "4wd4mcar") into the human project it belongs to.
//
// The User Preferences hub used to list devices flat, so two 4WD4M cars and a
// 2WD1M car were three unlabeled rows. The owner asked for the project to be
// the unit of the hub: one card per project, its devices inside, and that
// project's materials/health attached to it. This module is the single place
// that answers "which project package is this id?".
//
// Match rule: normalize both sides to lowercase alphanumerics and drop the
// firmware's trailing "car" ("4wd4mcar" -> "4wd4m"), then compare against the
// product id's leading token ("4wd4m-basic" -> "4wd4m") and its compact form
// minus a tier suffix ("smart-dustbin" -> "smartdustbin"). Names are free text
// and are never used as the key — only the canonical id is.
// =====================================================================
import { BUNDLED_PRODUCTS } from "../config/bundledProducts";
import { type Product } from "../types";

export type ProjectIdentity = {
  /** Grouping key — the canonical project id, or `unknown` when unreported. */
  key: string;
  /** Human project name (product name, else a title-cased id). */
  label: string;
  /** The matched project package, when the catalog knows this project. */
  product: Product | null;
  /** Materials the project requires (from the matched package). */
  materials: string[];
};

/** Canonical comparison token for a project id ("4wd4mcar" -> "4wd4m"). */
export function projectToken(projectId: string): string {
  const compact = projectId.toLowerCase().replace(/[^a-z0-9]/g, "");
  return compact.endsWith("car") ? compact.slice(0, -3) : compact;
}

/** True when a product id names the same project as a canonical project id. */
export function projectMatchesProduct(
  projectId: string,
  productId: string,
): boolean {
  const token = projectToken(projectId);
  if (!token) return false;
  const id = productId.toLowerCase();
  const productToken = id.split("-")[0];
  if (productToken === token) return true;
  const compactProduct = id
    .replace(/-(basic|pro|kit|v\d+)$/, "")
    .replace(/[^a-z0-9]/g, "");
  return compactProduct === token;
}

function titleCase(id: string): string {
  const spaced = id
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-z])([0-9])/gi, "$1 $2")
    .replace(/([0-9])([a-z])/gi, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim();
  if (!spaced) return "Unknown project";
  return spaced
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Resolve a canonical project id to the project card it belongs to. */
export function resolveProject(
  projectId: string | null | undefined,
): ProjectIdentity {
  const key = (projectId ?? "").trim();
  if (!key) {
    return {
      key: "unknown",
      label: "Unassigned devices",
      product: null,
      materials: [],
    };
  }
  const product =
    BUNDLED_PRODUCTS.find((p) => projectMatchesProduct(key, p.id)) ?? null;
  return {
    key,
    label: product?.name ?? titleCase(key),
    product,
    materials: product?.materialsRequired ?? [],
  };
}
