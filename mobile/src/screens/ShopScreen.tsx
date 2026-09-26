// =====================================================================
// ShopScreen - native product catalog backed by the shared Supabase
// `products` table. Supports category chips + search.
// =====================================================================
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
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
import { PagePager } from "../components/PagePager";
import { ShopSkeletonGrid } from "../components/SkeletonCard";
import { ProductCard } from "../components/ProductCard";
import {
  applyComponentsScope,
  loadRecentlyViewed,
  resolveRecentlyViewed,
} from "../services/productService";
import { useFocusEffect } from "@react-navigation/native";
import type { Product } from "../types";

export function ShopScreen() {
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
  const [recent, setRecent] = useState<Product[]>([]);
  const pageSize = 8;

  // U-47: scope to Electronic Products — 3D Models / kits / project
  // packages are excluded here (they duplicate the 3D Products screen).
  const electronic = useMemo(() => applyComponentsScope(products), [products]);
  const categories = useMemo(
    () => distinctCategories(electronic),
    [electronic],
  );
  const visible = useMemo(
    () =>
      inStockOnly(
        withinPrice(
          sortProducts(filterProducts(electronic, category, query), sort),
          maxPrice,
        ),
        inStock,
      ),
    [electronic, category, query, sort, maxPrice, inStock],
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

  // C3 (2026-09-23): "Recently viewed" strip above the grid. Re-read on every
  // focus — navigation.push to ProductDetail keeps this screen mounted, so a
  // mount-only effect would go stale after returning from a detail page.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadRecentlyViewed().then((ids) => {
        if (active) setRecent(resolveRecentlyViewed(products, ids));
      });
      return () => {
        active = false;
      };
    }, [products]),
  );

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
        ListHeaderComponent={
          recent.length > 0 ? (
            <View className="pb-2">
              <Text className="px-4 text-xs font-black uppercase tracking-[0.24em] text-navy">
                Recently viewed
              </Text>
              <FlatList
                horizontal
                data={recent.slice(0, 8)}
                keyExtractor={(p) => p.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
                renderItem={({ item }) => (
                  <ProductCard product={item} compact />
                )}
              />
            </View>
          ) : null
        }
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
          // U-43: numbered page buttons for fast navigation.
          <PagePager
            page={page}
            totalPages={totalPages}
            onPage={setPage}
            label="item"
            totalItems={visible.length}
          />
        }
        renderItem={({ item }) => <ProductCard product={item} chips />}
      />
    </View>
  );
}
