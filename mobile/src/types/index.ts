// =====================================================================
// Shared data types. These mirror the website's shared Supabase schema
// (website/supabase/schema.sql) so the app reads/writes the SAME database
// the website does. Column names are snake_case in the DB; these types use
// the camelCase shapes the screens consume.
// =====================================================================

export type ProductType =
  | 'Retail kit'
  | 'Project package'
  | 'Material'
  | 'Service package';

export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced' | 'Professional';

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  priceLabel: string;
  sku: string;
  productType: ProductType;
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
  provider: 'cod' | 'esewa' | 'khalti';
}

export interface Order {
  id: string;
  user_id: string | null;
  items: CheckoutLine[];
  total_npr: number;
  status: 'pending' | 'paid' | 'fulfilled' | 'cancelled';
  provider: string;
  customer_name: string;
  email: string;
  phone: string;
  address: string;
  provider_ref: string | null;
  created_at: string;
}
