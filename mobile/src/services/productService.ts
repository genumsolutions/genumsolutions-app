// =====================================================================
// productService - reads the shared `products` Supabase table (the SAME
// table the website's content-store reads) and caches the result locally
// so the catalog works offline.
//
// RLS: products has a public-read policy ("public read products"), so the
// app's anon key can SELECT without a session.
// =====================================================================
import AsyncStorage from "@react-native-async-storage/async-storage";
import { logger } from "./logger";
import { supabase } from "../config/supabase";
import type { Product, ProductType, Difficulty } from "../types";

const CATALOG_CACHE_KEY = "genum_products_v1";

// Product images are stored as absolute public URLs (Supabase Storage) in the
// shared `products.image_url` column. The native app renders that value as-is
// and NEVER derives, prefixes, or fabricates image URLs - it must not depend
// on the website/web app in any way.
function normalizeImageUrl(image: string | null): string {
  return image ?? "";
}

function normalizePrice(price: number | null | undefined): number {
  const n = Number(price) || 0;
  return Math.max(0, n);
}

function priceLabelFrom(
  price: number,
  label: string | null | undefined,
  row?: ProductRow,
): string {
  if (label) return label;
  if (price > 0) return `NPR ${price.toLocaleString("en-IN")}`;
  void row;
  return "Request quote";
}

type ProductRow = {
  id: string;
  name: string;
  category: string;
  project_category: string | null;
  price: number | null;
  price_label: string | null;
  sku: string | null;
  product_type: string | null;
  inventory_type: string | null;
  active: boolean | null;
  project_overview: string | null;
  objectives: unknown;
  materials_required: unknown;
  learning_outcomes: unknown;
  build_steps: unknown;
  control_methods: unknown;
  prerequisites: unknown;
  deliverables: unknown;
  estimated_duration: string | null;
  source_folder: string | null;
  documentation_url: string | null;
  video_url: string | null;
  maintenance_notes: string | null;
  note: string | null;
  description: string | null;
  specs: unknown;
  audience: string | null;
  difficulty: string | null;
  warranty: string | null;
  stock: number | null;
  delivery: string | null;
  color: string | null;
  badge: string | null;
  supplier: string | null;
  image_url: string | null;
  gallery: string[] | null;
  import_meta: Record<string, unknown> | null;
};

export function rowToProduct(row: ProductRow): Product {
  const price = normalizePrice(row.price);
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    // U-40: project classification for the Projects screen (mirrors website).
    projectCategory: row.project_category || undefined,
    price,
    priceLabel: priceLabelFrom(price, row.price_label),
    sku: row.sku || "",
    productType: (row.product_type as ProductType) || "Retail kit",
    inventoryType:
      (row.inventory_type as Product["inventoryType"]) || "Catalog",
    active: row.active !== false,
    projectOverview: row.project_overview || "",
    objectives: Array.isArray(row.objectives)
      ? (row.objectives as string[])
      : [],
    materialsRequired: Array.isArray(row.materials_required)
      ? (row.materials_required as string[])
      : [],
    learningOutcomes: Array.isArray(row.learning_outcomes)
      ? (row.learning_outcomes as string[])
      : [],
    buildSteps: Array.isArray(row.build_steps)
      ? (row.build_steps as string[])
      : [],
    controlMethods: Array.isArray(row.control_methods)
      ? (row.control_methods as string[])
      : [],
    prerequisites: Array.isArray(row.prerequisites)
      ? (row.prerequisites as string[])
      : [],
    deliverables: Array.isArray(row.deliverables)
      ? (row.deliverables as string[])
      : [],
    estimatedDuration: row.estimated_duration || "",
    sourceFolder: row.source_folder || "",
    documentationUrl: row.documentation_url || "",
    videoUrl: row.video_url || "",
    maintenanceNotes: row.maintenance_notes || "",
    note: row.note || "",
    description: row.description || "",
    specs: Array.isArray(row.specs) ? (row.specs as string[]) : [],
    audience: row.audience || "",
    difficulty: (row.difficulty as Difficulty) || "Beginner",
    warranty: row.warranty || "",
    stock: normalizePrice(row.stock),
    delivery: row.delivery || "",
    color: row.color || "from-[#dce8ff] to-[#7e9ff2]",
    ...(row.badge ? { badge: row.badge } : {}),
    ...(row.supplier ? { supplier: row.supplier } : {}),
    image: normalizeImageUrl(row.image_url),
    ...(Array.isArray(row.gallery)
      ? { gallery: row.gallery.filter(Boolean) }
      : {}),
    ...(row.import_meta && typeof row.import_meta === "object"
      ? { importMeta: row.import_meta as Product["importMeta"] }
      : {}),
  };
}

