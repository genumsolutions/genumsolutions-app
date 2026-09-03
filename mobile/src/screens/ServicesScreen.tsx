// =====================================================================
// ServicesScreen - reads the shared `services` Supabase table.
// Customer-facing filter organization (Phase F): search + category chips,
// result count, and pagination — all derived from the DB rows only.
// =====================================================================
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Text,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getServices } from '../services/serviceService';
import type { Service } from '../types';

export function ServicesScreen() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [page, setPage] = useState(1);
  const pageSize = 6;

  useEffect(() => {
    getServices()
      .then(setServices)
      .catch(() => setServices([]))
      .finally(() => setLoading(false));
  }, []);

  // Reset pagination whenever the filters change.
  useEffect(() => {
    setPage(1);
  }, [category, query]);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(services.map((s) => s.category).filter(Boolean)))],
    [services],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return services.filter((s) => {
      const matchesCategory = category === 'All' || s.category === category;
      const matchesQuery = !needle ||
        `${s.name} ${s.tag} ${s.id} ${s.description}`.toLowerCase().includes(needle);
      return matchesCategory && matchesQuery && s.active !== false;
    });
  }, [services, category, query]);

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const pageItems = visible.slice((page - 1) * pageSize, page * pageSize);

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
      data={pageItems}
      keyExtractor={(s) => s.id}
      ListHeaderComponent={
        <View className="mb-3">
          <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">Services</Text>
          <Text className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">
            What GENUM does
          </Text>

          {/* Search */}
          <View className="mt-4 flex-row items-center rounded-xl border border-line bg-card px-3">
            <Feather name="search" size={16} color="#64748b" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search services…"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              className="flex-1 px-2 py-2.5 text-sm text-ink"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} accessibilityLabel="Clear search">
                <Feather name="x" size={16} color="#64748b" />
              </Pressable>
            )}
          </View>

          {/* Categories (derived from the DB rows) */}
          {categories.length > 1 && (
            <View className="mt-2">
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={categories}
                keyExtractor={(c) => c}
                contentContainerStyle={{ gap: 8 }}
                renderItem={({ item }) => {
                  const active = item === category;
                  return (
                    <Pressable
                      onPress={() => setCategory(item)}
                      className={`rounded-full px-4 py-1.5 ${active ? 'bg-navy' : 'border border-line bg-card'}`}
                    >
                      <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-navy'}`}>
                        {item}
                      </Text>
                    </Pressable>
                  );
                }}
              />
            </View>
          )}

          {visible.length > 0 && (
            <Text className="mt-3 text-xs font-bold uppercase tracking-wide text-muted">
              {visible.length} service{visible.length === 1 ? '' : 's'}
            </Text>
          )}
        </View>
      }
      ListEmptyComponent={
        <View className="items-center py-16">
          <Feather name="inbox" size={40} color="#cbd5e1" />
          <Text className="mt-3 text-sm text-muted">No services match your filters.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View className="mb-3 rounded-2xl border border-line bg-card p-5">
          <View className="flex-row items-center justify-between">
            <Text className="flex-1 font-display text-lg font-bold leading-snug text-ink">{item.name}</Text>
            {item.tag ? (
              <View className="ml-2 rounded-full bg-sky px-2.5 py-0.5">
                <Text className="text-xs font-black uppercase text-navy">{item.tag}</Text>
              </View>
            ) : null}
          </View>
          <Text className="mt-2 text-sm leading-6 text-muted">{item.description}</Text>
          <Text className="mt-3 text-sm font-black text-navy">{item.priceLabel}</Text>
        </View>
      )}
      ListFooterComponent={totalPages > 1 ? (
        <View className="mt-1 flex-row items-center justify-between">
          <Pressable onPress={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1} accessibilityLabel="Previous services page" className="h-10 w-10 items-center justify-center rounded-full border border-line bg-card disabled:opacity-40"><Feather name="chevron-left" size={18} color="#1e3a8a" /></Pressable>
          <Text className="text-xs font-bold text-muted">Page {page} of {totalPages}</Text>
          <Pressable onPress={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page === totalPages} accessibilityLabel="Next services page" className="h-10 w-10 items-center justify-center rounded-full border border-line bg-card disabled:opacity-40"><Feather name="chevron-right" size={18} color="#1e3a8a" /></Pressable>
        </View>
      ) : null}
    />
  );
}
