// =====================================================================
// ContactScreen - company contact details (native UI).
// =====================================================================
import React from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { company } from '../config/company';

export function ContactScreen() {
  return (
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">Contact</Text>
      <Text className="mt-1 font-sans text-2xl font-bold text-ink">Get in touch</Text>

      <View className="mt-4 space-y-3">
        <Row
          icon="map-pin"
          label="Address"
          value={company.address}
          onPress={() => void Linking.openURL('geo:0,0?q=' + encodeURIComponent(company.address))}
        />
        <Row
          icon="mail"
          label="Email"
          value={company.email}
          onPress={() => void Linking.openURL(`mailto:${company.email}`)}
        />
        <Row
          icon="phone"
          label="Phone"
          value={company.phone}
          onPress={() => void Linking.openURL(`tel:${company.phone.replace(/\s/g, '')}`)}
        />
      </View>
    </ScrollView>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
}: {
  icon: 'map-pin' | 'mail' | 'phone';
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-start rounded-2xl border border-line bg-white p-4"
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-navy-light">
        <Feather name={icon} size={18} color="#1e3a8a" />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-xs font-bold uppercase tracking-wide text-border">{label}</Text>
        <Text className="mt-0.5 text-sm font-semibold text-ink">{value}</Text>
      </View>
      <Feather name="external-link" size={16} color="#94a3b8" />
    </Pressable>
  );
}
