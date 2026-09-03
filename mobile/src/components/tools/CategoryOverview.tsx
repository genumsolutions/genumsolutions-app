// =====================================================================
// CategoryOverview - inline panel on the Tools & IoT screen that shows the
// currently selected project category (tagline, what you can build,
// typical hardware) BELOW the remote-control window — so choosing a
// category never navigates away from the Tools screen.
// =====================================================================
import React from 'react';
import { Text, View } from 'react-native';
import type { ControlCapability, ProjectCategory } from '../../config/project-catalog';

const CAPABILITY_NOTES: Record<ControlCapability, string> = {
  directional: 'Drive forward, back, left, and right with adjustable speed',
  servo: 'Steer with a servo and tune the endpoint angles',
  pid: 'Tune the PID and read the live angle/heading',
  'start-stop': 'Run and stop autonomous behaviour with a toggle',
  relay: 'Flip relay / switch outputs (AC and DC loads)',
  sensor: 'Read live sensor values from the device',
  weblink: 'Link a client/server ESP connection over WiFi',
  slider: 'Adjust an arbitrary 0..n value (speed, threshold, brightness)',
  gimbal: 'Control camera gimbal orientation',
  altitude: 'Control and monitor flight altitude',
};

export function CategoryOverview({ category }: { category: ProjectCategory | undefined }) {
  if (!category) return null;

  const points = [
    category.tagline,
    ...category.capabilities.map((cap) => CAPABILITY_NOTES[cap]),
  ].filter(Boolean);

  return (
    <View className="overflow-hidden rounded-2xl border border-line bg-card">
      {/* Header band — mirrors the app's navy branding */}
      <View className="bg-navy px-4 py-3.5">
        <Text className="text-[10px] font-black uppercase tracking-[0.24em] text-gold">
          Project category
        </Text>
        <Text className="mt-1 font-display text-xl font-bold leading-tight text-white">
          {category.name}
        </Text>
        <Text className="mt-1 text-xs font-semibold leading-5 text-white/70">
          {category.tagline}
        </Text>
      </View>

      <View className="px-4 py-4">
        <Text className="text-sm leading-6 text-muted">{category.description}</Text>

        <Text className="mt-4 text-xs font-black uppercase tracking-widest text-navy">
          What you can build
        </Text>
        <View className="mt-2">
          {points.map((point) => (
            <View key={point} className="mb-2 flex-row items-start gap-2">
              <View className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <Text className="flex-1 text-sm leading-5 text-muted">{point}</Text>
            </View>
          ))}
        </View>

        <Text className="mt-4 text-xs font-black uppercase tracking-widest text-navy">
          Typical hardware
        </Text>
        <View className="mt-2 flex-row flex-wrap gap-2">
          {category.hardware.map((item) => (
            <Text
              key={item}
              className="rounded-full bg-mist px-3 py-1.5 text-xs font-bold text-navy"
            >
              {item}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}
