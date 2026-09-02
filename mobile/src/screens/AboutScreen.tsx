// =====================================================================
// AboutScreen - company overview (native UI).
// =====================================================================
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

const points = [
  {
    icon: 'cpu' as const,
    title: 'Robotics kits & components',
    body: 'Controllers, motors, sensors, and full robot-car platforms sourced and tested in Kathmandu.',
  },
  {
    icon: 'printer' as const,
    title: '3D & 2D printing',
    body: 'Prototypes, spare parts, and signage printed to spec with materials advice included.',
  },
  {
    icon: 'book-open' as const,
    title: 'School STEM packages',
    body: 'Kits, curriculum, teacher training, and coaching bundled into a single pilot program.',
  },
  {
    icon: 'tool' as const,
    title: 'Custom projects & labs',
    body: 'IoT, AI prototypes, workshop setups, and lab consultation delivered end to end.',
  },
];

export function AboutScreen() {
  return (
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">About</Text>
      <Text className="mt-1 font-sans text-2xl font-bold leading-tight text-ink">
        Technology you can touch, test, and trust.
      </Text>
      <Text className="mt-3 text-sm leading-6 text-muted">
        Robotics kits, project solutions, fabrication, open tools, and training for
        curious builders, schools, and teams — designed in Kathmandu, delivered
        across Nepal.
      </Text>

      <View className="mt-5 space-y-3">
        {points.map((p) => (
          <View key={p.title} className="flex-row items-start rounded-2xl border border-line bg-card p-4">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-navy-light">
              <Feather name={p.icon} size={18} color="#1e3a8a" />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-base font-bold text-ink">{p.title}</Text>
              <Text className="mt-1 text-sm leading-5 text-muted">{p.body}</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
