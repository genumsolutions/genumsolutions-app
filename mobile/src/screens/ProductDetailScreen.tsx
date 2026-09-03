// =====================================================================
// ProductDetailScreen - full product detail (parity with the website's
// ProductDetailPro). Retail kits add to the build list; Project packages /
// out-of-stock items request a scoped quote instead.
// =====================================================================
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getProductByIdWithSource } from '../services/productService';
import { OfflineBadge } from '../components/OfflineBadge';
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
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { product, source } = await getProductByIdWithSource(route.params.productId);
        if (active) {
          setProduct(product);
          setOffline(source === 'cache');
        }
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

  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 2000);
    return () => clearTimeout(timer);
  }, [added]);

  if (loading || !product) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }

  const isQuote = product.productType === 'Project package' || product.stock === 0;
  const projectSections: [string, string[] | undefined][] = [
    ['Objectives', product.objectives],
    ['Materials required', product.materialsRequired],
    ['Learning outcomes', product.learningOutcomes],
    ['Build steps', product.buildSteps],
    ['Control methods', product.controlMethods],
    ['Prerequisites', product.prerequisites],
    ['Deliverables', product.deliverables],
  ];

  const handleAdd = async () => {
    if (isQuote) return;
    const count = await addToCart(product.id, Math.min(qty, Math.max(1, product.stock)));
    setCart({ count, size: count });
    setAdded(true);
  };

  const handleQuote = () => {
    navigation.navigate('Contact');
  };

  const colorLabel =
    product.color && !/from-\[.*?\]\s*to-\[.*?\]/.test(product.color)
      ? product.color
      : 'Standard finish';

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ paddingBottom: 32 }}>
      {/* Offline indicator (product came from local cache) */}
      {offline && (
        <View className="px-4 pt-3">
          <OfflineBadge />
        </View>
      )}

      {/* Image */}
      <View className="h-64 w-full items-center justify-center bg-ink">
        {product.image ? (
          <Image
            source={{ uri: product.image }}
            className="h-full w-full"
            resizeMode="cover"
          />
        ) : (
          <Feather name="box" size={56} color="#64748b" />
        )}
      </View>

      <View className="px-5 pt-4">
        <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
          {product.category} · {product.badge || product.productType}
        </Text>
        <Text className="mt-2 font-display text-2xl font-bold leading-tight tracking-tight text-ink">
          {product.name}
        </Text>
        <Text className="mt-3 text-sm leading-6 text-muted">{product.description}</Text>

        <View className="mt-6 flex-row flex-wrap items-baseline gap-x-2">
          <Text className="font-display text-3xl font-bold tracking-tight text-ink">{product.priceLabel}</Text>
          <Text className="text-sm text-muted">
            {product.productType === 'Project package' ? 'indicative package' : 'per unit'}
          </Text>
        </View>

        <View className="mt-4 flex-row flex-wrap gap-x-5 gap-y-2 border-t border-b border-line py-3">
          <Info label="Price" value={product.priceLabel} />
          <Info label="SKU" value={product.sku || '—'} />
          <Info label="Category" value={product.category} />
          <Info label="Stock" value={product.stock > 0 ? `${product.stock} in stock` : 'Made to order'} />
        </View>

        {/* Audience / warranty */}
        <View className="mt-4 flex-row border-b border-line pb-4">
          <View className="flex-1 pr-3">
            <Text className="text-xs font-bold uppercase tracking-widest text-navy">Audience</Text>
            <Text className="mt-1 text-sm leading-5 text-muted">{product.audience}</Text>
            <Text className="mt-1 text-sm leading-5 text-muted">{product.difficulty}</Text>
          </View>
          <View className="flex-1 pl-3">
            <Text className="text-xs font-bold uppercase tracking-widest text-navy">Warranty</Text>
            <Text className="mt-1 text-sm leading-5 text-muted">{product.warranty}</Text>
          </View>
        </View>

        {/* Color / delivery */}
        <View className="mt-4 flex-row border-b border-line pb-4">
          <View className="flex-1 pr-3">
            <Text className="text-xs font-bold uppercase tracking-widest text-navy">Color</Text>
            <Text className="mt-1 text-sm leading-5 text-muted">{colorLabel}</Text>
          </View>
          <View className="flex-1 pl-3">
            <Text className="text-xs font-bold uppercase tracking-widest text-navy">Delivery</Text>
            <Text className="mt-1 text-sm leading-5 text-muted">{product.delivery}</Text>
          </View>
        </View>

        {product.specs.length > 0 && (
          <View className="mt-4">
            <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">Specs</Text>
            {product.specs.map((spec, i) => (
              <View key={i} className="mt-2 flex-row items-start">
                <View className="mr-2 mt-1.5 h-1.5 w-1.5 rounded-full bg-gold" />
                <Text className="flex-1 text-sm leading-5 text-muted">{spec}</Text>
              </View>
            ))}
          </View>
        )}

        {product.productType === 'Project package' && (
          <View className="mt-5 border-t-2 border-line pt-5">
            <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
              Project information
            </Text>
            {product.projectOverview ? (
              <Text className="mt-3 text-sm leading-6 text-muted">{product.projectOverview}</Text>
            ) : null}
            {product.estimatedDuration ? (
              <Text className="mt-3 text-sm font-bold text-ink">
                Estimated duration:{' '}
                <Text className="font-normal text-muted">{product.estimatedDuration}</Text>
              </Text>
            ) : null}

            <View className="mt-5">
              {projectSections
                .filter(([, items]) => items?.length)
                .map(([title, items]) => (
                  <View key={title} className="mb-4">
                    <Text className="text-sm font-bold text-ink">{title}</Text>
                    {(items ?? []).map((item, i) => (
                      <View key={i} className="mt-1.5 flex-row items-start pl-1">
                        <View className="mr-2 mt-1.5 h-1.5 w-1.5 rounded-full bg-gold" />
                        <Text className="flex-1 text-sm leading-5 text-muted">{item}</Text>
                      </View>
                    ))}
                  </View>
                ))}
            </View>

            {product.maintenanceNotes ? (
              <Text className="mt-2 text-sm leading-6 text-muted">
                <Text className="font-bold text-ink">Maintenance and safety: </Text>
                {product.maintenanceNotes}
              </Text>
            ) : null}

            {(product.documentationUrl || product.videoUrl) && (
              <View className="mt-4 flex-row flex-wrap gap-4">
                {product.documentationUrl ? (
                  <LinkRow label="Documentation" url={product.documentationUrl} />
                ) : null}
                {product.videoUrl ? <LinkRow label="Project video" url={product.videoUrl} /> : null}
              </View>
            )}
          </View>
        )}

        <Text className="mt-4 text-xs leading-5 text-muted">
          {product.delivery} · {product.warranty}
        </Text>
      </View>

      {/* Quantity + CTA */}
      <View className="mt-6 flex-row items-center gap-3 px-5">
        {!isQuote && (
          <View className="flex-row items-center rounded-full border border-line bg-card">
            <Pressable
              onPress={() => setQty((q) => Math.max(1, q - 1))}
              className="px-3 py-2"
              accessibilityLabel="Decrease quantity"
            >
              <Feather name="minus" size={16} color="#1e3a8a" />
            </Pressable>
            <Text className="min-w-8 text-center text-sm font-bold text-ink">{qty}</Text>
            <Pressable
              onPress={() => setQty((q) => Math.min(Math.max(1, product.stock), q + 1))}
              className="px-3 py-2"
              accessibilityLabel="Increase quantity"
            >
              <Feather name="plus" size={16} color="#1e3a8a" />
            </Pressable>
          </View>
        )}
        <Pressable
          onPress={isQuote ? handleQuote : () => void handleAdd()}
          className={`flex-1 flex-row items-center justify-center gap-2 rounded-full py-3 disabled:opacity-50 ${
            added && !isQuote ? 'bg-emerald-600' : 'bg-navy'
          }`}
        >
          <Text className="font-bold text-white">{isQuote ? 'Request a scoped quote' : added ? 'Added to build list' : 'Add to build list'}</Text>
          <Feather
            name={isQuote ? 'arrow-up-right' : added ? 'check' : 'shopping-bag'}
            size={15}
            color="#ffffff"
          />
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[40%]">
      <Text className="text-xs font-bold uppercase tracking-wide text-border">
        {label}
      </Text>
      <Text className="mt-0.5 text-sm font-semibold text-ink">{value}</Text>
    </View>
  );
}

function LinkRow({ label, url }: { label: string; url: string }) {
  return (
    <Pressable
      onPress={() => void Linking.openURL(url)}
      className="flex-row items-center gap-1"
      accessibilityRole="link"
    >
      <Text className="text-sm font-bold text-navy">{label}</Text>
      <Feather name="external-link" size={13} color="#1e3a8a" />
    </Pressable>
  );
}