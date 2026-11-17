// =====================================================================
// socials.ts — C5: the app's pure social-links helper, mirroring the
// website's lib/socials.ts socialLinks() 1:1 (same keys, same display
// order, same empty-URL-means-hidden rule). Kept free of react-native
// imports so it is unit-testable under node vitest, exactly like the
// web's helper. UI mapping (Feather icons) lives in SocialsRow.tsx.
//
// Social URLs are admin-editable in the shared company_info row (web
// admin Settings / app Company info editor). An empty URL means the
// surface is not used — callers must hide the entry rather than render
// a dead link.
// =====================================================================
import type { Company } from "./company";

export type SocialLink = {
  key: string;
  label: string;
  url: string;
};

/** The admin-editable social surfaces, in display order, empty = hidden. */
export function socialLinks(
  company: Pick<
    Company,
    "facebookUrl" | "instagramUrl" | "tiktokUrl" | "linkedinUrl" | "youtubeUrl"
  >,
): SocialLink[] {
  const all: SocialLink[] = [
    { key: "facebook", label: "Facebook", url: company.facebookUrl ?? "" },
    { key: "instagram", label: "Instagram", url: company.instagramUrl ?? "" },
    { key: "tiktok", label: "TikTok", url: company.tiktokUrl ?? "" },
    { key: "linkedin", label: "LinkedIn", url: company.linkedinUrl ?? "" },
    { key: "youtube", label: "YouTube", url: company.youtubeUrl ?? "" },
  ];
  return all.filter((link) => link.url.trim().length > 0);
}

/**
 * Normalize an admin-entered WhatsApp number to the digits-only form the
 * wa.me link format expects: strips everything except digits.
 * '+977 986-1842 552' -> '9779861842552'.
 *
 * Mirrors website lib/socials.ts normalizeWhatsappNumber() 1:1.
 */
export function normalizeWhatsappNumber(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

/**
 * Sanity-check a stored number: 8-15 digits after the country code.
 *
 * Mirrors website lib/socials.ts isValidWhatsappNumber() 1:1.
 */
export function isValidWhatsappNumber(value: string): boolean {
  return /^\d{8,15}$/.test(normalizeWhatsappNumber(value));
}

/**
 * Build a wa.me deep link with an optional prefilled message.
 *
 * Mirrors website lib/socials.ts whatsappLink() 1:1.
 * Note: the app's company.ts already exports whatsappLink() — this is the
 * website-side helper. The app uses its own copy in company.ts.
 */
export function whatsappLink(whatsappNumber: string, message?: string): string {
  const digits = normalizeWhatsappNumber(whatsappNumber);
  if (!digits) return "";
  const query = message?.trim()
    ? `?text=${encodeURIComponent(message.trim())}`
    : "";
  return `https://wa.me/${digits}${query}`;
}
