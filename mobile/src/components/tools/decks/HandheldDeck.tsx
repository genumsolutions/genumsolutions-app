// =====================================================================
// HandheldDeck — per-category deck step ② (PLAN-2026-09-29).
// =====================================================================
import React from "react";
import { View } from "react-native";
import { DECK_TILES } from "./deckkit";
import { DeckCard, DeckGrid } from "./shared";
import type { SensorData } from "../types";

export function HandheldDeck({
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
  const tiles = DECK_TILES["remote-controller"];
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
