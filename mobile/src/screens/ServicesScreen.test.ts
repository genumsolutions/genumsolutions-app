// =====================================================================
// ServicesScreen.test.ts — parity with the website /services page.
//
// The website's ServicesPage renders, in this order: the service grid,
// then the training programs, then the illustrative pilot costing, then
// the 100+ project curriculum. The app used to carry the last three only
// on HomeScreen; ServicesScreen now owns them too, so these rules pin the
// sections to the SAME source the website reads and stop them drifting
// back into a second, app-only copy.
//
// WHICH VIEW THIS READS (same convention as remoteChrome.test.ts): the raw
// TypeScript/TSX source of `ServicesScreen.tsx`, comments stripped. This
// repo ships no React Testing Library, so a rendered assertion is not
// available; a real web bundle (expo export) proves it COMPILES, and these
// rules prove WHICH data and sections the compiled screen contains.
// =====================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";

function raw(rel: string): string {
  return readFileSync(fileURLToPath(new NodeURL(rel, import.meta.url)), "utf8");
}

/** Comments stripped — the assertions match JSX text/section names and
    identifiers, so comment prose must not be able to satisfy them. */
function strip(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

const src = strip(raw("./ServicesScreen.tsx"));

function count(hay: string, needle: string): number {
  return hay.split(needle).length - 1;
}

function at(needle: string): number {
  return src.indexOf(needle);
}

// The three sections the website's /services page shows after the grid.
const SECTIONS = [
  "Training programs",
  "Illustrative pilot costing",
  "100+ project curriculum",
];

describe("ServicesScreen — the three website /services program sections", () => {
  it("has a source to check (the rules must not pass vacuously)", () => {
    expect(src.length).toBeGreaterThan(1000);
    expect(at("ScrollView")).toBeGreaterThan(-1);
  });

  it("renders all three program sections, named exactly as the website names them", () => {
    for (const heading of SECTIONS) {
      expect(src, `missing section: ${heading}`).toContain(
        `\n            ${heading}\n`,
      );
    }
  });

  it("keeps the website's order: service grid, then the program sections", () => {
    const grid = at("<PagePager");
    expect(grid).toBeGreaterThan(-1);
    for (const heading of SECTIONS) {
      expect(
        at(heading),
        `${heading} must come after the service grid`,
      ).toBeGreaterThan(grid);
    }
    // …and among themselves in the order the website reads them.
    expect(at(SECTIONS[0])).toBeLessThan(at(SECTIONS[1]));
    expect(at(SECTIONS[1])).toBeLessThan(at(SECTIONS[2]));
  });

  it("gates every section on programsReady — no section renders half-resolved", () => {
    expect(count(src, "programsReady &&")).toBe(3);
  });
});

describe("ServicesScreen — program sections read the SAME data the website does", () => {
  it("reads the shared programs service instead of a services-only local copy", () => {
    expect(src).toContain('from "../services/programsService"');
    expect(src).toContain("getProgramsContent");
  });

  it("seeds all three sections from the bundled fallbacks in config/programs", () => {
    // Same three arrays the website's programs-store falls back to, so an
    // offline app shows the same content as an offline web page.
    expect(src).toContain('from "../config/programs"');
    expect(src).toContain("trainingPrograms as fallbackPrograms");
    expect(src).toContain("pilotCosts as fallbackPilotCosts");
    expect(src).toContain("stemProjectHighlights as fallbackHighlights");
    expect(count(src, "useState(fallback")).toBe(3);
  });

  it("shows the bundled content even when the DB read FAILS", () => {
    // A rejected getProgramsContent must still flip programsReady, or the
    // three sections would vanish on a bad network while the fallbacks sit
    // unused in state.
    const catchBlock = src.slice(
      src.indexOf("getProgramsContent()"),
      src.indexOf("getProgramsContent()") + 600,
    );
    expect(catchBlock).toContain(".catch(");
    expect(catchBlock).toContain("setProgramsReady(true)");
  });

  it("destructures pilot cost lines as (item, cost, note) — the website row shape", () => {
    expect(src).toContain("pilotCosts.map(([item, cost, note])");
    expect(src).toContain("{cost}");
  });

  it("renders curriculum bands from Object.entries(stemProjectHighlights)", () => {
    expect(src).toContain("Object.entries(stemProjectHighlights)");
  });

  it("renders the five training-program fields the website card shows", () => {
    for (const field of [
      "prog.title",
      "prog.duration",
      "prog.audience",
      "prog.description",
      "prog.outcome",
    ]) {
      expect(src, `missing field: ${field}`).toContain(`{${field}}`);
    }
  });

  it("quotes the same illustrative pilot total as the website", () => {
    expect(src).toContain("NPR 8,40,000");
  });
});

describe("ServicesScreen — the existing services behaviour is untouched", () => {
  it("keeps the category filter and the website's exact empty state", () => {
    expect(src).toContain("<CategoryDropdown");
    expect(src).toContain(
      "No services in this category. Contact us for details.",
    );
  });

  it("has no text search — the website's /services filter is category-only", () => {
    // A regression here would silently re-add the search box the website
    // does not have (removed in Nov 2026).
    expect(src).not.toContain("TextInput");
  });
});
