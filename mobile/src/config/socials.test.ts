// socials.test.ts — C5 contract tests for the app's social links helper.
//
// Mirrors the website's tests/socials.test.ts cases so both clients pin
// the same rules: display order matches web lib/socials.ts, an empty or
// whitespace URL hides the entry, and an all-empty company yields an
// empty row (a surface never shows dead links).
import { describe, expect, it } from "vitest";
import { socialLinks } from "./socials";
import { company as fallbackCompany } from "./company";
import type { Company } from "./company";

function companyWith(partial: Partial<Company>): Company {
  return { ...fallbackCompany, ...partial };
}

describe("socialLinks (C5 app mirror of web lib/socials)", () => {
  it("keeps the shared display order and hides empty/whitespace URLs", () => {
    const links = socialLinks(
      companyWith({
        facebookUrl: "https://facebook.com/genum",
        instagramUrl: "",
        tiktokUrl: "   ",
        linkedinUrl: "https://linkedin.com/company/genum",
        youtubeUrl: "",
      }),
    );
    expect(links.map((l) => l.key)).toEqual(["facebook", "linkedin"]);
  });

  it("returns nothing when every URL is empty (placeholder default)", () => {
    expect(socialLinks(fallbackCompany)).toEqual([]);
  });

  it("keeps labels aligned with the web client", () => {
    const links = socialLinks(
      companyWith({
        facebookUrl: "https://facebook.com/genum",
        tiktokUrl: "https://tiktok.com/@genum",
        youtubeUrl: "https://youtube.com/@genum",
      }),
    );
    expect(links.map((l) => l.label)).toEqual([
      "Facebook",
      "TikTok",
      "YouTube",
    ]);
  });
});
