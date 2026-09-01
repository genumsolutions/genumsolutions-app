// =====================================================================
// serviceService - reads the shared `services` Supabase table (same data
// the website's lib/services.ts serves). RLS: public read on active rows.
// =====================================================================
import { supabase } from '../config/supabase';
import type { Service } from '../types';

type ServiceRow = {
  id: string;
  name: string;
  category: string;
  price_label: string;
  description: string;
  tag: string;
  sort_order: number;
  active: boolean;
};

function rowToService(row: ServiceRow): Service {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    priceLabel: row.price_label,
    description: row.description,
    tag: row.tag,
    sortOrder: row.sort_order,
    active: row.active,
  };
}

/** List active services from Supabase (shared with the website). */
export async function getServices(): Promise<Service[]> {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return ((data as ServiceRow[]) ?? []).map(rowToService);
}
