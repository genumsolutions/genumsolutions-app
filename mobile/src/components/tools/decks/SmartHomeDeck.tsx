// =====================================================================
// SmartHomeDeck — the per-category deck PILOT (PLAN-2026-09-29 step ①).
//
// Replaces the shared SensorGrid fallback for the Smart Home category
// ONLY (owner decision ③: every category gets its OWN deck showing ONLY
// its own things — never the default robocar-ish grid). Landscape is
// already locked by RemoteControlScreen; the deck fills it like the
// robocar deck does (same card chrome, rule 1).
//
// Live vs planned (rule ④):
//   · Light/Fan/Socket switches → the hub's LIVE relays (OUT<i>:n on
//     the active link) — real writes, gated on canControl.
//   · Temperature/Humidity → live sensorData (placeholder 0s until a
//     real firmware protocol exists — the established U-47 pattern).
//   · Motion/IR → DeckPlanned: "Ready for firmware" chip, disabled.
// =====================================================================
import React from "react";
import { View } from "react-native";
import { DECK_TILES } from "./deckkit";
import { DeckCard, DeckGrid } from "./shared";
import type { SensorData } from "../types";

export function SmartHomeDeck({
  sensorData,
  relays,
  canControl,
  onToggleRelay,
}: {
  sensorData: SensorData;
  relays: Record<number, boolean>;
  canControl: boolean;
  onToggleRelay: (i: number) => void;
}) {
  const tiles = DECK_TILES["home-automation"];
  // A missing manifest must never render an empty card — the remote
  // falls back to the SensorGrid branch instead (defensive routing).
  if (!tiles || tiles.length === 0) return null;
  return (
    <DeckCard>
      <DeckGrid
        tiles={tiles}
        sensorData={sensorData}
        relays={relays}
        canControl={canControl}
        onToggleRelay={onToggleRelay}
      />
    </DeckCard>
  );
}
