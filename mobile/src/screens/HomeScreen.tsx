// =====================================================================
// HomeScreen - branded landing screen with navigation placeholders.
//
// TODO: replace `onNavigate` prop with your real navigation solution
// (e.g. React Navigation / expo-router) once routing is wired up.
// =====================================================================
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { BrandHeader } from '../components/BrandHeader';
import { brand } from '../../shared/theme';

type Props = {
  onNavigate: (screen: string) => void;
};

const NAV_ITEMS = [
  { key: 'auth', label: 'Sign In / Sign Up' },
  { key: 'offlineAudit', label: 'Offline Audits' },
  { key: 'productEdit', label: 'Edit Products' },
  { key: 'robotCar', label: 'Robot Car (BLE)' },
];

export function HomeScreen({ onNavigate }: Props) {
  return (
    <ScrollView className="flex-1 bg-mist">
      <BrandHeader title={brand.name} subtitle={brand.tagline} />
      <View className="p-5">
        <Text className="text-lg font-bold text-ink">Menu</Text>
        {NAV_ITEMS.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => onNavigate(item.key)}
            className="mt-3 rounded-lg border border-line bg-surface px-4 py-4"
          >
            <Text className="text-base font-semibold text-navy">{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
