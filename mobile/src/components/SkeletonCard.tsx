// =====================================================================
// SkeletonCard - C8 (2026-09-23): shimmer-free skeleton placeholder for
// the Shop grid. Renders the same 2-column card shape the real product
// cards use (image block + two text lines) with a soft opacity pulse,
// so the grid doesn't jump when data arrives.
// =====================================================================
import React, { useEffect, useRef } from "react";
import { Animated, View } from "react-native";

export function SkeletonCard({ width }: { width?: number | `${number}%` }) {
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 750,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View
      className="rounded-2xl border border-line bg-card p-3"
      style={width ? { width } : undefined}
    >
      <Animated.View
        className="h-24 items-center justify-center rounded-xl bg-mist"
        style={{ opacity: pulse }}
      />
      <Animated.View
        className="mt-3 h-3.5 rounded bg-mist"
        style={{ opacity: pulse }}
      />
      <Animated.View
        className="mt-2 h-3 w-2/3 rounded bg-mist"
        style={{ opacity: pulse }}
      />
    </View>
  );
}

/** Full loading grid for the Shop screen's 2-column layout. */
export function ShopSkeletonGrid() {
  return (
    <View className="flex-row flex-wrap gap-3 px-4 pt-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonCard key={i} width="48%" />
      ))}
    </View>
  );
}
