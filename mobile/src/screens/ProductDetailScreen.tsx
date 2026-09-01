// =====================================================================
// ProductDetailScreen - shows a single product and lets the user add it to
// the cart.
// =====================================================================
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getProductById } from '../services/productService';
import { addToCart } from '../services/cartService';
import { useApp } from '../context/AppContext';
import type { Product } from '../types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ProductDetail'>;
type Route = RouteProp<RootStackParamList, 'ProductDetail'>;

export function ProductDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { setCart } = useApp();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getProductById(route.params.productId);
        if (active) setProduct(p);
      } catch {
        // no-op
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [route.params.productId]);

  if (loading || !product) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }

  const handleAdd = async () => {
    const count = await addToCart(product.id, qty);
    setCart({ count, size: count });
    navigation.navigate('Main', { screen: 'Cart' });
  };

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ paddingBottom: 32 }}>
      {/* Image */}
      <View className="h-56 w-full items-center justify-center bg-mist">
        {product.image ? (
          <Image
            source={{ uri: product.image }}
            className="h-full w-full"
            resizeMode="cover"
          />
        ) : (
          <Feather name="box" size={56} color="#94a3b8" />
        )}
      </View>

      <View className="px-5 pt-4">
        {product.badge ? (
          <Text className="text-[11px] font-black uppercase tracking-wide text-gold">
            {product.badge}
          </Text>
        ) : null}
        <Text className="mt-1 font-sans text-2xl font-bold leading-tight text-ink">
          {product.name}
        </Text>
        <Text className="mt-2 text-sm text-slate-600">{product.description}</Text>

        <View className="mt-4 flex-row flex-wrap gap-x-5 gap-y-2 border-y border-line py-3">
          <Info label="Price" value={product.priceLabel} />
          <Info label="SKU" value={product.sku || '—'} />
          <Info label="Category" value={product.category} />
          <Info label="Stock" value={product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'} />
        </View>

        {product.specs.length > 0 && (
          <View className="mt-4">
            <Text className="text-xs font-black uppercase tracking-[0.2em] text-navy">
              Specs
            </Text>
            {product.specs.map((spec, i) => (
              <View key={i} className="mt-2 flex-row items-start">
                <View className="mr-2 mt-1.5 h-1.5 w-1.5 rounded-full bg-gold" />
                <Text className="flex-1 text-sm leading-5 text-slate-600">{spec}</Text>
              </View>
            ))}
          </View>
        )}

        <Text className="mt-4 text-xs leading-5 text-muted">
          {product.delivery || 'Ships in 1–2 working days'} · {product.warranty}
        </Text>
      </View>

      {/* Quantity + add */}
      <View className="mt-6 flex-row items-center gap-3 px-5">
        <View className="flex-row items-center rounded-full border border-line bg-white">
          <Pressable
            onPress={() => setQty((q) => Math.max(1, q - 1))}
            className="px-3 py-2"
            accessibilityLabel="Decrease quantity"
          >
            <Feather name="minus" size={16} color="#1e3a8a" />
          </Pressable>
          <Text className="min-w-8 text-center text-sm font-bold text-ink">{qty}</Text>
          <Pressable
            onPress={() => setQty((q) => q + 1)}
            className="px-3 py-2"
            accessibilityLabel="Increase quantity"
          >
            <Feather name="plus" size={16} color="#1e3a8a" />
          </Pressable>
        </View>
        <Pressable
          onPress={handleAdd}
          disabled={product.stock <= 0}
          className="flex-1 items-center rounded-full bg-navy py-3 disabled:opacity-50"
        >
          <Text className="font-bold text-white">
            {product.stock > 0 ? 'Add to cart' : 'Out of stock'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[40%]">
      <Text className="text-[10px] font-bold uppercase tracking-wide text-border">
        {label}
      </Text>
      <Text className="mt-0.5 text-sm font-semibold text-ink">{value}</Text>
    </View>
  );
}
