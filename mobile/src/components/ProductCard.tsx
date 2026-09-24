// =====================================================================
// ProductCard - U-23 (2026-09-24): single shared product card used by the
// Shop + Projects grids, Home collections and related/recently-viewed rows.
// Image-led with a taller media box and 2 spec chips for non-compact cards.
// =====================================================================
import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import type { RootStackParamList } from "../navigation/types";
import { galleryImages, type Product } from "../types";

type Nav = NativeStackNavigationProp<RootStackParamList, "ProductDetail">;

export function ProductCard({
  product,
  compact = false,
  chips = false,
}: {
  product: Product;
  compact?: boolean;
  chips?: boolean;
}) {
  const navigation = useNavigation<Nav>();
  const media = galleryImages(product)[0];
  const specChips = chips
    ? (product.specs ?? []).filter(Boolean).slice(0, 2)
    : [];

  return (
    <Pressable
      onPress={() =>
        navigation.push("ProductDetail", { productId: product.id })
      }
      accessibilityLabel={`View ${product.name}`}
      className={`overflow-hidden rounded-2xl border border-line bg-card p-3 ${
        compact ? "w-40" : "mb-4 flex-1"
      }`}
    >
      <View
        className={`items-center justify-center overflow-hidden rounded-xl bg-mist ${
          compact ? "h-20" : "h-32"
        }`}
      >
        {media ? (
          <Image
            source={{ uri: media }}
            className="h-full w-full"
            resizeMode="cover"
          />
        ) : (
          <Feather name="box" size={28} color="#94a3b8" />
        )}
      </View>
      <Text
        numberOfLines={2}
        className="mt-2 text-[13px] font-bold leading-tight text-ink"
      >
        {product.name}
      </Text>
      {product.badge ? (
        <Text className="mt-1 text-xs font-black uppercase tracking-wide text-gold">
          {product.badge}
        </Text>
      ) : null}
      {!compact && specChips.length > 0 ? (
        <View className="mt-1.5 flex-row flex-wrap gap-1">
          {specChips.map((chip) => (
            <View
              key={chip}
              className="max-w-full rounded-full border border-line bg-mist px-2 py-0.5"
            >
              <Text
                numberOfLines={1}
                className="text-[10px] font-bold text-muted"
              >
                {chip}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <Text className="mt-1 text-xs font-black text-navy">
        {product.priceLabel}
      </Text>
    </Pressable>
  );
}
