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
// Then commit the regenerated src/config/bundledProducts.ts.
// =====================================================================
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { localProducts } from "../../../genumsolutions-website/lib/catalog-data.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(here, "../src/config/bundledProducts.ts");

// The two Product types differ in exactly one field name: the website keeps
// the DB column name (`project_category`) and the app uses camelCase.
const mapped = localProducts.map((product) => {
  const { project_category, ...rest } = product;
  return project_category === undefined
    ? rest
    : { ...rest, projectCategory: project_category };
});

const header = `// =====================================================================
// bundledProducts — the WEBSITE's fallback catalog, mapped to the app's
// Product shape (project_category → projectCategory).
//
// GENERATED FILE. Do not hand-edit; regenerate with
//   npx tsx scripts/generate-bundled-catalog.mts
// from genumsolutions-app/mobile (the website repo must be a sibling).
//
// Why it exists: the app's store reads the shared \`products\` table, and a
// failed or empty read used to yield [], which made About's live-stats block
// vanish. The website falls back to these same products, so bundling them
// keeps the two surfaces reporting identical numbers offline
// (55 components / 0 3D models / 7 project packages / 7 categories).
//
// Source: genumsolutions-website/lib/catalog-data.ts (${mapped.length} products).
// =====================================================================
import type { Product } from "../types";

export const BUNDLED_PRODUCTS: Product[] = `;

writeFileSync(outFile, `${header}${JSON.stringify(mapped, null, 2)};\n`);
console.log(`wrote ${mapped.length} products to ${outFile}`);
