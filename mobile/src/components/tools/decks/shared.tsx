// =====================================================================
// shared.tsx — the DECK KIT chrome (PLAN-2026-09-29 §5): every deck is
// built from these four primitives so all categories feel like one
// family (plan design rule 1: same card borders/spacing/typography as
// the robocar deck — rounded-2xl border border-line bg-card).
//
// Honesty rule ④ lives here: DeckSwitch/DeckValue/DeckGauge render LIVE
// state; DeckPlanned renders the "Ready for firmware" chip and stays
// disabled — it never claims to work. No fake success (F-series rule).
// =====================================================================
import React from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import type {
  DeckGaugeTile,
  DeckPlannedTile,
  DeckSwitchTile,
  DeckTileSpec,
  DeckValueTile,
} from "./deckkit";
import type { SensorData } from "../types";

/** One card of the deck — same borders/spacing as the robocar deck's
    cards (design rule 1).

    U-58 (owner report 2026-09-30 — deck cards overlapping in landscape):
    the card now FILLS its column (flex={1} default) because the screen gives
    the deck a bounded flex-1 column with min-h-0. flex-1 + min-h-0 together
    mean "fill exactly this column, never taller" — the old natural-height
    card overflowed the screen bottom and was clipped ("merged/overlapping").
    The screen does NOT wrap decks in a second card anymore — this is the
    ONE card (double-border/nesting removed). */
export function DeckCard({
  children,
  flex = 1,
}: {
  children: React.ReactNode;
  flex?: number;
}) {
  return (
    <View
      className="min-h-0 min-w-0 rounded-2xl border border-line bg-card p-3 shadow-card dark:bg-black/20"
      style={flex ? { flex } : undefined}
    >
      {children}
    </View>
  );
}

/** Live relay switch tile (OUT<relayIndex>:n when linked). */
export function DeckSwitch({
  tile,
  on,
  canControl,
  onToggle,
}: {
  tile: DeckSwitchTile;
  on: boolean;
  canControl: boolean;
  onToggle: (relayIndex: number) => void;
}) {
  return (
    <View className="flex-row items-center justify-between gap-2 border-b border-line px-1 py-2 last:border-b-0">
      <View className="min-w-0 flex-row items-center gap-2">
        <Feather name={tile.icon as any} size={16} color="#64748b" />
        <Text
          numberOfLines={1}
          className="text-xs font-bold uppercase tracking-wide text-ink dark:text-white"
        >
          {tile.label}
        </Text>
      </View>
      <Switch
        value={on}
        onValueChange={() => onToggle(tile.relayIndex)}
        disabled={!canControl}
        trackColor={{ false: "#cbd5e1", true: "#1e3a8a" }}
        thumbColor="#ffffff"
        accessibilityLabel={`Toggle ${tile.label}`}
      />
    </View>
  );
}

/** Live readout tile backed by one SensorData field. */
export function DeckValue({
  tile,
  value,
}: {
  tile: DeckValueTile;
  value: number;
}) {
  return (
    <View className="flex-1 rounded-xl border border-line bg-surface p-2.5">
      <View className="flex-row items-center gap-1.5">
        <Feather name={tile.icon as any} size={13} color={tile.accent} />
        <Text
          numberOfLines={1}
          className="text-[9px] font-black uppercase tracking-widest text-muted"
        >
          {tile.label}
        </Text>
      </View>
      <Text
        className="mt-1 font-mono text-lg font-bold"
        style={{ color: tile.accent }}
      >
        {Math.round(value * 10) / 10}
        {tile.unit}
      </Text>
    </View>
  );
}

/** Percentage gauge tile (0..100) backed by one SensorData field. */
export function DeckGauge({
  tile,
  value,
}: {
  tile: DeckGaugeTile;
  value: number;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <View className="flex-1 rounded-xl border border-line bg-surface p-2.5">
      <View className="flex-row items-center gap-1.5">
        <Feather name={tile.icon as any} size={13} color={tile.accent} />
        <Text
          numberOfLines={1}
          className="text-[9px] font-black uppercase tracking-widest text-muted"
        >
          {tile.label}
        </Text>
      </View>
      <Text
        className="mt-1 font-mono text-lg font-bold"
        style={{ color: tile.accent }}
      >
        {pct}%
      </Text>
      <View className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line">
        <View
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: tile.accent }}
        />
      </View>
    </View>
  );
}

