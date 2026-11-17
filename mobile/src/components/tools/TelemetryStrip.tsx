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
  // U-85: the tiles used to be `w-1/3` PLUS `marginRight: 6`. Three tiles then
  // needed 100% + 18px, so every row overflowed its parent and the third
  // column was clipped on a narrow phone - the owner's "the control panel at
  // the top is not perfectly fitting space in the screen".
  //
  // A real gap grid fixes the arithmetic, and `grow` shares whatever is left so
  // the columns stay equal. The per-tile border and fill are gone too: six
  // bordered boxes inside a bordered card read as a website, not an app. The
  // label/value pair carries the structure on its own.
  return (
    <View className="mt-3 flex-row flex-wrap" style={{ gap: 10 }}>
      {fields.map((f) => (
        <View
          key={f.label}
          className="grow basis-[30%] rounded-lg bg-surface px-2.5 py-2"
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

// U-119 cleansing (2026-10-20): `CarStatusLine` is DELETED — the duplicated
// top Car status card it fed was removed in an earlier round (its
// buildCarTelemetry/describeCar siblings went with it), and the export
// lingered with zero callers.
// The status dot + line now live in the deck's own status row.
