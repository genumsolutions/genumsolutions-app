// =====================================================================
// U-45 Phase 2 (2026-09-27) — project ↔ component matcher, ported 1:1
// from the website's lib/project-components.ts (Phase 1). Pure +
// deterministic so the app's linker suggestions agree with the website's
// for the same materials_required + catalog inputs. NEVER writes — the
// admin Projects linker shows these as pre-filled suggestions that
// staff confirm or edit.
//
// Matching strategy (identical to the web port, keep them in sync):
//   1. alias map — curated exact-normalized names → product id
//   2. token Jaccard similarity on name + sku tokens (strip qty
//      prefixes and parentheticals first)
//   3. below threshold → null productId with the original label kept
//      (renders as "generic part", never silently dropped)
// =====================================================================

export type ProjectComponentSuggestion = {
  /** Catalog product id, or null when nothing scored high enough. */
  productId: string | null;
  /** The original material string (shown when unmatched). */
  label: string;
  /** Parsed leading quantity ("2 × X" → 2); default 1. */
  quantity: number;
  /** 0..1 similarity; 1 for exact alias hits. */
  score: number;
  /** Which strategy matched (for linker UI badges + tests). */
  matchedBy: "alias" | "similarity" | "none";
};

/** Strip a leading quantity and parenthetical annotations from a BOM line. */
export function parseMaterialLabel(raw: string): {
  quantity: number;
  tokens: string[];
} {
  let text = raw.trim();
  let quantity = 1;
  const qtyMatch = text.match(/^(\d+)\s*[x×*]\s+/i);
  if (qtyMatch) {
    quantity = Math.max(1, parseInt(qtyMatch[1] ?? "1", 10));
    text = text.slice(qtyMatch[0].length);
  }
  const innerQty = text.match(/^(\d+)\s*[x×*]\s+/i);
  if (innerQty) {
    quantity = Math.max(1, parseInt(innerQty[1] ?? "1", 10));
    text = text.slice(innerQty[0].length);
  }
  const cleaned = text
    .replace(/\([^)]*\)/g, " ") // "(I2C)", "(mode switch)"…
    .replace(/[×x*]\s*\d+/gi, " ") // trailing multipliers
    .toLowerCase();
  const tokens = cleaned
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1)
    .map(stem);
  return { quantity, tokens };
}

/** Light plural stem — "motors"→"motor" (enough for BOM matching, no NLP). */
function stem(token: string): string {
  return token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;
}

function tokenizeProduct(name: string, sku: string): Set<string> {
  const cleaned = `${name} ${sku}`.toLowerCase().replace(/\([^)]*\)/g, " ");
  return new Set(
    cleaned
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1)
      .map(stem),
  );
}

function jaccard(aInput: Iterable<string>, bInput: Iterable<string>): number {
  // Accept any iterable — callers pass arrays and Sets alike. (The original
  // `.size` check silently returned 0 for array inputs: arrays have
  // `.length`, not `.size`, so every suggestion scored 0 and matched
  // nothing. Ported with the fix.)
  const a = aInput instanceof Set ? aInput : new Set(aInput);
  const b = bInput instanceof Set ? bInput : new Set(bInput);
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export type CatalogCandidate = { id: string; name: string; sku: string };

const SIMILARITY_THRESHOLD = 0.34;

/**
 * Suggest catalog components for one material line. `aliases` maps a
 * normalized material string to a product id (admin-curated; wins outright).
 */
export function suggestComponent(
  material: string,
  catalog: CatalogCandidate[],
  aliases: Record<string, string> = {},
): ProjectComponentSuggestion {
  const { quantity, tokens } = parseMaterialLabel(material);
  const normalized = tokens.join(" ");

  const aliasId = aliases[normalized] ?? aliases[material.trim().toLowerCase()];
  if (aliasId && catalog.some((c) => c.id === aliasId)) {
    return {
      productId: aliasId,
      label: material,
      quantity,
      score: 1,
      matchedBy: "alias",
    };
  }

  let best: { id: string; score: number } | null = null;
  for (const candidate of catalog) {
    const score = jaccard(
      tokens,
      tokenizeProduct(candidate.name, candidate.sku),
    );
    if (score > (best?.score ?? 0)) best = { id: candidate.id, score };
  }
  if (best && best.score >= SIMILARITY_THRESHOLD) {
    return {
      productId: best.id,
      label: material,
      quantity,
      score: best.score,
      matchedBy: "similarity",
    };
  }
  return {
    productId: null,
    label: material,
    quantity,
    score: 0,
    matchedBy: "none",
  };
}

/** Suggest for a whole materials_required list, keeping original order. */
export function suggestComponents(
  materials: string[],
  catalog: CatalogCandidate[],
  aliases: Record<string, string> = {},
): ProjectComponentSuggestion[] {
  return materials
    .filter((m) => m.trim())
    .map((m) => suggestComponent(m, catalog, aliases));
}

/** Deduplicate suggestions onto distinct product ids (keep the best score). */
export function dedupeSuggestions(
  suggestions: ProjectComponentSuggestion[],
): ProjectComponentSuggestion[] {
  const byId = new Map<string, ProjectComponentSuggestion>();
  const result: ProjectComponentSuggestion[] = [];
  for (const s of suggestions) {
    if (!s.productId) {
      result.push(s);
      continue;
    }
    const existing = byId.get(s.productId);
    if (!existing) {
      byId.set(s.productId, s);
      result.push(s);
    } else {
      existing.quantity += s.quantity;
      if (s.score > existing.score) existing.score = s.score;
    }
  }
  return result;
}

// ---------------------------------------------------------------------
// U-45 Phase 2: app-side catalog scoping (mirror of the website's
// applyScope "components" branch in lib/catalog.ts — the app inlines the
// same contract in AdminScreen + screens; changing a scope without BOTH
// clients breaks parity tests on both repos).
// ---------------------------------------------------------------------

/** Contract categories — load-bearing literals, never repurpose (U-44). */
export function isComponentsCatalogRow(row: {
  category?: string | null;
  productType?: string | null;
}): boolean {
  const cat = (row.category ?? "").trim().toLowerCase();
  if (cat === "robot cars") return false;
  if (cat === "pre-packaged kits") return false;
  if (cat === "3d models") return false;
  return (row.productType ?? "Retail kit") !== "Project package";
}
