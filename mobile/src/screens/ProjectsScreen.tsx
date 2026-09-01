// =====================================================================
// ProjectsScreen - native list of project packages & robot-car builds from
// the shared Supabase `products` table (same data as the website /projects).
// =====================================================================
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getProjects, type Project } from '../services/projectService';

export function ProjectsScreen() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
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
      data={projects}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={
        <View className="mb-3">
          <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">Projects</Text>
          <Text className="mt-1 font-sans text-2xl font-bold text-ink">
            Packages & robot cars
          </Text>
        </View>
      }
      ListEmptyComponent={
        <View className="items-center py-16">
          <Feather name="inbox" size={40} color="#cbd5e1" />
          <Text className="mt-3 text-sm text-muted">No projects found.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View className="mb-3 flex-row overflow-hidden rounded-2xl border border-line bg-white">
          <View className="h-24 w-24 items-center justify-center bg-mist">
            {item.image ? (
              <Image source={{ uri: item.image }} className="h-full w-full" resizeMode="cover" />
            ) : (
              <Feather name="box" size={26} color="#94a3b8" />
            )}
          </View>
          <View className="flex-1 p-3">
            <Text className="text-[10px] font-black uppercase tracking-wide text-gold">
              {item.category}
            </Text>
            <Text className="mt-0.5 text-sm font-bold leading-tight text-ink">{item.name}</Text>
            <Text className="mt-1 text-xs font-black text-navy">{item.priceLabel}</Text>
            {item.specs?.length ? (
              <Text className="mt-1 text-[11px] text-muted">{item.specs.slice(0, 2).join(' · ')}</Text>
            ) : null}
          </View>
        </View>
      )}
    />
  );
}
