// =====================================================================
// U-113 P1 (1.3.11) — the remote's mode-rotate button must ADVANCE on the
// 4WD4M.
//
// The defect: the old cycleMode walked the full REMOTE_MODE_ORDER and sent
// the very next token, per owner ruling R-10 ("planned/CS modes stay
// cyclable — the car will NACK if it truly rejects the token; the app must
// not pre-filter"). U-79 then REMOVED `ESP_SER`/`ESP_CLI` from the 4WD4M's
// registry outright (absent from CAPS ⇒ `GONE`, U-81), so the cycle went
// 4WD4M → ESP_SER → car answers NACK;E=UNKNOWN_MODE → handleNack rolls the
// optimistic pick back to car truth — 4WD4M again, on every tap. The button
// looked dead: "seems like resetting to the same 4wd4m car".
//
// The fix: `cycleMode` routes through the pure `nextCyclableToken` helper,
// whose predicate skips ONLY tokens whose `modeAvailStatus` is `GONE`.
// R-10 still stands for everything else — WIP/CS tokens are present in the
// car's own registry, remain cyclable, and the car renders its planned-mode
// frame.
//
// WHICH VIEW THIS READS, and why (F-83): the RAW TypeScript source of
// `useControlHub.ts`, with block and line comments stripped — the same
// convention as oneActiveLink.test.ts. These rules are about which helpers
// are called inside one useCallback and with what arguments; there is no
// component harness in this repo (no React Testing Library), so a rendered
// assertion is unavailable. Every rule below was proven in BOTH directions
// (mutate → red, restore → green) when the file was written.
// =====================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";

const RAW = readFileSync(
  fileURLToPath(new NodeURL("./useControlHub.ts", import.meta.url)),
  "utf8",
);

/** Comments stripped — character literals are NOT blanked here because this
    file's rules match identifiers and call shapes, never `'…'` literals. */
const code = RAW.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

/** The body of the `const cycleMode = useCallback(` … up to the next
    top-level `const <other> = useCallback(`. Anchor-based: if the anchor is
    missing the slice is EMPTY and the rule that needs it fails loudly, never
    vacuously. */
function cycleBody(): string {
  const start = code.indexOf("const cycleMode = useCallback(");
  const end = code.indexOf("const toggleRelay = useCallback(");
  if (start < 0 || end <= start) return "";
  return code.slice(start, end);
}

describe("U-113 P1 — cycleMode is GONE-aware (the rotate button advances)", () => {
  it("has a cycleMode to check (the rules must not pass vacuously)", () => {
    expect(cycleBody().length).toBeGreaterThan(100);
  });

  it("routes through nextCyclableToken, never the plain cycle", () => {
    const body = cycleBody();
    // The fix: the GONE-aware helper decides the next token.
    expect(body).toContain("nextCyclableToken(");
    // The old unfiltered walk is gone: no pool over REMOTE_MODE_ORDER and
    // no direct nextRemoteModeToken call inside cycleMode.
    expect(body).not.toContain("REMOTE_MODE_ORDER.map");
    expect(body).not.toContain("nextRemoteModeToken(");
  });

  it("the predicate skips ONLY GONE — WIP/CS stay cyclable (R-10)", () => {
    const body = cycleBody();
    // Availability comes from the pure resolver, keyed on the car's CAPS
    // table (or its absence, in which case nothing is GONE).
    expect(body).toContain("modeAvailStatus(");
    expect(body).toContain('avail === "GONE"');
    // isTokenComingSoon would also filter WIP/CS tokens — exactly what
    // R-10 forbids. Its absence here is the honest assertion.
    expect(body).not.toContain("isTokenComingSoon(");
  });

  it("reads the car's CAPS state (deps include carAvailMap + carStubMap)", () => {
    // The predicate closes over carAvailMap/carStubMap, so both must be in
    // the useCallback dependency list — a stale empty map would make every
    // tap walk the old unfiltered order again.
    expect(cycleBody()).toContain(
      "}, [activeMode, selectMode, carStubMap, carAvailMap]);",
    );
  });

  it("still picks optimistically through selectMode (commit grace intact)", () => {
    // The rotate keeps the A-37 optimistic-pick contract: resolve a CarMode
    // and hand it to selectMode (which sets the mode, sends the token and
    // opens the commit-grace window). The fix changes WHICH token is chosen,
    // not how it is applied.
    const body = cycleBody();
    expect(body).toContain("selectMode(");
    expect(body).toContain("canonicalCarToken(");
  });
});
