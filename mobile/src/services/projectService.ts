// =====================================================================
// projectService - reads project packages from the shared `products`
// Supabase table. The website's /projects page shows Project packages and
// Robot Cars from the SAME products table (see website's ProjectsCatalog),
// so the app shows the same data.
// =====================================================================
import { getProductsFromSupabase } from './productService';
import type { Product } from '../types';

export interface Project {
  id: string;
  name: string;
  description: string;
  mode_name: string;
  category: string;
  inventoryType?: 'Inhouse' | 'Catalog' | 'Supplier';
  technologies: string[];
  difficulty: string;
  image?: string;
  priceLabel: string;
  specs: string[];
}

function isProjectPackage(p: Product): boolean {
  return (
    p.productType === 'Project package' ||
    p.category === 'Robot Cars' ||
    p.category === 'Pre-packaged Kits'
  );
}

export async function getProjects(): Promise<Project[]> {
  const products = await getProductsFromSupabase();
  return products
    .filter(isProjectPackage)
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      mode_name: p.category,
      category: p.category,
      inventoryType: p.inventoryType,
      technologies: p.specs,
      difficulty: p.difficulty,
      image: p.image,
      priceLabel: p.priceLabel,
      specs: p.specs,
    }));
}
