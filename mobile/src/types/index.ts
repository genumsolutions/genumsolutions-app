// =====================================================================
// Shared data types. These mirror the website's shared Supabase schema
// (website/supabase/schema.sql) so the app reads/writes the SAME database
// the website does. Column names are snake_case in the DB; these types use
// the camelCase shapes the screens consume.
// =====================================================================

export type ProductType =
  "Retail kit" | "Project package" | "Material" | "Service package";

export type Difficulty =
  "Beginner" | "Intermediate" | "Advanced" | "Professional";

export interface ProductImportMeta {
  sourceSite?: string;
  creator?: string;
  license?: string;
  designId?: string;
  tags?: string[];
  sourceUrl?: string;
  subcategory?: string;
  structuredSpecs?: { key: string; value: string }[];
  stats?: Record<string, number>;
  pricing?: Record<string, unknown>;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  /** U-40 (2026-09-26): project-specific classification ("Robo Car" ×3,
   *  "Remote Controller", "Smart Dustbin", …) — mirrors the website's
   *  products.project_category. The general `category` stays "Robot Cars"
   *  (it is load-bearing for the Shop scope); this is the one the Projects
   *  screen groups by. */
  projectCategory?: string;
  price: number;
  priceLabel: string;
  sku: string;
  productType: ProductType;
  inventoryType?: "Inhouse" | "Catalog" | "Supplier";
  active?: boolean;
  projectOverview?: string;
  objectives?: string[];
  materialsRequired?: string[];
  learningOutcomes?: string[];
  buildSteps?: string[];
  controlMethods?: string[];
  prerequisites?: string[];
  deliverables?: string[];
  estimatedDuration?: string;
  sourceFolder?: string;
  documentationUrl?: string;
  videoUrl?: string;
  maintenanceNotes?: string;
  note: string;
  description: string;
  specs: string[];
  audience: string;
  difficulty: Difficulty;
  warranty: string;
  stock: number;
  delivery: string;
  color: string;
  badge?: string;
  supplier?: string;
  image?: string;
  gallery?: string[];
  importMeta?: ProductImportMeta;
}

/** Flattened gallery order: primary image first, then the remaining gallery. */
export function galleryImages(product: {
  image?: string;
  gallery?: string[];
}): string[] {
  const gallery = (product.gallery ?? []).filter(Boolean);
  if (product.image && !gallery.includes(product.image)) {
    return [product.image, ...gallery];
  }
  return gallery;
}

export interface Service {
  id: string;
  name: string;
  category: string;
  priceLabel: string;
  description: string;
  tag: string;
  sortOrder: number;
  active: boolean;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  mode_name: string;
  category: string;
  technologies: string[];
  control_method: string[];
  difficulty: string;
  image_url?: string;
  spec?: string;
}

export interface SiteContent {
  homeTitle: string;
  homeBody: string;
}

export interface CartLine {
  productId: string;
  quantity: number;
}

export interface CheckoutLine {
  productId: string;
  name: string;
  priceNpr: number;
  quantity: number;
}

export interface CheckoutInput {
  items: CheckoutLine[];
  totalNpr: number;
  customerName: string;
  email: string;
  phone: string;
  address: string;
  provider: "cod" | "esewa" | "khalti";
}

export interface Order {
  id: string;
  user_id: string | null;
  items: CheckoutLine[];
  total_npr: number;
  status: "pending" | "paid" | "fulfilled" | "cancelled";
  provider: string;
  customer_name: string;
  email: string;
  phone: string;
  address: string;
  provider_ref: string | null;
  created_at: string;
}
