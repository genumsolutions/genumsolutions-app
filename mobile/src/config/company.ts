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
  // C5 (2026-09-23): admin-editable socials + WhatsApp, mirroring the
  // website's lib/company.ts. Empty = surface not used. whatsappNumber is
  // digits-only WITH country code (no '+'), e.g. '9779861842552'.
  whatsappNumber: string;
  facebookUrl: string;
  instagramUrl: string;
  tiktokUrl: string;
  linkedinUrl: string;
  youtubeUrl: string;
};

export const company: Company = {
  name: "GENUM SOLUTIONS PVT. LTD.",
  shortName: "GENUM SOLUTIONS",
  address: "Shringhkhala Galli-32, Kathmandu, Nepal",
  email: "genumsolutions@gmail.com",
  phone: "+977 9861842552",
  pan: "623676190",
  // C5: PLACEHOLDERS until the owner fills real values in admin Settings.
  whatsappNumber: "9779861842552", // default = the business phone, digits-only
  facebookUrl: "",
  instagramUrl: "",
  tiktokUrl: "",
  linkedinUrl: "",
  youtubeUrl: "",
};

// C5: WhatsApp helpers (mirrored from the website's lib/socials.ts).
export function normalizeWhatsappNumber(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

export function whatsappLink(whatsappNumber: string, message?: string): string {
  const digits = normalizeWhatsappNumber(whatsappNumber);
  if (!digits) return "";
  const query = message?.trim()
    ? `?text=${encodeURIComponent(message.trim())}`
    : "";
  return `https://wa.me/${digits}${query}`;
}
