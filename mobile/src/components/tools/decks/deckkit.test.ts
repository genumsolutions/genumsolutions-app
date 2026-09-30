// =====================================================================
// deckkit.test.ts — pins the per-category DECK parity contract
// (guide/PLAN-2026-09-29-CONTROL-PANEL-KINDS.md, owner decisions ①–④).
//
// Pure TS (no react-native import): the deck manifests are data, so the
// tests pin the data — component rendering is out of scope for vitest
// here (RN Flow files are unparseable; see F-46's lesson on brittle
// shared-mock tests).
// =====================================================================
import { describe, expect, it } from "vitest";
import {
  DECK_CATEGORIES,
  DECK_DECKED,
  DECK_PENDING,
  DECK_TILES,
  RESERVED_TILE_LABELS,
  deckTileIds,
  hasDeck,
} from "./deckkit";

const UNTOUCHED = ["robocar", "drones"];

function labelsOf(slug: keyof typeof DECK_TILES): string[] {
  return (DECK_TILES[slug] ?? []).map((t) => t.label);
}

describe("deckkit parity contract", () => {
  it("covers exactly the five non-robocar, non-drone categories", () => {
    expect([...DECK_CATEGORIES].sort()).toEqual(
      [
        "home-automation",
        "smart-farm",
        "smart-city",
        "smart-dustbin",
        "remote-controller",
      ].sort(),
    );
  });

  it("never gives robocar or drones a deck manifest (gold standard, untouched)", () => {
    for (const slug of UNTOUCHED) {
      expect(DECK_TILES[slug as keyof typeof DECK_TILES]).toBeUndefined();
      expect(hasDeck(slug)).toBe(false);
    }
  });

  it("ships all five dedicated decks by step ② (none on the fallback set)", () => {
    expect(DECK_DECKED.sort()).toEqual(
      [
        "home-automation",
        "smart-farm",
        "smart-city",
        "smart-dustbin",
        "remote-controller",
      ].sort(),
    );
    // All five manifests must be pairwise disjoint in labels.
    const shipped = DECK_CATEGORIES.flatMap((slug) => labelsOf(slug));
    const all = [...shipped, ...RESERVED_TILE_LABELS];
    expect(new Set(all).size).toBe(all.length);
  });

  it("every manifest tile label is pairwise-disjoint across ALL reserved + shipped vocab (zero cross-category leakage)", () => {
    const shipped = DECK_CATEGORIES.flatMap((slug) => labelsOf(slug));
    const all = [...shipped, ...RESERVED_TILE_LABELS];
    const seen = new Set<string>();
    for (const label of all) {
      expect(seen.has(label)).toBe(false);
      seen.add(label);
    }
  });

  it("labels are unique within one manifest (switch loops key on ids, not labels)", () => {
    for (const slug of DECK_CATEGORIES) {
      const labels = labelsOf(slug);
      expect(new Set(labels).size).toBe(labels.length);
      const ids = deckTileIds(slug as never);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("manifests with tiles haveDeck(); empty ones never do (no empty deck card can render)", () => {
    expect(hasDeck("home-automation")).toBe(true);
    for (const slug of DECK_CATEGORIES) {
      const has = hasDeck(slug);
      // A category WITH a manifest is decked; one without is pending and
      // still falls back to the shared SensorGrid.
      expect(has).toBe(Boolean(DECK_TILES[slug as keyof typeof DECK_TILES]));
    }
  });

  it("every shipped tile is honestly one of the four kinds with the required fields", () => {
    for (const slug of DECK_CATEGORIES) {
      for (const tile of DECK_TILES[slug] ?? []) {
        expect(["switch", "value", "gauge", "planned"]).toContain(tile.kind);
        expect(tile.label.length).toBeGreaterThan(0);
        expect(tile.icon.length).toBeGreaterThan(0);
        if (tile.kind === "switch") {
          expect(tile.relayIndex).toBeGreaterThanOrEqual(1);
        }
        if (tile.kind === "planned") {
          expect(tile.note.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("switch tiles target distinct hub relays (the old grid's Relay 1..4)", () => {
    const relays = (DECK_TILES["home-automation"] ?? [])
      .filter((t) => t.kind === "switch")
      .map((t) => (t.kind === "switch" ? t.relayIndex : -1));
    expect(new Set(relays).size).toBe(relays.length);
  });
});
