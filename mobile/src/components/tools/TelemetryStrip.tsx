// U-81 (owner 2026-10-03): the Control Panel was rebuilt to read like the
// website's RoboCar control panel — hairline borders, small uppercase tracked
// labels, MONOSPACED values, a status dot, and one honest banner.
//
//   look being matched:
//     genumsolutions-website/components/RoboCarControl.tsx
//       section  rounded-2xl border border-line bg-white p-5 shadow-card
//       tile     rounded-xl  border border-line bg-surface p-4
//       label    text-xs font-bold uppercase tracking-wide text-muted
//       value    font-mono text-sm font-bold text-navy
//       status   h-2.5 w-2.5 rounded-full + bg-accent | bg-border
//
// The mobile equivalents use this app's tokens (tailwind.config.js mirrors the
// website's) plus the U-69 `success`/`danger` pair, which exists precisely so
// status colour flips with the theme instead of merging into the dark card.
//
// All the numbers come from `telemetryFormat.ts`, which is pure and tested.
// This file only draws.
import React from "react";
import { Text, View } from "react-native";

import type { TelemetryField, TelemetryTone } from "./telemetryFormat";

const TONE_TEXT: Record<TelemetryTone, string> = {
  normal: "text-ink",
  good: "text-success",
  bad: "text-danger",
  muted: "text-muted",
};

/**
 * The reading strip: six hairline tiles, three per row, at phone density.
 */
export function TelemetryStrip({
  fields,
}: {
  fields: readonly TelemetryField[];
}) {
  return (
    <View className="mt-3 flex-row flex-wrap">
      {fields.map((f) => (
        <View
          key={f.label}
          className="mb-2 w-1/3 rounded-xl border border-line bg-surface px-2.5 py-2"
          style={{ marginRight: 6 }}
        >
          <Text
            numberOfLines={1}
            className="text-[9px] font-black uppercase tracking-[0.18em] text-muted"
          >
            {f.label}
          </Text>
          <Text
            numberOfLines={1}
            className={`mt-0.5 font-mono text-[13px] font-bold ${TONE_TEXT[f.tone]}`}
          >
            {f.value}
          </Text>
          {f.hint ? (
            <Text
              numberOfLines={1}
              className="text-[9px] font-semibold text-muted"
            >
              {f.hint}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/**
 * The status dot + line under the title. The dot is the fastest read on the
 * whole page: green when a car is reporting, grey when nothing is.
 */
export function CarStatusLine({
  connected,
  summary,
}: {
  connected: boolean;
  summary: string;
}) {
  return (
    <View className="mt-2 flex-row items-center">
      <View
        className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-success" : "bg-border"}`}
      />
      <Text
        numberOfLines={1}
        className={`ml-2 flex-1 font-mono text-xs ${connected ? "text-ink" : "text-muted"}`}
      >
        {summary}
      </Text>
    </View>
  );
}
