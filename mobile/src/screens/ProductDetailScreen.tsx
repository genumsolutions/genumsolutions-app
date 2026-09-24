// =====================================================================
// ProductDetailScreen - full product detail (parity with the website's
// ProductDetailPro). Retail kits add to the build list; Project packages /
// out-of-stock items request a scoped quote instead.
// =====================================================================
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import {
  getProductByIdWithSource,
  getProducts,
  recordProductView,
  relatedProducts,
  resolveRecentlyViewed,
  loadRecentlyViewed,
} from "../services/productService";
import { resolveModeForProduct } from "../config/roboCarCatalog";
import { OfflineBadge } from "../components/OfflineBadge";
import { ProductCard } from "../components/ProductCard";
import { addToCart } from "../services/cartService";
import { useApp } from "../context/AppContext";
import { galleryImages, type Product } from "../types";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList, "ProductDetail">;
type Route = RouteProp<RootStackParamList, "ProductDetail">;

export function ProductDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { setCart } = useApp();
  const [product, setProduct] = useState<Product | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  // C3 (2026-09-23): related (same category → same type) + recently-viewed
  // rows resolved against the full catalog once it loads.
  const [related, setRelated] = useState<Product[]>([]);
  const [recent, setRecent] = useState<Product[]>([]);
  // U-23 (2026-09-24): gallery pagination (primary + thumbnails).
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { product, source } = await getProductByIdWithSource(
          route.params.productId,
        );
        if (active) {
          setProduct(product);
          setOffline(source === "cache");
          setActiveImage(0);
          if (product) {
            // C3: record the view BEFORE resolving the strip so this product
            // lands at the front of "Recently viewed" on the next screen.
            void recordProductView(product.id);
            void getProducts()
              .then((all) => {
                if (!active) return;
                setRelated(relatedProducts(all, product));
                return loadRecentlyViewed().then((ids) => {
                  if (active)
                    setRecent(resolveRecentlyViewed(all, ids, product.id));
                });
              })
              .catch(() => undefined);
          }
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

  const isQuote =
    product.productType === "Project package" || product.stock === 0;
  const projectSections: [string, string[] | undefined][] = [
    ["Objectives", product.objectives],
    ["Materials required", product.materialsRequired],
    ["Learning outcomes", product.learningOutcomes],
    ["Build steps", product.buildSteps],
    ["Control methods", product.controlMethods],
    ["Prerequisites", product.prerequisites],
    ["Deliverables", product.deliverables],
  ];

  const handleAdd = async () => {
    if (isQuote) return;
    const count = await addToCart(
      product.id,
      Math.min(qty, Math.max(1, product.stock)),
    );
    setCart({ count, size: count });
    setAdded(true);
  };

  const handleQuote = () => {
    navigation.push("Contact");
  };

  const colorLabel =
    product.color && !/from-\[.*?\]\s*to-\[.*?\]/.test(product.color)
      ? product.color
      : "Standard finish";

  const images = galleryImages(product);

  // U-24 (2026-09-24): canonical specs as rows — structured when the import
  // carried them, else parsed from the plain `specs` chip lines.
  const specRows: { key: string; value: string }[] = product.importMeta
    ?.structuredSpecs?.length
    ? product.importMeta.structuredSpecs
    : product.specs
        .filter(Boolean)
        .map((line) => {
          const idx = line.indexOf(":");
          return idx > 0
            ? {
                key: line.slice(0, idx).trim(),
                value: line.slice(idx + 1).trim(),
              }
            : { key: "", value: line };
        })
        .filter((row) => row.key);

  return (
    <View className="flex-1 bg-surface">
      <ScrollView
        className="flex-1 bg-surface"
        contentContainerStyle={{ paddingBottom: 104 }}
      >
        {/* Offline indicator (product came from local cache) */}
        {offline && (
          <View className="px-4 pt-3">
            <OfflineBadge />
          </View>
        )}

        {/* U-23 (2026-09-24): full gallery — larger contain-fit hero that never
          crops the print, with thumbnail strip for multi-photo imports. */}
        <View className="w-full bg-mist">
          <View className="h-72 w-full items-center justify-center">
            {images[activeImage] ? (
              <Image
                source={{ uri: images[activeImage] }}
                className="h-full w-full"
                resizeMode="contain"
              />
            ) : (
              <Feather name="box" size={56} color="#64748b" />
            )}
          </View>
          {images.length > 1 && (
            <View className="flex-row gap-2 px-4 pb-3">
              {images.map((src, i) => (
                <Pressable
                  key={src}
                  onPress={() => setActiveImage(i)}
                  className={`h-14 w-14 overflow-hidden rounded-xl border-2 ${
                    i === activeImage ? "border-navy" : "border-line"
                  }`}
                  accessibilityRole="button"
                  accessibilityLabel={`Show photo ${i + 1} of ${product.name}`}
                >
                  <Image
                    source={{ uri: src }}
                    className="h-full w-full"
                    resizeMode="cover"
                  />
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View className="px-5 pt-4">
          <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
            {product.category} · {product.badge || product.productType}
          </Text>
          {product.note ? (
            <Text className="mt-1 text-xs font-bold leading-4 text-gold">
              {product.note}
            </Text>
          ) : null}
          <Text className="mt-2 font-display text-2xl font-bold leading-tight tracking-tight text-ink">
            {product.name}
          </Text>
          <Text className="mt-3 text-sm leading-6 text-muted">
            {product.description}
          </Text>
          {product.importMeta?.creator ||
          product.importMeta?.license ||
          product.importMeta?.sourceSite ||
          product.documentationUrl ? (
            <View className="mt-3 overflow-hidden rounded-xl border border-line bg-mist/60">
              {product.importMeta?.creator ? (
                <View className="flex-row items-center justify-between gap-4 px-4 py-2">
                  <Text className="text-xs font-black uppercase tracking-widest text-navy">
                    Design by
                  </Text>
                  <Text className="max-w-[70%] text-sm text-ink">
                    {String(product.importMeta.creator)}
                  </Text>
                </View>
              ) : null}
              {product.importMeta?.license ? (
                <View className="flex-row items-center justify-between gap-4 border-t border-line px-4 py-2">
                  <Text className="text-xs font-black uppercase tracking-widest text-navy">
                    License
                  </Text>
                  <Text
                    className="max-w-[70%] text-sm text-ink"
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    {String(product.importMeta.license)}
                  </Text>
                </View>
              ) : null}
              {product.importMeta?.sourceSite || product.documentationUrl ? (
                <View className="flex-row items-center justify-between gap-4 border-t border-line px-4 py-2">
                  <Text className="text-xs font-black uppercase tracking-widest text-navy">
                    Source
                  </Text>
                  {product.documentationUrl ? (
                    <Pressable
                      onPress={() =>
                        void Linking.openURL(product.documentationUrl!)
                      }
                      accessibilityRole="link"
                      accessibilityLabel={`Open ${product.importMeta?.sourceSite || "source link"}`}
                      hitSlop={8}
                    >
                      <Text className="text-sm font-bold text-navy underline">
                        {product.importMeta?.sourceSite || "Original"} ↗
                      </Text>
                    </Pressable>
                  ) : (
                    <Text className="text-sm text-ink">
                      {product.importMeta?.sourceSite}
                    </Text>
                  )}
                </View>
              ) : null}
            </View>
          ) : null}

          <View className="mt-6 flex-row flex-wrap items-baseline gap-x-2">
            <Text className="font-display text-3xl font-bold tracking-tight text-ink">
              {product.priceLabel}
            </Text>
            <Text className="text-sm text-muted">
              {product.productType === "Project package"
                ? "indicative package"
                : "per unit"}
            </Text>
          </View>

          <View className="mt-4 flex-row flex-wrap gap-x-5 gap-y-2 border-t border-b border-line py-3">
            <Info label="Price" value={product.priceLabel} />
            <Info label="SKU" value={product.sku || "—"} />
            <Info label="Category" value={product.category} />
            <Info
              label="Stock"
              value={
                product.stock > 0
                  ? `${product.stock} in stock`
                  : "Made to order"
              }
            />
            {product.supplier ? (
              <Info label="Supplier" value={product.supplier} />
            ) : null}
            {product.inventoryType ? (
              <Info label="Type" value={product.inventoryType} />
            ) : null}
          </View>

          {/* Audience / warranty */}
          <View className="mt-4 flex-row border-b border-line pb-4">
            <View className="flex-1 pr-3">
              <Text className="text-xs font-bold uppercase tracking-widest text-navy">
                Audience
              </Text>
              <Text className="mt-1 text-sm leading-5 text-muted">
                {product.audience}
              </Text>
              <Text className="mt-1 text-sm leading-5 text-muted">
                {product.difficulty}
              </Text>
            </View>
            <View className="flex-1 pl-3">
              <Text className="text-xs font-bold uppercase tracking-widest text-navy">
                Warranty
              </Text>
              <Text className="mt-1 text-sm leading-5 text-muted">
                {product.warranty}
              </Text>
            </View>
          </View>

          {/* Color / delivery */}
          <View className="mt-4 flex-row border-b border-line pb-4">
            <View className="flex-1 pr-3">
              <Text className="text-xs font-bold uppercase tracking-widest text-navy">
                Color
              </Text>
              <Text className="mt-1 text-sm leading-5 text-muted">
                {colorLabel}
              </Text>
            </View>
            <View className="flex-1 pl-3">
              <Text className="text-xs font-bold uppercase tracking-widest text-navy">
                Delivery
              </Text>
              <Text className="mt-1 text-sm leading-5 text-muted">
                {product.delivery}
              </Text>
            </View>
          </View>

          {specRows.length > 0 && (
            <View className="mt-4">
              <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
                Specifications
              </Text>
              {specRows.map((row, i) => (
                <View
                  key={`${row.key}-${i}`}
                  className="mt-2 flex-row items-start"
                >
                  <View className="mr-2 mt-1.5 h-1.5 w-1.5 rounded-full bg-gold" />
                  <Text className="flex-1 text-sm leading-5 text-muted">
                    <Text className="font-bold text-ink">{row.key}:</Text>{" "}
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {product.productType === "Project package" && (
            <View className="mt-5 border-t-2 border-line pt-5">
              <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
                Project information
              </Text>
              {product.projectOverview ? (
                <Text className="mt-3 text-sm leading-6 text-muted">
                  {product.projectOverview}
                </Text>
              ) : null}
              {product.estimatedDuration ? (
                <Text className="mt-3 text-sm font-bold text-ink">
                  Estimated duration:{" "}
                  <Text className="font-normal text-muted">
                    {product.estimatedDuration}
                  </Text>
                </Text>
              ) : null}
              {product.sourceFolder ? (
                <Text className="mt-2 text-sm font-bold text-ink">
                  Source folder:{" "}
                  <Text className="font-normal text-muted">
                    {product.sourceFolder}
                  </Text>
                </Text>
              ) : null}

              <View className="mt-5">
                {projectSections
                  .filter(([, items]) => items?.length)
                  .map(([title, items]) => (
                    <View key={title} className="mb-4">
                      <Text className="text-sm font-bold text-ink">
                        {title}
                      </Text>
                      {(items ?? []).map((item, i) => (
                        <View
                          key={i}
                          className="mt-1.5 flex-row items-start pl-1"
                        >
                          <View className="mr-2 mt-1.5 h-1.5 w-1.5 rounded-full bg-gold" />
                          <Text className="flex-1 text-sm leading-5 text-muted">
                            {item}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ))}
              </View>

              {product.maintenanceNotes ? (
                <Text className="mt-2 text-sm leading-6 text-muted">
                  <Text className="font-bold text-ink">
                    Maintenance and safety:{" "}
                  </Text>
                  {product.maintenanceNotes}
                </Text>
              ) : null}

              {(product.documentationUrl || product.videoUrl) && (
                <View className="mt-4 flex-row flex-wrap gap-4">
                  {product.documentationUrl ? (
                    <LinkRow
                      label="Documentation"
                      url={product.documentationUrl}
                    />
                  ) : null}
                  {product.videoUrl ? (
                    <LinkRow label="Project video" url={product.videoUrl} />
                  ) : null}
                </View>
              )}
            </View>
          )}

          <Text className="mt-4 text-xs leading-5 text-muted">
            {product.delivery} · {product.warranty}
          </Text>
        </View>

        {/* C3: Related products — same category (closest price) → same type. */}
        {related.length > 0 && (
          <View className="mt-6 border-t-2 border-line pt-5">
            <Text className="px-5 text-xs font-black uppercase tracking-[0.24em] text-navy">
              Related products
            </Text>
            <FlatList
              horizontal
              data={related}
              keyExtractor={(p) => p.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingTop: 10,
                gap: 10,
              }}
              renderItem={({ item }) => <ProductCard product={item} compact />}
            />
          </View>
        )}

        {/* C3: Recently viewed — view order, excluding this product. */}
        {recent.length > 0 && (
          <View className="mt-5 border-t border-line pt-4">
            <Text className="px-5 text-xs font-black uppercase tracking-[0.24em] text-navy">
              Recently viewed
            </Text>
            <FlatList
              horizontal
              data={recent.slice(0, 8)}
              keyExtractor={(p) => p.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingTop: 10,
                gap: 10,
              }}
              renderItem={({ item }) => <ProductCard product={item} compact />}
            />
          </View>
        )}

        {/* U-23 (2026-09-24): pinned CTA bar — quantity + add/quote stays
          reachable without scrolling to the end of a long product page. */}
      </ScrollView>
      <View
        className="absolute inset-x-0 bottom-0 border-t border-line bg-white"
        style={{ paddingBottom: Math.max(insets.bottom, 10) }}
      >
        <View className="flex-row items-center gap-3 px-5 py-3">
          {!isQuote && (
            <View className="flex-row items-center rounded-full border border-line bg-card">
              <Pressable
                onPress={() => setQty((q) => Math.max(1, q - 1))}
                accessibilityRole="button"
                accessibilityLabel="Decrease quantity"
                className="h-11 w-11 items-center justify-center rounded-full"
              >
                <Feather name="minus" size={16} color="#1e3a8a" />
              </Pressable>
              <Text className="min-w-8 text-center text-sm font-bold text-ink">
                {qty}
              </Text>
              <Pressable
                onPress={() =>
                  setQty((q) => Math.min(Math.max(1, product.stock), q + 1))
                }
                accessibilityRole="button"
                accessibilityLabel="Increase quantity"
                className="h-11 w-11 items-center justify-center rounded-full"
              >
                <Feather name="plus" size={16} color="#1e3a8a" />
              </Pressable>
            </View>
          )}
          {/* Robot-car products get a per-package remote (CarRemote) that opens
              preconfigured for the car's firmware mode - like the ESP remote. */}
          {isQuote && resolveModeForProduct(product) && (
            <Pressable
              onPress={() =>
                navigation.push("Tools", { category: product.category })
              }
              accessibilityRole="button"
              className="flex-1 flex-row items-center justify-center gap-2 rounded-full border-2 border-gold bg-gold/10 py-3"
            >
              <Feather name="activity" size={15} color="#1e3a8a" />
              <Text className="font-bold text-navy">Control this car</Text>
            </Pressable>
          )}
          <Pressable
            onPress={isQuote ? handleQuote : () => void handleAdd()}
            accessibilityRole="button"
            accessibilityLabel={
              isQuote ? "Request a scoped quote" : "Add to build list"
            }
            className={`flex-1 flex-row items-center justify-center gap-2 rounded-full py-3.5 disabled:opacity-50 ${
              added && !isQuote ? "bg-emerald-600" : "bg-navy"
            }`}
          >
            <Text className="font-bold text-white">
              {isQuote
                ? "Request a scoped quote"
                : added
                  ? "Added to build list"
                  : "Add to build list"}
            </Text>
            <Feather
              name={
                isQuote ? "arrow-up-right" : added ? "check" : "shopping-bag"
              }
              size={15}
              color="#ffffff"
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[40%]">
      <Text className="text-xs font-bold uppercase tracking-wide text-border">
        {label}
      </Text>
      {/* R5 overflow fix: values ellipsize within the wrapped row. */}
      <Text numberOfLines={1} className="mt-0.5 text-sm font-semibold text-ink">
        {value}
      </Text>
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
