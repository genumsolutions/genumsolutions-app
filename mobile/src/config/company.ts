// Company details - OFFLINE FALLBACK used until the DB-first read in
// services/companyService.ts resolves (shared `company_info` table, the
// same row the website's company-store reads). Kept in sync with the
// website's lib/company.ts, which also seeds the DB row.
export type Company = {
  name: string;
  shortName: string;
  address: string;
  email: string;
  phone: string;
  pan: string;
};

export const company: Company = {
  name: 'GENUM SOLUTIONS PVT. LTD.',
  shortName: 'GENUM SOLUTIONS',
  address: 'Shringhkhala Galli-32, Kathmandu, Nepal',
  email: 'genumsolutions@gmail.com',
  phone: '+977 9861842552',
  pan: '623676190',
};
