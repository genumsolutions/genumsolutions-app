// =====================================================================
// U-124 ⑮ (owner 2026-10-24) — the add-network form:
//
//   "remove the duplicated 'Network name' label and shrink the oversized
//   type"
//
// The label rendered TWICE (two identical Text blocks stacked under the
// modal title), and both the title and the field labels sat above the
// panel's own scale (15 px / 13 px black caps vs. the 10–12 px tiers the
// rest of the Connectivity pane uses).
//
// Pins:
//   1. exactly ONE "Network name" label Text block;
//   2. the label tier is 10 px (the panel's micro-label), the modal
//      title 12 px — nothing in the form is 13 px+ black caps anymore;
//   3. the input itself stays 16 px (native keyboard/font scaling), and
//      the tap rows keep their real heights (item 5's tap rules).
// =====================================================================

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

function raw(rel: string): string {
  return readFileSync(join(__dirname, rel), "utf8");
}

/** Comments stripped; `//` preceded by `:` (URL literals) survives. */
function strip(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

const panel = strip(raw("./WifiPanel.tsx"));

describe("U-124 ⑮ — the add-network form's label and type", () => {
  it("renders the 'Network name' label exactly ONCE", () => {
    const blocks = panel.match(
      /text-\[10px\] font-black uppercase tracking-widest text-muted">\s*\n\s*Network name/g,
    );
    expect(blocks ?? []).toHaveLength(1);
    // No 13 px copy of the label survives anywhere.
    expect(panel).not.toContain("text-[13px] font-black uppercase");
  });

  it("the field labels are on the 10 px tier and the title on 12 px", () => {
    expect(panel).toContain(
      'className="mt-5 text-[10px] font-black uppercase tracking-widest text-muted"',
    );
    expect(panel).toContain(
      'className="mt-4 text-[10px] font-black uppercase tracking-widest text-muted"',
    );
    expect(panel).toContain(
      'className="min-w-0 flex-1 text-[12px] font-black text-ink"',
    );
    // Password is a field label too — same tier as Network name.
    expect(panel).toMatch(
      /text-\[10px\] font-black uppercase tracking-widest text-muted">\s*\n\s*Password/,
    );
  });

  it("the inputs keep 16 px text (native keyboard scaling) and real tap rows", () => {
    expect(panel).toContain("px-4 text-[16px] text-ink");
    // The save row keeps its py-4 tap height; buttons keep 14 px labels.
    expect(panel).toContain("py-4 disabled:opacity-50");
    expect(panel).toContain('className="text-[14px] font-black text-white"');
  });
});
