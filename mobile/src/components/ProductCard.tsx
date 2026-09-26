// =====================================================================
// ProductCard — U-47 (2026-09-27) owner redesign: the card IS the link.
// Bare minimum: square photo, name, price. No badge, no chips, no spec
// text, no dead padding — details live on the product page. The heart
// reads/writes the APP-WIDE CollectionContext (hydrated once per
// sign-in, shared by every screen — a heart on Shop shows on Projects
// and in the profile instantly). Guest taps throw; the context flags
// guestAttempt so hosts can prompt sign-in.
// PERF: memoized (Shop FlatList re-renders on every keystroke).
// =====================================================================
import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { galleryImages, type Product } from "../types";
import { getProductMedia } from "../lib/productMedia";
import type { RootStackParamList } from "../navigation/types";
import { useCollection } from "../context/CollectionContext";

type Nav = NativeStackNavigationProp<RootStackParamList, "ProductDetail">;

function ProductCardBase({
  product,
  compact = false,
  /** Deprecated (U-47): chips removed from the minimal card. */
  chips = false,
}: {
  product: Product;
  /** Kept for call-site compatibility; all cards are minimal now. */
  compact?: boolean;
  chips?: boolean;
}) {
  const navigation = useNavigation<Nav>();
  // U-47v4 (car-parity): fall back to the themed category photo like the
  // website's ProductCard — cars/kits without photos no longer render as a
  // gray box icon in the grid.
  const media =
    galleryImages(product)[0] ?? getProductMedia(product.category).src;
  const { has, toggle } = useCollection();
  const saved = has(product.id);

  return (
    <Pressable
      onPress={() =>
        navigation.push("ProductDetail", { productId: product.id })
      }
      accessibilityRole="button"
      accessibilityLabel={`Open ${product.name}`}
      className={`overflow-hidden rounded-2xl border border-line bg-card shadow-card ${
        compact ? "w-40" : "flex-1"
      }`}
    >
      <View className="aspect-square w-full items-center justify-center bg-mist">
        <Image
          source={{ uri: media }}
          className="h-full w-full"
          resizeMode="contain"
        />
      </View>
      <View className="px-2 pb-2 pt-1.5">
        <Text
          numberOfLines={1}
          className="text-[13px] font-bold leading-tight text-ink"
        >
          {product.name}
        </Text>
        <Text className="mt-0.5 text-xs font-black text-navy">
          {product.priceLabel}
        </Text>
      </View>
      <Pressable
        onPress={() => {
          void toggle(product.id).catch(() => undefined);
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Save ${product.name} to collection`}
        className="absolute right-2 top-2 h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm"
      >
        <Feather
          name="heart"
          size={16}
          color={saved ? "#ef4444" : "#94a3b8"}
          fill={saved ? "#ef4444" : "none"}
        />
      </Pressable>
    </Pressable>
  );
}

export const ProductCard = React.memo(ProductCardBase);