/** Honest placeholder for controls whose hardware path is not wired yet:
    disabled + "Ready for firmware" chip. It looks real, it never claims
    to work (rule ④). */
export function DeckPlanned({ tile }: { tile: DeckPlannedTile }) {
  return (
    <View className="flex-1 rounded-xl border border-dashed border-line bg-surface p-2.5 opacity-70">
      <View className="flex-row items-center gap-1.5">
        <Feather name={tile.icon as any} size={13} color="#94a3b8" />
        <Text
          numberOfLines={1}
          className="text-[9px] font-black uppercase tracking-widest text-muted"
        >
          {tile.label}
        </Text>
      </View>
      <View className="mt-1.5 flex-row flex-wrap items-center gap-1.5">
        <View className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5">
          <Text className="text-[9px] font-black uppercase tracking-wide text-amber-700">
            Ready for firmware
          </Text>
        </View>
        <Text
          numberOfLines={2}
          className="shrink text-[9px] leading-3 text-muted"
        >
          {tile.note}
        </Text>
      </View>
    </View>
  );
}

/** Renders one tile spec from the manifest, wired to the deck's live
    state. The manifest decides WHAT renders; this decides HOW. */
export function DeckTile({
  tile,
  sensorData,
  relays,
  canControl,
  onToggleRelay,
}: {
  tile: DeckTileSpec;
  sensorData: SensorData;
  relays: Record<number, boolean>;
  canControl: boolean;
  onToggleRelay: (i: number) => void;
}) {
  switch (tile.kind) {
    case "switch":
      return (
        <DeckSwitch
          tile={tile}
          on={!!relays[tile.relayIndex]}
          canControl={canControl}
          onToggle={onToggleRelay}
        />
      );
    case "value":
      return <DeckValue tile={tile} value={sensorData[tile.source]} />;
    case "gauge":
      return <DeckGauge tile={tile} value={sensorData[tile.source]} />;
    case "planned":
      return <DeckPlanned tile={tile} />;
  }
}

/** The deck body: renders the manifest's switches as one wall, then the
    readout/planned tiles on a STABLE 2-up grid. Only THIS category's tiles
    ever render — the manifest is the whole surface (rule ②/③).

    U-58: the old per-tile classes `w-[47%] flex-1 min-w-[120px]` fought each
    other (percentage width + flex-basis + min-width) so rows wrapped
    unpredictably at landscape widths and tiles collided. Now each row is an
    explicit flex-row of two fixed-width halves (no percentages, no wrap) —
    odd counts leave the last slot empty by design (honest, stable layout). */
export function DeckGrid({
  tiles,
  sensorData,
  relays,
  canControl,
  onToggleRelay,
}: {
  tiles: DeckTileSpec[];
  sensorData: SensorData;
  relays: Record<number, boolean>;
  canControl: boolean;
  onToggleRelay: (i: number) => void;
}) {
  const switches = tiles.filter((t) => t.kind === "switch");
  const others = tiles.filter((t) => t.kind !== "switch");
  const rows: DeckTileSpec[][] = [];
  for (let i = 0; i < others.length; i += 2) {
    rows.push(others.slice(i, i + 2));
  }
  return (
    <View className="min-h-0 flex-1 gap-2.5">
      {switches.length > 0 && (
        <View className="shrink-0">
          <Text className="mb-0.5 text-[9px] font-black uppercase tracking-widest text-muted">
            Outputs
          </Text>
          {switches.map((t) => (
            <DeckTile
              key={t.id}
              tile={t}
              sensorData={sensorData}
              relays={relays}
              canControl={canControl}
              onToggleRelay={onToggleRelay}
            />
          ))}
        </View>
      )}
      {rows.length > 0 && (
        <View className="min-h-0 flex-1 flex-col justify-start gap-2.5">
          {rows.map((row, ri) => (
            <View key={ri} className="flex-row gap-2.5">
              {row.map((t) => (
                <View key={t.id} className="flex-1">
                  <DeckTile
                    tile={t}
                    sensorData={sensorData}
                    relays={relays}
                    canControl={canControl}
                    onToggleRelay={onToggleRelay}
                  />
                </View>
              ))}
              {/* Odd row: pad the missing half so widths stay symmetric. */}
              {row.length === 1 && <View className="flex-1" />}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
