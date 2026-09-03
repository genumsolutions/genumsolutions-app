// =====================================================================
// companyService - reads the shared single-row `company_info` Supabase
// table (the SAME table the website's company-store reads) so the app and
// the website always show the same business contact / brand details.
// Falls back to the bundled config/company.ts when Supabase is not
// configured or unreachable. Fields merge per-field: the DB value wins
// only when non-empty, so a partial row can never blank out a fallback.
//
// RLS: company_info has a public-read policy (single marketing row), so
// the app's anon key can SELECT without a session.
// =====================================================================
import { supabase, supabaseConfigured } from '../config/supabase';
import { company as fallbackCompany, type Company } from '../config/company';

type CompanyRow = {
  name: string | null;
  short_name: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  pan: string | null;
};

/** Fetch company details DB-first with bundled fallback. */
export async function getCompany(): Promise<Company> {
  if (!supabaseConfigured) return fallbackCompany;
  try {
    const { data, error } = await supabase
      .from('company_info')
      .select('name, short_name, address, email, phone, pan')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return fallbackCompany;
    const row = data as CompanyRow;
    const pick = (db: string | null, fallback: string) => (db && db.trim() ? db.trim() : fallback);
    return {
      name: pick(row.name, fallbackCompany.name),
      shortName: pick(row.short_name, fallbackCompany.shortName),
      address: pick(row.address, fallbackCompany.address),
      email: pick(row.email, fallbackCompany.email),
      phone: pick(row.phone, fallbackCompany.phone),
      pan: pick(row.pan, fallbackCompany.pan),
    };
  } catch {
    return fallbackCompany;
  }
}
