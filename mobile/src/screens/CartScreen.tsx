// =====================================================================
// CartScreen - shows the native cart with quantity controls.
// =====================================================================
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getProducts } from '../services/productService';
import { resolveCart, setQuantity } from '../services/cartService';
import { useApp } from '../context/AppContext';
import type { Product } from '../types';
import type { TabNav } from '../navigation/types';

type Nav = TabNav<'Cart'>;

export function CartScreen() {
  const navigation = useNavigation<Nav>();
  const { setCart } = useApp();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setProducts(await getProducts());
    } catch {
      // no-op
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, version]);

  const updateQty = async (productId: string, qty: number) => {
    const count = await setQuantity(productId, qty);
    setCart({ count, size: count });
    setVersion((v) => v + 1);
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }

  return (
    <CartContent
      products={products}
      onUpdateQty={updateQty}
      onCheckout={() => navigation.push('Checkout')}
    />
  );
}

function CartContent({
  products,
  onUpdateQty,
  onCheckout,
}: {
  products: Product[];
  onUpdateQty: (id: string, qty: number) => void;
  onCheckout: () => void;
}) {
  const [lines, setLines] = useState<{ line: { productId: string; quantity: number }; product: Product }[]>([]);

  useEffect(() => {
    void resolveCart(products).then(setLines);
  }, [products]);

  if (lines.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-surface px-8">
        <Feather name="shopping-cart" size={44} color="#cbd5e1" />
        <Text className="mt-3 font-display text-xl font-bold text-ink">Your cart is empty</Text>
        <Text className="mt-1 text-center text-sm text-muted">
          Add products from the shop to start your build list.
        </Text>
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
            <View className="ml-3 flex-1">
              <Text className="text-sm font-bold leading-tight text-ink">
                {item.product.name}
              </Text>
              <Text className="mt-0.5 text-xs font-black text-navy">
                {item.product.priceLabel}
              </Text>
              <View className="mt-2 flex-row items-center">
                <Pressable
                  onPress={() => onUpdateQty(item.line.productId, item.line.quantity - 1)}
                  className="rounded-full border border-line px-2 py-1"
                  accessibilityLabel="Decrease quantity"
                >
                  <Feather name="minus" size={13} color="#1e3a8a" />
                </Pressable>
                <Text className="mx-3 text-sm font-bold text-ink">{item.line.quantity}</Text>
                <Pressable
                  onPress={() => onUpdateQty(item.line.productId, item.line.quantity + 1)}
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
            NPR {(total || 0).toLocaleString('en-IN')}
          </Text>
        </View>
        <Pressable
          onPress={onCheckout}
          className="mt-3 items-center rounded-full bg-navy py-3"
        >
          <Text className="font-bold text-white">Checkout</Text>
        </Pressable>
      </View>
    </View>
  );
}
