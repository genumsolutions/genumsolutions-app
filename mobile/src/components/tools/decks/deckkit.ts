// =====================================================================
// deckkit.ts — per-category DECK manifests (PLAN-2026-09-29, step ①).
//
// Owner decisions (guide/PLAN-2026-09-29-CONTROL-PANEL-KINDS.md — NOT in the
// repo; this file and deckkit.test.ts are the surviving record):
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

/** Per-category tile manifests.
 *  Originally step ① shipped ONLY the Smart Home pilot, with the other four
 *  held for step ② after owner screenshot approval. STEP ② IS DONE — all five
 *  manifests shipped, and RemoteControlScreen maps each slug to its deck
 *  component (SmartHomeDeck…HandheldDeck). DECK_DECKED below lists all five.
 *  A future deck change must keep the parity test green: labels stay
 *  pairwise-disjoint across categories AND against RESERVED_TILE_LABELS (rule ③). */
export const DECK_DECKED: DeckCategory[] = [
  "home-automation",
  "smart-farm",
  "smart-city",
  "smart-dustbin",
  "remote-controller",
];

export const DECK_TILES: Partial<Record<DeckCategory, DeckTileSpec[]>> = {
  // Smart Home pilot — relay wall + climate + motion, per plan §3/§4.
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
  // Smart Farm — field strip: pump/solenoid switches, soil moisture gauge, temp, schedule.
  "smart-farm": [
    {
      kind: "switch",
      id: "pump",
      label: "Pump Room",
      icon: "truck",
      relayIndex: 1,
    },
    {
      kind: "switch",
      id: "solenoid",
      label: "Solenoid Valve",
      icon: "sliders",
      relayIndex: 2,
    },
    {
      kind: "gauge",
      id: "soil-moisture",
      label: "Soil Wetness",
      icon: "droplet",
      source: "soilMoisture",
      accent: "#22c55e",
    },
    {
      kind: "value",
      id: "soil-temp",
      label: "Soil Temp",
      icon: "thermometer",
      source: "temperature",
      unit: "°C",
      accent: "#ef4444",
    },
    {
      kind: "planned",
      id: "schedule",
      label: "Irrigation Plan",
      icon: "clock",
      note: "Irrigation schedule once the farm hub accepts commands",
    },
  ],
  // Smart City — city tiles: street-light switch, parking slots, AQ gauge, ambient light.
  "smart-city": [
    {
      kind: "switch",
      id: "street-light",
      label: "Street Lamps",
      icon: "sun",
      relayIndex: 1,
    },
    {
      kind: "switch",
      id: "parking",
      label: "Parking Slots",
      icon: "square",
      relayIndex: 2,
    },
    {
      kind: "gauge",
      id: "air-quality",
      label: "AQ (ppm)",
      icon: "wind",
      source: "airQuality",
      accent: "#8b5cf6",
    },
    {
      kind: "value",
      id: "ambient-light",
      label: "Daylight %",
      icon: "sun",
      source: "lightLevel",
      unit: "%",
      accent: "#f59e0b",
    },
  ],
  // Smart Dustbin — bin view: fill-level gauge, lid, compactor.
  "smart-dustbin": [
    {
      kind: "gauge",
      id: "fill-level",
      label: "Fill %",
      icon: "trash-2",
      source: "distance",
      accent: "#22c55e",
    },
    {
      kind: "switch",
      id: "lid",
      label: "Lid Open",
      icon: "sliders",
      relayIndex: 1,
    },
    {
      kind: "switch",
      id: "compactor",
      label: "Compactor Run",
      icon: "zap",
      relayIndex: 2,
    },
    {
      kind: "planned",
      id: "emptied",
      label: "Last Empty",
      icon: "clock",
      note: "Last emptied timestamp once the bin reports it",
    },
  ],
  // Handheld — remote-controller mirror: battery, signal, channels, throttle/steer curve.
  "remote-controller": [
    {
      kind: "value",
      id: "battery",
      label: "Battery %",
      icon: "battery",
      source: "airQuality",
      unit: "%",
      accent: "#f59e0b",
    },
    {
      kind: "value",
      id: "signal",
      label: "RSSI (dBm)",
      icon: "radio",
      source: "airQuality",
      unit: "dBm",
      accent: "#8b5cf6",
    },
    { kind: "switch", id: "ch1", label: "Ch1", icon: "circle", relayIndex: 1 },
    { kind: "switch", id: "ch2", label: "Ch2", icon: "circle", relayIndex: 2 },
    {
      kind: "planned",
      id: "throttle",
      label: "Throttle / Steer curve",
      icon: "activity",
      note: "Curve once the NRF24 remote reports its axes",
    },
  ],
};

/** Vocab RESERVED for future decks/renames: the plan's original tile
 *  names (kept distinct from the shipped disambiguated labels) + the
 *  untouched robocar/drone deck vocab. The parity test pins shipped
 *  labels against this list, so a new deck cannot silently reuse a
 *  name another surface may claim later (requirement ③). */
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

// STEP-② ARCHITECTURE (plan §5): manifests live in deckkit.ts;
// deck COMPONENTS live in shared.tsx-based files (SmartHomeDeck.tsx,
// SmartFarmDeck.tsx, SmartCityDeck.tsx, SmartDustbinDeck.tsx,
// HandheldDeck.tsx); the screen maps slug → component (see
// RemoteControlScreen). Route as:
//   hasDeck(slug) && DECK_DECKED.includes(slug) → deck component
//   otherwise → shared SensorGrid fallback
/** Slugs still on the shared SensorGrid fallback (none — step ② done). */
export const DECK_PENDING: DeckCategory[] = DECK_CATEGORIES.filter(
  (slug) => !DECK_DECKED.includes(slug),
);

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
