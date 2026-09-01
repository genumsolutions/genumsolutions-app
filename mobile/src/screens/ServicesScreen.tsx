// =====================================================================
// ServicesScreen - reads the shared `services` Supabase table.
// =====================================================================
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Text,
  View,
} from 'react-native';
import { getServices } from '../services/serviceService';
import type { Service } from '../types';

export function ServicesScreen() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getServices()
      .then(setServices)
      .catch(() => setServices([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1 bg-surface"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      data={services}
      keyExtractor={(s) => s.id}
      ListHeaderComponent={
        <View className="mb-3">
          <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">Services</Text>
          <Text className="mt-1 font-sans text-2xl font-bold text-ink">
            What GENUM does
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <View className="mb-3 rounded-2xl border border-line bg-white p-5">
          <View className="flex-row items-center justify-between">
            <Text className="flex-1 font-sans text-lg font-bold text-ink">{item.name}</Text>
            {item.tag ? (
              <View className="ml-2 rounded-full bg-sky px-2.5 py-0.5">
                <Text className="text-[10px] font-black uppercase text-navy">{item.tag}</Text>
              </View>
            ) : null}
          </View>
          <Text className="mt-2 text-sm leading-6 text-slate-600">{item.description}</Text>
          <Text className="mt-3 text-sm font-black text-navy">{item.priceLabel}</Text>
        </View>
      )}
    />
  );
}
