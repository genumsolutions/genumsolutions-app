// =====================================================================
// ProjectsScreen — U-47 (2026-09-27, owner): ONE unified projects grid.
// The Packages/Robot-Cars tabs are gone; every project package displays
// as a minimal card and the category selector filters by the SIX
// owner-named categories (Robo Car, Smart Home, Smart Farm, Smart City,
// Smart Dustbin, Aerial Drones) read from project_categories. Empty
// categories show as "coming soon". Grid = 2 per row, minimal cards
// (photo, name, price — whole card opens the detail page).
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
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { getProducts } from "../services/productService";
import { getProjectCategories } from "../services/projectCategoryService";
import { CategoryDropdown } from "../components/CategoryDropdown";
import { PagePager } from "../components/PagePager";
import { ProductCard } from "../components/ProductCard";
import { type Product } from "../types";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList, "Projects">;

type CategoryEntry = { id: string; name: string };

export function ProjectsScreen() {
  const navigation = useNavigation<Nav>();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [page, setPage] = useState(1);

  const pageSize = 8;

  const load = useCallback(async (asRefresh = false) => {
    if (asRefresh) setRefreshing(true);
    try {
      const [prods, cats] = await Promise.all([
        getProducts(),
        getProjectCategories(),
      ]);
      setProducts(prods);
      setCategories(cats.map((c) => ({ id: c.name, name: c.name })));
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
  }, [category, query]);

  // ONE list: every active Project package (kit rows ride along per U-44).
  const allProjects = useMemo(
    () =>
      products.filter(
        (p) =>
          p.active !== false &&
          (p.productType === "Project package" ||
            p.category === "Pre-packaged Kits"),
      ),
    [products],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allProjects.filter((p) => {
      if (category !== "All" && p.projectCategory !== category) return false;
      if (!needle) return true;
      return `${p.name} ${p.note} ${p.description}`
        .toLowerCase()
        .includes(needle);
    });
  }, [allProjects, category, query]);

  // The six canonical categories from the DB (matched by NAME — the
  // products.project_category column stores names). Categories with no
  // products yet are flagged coming-soon (owner decision, mirrors web).
  const categoryOptions = useMemo(() => {
    const present = new Set(
      allProjects.map((p) => p.projectCategory).filter(Boolean),
    );
    return categories.map((c) => ({
      ...c,
      comingSoon: !present.has(c.name),
    }));
  }, [categories, allProjects]);

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
    <View className="flex-1 bg-surface">
      {/* Search */}
      <View className="px-4 pt-4">
        <View className="flex-row items-center rounded-xl border border-line bg-card px-3">
          <Feather name="search" size={16} color="#64748b" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search projects"
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

      {/* Project-category filter (the six owner categories) */}
      {categoryOptions.length > 0 && (
        <View className="px-4 pb-2 pt-3">
          <CategoryDropdown
            value={
              category === "All"
                ? `All categories (${visible.length})`
                : category
            }
            options={[
              `All categories (${visible.length})`,
              ...categoryOptions.map(
                (c) => `${c.name}${c.comingSoon ? " — coming soon" : ""}`,
              ),
            ]}
            onChange={(label) => {
              if (label.startsWith("All categories")) {
                setCategory("All");
                return;
              }
              const name = label.replace(" — coming soon", "");
              setCategory(name);
            }}
            placeholder="All categories"
            title="Filter by project category"
          />
        </View>
      )}

      {/* Results — one grid, 2 per row, minimal cards */}
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
            <Text className="mt-3 text-sm text-muted">
              No projects found matching your filters.
            </Text>
          </View>
        }
        ListFooterComponent={
          <PagePager
            page={page}
            totalPages={totalPages}
            onPage={setPage}
            label="listing"
            totalItems={visible.length}
          />
        }
        renderItem={({ item }) => (
          <View className="mb-3 w-[48%] flex-1">
            <ProductCard product={item} />
          </View>
        )}
      />
    </View>
  );
}