function cacheProducts(list: Product[]): void {
  try {
    void AsyncStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

async function cachedProducts(): Promise<Product[] | null> {
  try {
    const raw = await AsyncStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0
      ? (parsed as Product[])
      : null;
  } catch {
    return null;
  }
}

// U-26 (2026-09-25): one-flight shared catalog. Products is the SAME table the
// website admin edits; eight screens (Home/Shop/Cart/Detail/Printing/Checkout/
// Projects + AppContext launch scan) were each re-downloading the FULL catalog
// (select "*" incl. JSONB) on every mount/focus -> cold-open lag + mount jank.
// A single module-level flight is shared for a short TTL; concurrent callers
// await the SAME promise (no duplicated network work).
let catalogFlight: { promise: Promise<Product[]>; at: number } | null = null;
const CATALOG_TTL_MS = 10_000;

/** Fetch the full catalog from Supabase (shared with the website). */
export async function getProductsFromSupabase(): Promise<Product[]> {
  const now = Date.now();
  if (catalogFlight && now - catalogFlight.at < CATALOG_TTL_MS)
    return catalogFlight.promise;

  const flight = (async () => {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;
    if (!data || data.length === 0) return [];
    return (data as ProductRow[]).map(rowToProduct);
  })();

  catalogFlight = { promise: flight, at: now };
  try {
    return await flight;
  } catch (e) {
    catalogFlight = null;
    throw e;
  }
}

// U-24 (2026-09-24): cheap id-only catalog read used to prune orphan cart
// lines (badge vs CartScreen parity). One in-flight fetch is shared across
// callers; the memo refreshes on a short debounce so new/deactivated products
// are picked up without extra load during a single navigation burst.
let activeIdsPromise: Promise<string[]> | null = null;

/** Ids of every ACTIVE product (best-effort; cache fallback, never throws). */
export function listActiveProductIds(): Promise<string[]> {
  if (activeIdsPromise) return activeIdsPromise;
  activeIdsPromise = (async () => {
    try {
      const { data } = await supabase
        .from("products")
        .select("id")
        .eq("active", true);
      return (data ?? []).map((row) => String((row as { id: unknown }).id));
    } catch (e) {
      logger.error("catalog", "active id fetch failed, using cache", e);
      const cached = await cachedProducts();
      return cached ? cached.map((p) => p.id) : [];
    } finally {
      const timer = setTimeout(() => {
        activeIdsPromise = null;
      }, 30_000);
      timer.unref?.();
    }
  })();
  return activeIdsPromise;
}

/** Best-effort catalog: try Supabase, fall back to a local cache. */
export async function getProducts(): Promise<Product[]> {
  try {
    const list = await getProductsFromSupabase();
    cacheProducts(list);
    return list;
  } catch (e) {
    // C8: was silent — a dead catalog now leaves a trace before cache fallback.
    logger.error("catalog", "live catalog fetch failed, serving cache", e);
    const cached = await cachedProducts();
    return cached ?? [];
  }
}

export type CatalogSource = "live" | "cache";

/** Like getProducts(), but also reports whether the data is live or cached. */
export async function getProductsWithSource(): Promise<{
  products: Product[];
  source: CatalogSource;
}> {
  try {
    const list = await getProductsFromSupabase();
    cacheProducts(list);
    return { products: list, source: "live" };
  } catch (e) {
    logger.error("catalog", "live catalog fetch failed, serving cache", e);
    const cached = await cachedProducts();
    return { products: cached ?? [], source: "cache" };
  }
}

export async function getProductById(id: string): Promise<Product | null> {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("active", true)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToProduct(data as ProductRow) : null;
  } catch (e) {
    logger.error("catalog", `product ${id} fetch failed, serving cache`, e);
    try {
      const cached = await cachedProducts();
      return cached?.find((p) => p.id === id) ?? null;
    } catch (e2) {
      logger.warn("catalog", "cache read failed", e2);
      return null;
    }
  }
}

/** Like getProductById(), but also reports whether the product is live or cached. */
export async function getProductByIdWithSource(
  id: string,
): Promise<{ product: Product | null; source: CatalogSource }> {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("active", true)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return {
      product: data ? rowToProduct(data as ProductRow) : null,
      source: "live",
    };
  } catch (e) {
    logger.error("catalog", `product ${id} fetch failed, serving cache`, e);
    try {
      const cached = await cachedProducts();
      return {
        product: cached?.find((p) => p.id === id) ?? null,
        source: "cache",
      };
    } catch {
      return { product: null, source: "cache" };
    }
  }
}

export function distinctCategories(products: Product[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of products) {
    if (!seen.has(p.category)) {
      seen.add(p.category);
      out.push(p.category);
    }
  }
  return out;
}

/**
 * U-47 (owner bug report): the app's Electronic Products screen showed 3D
 * models too — duplicating the 3D Products screen. This mirrors the web
 * `applyScope(all, "components")` branch (web lib/catalog.ts): exclude
 * Robot Cars, Pre-packaged Kits, 3D Models, and project packages. Keep the
 * two clients in sync — one scope change must land on BOTH sides.
 * Generic over the row type so the admin screens (AdminProduct) can share
 * the same scope predicate as the storefront (Product).
 */
export function applyComponentsScope<
  T extends { category?: string | null; productType?: string | null },
