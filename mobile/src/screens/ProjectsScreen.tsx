// =====================================================================
// ProjectsScreen - native two-tab catalog (Project Packages / Robot Car
// Projects) backed by the shared Supabase `products` table, matching the
// website's ProjectsCatalog. Supports search, category chips, pagination,
// and "Add to build list" with quote-only routing to product details.
// =====================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { addToCart } from '../services/cartService';
import { filterProducts, getProducts } from '../services/productService';
import { useApp } from '../context/AppContext';
import type { Product } from '../types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Projects'>;
type ProjectTab = 'packages' | 'robot-cars';

const TABS: { key: ProjectTab; label: string }[] = [
  { key: 'packages', label: 'Project Packages' },
  { key: 'robot-cars', label: 'Robot Car Projects' },
];

const SECTION_COPY: Record<ProjectTab, string> = {
  packages: 'Named teaching and automation projects organized by scope.',
  'robot-cars': 'Assembled robot-car projects separated from components and materials.',
};

export function ProjectsScreen() {
  const navigation = useNavigation<Nav>();
  const { setCart } = useApp();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<ProjectTab>('packages');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [page, setPage] = useState(1);
  const [addedId, setAddedId] = useState<string | null>(null);

  const pageSize = 8;

  const load = useCallback(async (asRefresh = false) => {
    if (asRefresh) setRefreshing(true);
    try {
      setProducts(await getProducts());
    } catch {
      // keep previous data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [tab, category, query]);

  useEffect(() => {
    if (!addedId) return;
    const timer = setTimeout(() => setAddedId(null), 1600);
    return () => clearTimeout(timer);
  }, [addedId]);

  const tabProducts = useMemo(() => {
    return products.filter(
      (p) =>
        p.active !== false &&
        (tab === 'packages'
          ? p.productType === 'Project package'
          : p.category === 'Robot Cars'),
    );
  }, [products, tab]);

  const categories = useMemo(() => {
    const present: string[] = [];
    for (const p of tabProducts) {
      if (!present.includes(p.category)) present.push(p.category);
    }
    return present;
  }, [tabProducts]);

  const visible = useMemo(
    () => filterProducts(tabProducts, category, query),
    [tabProducts, category, query],
  );
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const pageItems = visible.slice((page - 1) * pageSize, page * pageSize);

  function changeTab(next: ProjectTab) {
    setTab(next);
    setQuery('');
    setCategory('All');
    setPage(1);
  }

  async function handleAdd(product: Product) {
    try {
      const count = await addToCart(product.id, 1);
      setCart({ count, size: count });
      setAddedId(product.id);
    } catch {
      // ignore
    }
  }

  function handleCardPress(product: Product) {
    const quoteOnly = product.stock === 0 || product.productType === 'Project package';
    if (quoteOnly) {
      navigation.push('ProductDetail', { productId: product.id });
    }
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface">
      {/* Tabs */}
      <View className="flex-row px-4 pt-4">
        <View className="flex-row items-center gap-2">
          {TABS.map((item, index) => {
            const active = tab === item.key;
            const count = item.key === 'packages'
              ? products.filter((p) => p.productType === 'Project package' && p.active !== false).length
              : products.filter((p) => p.category === 'Robot Cars' && p.active !== false).length;
            return (
              <Pressable
                key={item.key}
                onPress={() => changeTab(item.key)}
                className={`flex-row items-center rounded-full border px-4 py-2 ${index > 0 ? 'ml-2' : ''} ${active ? 'border-navy bg-navy' : 'border-line bg-card'}`}
              >
                <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-navy'}`}>
                  {item.label}
                </Text>
                <Text
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-black ${active ? 'bg-navy-light text-navy' : 'bg-mist text-muted'}`}
                >
                  {count}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Search */}
      <View className="px-4 pt-3">
        <View className="flex-row items-center rounded-xl border border-line bg-card px-3">
          <Feather name="search" size={16} color="#64748b" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search this section"
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
        <Text className="mt-2 text-sm leading-6 text-muted">{SECTION_COPY[tab]}</Text>
      </View>

      {/* Categories */}
      {categories.length > 1 && (
        <View>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={['All', ...categories]}
            keyExtractor={(c) => c}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}
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

      {/* Results */}
      <FlatList
        data={pageItems}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshing={refreshing}
        onRefresh={() => load(true)}
        ListEmptyComponent={
          <View className="items-center py-16">
            <Feather name="inbox" size={40} color="#cbd5e1" />
            <Text className="mt-3 text-sm text-muted">No projects found matching your filters.</Text>
          </View>
        }
        ListFooterComponent={
          totalPages > 1 ? (
            <View className="mt-1 flex-row items-center justify-between px-4">
              <Pressable
                onPress={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                accessibilityLabel="Previous projects page"
                className="h-10 w-10 items-center justify-center rounded-full border border-line bg-card disabled:opacity-40"
              >
                <Feather name="chevron-left" size={18} color="#1e3a8a" />
              </Pressable>
              <Text className="text-xs font-bold text-muted">
                Page {page} of {totalPages} · {visible.length} listing{visible.length === 1 ? '' : 's'}
              </Text>
              <Pressable
                onPress={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page === totalPages}
                accessibilityLabel="Next projects page"
                className="h-10 w-10 items-center justify-center rounded-full border border-line bg-card disabled:opacity-40"
              >
                <Feather name="chevron-right" size={18} color="#1e3a8a" />
              </Pressable>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const quoteOnly = item.stock === 0 || item.productType === 'Project package';
          const added = addedId === item.id;
          return (
            <Pressable
              onPress={() => handleCardPress(item)}
              className="mb-4 w-[48%] flex-1 overflow-hidden rounded-2xl border border-line bg-card"
            >
              <View className="h-24 items-center justify-center overflow-hidden bg-ink">
                {item.image ? (
                  <Image source={{ uri: item.image }} className="h-full w-full" resizeMode="cover" />
                ) : (
                  <Feather name="box" size={28} color="#94a3b8" />
                )}
                {item.image ? (
                  <View className="absolute inset-0 bg-ink/40">
                    <Text className="absolute bottom-2 left-3 text-xs font-black uppercase tracking-widest text-white">
                      {item.category}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View className="p-3">
                <Text className="text-xs font-black uppercase tracking-widest text-navy">
                  {tab === 'robot-cars' ? 'Robot Car' : item.productType}
                </Text>
                <Text className="mt-1 text-[13px] font-bold leading-tight text-ink">
                  {item.name}
                </Text>
                <Text className="mt-1 text-xs leading-4 text-muted">
                  {item.note || item.description?.split('. ')[0]}
                </Text>
                <View className="mt-2 flex-row items-center justify-between gap-2">
                  <Text className="shrink text-xs font-black text-navy">{item.priceLabel}</Text>
                  {quoteOnly ? (
                      <View className="flex-row gap-1.5">
                        <Pressable
                          onPress={() => navigation.push('ProductDetail', { productId: item.id })}
                          accessibilityLabel={`View details for ${item.name}`}
                          className="rounded-full border border-line px-2.5 py-1.5"
                        >
                          <Text className="text-xs font-black text-navy">Details</Text>
                        </Pressable>
                        {item.productType === 'Project package' && (
                          <Pressable
                            onPress={() => navigation.push('Tools', { category: item.category })}
                            accessibilityLabel={`Control ${item.name}`}
                            className="rounded-full bg-gold px-2.5 py-1.5"
                          >
                            <Text className="text-xs font-black text-ink">Control</Text>
                          </Pressable>
                        )}
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => handleAdd(item)}
                        accessibilityLabel={`Add ${item.name} to cart`}
                        className={`rounded-full px-3 py-1.5 ${added ? 'bg-emerald-500' : 'bg-navy'}`}
                      >
                        <Text className="text-xs font-black text-white">
                          {added ? '✓ Added' : 'Add'}
                        </Text>
                      </Pressable>
                    )}
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}