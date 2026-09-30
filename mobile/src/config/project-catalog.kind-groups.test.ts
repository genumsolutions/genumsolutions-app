// =====================================================================
// project-catalog.kind-groups.test.ts — pins the PLAN-2026-09-29 §2 kind
// grouping for the Control Panel pill row (step ③).
//
// Owner decisions pinned here:
//   ① The 7 categories stay SEPARATE — kinds are visual labels only;
//      nothing merges, nothing moves between categories.
//   ② Grouping is by KIND_MEMBERSHIP, but the pill ORDER inside each
//      group follows PROJECT_CATEGORIES (the original row order).
// =====================================================================
import { describe, expect, it } from "vitest";
import { KIND_GROUPS, PROJECT_CATEGORIES } from "./project-catalog";

describe("kind groups (PLAN-2026-09-29 §2)", () => {
  it("splits the 7 categories into exactly two groups", () => {
    expect(KIND_GROUPS).toHaveLength(2);
    const grouped = KIND_GROUPS.flatMap((g) => g.slugs).sort();
    const all = PROJECT_CATEGORIES.map((c) => c.slug).sort();
    // ① Every category appears in a group EXACTLY once — nothing merges,
    //    nothing is dropped or duplicated.
    expect(grouped).toEqual(all);
  });

  it("labels the groups with the approved wording", () => {
    expect(KIND_GROUPS.map((g) => g.label)).toEqual([
      "Devices that drive",
      "Devices that monitor & switch",
    ]);
  });

  it("keeps every category in its decided group", () => {
    const [drive, monitor] = KIND_GROUPS;
    expect(drive.slugs).toEqual(["robocar", "drones", "remote-controller"]);
    expect(monitor.slugs).toEqual([
      "home-automation",
      "smart-farm",
      "smart-city",
      "smart-dustbin",
    ]);
  });

  it("renders pills in the original catalog order inside each group", () => {
    const catalogOrder = PROJECT_CATEGORIES.map((c, i) => ({
      slug: c.slug,
      i,
    }));
    for (const group of KIND_GROUPS) {
      const indices = group.slugs.map(
        (s) => catalogOrder.find((c) => c.slug === s)!.i,
      );
      const sorted = [...indices].sort((a, b) => a - b);
      // Membership order must match the catalog's relative order so the
      // pill row reads the same as before, just under its kind header.
      expect(indices).toEqual(sorted);
    }
  });
});
