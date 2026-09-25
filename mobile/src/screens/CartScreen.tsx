// =====================================================================
// CartScreen - shows the native cart with quantity controls.
//
// The displayed lines are always re-resolved from the actual cart:
//   - on initial product load
//   - every time the tab regains focus (adds from other screens, reset
//     after checkout, DB adopt on sign-in, ...)
//   - after every quantity edit
// so the badge (AppContext cartCount) and the list can never drift apart
// from each other.
// =====================================================================
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { getProductsWithSource } from "../services/productService";
import { resolveCart, setQuantity } from "../services/cartService";
import { useApp } from "../context/AppContext";
import type { Product } from "../types";
import type { TabNav } from "../navigation/types";

type Nav = TabNav<"Cart">;
type CartEntry = {
  line: { productId: string; quantity: number };
  product: Product;
};

export function CartScreen() {
  const navigation = useNavigation<Nav>();
  const { setCart } = useApp();
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<CartEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getProductsWithSource()
      .then(({ products: prods, source }) => {
        if (!active) return;
        setProducts(prods);
        // R6: an empty catalog from cache = the live fetch failed. Show the
        // offline badge instead of a bare cart (data-failure masqueraded as
        // "your cart is empty" before).
        setOffline(source === "cache" && prods.length === 0);
      })
      .catch(() => {
        if (active) setOffline(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Re-resolve the cart whenever the products catalog changes, after a
  // quantity edit, or when the tab regains focus.
  // PERF (2026-09-25): the resolve is cheap but setState isn't — skip the
  // update when the resolved lines are identical to what's already rendered
  // (same product ids + quantities in the same order). Focus-triggered
  // re-resolves (tab swipes through the pager) previously re-rendered the
  // whole list even when nothing changed.
  const linesRef = useRef<CartEntry[]>([]);
  useEffect(() => {
    let active = true;
    void resolveCart(products).then((resolved) => {
      if (!active) return;
      const prev = linesRef.current;
      const same =
        prev.length === resolved.length &&
        prev.every(
          (entry, i) =>
            entry.line.productId === resolved[i].line.productId &&
            entry.line.quantity === resolved[i].line.quantity,
        );
      if (!same) {
        linesRef.current = resolved;
        setLines(resolved);
      }
    });
    return () => {
      active = false;
    };
  }, [products, refreshKey]);

  useFocusEffect(
    useCallback(() => {
      setRefreshKey((k) => k + 1);
    }, []),
  );

  const updateQty = async (productId: string, qty: number) => {
    // Update the local cart + badge immediately (no waiting for the DB).
    // The DB sync runs in the background via the AppContext handler.
    const count = await setQuantity(productId, qty);
    setCart({ count, size: count });
    setRefreshKey((k) => k + 1);
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }

  if (lines.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-surface px-8">
        {offline ? (
          <>
            <Feather name="wifi-off" size={44} color="#cbd5e1" />
            <Text className="mt-3 font-display text-xl font-bold text-ink">
              Can't reach the catalog
            </Text>
            <Text className="mt-1 text-center text-sm text-muted">
              We can't verify your build list right now. Check your connection
              and try again.
            </Text>
          </>
        ) : (
          <>
            <Feather name="shopping-cart" size={44} color="#cbd5e1" />
            <Text className="mt-3 font-display text-xl font-bold text-ink">
              Your cart is empty
            </Text>
            <Text className="mt-1 text-center text-sm text-muted">
              Add products from the shop to start your build list.
            </Text>
          </>
        )}
      </View>
    );
  }

  const total = lines.reduce(
    (sum, { line, product }) => sum + product.price * line.quantity,
    0,
  );

  return (
    <View className="flex-1 bg-surface">
      <FlatList
        data={lines}
        keyExtractor={({ line }) => line.productId}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <View className="mb-3 flex-row rounded-2xl border border-line bg-card p-3">
            <View className="h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-mist">
              {item.product.image ? (
                <Image
                  source={{ uri: item.product.image }}
                  className="h-full w-full"
                  resizeMode="cover"
                />
              ) : (
                <Feather name="box" size={22} color="#94a3b8" />
              )}
            </View>
            <View className="ml-3 min-w-0 flex-1">
              {/* R5 overflow fix: min-w-0 so long product names ellipsize
                  instead of pushing the qty controls past the card edge. */}
              <Text
                numberOfLines={2}
                className="text-sm font-bold leading-tight text-ink"
              >
                {item.product.name}
              </Text>
              <Text className="mt-0.5 text-xs font-black text-navy">
                {item.product.priceLabel}
              </Text>
              <View className="mt-2 flex-row items-center">
                <Pressable
                  onPress={() =>
                    updateQty(item.line.productId, item.line.quantity - 1)
                  }
                  className="rounded-full border border-line px-2 py-1"
                  accessibilityLabel="Decrease quantity"
                >
                  <Feather name="minus" size={13} color="#1e3a8a" />
                </Pressable>
                <Text className="mx-3 text-sm font-bold text-ink">
                  {item.line.quantity}
                </Text>
                <Pressable
                  onPress={() =>
                    updateQty(item.line.productId, item.line.quantity + 1)
                  }
                  className="rounded-full border border-line px-2 py-1"
                  accessibilityLabel="Increase quantity"
                >
                  <Feather name="plus" size={13} color="#1e3a8a" />
                </Pressable>
              </View>
            </View>
          </View>
        )}
      />

      <View className="border-t border-line bg-card px-5 py-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-muted">Total</Text>
          <Text className="font-display text-lg font-bold tracking-tight text-ink">
            NPR {(total || 0).toLocaleString("en-IN")}
          </Text>
        </View>
        <View className="mt-2 flex-row items-center gap-2 text-xs text-muted">
          <Feather name="zap" size={12} color="#94a3b8" />
          <Text>Changes save instantly to your cart</Text>
        </View>
        <Pressable
          onPress={() => navigation.push("Checkout")}
          className="mt-3 items-center rounded-full bg-navy py-3"
        >
          <Text className="font-bold text-white">Checkout</Text>
        </Pressable>
      </View>
    </View>
  );
}
