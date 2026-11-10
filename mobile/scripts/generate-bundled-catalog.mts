// =====================================================================
// scripts/generate-bundled-catalog.mts
//
// Regenerates src/config/bundledProducts.ts from the WEBSITE's fallback
// catalog, so the app never hand-maintains a second copy of 55 products.
//
// The app's store reads the shared `products` table. With no credentials
// (or a failed/empty read) it used to return an empty list, which made
// About's live-stats block disappear — while the website kept showing its
// bundled 55. Mirroring the website's fallback makes both surfaces agree on
// every number, database or no database.
//
// Run from genumsolutions-app/mobile, with the website checked out next to
// the app repo (the normal layout of this project):
//
//   npx tsx scripts/generate-bundled-catalog.mts
//
// CI checks out the website inside the app repo instead, so the location is
// overridable:
//
//   npx tsx scripts/generate-bundled-catalog.mts --website ../website
//
// Then commit the regenerated src/config/bundledProducts.ts.
// =====================================================================
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { format } from "prettier";

const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(here, "../src/config/bundledProducts.ts");

// `--website <dir>` wins; otherwise assume the siblings layout above.
const flag = process.argv.indexOf("--website");
const websiteRoot =
  flag !== -1 && process.argv[flag + 1]
    ? resolve(process.cwd(), process.argv[flag + 1]!)
    : resolve(here, "../../../genumsolutions-website");

const { localProducts } = await import(
  pathToFileURL(resolve(websiteRoot, "lib/catalog-data.ts")).href
);

// The two Product types differ in exactly one field name: the website keeps
// the DB column name (`project_category`) and the app uses camelCase.
const mapped = localProducts.map((product) => {
  const { project_category, ...rest } = product;
  return project_category === undefined
    ? rest
    : { ...rest, projectCategory: project_category };
});

// Same scope rules as the website's applyScope(): models and packages are
// disjoint from the components catalog, so these numbers are what /about
// reports on both surfaces when the database is unavailable.
const isModel = (p: (typeof mapped)[number]) =>
  p.category?.trim().toLowerCase() === "3d models";
const isPackage = (p: (typeof mapped)[number]) =>
  p.productType === "Project package" || p.category === "Pre-packaged Kits";
const models = mapped.filter(isModel).length;
const packages = mapped.filter(isPackage).length;
const components = mapped.filter((p) => !isModel(p) && !isPackage(p)).length;

const header = `// =====================================================================
// bundledProducts — the WEBSITE's fallback catalog, mapped to the app's
// Product shape (project_category → projectCategory).
//
// GENERATED FILE. Do not hand-edit; regenerate with
//   npx tsx scripts/generate-bundled-catalog.mts
// from genumsolutions-app/mobile (the website repo must be a sibling, or pass
// \`--website <dir>\`). CI runs it and fails if this file is stale.
//
// Why it exists: the app's store reads the shared \`products\` table, and a
// failed or empty read used to yield [], which made About's live-stats block
// vanish. The website falls back to these same products, so bundling them
// keeps the two surfaces reporting identical numbers offline
// (${components} components / ${models} 3D models / ${packages} project packages / 7 categories).
//
// Source: genumsolutions-website/lib/catalog-data.ts (${mapped.length} products,
// including the snapshotted models and packages in catalog-extras-data.ts).
// =====================================================================
import type { Product } from "../types";

export const BUNDLED_PRODUCTS: Product[] = `;

// Prettier-formatted on purpose: lint-staged reformats staged files, so
// emitting raw JSON made every regeneration look like a 2,000-line diff.
const formatted = await format(`${header}${JSON.stringify(mapped, null, 2)};\n`, {
  parser: "typescript",
});

writeFileSync(outFile, formatted);
console.log(`wrote ${mapped.length} products to ${outFile}`);
