// =====================================================================
// productService - reads the shared `products` Supabase table (the SAME
// table the website's content-store reads) and caches the result locally
// so the catalog works offline.
//
// RLS: products has a public-read policy ("public read products"), so the
// app's anon key can SELECT without a session.
// =====================================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';
import type { Product, ProductType, Difficulty } from '../types';

const CATALOG_CACHE_KEY = 'genum_products_v1';
const WEBSITE_MEDIA_BASE = 'https://genumsolutions-website.vercel.app/media/products';

function normalizeImageUrl(image: string | null, id: string): string {
  if (!image) return `${WEBSITE_MEDIA_BASE}/${id}.jpg`;
  if (image.startsWith('/')) return `https://genumsolutions-website.vercel.app${image}`;
  return image;
}

function normalizePrice(price: number | null | undefined): number {
  const n = Number(price) || 0;
  return Math.max(0, n);
}

function priceLabelFrom(price: number, label: string | null | undefined, row?: ProductRow): string {
  if (label) return label;
  if (price > 0) return `NPR ${price.toLocaleString('en-IN')}`;
  void row;
  return 'Request quote';
}

type ProductRow = {
  id: string;
  name: string;
  category: string;
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
};

export function rowToProduct(row: ProductRow): Product {
  const price = normalizePrice(row.price);
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price,
    priceLabel: priceLabelFrom(price, row.price_label),
    sku: row.sku || '',
    productType: (row.product_type as ProductType) || 'Retail kit',
    inventoryType: (row.inventory_type as Product['inventoryType']) || 'Catalog',
    active: row.active !== false,
    projectOverview: row.project_overview || '',
    objectives: Array.isArray(row.objectives) ? row.objectives as string[] : [],
    materialsRequired: Array.isArray(row.materials_required) ? row.materials_required as string[] : [],
    learningOutcomes: Array.isArray(row.learning_outcomes) ? row.learning_outcomes as string[] : [],
    buildSteps: Array.isArray(row.build_steps) ? row.build_steps as string[] : [],
    controlMethods: Array.isArray(row.control_methods) ? row.control_methods as string[] : [],
    prerequisites: Array.isArray(row.prerequisites) ? row.prerequisites as string[] : [],
    deliverables: Array.isArray(row.deliverables) ? row.deliverables as string[] : [],
    estimatedDuration: row.estimated_duration || '',
    sourceFolder: row.source_folder || '',
    documentationUrl: row.documentation_url || '',
    videoUrl: row.video_url || '',
    maintenanceNotes: row.maintenance_notes || '',
    note: row.note || '',
    description: row.description || '',
    specs: Array.isArray(row.specs) ? (row.specs as string[]) : [],
    audience: row.audience || '',
    difficulty: (row.difficulty as Difficulty) || 'Beginner',
    warranty: row.warranty || '',
    stock: normalizePrice(row.stock),
    delivery: row.delivery || '',
    color: row.color || 'from-[#dce8ff] to-[#7e9ff2]',
    ...(row.badge ? { badge: row.badge } : {}),
    ...(row.supplier ? { supplier: row.supplier } : {}),
    image: normalizeImageUrl(row.image_url, row.id),
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
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as Product[]) : null;
  } catch {
    return null;
  }
}

/** Fetch the full catalog from Supabase (shared with the website). */
export async function getProductsFromSupabase(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;
  if (!data || data.length === 0) return [];
  return (data as ProductRow[]).map(rowToProduct);
}

/** Best-effort catalog: try Supabase, fall back to a local cache. */
export async function getProducts(): Promise<Product[]> {
  try {
    const list = await getProductsFromSupabase();
    cacheProducts(list);
    return list;
  } catch {
    const cached = await cachedProducts();
    return cached ?? [];
  }
}

export async function getProductById(id: string): Promise<Product | null> {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToProduct(data as ProductRow) : null;
  } catch {
    try {
      const cached = await cachedProducts();
      return cached?.find((p) => p.id === id) ?? null;
    } catch {
      return null;
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

export function filterProducts(
  list: Product[],
  category: string,
  query: string,
): Product[] {
  const needle = query.trim().toLowerCase();
  return list.filter((p) => {
    if (category && category !== 'All' && p.category !== category) return false;
    if (!needle) return true;
    return `${p.name} ${p.note} ${p.description}`
      .toLowerCase()
      .includes(needle);
  });
}
