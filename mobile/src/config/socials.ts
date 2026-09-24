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
