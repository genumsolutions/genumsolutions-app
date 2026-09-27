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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { getProductsWithSource } from "../services/productService";
import { resolveCart, setQuantity } from "../services/cartService";
import { useApp } from "../context/AppContext";
import { trackHabit } from "../services/collectionService";
import type { Product } from "../types";
import type { RootStackParamList } from "../navigation/types";

// U-44 (2026-09-26): Cart is a RootStack screen now (pushed from the header
// bag icon), not a Main tab — so its nav prop is the stack navigator.
type Nav = NativeStackNavigationProp<RootStackParamList, "Cart">;

function formatNPR(amount: number): string {
  return `NPR ${(amount || 0).toLocaleString("en-IN")}`;
}
type CartEntry = {
  line: { productId: string; quantity: number };
  product: Product;
};

export function CartScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
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

  // One in-flight qty write at a time: a fast double-tap on "+" used to run two
  // read-modify-write cycles concurrently and land on a wrong quantity.
  const qtyBusyRef = useRef<string | null>(null);
  const updateQty = async (productId: string, qty: number) => {
    if (qtyBusyRef.current === productId) return;
    qtyBusyRef.current = productId;
    try {
      // Update the local cart + badge immediately (no waiting for the DB).
      // The DB sync runs in the background via the AppContext handler.
      const count = await setQuantity(productId, qty);
      // U-47v4: 'Remove' is qty 0 — count it as a cart-change habit event.
      if (qty === 0) void trackHabit("cart");
      setCart({ count, size: count });
      setRefreshKey((k) => k + 1);
    } finally {
      qtyBusyRef.current = null;
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }

  // U-47v5 (owner: cart "doesn't contain the top bar and the heading and
  // starts the item directly over the camera position"): the Cart is a
  // PUSHED stack screen with no nav header, so it draws its own — back
  // chevron, title, subtitle, padded below the status/camera area via
  // safe-area insets. Same pattern as Checkout's screen header.
  function CartHeader() {
    return (
      <View
        className="border-b border-line bg-card px-4 pb-3"
        style={{ paddingTop: insets.top + 8 }}
      >
        <View className="flex-row items-center justify-between gap-2">
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full border border-line bg-card"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="arrow-left" size={18} color="#1e3a8a" />
          </Pressable>
          <Text className="flex-1 text-right font-display text-lg font-bold text-ink">
            Your build list
          </Text>
        </View>
        <Text className="mt-1 text-xs text-muted">
          Quantities sync to your account instantly.
        </Text>
      </View>
    );
  }

  if (lines.length === 0) {
    return (
      <View className="flex-1 bg-surface">
        <CartHeader />
        <View className="flex-1 items-center justify-center px-8">
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
      </View>
    );
  }

  const total = lines.reduce(
    (sum, { line, product }) => sum + product.price * line.quantity,
    0,
  );

  return (
    <View className="flex-1 bg-surface">
      <CartHeader />
      <FlatList
        data={lines}
        keyExtractor={({ line }) => line.productId}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          // U-47v4 (owner: cart "shitty and poorly displayed"): web-parity
          // row — photo, name, per-unit price, line total, bordered qty
          // stepper, and a Remove action. Nothing overflows: the info column
          // is min-w-0 flex-1 and the stepper is fixed-width.
          <View className="mb-3 rounded-2xl border border-line bg-card p-3">
            <View className="flex-row">
              <View className="h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-mist">
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
                <Text
                  numberOfLines={2}
                  className="text-sm font-bold leading-tight text-ink"
                >
                  {item.product.name}
                </Text>
                <Text className="mt-0.5 text-xs text-muted">
                  {formatNPR(item.product.price)} each
                </Text>
                <View className="mt-2 flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <Pressable
                      onPress={() =>
                        updateQty(item.line.productId, item.line.quantity - 1)
                      }
                      className="h-8 w-8 items-center justify-center rounded-lg border border-line"
                      accessibilityLabel={`Reduce ${item.product.name} quantity`}
                    >
                      <Feather name="minus" size={13} color="#1e3a8a" />
                    </Pressable>
                    <Text
                      accessibilityLiveRegion="polite"
                      className="mx-2.5 min-w-5 text-center text-sm font-bold text-ink"
                    >
                      {item.line.quantity}
                    </Text>
                    <Pressable
                      onPress={() =>
                        updateQty(item.line.productId, item.line.quantity + 1)
                      }
                      className="h-8 w-8 items-center justify-center rounded-lg border border-line"
                      accessibilityLabel={`Add another ${item.product.name}`}
                    >
                      <Feather name="plus" size={13} color="#1e3a8a" />
                    </Pressable>
                  </View>
                  <Text
                    numberOfLines={1}
                    className="ml-2 shrink text-sm font-black text-ink"
                  >
                    {formatNPR(item.product.price * item.line.quantity)}
                  </Text>
                </View>
              </View>
            </View>
            <Pressable
              onPress={() => updateQty(item.line.productId, 0)}
              className="mt-2 self-start"
              accessibilityLabel={`Remove ${item.product.name} from cart`}
            >
              <Text className="text-xs font-bold text-red-500 underline">
                Remove
              </Text>
            </Pressable>
          </View>
        )}
      />

      <View
        className="border-t border-line bg-card px-5 pb-6 pt-4"
        style={{ elevation: 8 }}
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-muted">Subtotal</Text>
          <Text className="text-sm font-bold text-ink">{formatNPR(total)}</Text>
        </View>
        <View className="mt-2 flex-row items-center justify-between border-t border-line pt-2">
          <Text className="font-display text-base font-black text-ink">
            Total
          </Text>
          <Text className="font-display text-lg font-black text-ink">
            {formatNPR(total)}
          </Text>
        </View>
        <Text className="mt-1.5 text-[11px] text-muted">
          Delivery is calculated at checkout. Changes save instantly.
        </Text>
        <Pressable
          onPress={() => navigation.push("Checkout")}
          className="mt-3 items-center rounded-full bg-navy py-3.5"
          accessibilityRole="button"
          accessibilityLabel="Proceed to checkout"
        >
          <Text className="text-sm font-black text-white">
            Checkout · {formatNPR(total)}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.goBack()}
          className="mt-2 items-center py-2 active:opacity-60"
          accessibilityLabel="Continue shopping"
        >
          <Text className="text-xs font-bold text-navy underline">
            Continue shopping
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