>(products: T[]): T[] {
  return products.filter(
    (p) =>
      !["Robot Cars", "Pre-packaged Kits"].includes(p.category ?? "") &&
      (p.category ?? "").trim().toLowerCase() !== "3d models" &&
      p.productType !== "Project package",
  );
}
export function filterProducts(
  list: Product[],
  category: string,
  query: string,
): Product[] {
  const needle = query.trim().toLowerCase();
  return list.filter((p) => {
    if (category && category !== "All" && p.category !== category) return false;
    if (!needle) return true;
    return `${p.name} ${p.note} ${p.description}`
      .toLowerCase()
      .includes(needle);
  });
}

// ===== C2 (2026-09-23): sort + price/stock filters (mirrors the website's
// lib/catalog.ts 1:1 so both catalogs behave identically) =====
export const SORT_OPTIONS = [
  "featured",
  "price-asc",
  "price-desc",
  "name",
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const SORT_LABELS: Record<SortOption, string> = {
  featured: "Featured",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  name: "Name A–Z",
};

// Price ceilings in NPR (0 = any price). Quote-only rows (price 0) never
// match a ceiling — filtering by price implies a buyable budget.
export const PRICE_CEILINGS = [0, 500, 1000, 2500, 5000, 10000] as const;
export const priceCeilingLabel = (ceiling: number): string =>
  ceiling === 0 ? "Any price" : `Up to NPR ${ceiling.toLocaleString("en-IN")}`;

export function isPriceCeiling(value: number): boolean {
  return (PRICE_CEILINGS as readonly number[]).includes(value);
}

// 'featured' preserves the curated sort_order the list arrived in.
export function sortProducts(list: Product[], sort: SortOption): Product[] {
  const sorted = [...list];
  if (sort === "price-asc")
    sorted.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
  else if (sort === "price-desc")
    sorted.sort((a, b) => b.price - a.price || a.name.localeCompare(b.name));
  else if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
  return sorted;
}

export function withinPrice(list: Product[], ceiling: number): Product[] {
  if (!ceiling) return list;
  return list.filter((p) => p.price > 0 && p.price <= ceiling);
}

export function inStockOnly(list: Product[], only: boolean): Product[] {
  return only ? list.filter((p) => p.stock > 0) : list;
}

// ===== C3 (2026-09-23): related products + recently viewed (mirrors the
// website's lib/catalog.ts 1:1 so both clients behave identically) =====

export const RECENTLY_VIEWED_LIMIT = 8;

/**
 * Related products: same category first (closest price when several),
 * then active same-type items. Excludes the product itself; cap 4.
 */
export function relatedProducts(
  all: Product[],
  current: Product,
  limit = 4,
): Product[] {
  const candidates = all.filter(
    (p) => p.id !== current.id && p.active !== false,
  );
  const sameCategory = candidates
    .filter((p) => p.category === current.category)
    .sort(
      (a, b) =>
        Math.abs(a.price - current.price) - Math.abs(b.price - current.price) ||
        a.name.localeCompare(b.name),
    );
  const sameType = candidates.filter(
    (p) =>
      p.category !== current.category && p.productType === current.productType,
  );
  return [...sameCategory, ...sameType].slice(0, limit);
}

/**
 * Add a product id to the recently-viewed list (pure — returns the new
 * list): most-recent first, self deduped, capped at the limit.
 */
export function pushRecentlyViewed(
  viewed: string[],
  productId: string,
  limit = RECENTLY_VIEWED_LIMIT,
): string[] {
  const next = [productId, ...viewed.filter((id) => id !== productId)];
  return next.slice(0, limit);
}

/**
 * Resolve recently-viewed ids against the catalog: active products only,
 * keeping the view order (most recent first). The current product is
 * excluded so the row never shows the page you are on.
 */
export function resolveRecentlyViewed(
  all: Product[],
  viewedIds: string[],
  excludeId?: string,
  limit = RECENTLY_VIEWED_LIMIT,
): Product[] {
  const byId = new Map(all.map((p) => [p.id, p]));
  const out: Product[] = [];
  for (const id of viewedIds) {
    if (out.length >= limit) break;
    if (id === excludeId) continue;
    const product = byId.get(id);
    if (product && product.active !== false && !out.some((p) => p.id === id)) {
      out.push(product);
    }
  }
  return out;
}

const RECENTLY_VIEWED_KEY = "genum-recently-viewed";

/** C3: recently-viewed ids (most recent first) from AsyncStorage. */
export async function loadRecentlyViewed(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

/** C3: persist the recently-viewed id list (best-effort). */
export async function saveRecentlyViewed(ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(ids));
  } catch {
    /* storage disabled — tracking is best-effort */
  }
}

/** C3: record a product view (dedupe + cap via the pure helper). */
export async function recordProductView(productId: string): Promise<void> {
  const viewed = await loadRecentlyViewed();
  await saveRecentlyViewed(pushRecentlyViewed(viewed, productId));
}
