// =====================================================================
// ShopScreen - native product catalog backed by the shared Supabase
// `products` table. Supports category chips + search.
// =====================================================================
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import {
  distinctCategories,
  filterProducts,
  getProductsWithSource,
  inStockOnly,
  PRICE_CEILINGS,
  priceCeilingLabel,
  SORT_LABELS,
  sortProducts,
  withinPrice,
  type SortOption,
} from "../services/productService";
import { OfflineBadge } from "../components/OfflineBadge";
import { CategoryDropdown } from "../components/CategoryDropdown";
import { ShopSkeletonGrid } from "../components/SkeletonCard";
import type { Product } from "../types";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList, "Main">;

export function ShopScreen() {
  const navigation = useNavigation<Nav>();
  const [products, setProducts] = useState<Product[]>([]);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOption>("featured");
  const [maxPrice, setMaxPrice] = useState(0);
  const [inStock, setInStock] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const categories = useMemo(() => distinctCategories(products), [products]);
  const visible = useMemo(
    () =>
      inStockOnly(
        withinPrice(
          sortProducts(filterProducts(products, category, query), sort),
          maxPrice,
        ),
        inStock,
      ),
    [products, category, query, sort, maxPrice, inStock],
  );
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const pageItems = visible.slice((page - 1) * pageSize, page * pageSize);

  const load = async (asRefresh = false) => {
    if (asRefresh) setRefreshing(true);
    try {
      const { products, source } = await getProductsWithSource();
      setProducts(products);
      setOffline(source === "cache");
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
  }, [category, query, sort, maxPrice, inStock]);

  if (loading) {
    // C8 (2026-09-23): skeleton grid instead of a bare spinner — the card
    // shapes match the real grid so nothing jumps when data arrives.
    return (
      <View className="flex-1 bg-surface pt-3">
        <View className="px-4 pb-3">
          <View className="h-11 rounded-xl border border-line bg-card" />
        </View>
        <ShopSkeletonGrid />
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
            <Pressable
              onPress={() => setQuery("")}
              accessibilityLabel="Clear search"
            >
              <Feather name="x" size={16} color="#64748b" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Offline indicator (data came from local cache) */}
      {offline && (
        <View className="px-4 pb-1">
          <OfflineBadge />
        </View>
      )}

      {/* Category / sort / price filters (C2 2026-09-23) */}
      <View className="gap-2 px-4 pb-2">
        <CategoryDropdown
          value={category}
          options={["All", ...categories]}
          onChange={setCategory}
          placeholder="All categories"
          title="Filter by category"
        />
        <View className="flex-row gap-2">
          <CategoryDropdown
            value={SORT_LABELS[sort]}
            options={Object.values(SORT_LABELS)}
            onChange={(label) => {
              const entry = (
                Object.entries(SORT_LABELS) as [SortOption, string][]
              ).find(([, l]) => l === label);
              if (entry) setSort(entry[0]);
            }}
            placeholder="Sort: Featured"
            title="Sort products"
            buttonClassName="flex-1"
          />
          <CategoryDropdown
            value={priceCeilingLabel(maxPrice)}
            options={PRICE_CEILINGS.map(priceCeilingLabel)}
            onChange={(label) => {
              const entry = PRICE_CEILINGS.find(
                (c) => priceCeilingLabel(c) === label,
              );
              if (entry != null) setMaxPrice(entry);
            }}
            placeholder="Any price"
            title="Maximum price"
            buttonClassName="flex-1"
          />
        </View>
        <Pressable
          onPress={() => setInStock((current) => !current)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: inStock }}
          className="flex-row items-center self-start rounded-lg border border-line bg-card px-3 py-2"
        >
          <Feather
            name={inStock ? "check-square" : "square"}
            size={16}
            color={inStock ? "#1e3a8a" : "#94a3b8"}
          />
          <Text className="ml-2 text-sm text-ink">In stock only</Text>
        </Pressable>
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
            {(maxPrice > 0 || inStock || sort !== "featured") && (
              <Pressable
                onPress={() => {
                  setMaxPrice(0);
                  setInStock(false);
                  setSort("featured");
                }}
                className="mt-4 rounded-full border border-navy px-5 py-2"
                accessibilityLabel="Clear price and stock filters"
              >
                <Text className="text-xs font-black text-navy">
                  Clear filters
                </Text>
              </Pressable>
            )}
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
              <Text className="text-xs font-bold text-muted">
                Page {page} of {totalPages}
                {visible.length > 0
                  ? ` · ${visible.length} item${visible.length === 1 ? "" : "s"}`
                  : ""}
              </Text>
              <Pressable
                onPress={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
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
              navigation.push("ProductDetail", { productId: item.id })
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
            {/* R5 overflow fix: numberOfLines so long product names
                ellipsize inside the 2-col card instead of clipping. */}
            <Text
              numberOfLines={2}
              className="mt-2 text-[13px] font-bold leading-tight text-ink"
            >
              {item.name}
            </Text>
            {item.badge ? (
              <Text className="mt-1 text-xs font-black uppercase tracking-wide text-gold">
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
