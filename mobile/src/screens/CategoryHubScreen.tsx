// =====================================================================
// CategoryHubScreen - native "hub" for one of the 5 project categories
// (robocar, home-automation, smart-farm, smart-city, drones). Mirrors the
// website's CategoryPage (What you can build / Typical hardware / link to
// the Tools control surface).
// =====================================================================
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getProjectCategory, type ControlCapability } from '../config/project-catalog';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Category'>;
type Route = RouteProp<RootStackParamList, 'Category'>;

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

export function CategoryHubScreen() {
  const navigation = useNavigation<Nav>();
  const { slug } = useRoute<Route>().params;
  const category = getProjectCategory(slug);

  if (!category) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <Text className="text-sm text-muted">Category not found.</Text>
      </View>
    );
  }

  const points = [category.tagline, ...category.capabilities.map((cap) => CAPABILITY_NOTES[cap])].filter(
    Boolean,
  );

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
      <Text className="text-[10px] font-black uppercase tracking-widest text-navy">
        {category.name}
      </Text>
      <Text className="mt-2 font-display text-3xl font-bold leading-tight text-ink">
        {category.name}
      </Text>
      <Text className="mt-4 text-base leading-7 text-muted">{category.description}</Text>

      <View className="mt-8 rounded-2xl border border-line bg-card p-6">
        <Text className="font-display text-lg font-bold text-ink">What you can build</Text>
        <View className="mt-4">
          {points.map((point) => (
            <View key={point} className="mb-3 flex-row items-start gap-2">
              <View className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <Text className="flex-1 text-sm leading-6 text-muted">{point}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="mt-6 rounded-2xl border border-line bg-card p-6">
        <Text className="font-display text-lg font-bold text-ink">Typical hardware</Text>
        <View className="mt-4 flex-row flex-wrap gap-2">
          {category.hardware.map((item) => (
            <Text
              key={item}
              className="rounded-full bg-mist px-3 py-1.5 text-xs font-bold text-navy"
            >
              {item}
            </Text>
          ))}
        </View>
        <View className="mt-6 rounded-xl bg-sky px-4 py-3">
          <Pressable onPress={() => navigation.navigate('Tools')} className="flex-row items-center gap-1">
            <Text className="text-sm font-bold text-navy">Test & control this category</Text>
            <Feather name="arrow-right" size={14} color="#1e3a8a" />
          </Pressable>
          <Text className="mt-1 text-xs leading-5 text-muted">
            Live controls for this category live on the Tools page and use the same Bluetooth / WiFi
            transport as the robot cars.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}