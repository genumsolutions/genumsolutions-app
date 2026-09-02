// =====================================================================
// ShopScreen - native product catalog backed by the shared Supabase
// `products` table. Supports category chips + search.
// =====================================================================
import React, { useEffect, useMemo, useState } from 'react';
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
import {
  distinctCategories,
  filterProducts,
  getProducts,
} from '../services/productService';
import type { Product } from '../types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Main'>;

export function ShopScreen() {
  const navigation = useNavigation<Nav>();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const categories = useMemo(() => distinctCategories(products), [products]);
  const visible = useMemo(
    () => filterProducts(products, category, query),
    [products, category, query],
  );
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const pageItems = visible.slice((page - 1) * pageSize, page * pageSize);

  const load = async (asRefresh = false) => {
    if (asRefresh) setRefreshing(true);
    try {
      setProducts(await getProducts());
    } catch {
      // keep previous data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [category, query]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface">
      {/* Search */}
      <View className="px-4 pt-3">
        <View className="flex-row items-center rounded-xl border border-line bg-card px-3">
          <Feather name="search" size={16} color="#64748b" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search products…"
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
      </View>

      {/* Categories */}
      <View>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={['All', ...categories]}
          keyExtractor={(c) => c}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}
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
            <Text className="mt-3 text-sm text-muted">No products found.</Text>
          </View>
        }
        ListFooterComponent={
          totalPages > 1 ? (
            <View className="mt-1 flex-row items-center justify-between px-4">
              <Pressable
                onPress={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                accessibilityLabel="Previous products page"
                className="h-10 w-10 items-center justify-center rounded-full border border-line bg-card disabled:opacity-40"
              >
                <Feather name="chevron-left" size={18} color="#1e3a8a" />
              </Pressable>
              <Text className="text-xs font-bold text-muted">Page {page} of {totalPages}</Text>
              <Pressable
                onPress={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page === totalPages}
                accessibilityLabel="Next products page"
                className="h-10 w-10 items-center justify-center rounded-full border border-line bg-card disabled:opacity-40"
              >
                <Feather name="chevron-right" size={18} color="#1e3a8a" />
              </Pressable>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              navigation.navigate('ProductDetail', { productId: item.id })
            }
            className="mb-4 w-[48%] flex-1 rounded-2xl border border-line bg-card p-3"
          >
            <View className="h-24 items-center justify-center overflow-hidden rounded-xl bg-mist">
              {item.image ? (
                <Image
                  source={{ uri: item.image }}
                  className="h-full w-full"
                  resizeMode="cover"
                />
              ) : (
                <Feather name="box" size={28} color="#94a3b8" />
              )}
            </View>
            <Text className="mt-2 text-[13px] font-bold leading-tight text-ink">
              {item.name}
            </Text>
            {item.badge ? (
              <Text className="mt-1 text-[10px] font-black uppercase tracking-wide text-gold">
                {item.badge}
              </Text>
            ) : null}
            <Text className="mt-1 text-xs font-black text-navy">
              {item.priceLabel}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}
