// =====================================================================
// deckkit.ts — per-category DECK manifests (PLAN-2026-09-29, step ①).
//
// Owner decisions (guide/PLAN-2026-09-29-CONTROL-PANEL-KINDS.md):
//   ① The 7 categories stay SEPARATE — a deck shows ONLY its category's
//      tiles; kinds are visual labels, nothing merges.
//   ② Robocar + drones are UNTOUCHED (gold standard) — they must NEVER
//      appear here; they keep DriveControls / DroneControls.
//   ③ Every other category gets its own deck — never the shared
//      SensorGrid fallback.
//   ④ Honest UI: tiles with a live backing state (relays via OUT<i>:,
//      sensorData) render LIVE; tiles whose hardware path is not wired
//      yet render kind:"planned" → the deck draws the "Ready for
//      firmware" chip and keeps them disabled. No fake success.
//
// This module is PURE (no react-native imports) so tests can pin the
// parity contract without importing RN Flow files.
// =====================================================================
import type { SensorData } from "../types";

/** A switch tile wired to a live relay write (OUT<relayIndex>:<0|1>). */
export type DeckSwitchTile = {
  kind: "switch";
  id: string;
  label: string;
  icon: string;
  /** The hub relay this switch drives (toggleRelay(i) → OUT<i>:n). */
  relayIndex: number;
};

/** A live readout tile backed by one SensorData field. */
export type DeckValueTile = {
  kind: "value";
  id: string;
  label: string;
  icon: string;
  /** Which live sensor field this tile reads. */
  source: keyof SensorData;
  /** Unit suffix rendered after the value ("°C", "%", "ppm", "cm", "dBm"). */
  unit: string;
  accent: string;
};

/** A percentage gauge tile backed by one SensorData field (0..100). */
export type DeckGaugeTile = {
  kind: "gauge";
  id: string;
  label: string;
  icon: string;
  source: keyof SensorData;
  accent: string;
};

/** A control whose hardware path is NOT wired yet — rendered disabled
    with a "Ready for firmware" chip. Honesty rule ④. */
export type DeckPlannedTile = {
  kind: "planned";
  id: string;
  label: string;
  icon: string;
  /** Short note shown under the chip (what it will do once wired). */
  note: string;
};

export type DeckTileSpec =
  DeckSwitchTile | DeckValueTile | DeckGaugeTile | DeckPlannedTile;

/** Categories that GET a dedicated deck (everything but robocar/drones). */
export const DECK_CATEGORIES = [
  "home-automation",
  "smart-farm",
  "smart-city",
  "smart-dustbin",
  "remote-controller",
] as const;

export type DeckCategory = (typeof DECK_CATEGORIES)[number];

/** Per-category tile manifests. Step ① ships ONLY the Smart Home pilot;
 *  the other four land in step ② after owner screenshot approval.
 *
 *  ⚠ STEP-② TRIPWIRE: RemoteControlScreen's deck branch currently renders
 *  SmartHomeDeck for ANY slug with a manifest. Adding a manifest here
 *  REQUIRES the matching screen change (slug→deck component) AND updating
 *  the parity test's `PILOT_DECK_SLUGS` — the test fails on purpose until
 *  both land, so a farm/city/dustbin/handheld category can never silently
 *  render another category's deck (rule ③). */
export const PILOT_DECK_SLUGS: DeckCategory[] = ["home-automation"];

export const DECK_TILES: Partial<Record<DeckCategory, DeckTileSpec[]>> = {
  // Smart Home pilot — relay wall + climate + motion, per plan §3/§4.
  // Switches drive the hub's live relays (Relay 1..4 in the old grid);
  // climate reads live sensorData; motion/IR has no state yet → planned.
  "home-automation": [
    { kind: "switch", id: "light", label: "Light", icon: "sun", relayIndex: 1 },
    { kind: "switch", id: "fan", label: "Fan", icon: "wind", relayIndex: 2 },
    {
      kind: "switch",
      id: "socket",
      label: "Socket",
      icon: "power",
      relayIndex: 3,
    },
    {
      kind: "value",
      id: "climate-temp",
      label: "Temperature",
      icon: "thermometer",
      source: "temperature",
      unit: "°C",
      accent: "#ef4444",
    },
    {
      kind: "value",
      id: "climate-humidity",
      label: "Humidity",
      icon: "droplet",
      source: "humidity",
      unit: "%",
      accent: "#3b82f6",
    },
    {
      kind: "planned",
      id: "motion",
      label: "Motion / IR",
      icon: "eye",
      note: "Motion + IR events once the firmware reports them",
    },
  ],
};

/** Categories still on the shared SensorGrid fallback until step ②. */
export const DECK_PENDING: DeckCategory[] = DECK_CATEGORIES.filter(
  (slug) => !PILOT_DECK_SLUGS.includes(slug),
);

/** Vocab RESERVED for the step-② decks + the untouched robocar/drone
    decks. The Smart Home manifest must never leak into these — the
    parity test pins pairwise-disjoint labels, so a later deck cannot
    silently reuse another category's tile name (requirement ③). */
export const RESERVED_TILE_LABELS: string[] = [
  // Smart Farm (field strip)
  "Pump",
  "Solenoid",
  "Soil Moisture",
  "Schedule",
  // Smart City (city tiles)
  "Street Light",
  "Parking",
  "Air Quality",
  "Ambient Light",
  // Smart Dustbin (bin view)
  "Fill Level",
  "Lid",
  "Compactor",
  "Last Emptied",
  // Handheld / Remote Controller (mirror)
  "Battery",
  "Signal (RSSI)",
  "Channel",
  "Throttle Curve",
  // Untouched decks
  "Drive",
  "Steer",
  "Gimbal",
  "Altitude",
];

/** Tile ids must be unique inside one deck (switch loops key on them). */
export function deckTileIds(slug: DeckCategory): string[] {
  return (DECK_TILES[slug] ?? []).map((t) => t.id);
}

/** True when the category has a dedicated deck manifest. RemoteControlScreen
 *  routes on this: dedicated deck when true, the shared SensorGrid fallback
 *  otherwise — an empty deck card can never render (defensive routing). */
export function hasDeck(slug: string): boolean {
  const tiles = DECK_TILES[slug as DeckCategory];
  return Array.isArray(tiles) && tiles.length > 0;
}
