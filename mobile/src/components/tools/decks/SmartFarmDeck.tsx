// =====================================================================
// SmartFarmDeck — per-category deck step ② (PLAN-2026-09-29).
//
// Landed after owner approval of the Smart Home pilot (plan ①).
// See SmartHomeDeck.tsx for the live-vs-planned honesty rules; this deck
// follows the same family (DeckCard + DeckGrid from shared.tsx).
// =====================================================================
import React from "react";
import { View } from "react-native";
import { DECK_TILES } from "./deckkit";
import { DeckCard, DeckGrid } from "./shared";
import type { SensorData } from "../types";

export function SmartFarmDeck({
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
  const tiles = DECK_TILES["smart-farm"];
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
