// =====================================================================
// PrintPromoSticker — the landing-page 3D-printing offer.
//
// 2026-11-14 (owner): "i want the promotional price for the 3d printing of the
// rs. 10 per gram in the landing page, like a sticker … and also have them
// close button so that it doesn't become irritating when displaying and
// working with other things."
//
// The copy is not hard-coded: it prints whatever the website's active
// print_promotions row says (title + body verbatim, which is where the
// "first year only" wording lives), so Admin → 3D Products → Promotions owns
// the offer. Dismissal is stored per promotion id in AsyncStorage: closing it
// keeps it closed on this device, and publishing a different promotion id
// brings it back.
// =====================================================================
import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import type { PrintPromotion } from "../services/printService";

const storageKey = (id: string) => `genum.print-promo.dismissed.${id}`;

export function PrintPromoSticker({
  promo,
  onPress,
}: {
  promo: PrintPromotion | null;
  /** Opens the printing screen (the CTA target). */
  onPress?: () => void;
}) {
  // "unknown" renders nothing until storage has been read, so a dismissed
  // sticker never flashes back for a frame on every app start.
  const [state, setState] = useState<"unknown" | "shown" | "hidden">("unknown");

  useEffect(() => {
    if (!promo) {
      setState("hidden");
      return;
    }
    let active = true;
    void AsyncStorage.getItem(storageKey(promo.id))
      .then((stored) => {
        if (active) setState(stored ? "hidden" : "shown");
      })
      .catch(() => {
        // Storage unavailable: show it, closing just won't persist.
        if (active) setState("shown");
      });
    return () => {
      active = false;
    };
  }, [promo]);

  if (!promo || state !== "shown") return null;

  function dismiss() {
    setState("hidden");
    if (!promo) return;
    void AsyncStorage.setItem(
      storageKey(promo.id),
      new Date().toISOString(),
    ).catch(() => undefined);
  }

  return (
    <View className="mx-5 mt-4 overflow-hidden rounded-2xl border border-gold/60 bg-gold/10">
      <View className="absolute bottom-0 left-0 top-0 w-1.5 bg-gold" />
      <View className="flex-row items-start gap-2 px-4 py-3 pl-5">
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <View className="shrink-0 rounded-full bg-gold px-2 py-0.5">
              <Text className="text-[9px] font-black uppercase tracking-[0.12em] text-ink">
                First-year offer
              </Text>
            </View>
          </View>
          <Text className="mt-1.5 text-sm font-black leading-5 text-ink">
            {promo.title}
          </Text>
          {promo.body ? (
            <Text className="mt-1 text-[11px] leading-4 text-slate-600">
              {promo.body}
            </Text>
          ) : null}
          {onPress ? (
            <Pressable
              onPress={() => {
                onPress();
              }}
              accessibilityRole="button"
              accessibilityLabel={promo.ctaLabel || "See the 3D printing offer"}
              className="mt-2 min-h-9 self-start items-center justify-center rounded-full bg-navy px-4"
            >
              <Text className="text-[11px] font-black text-white">
                {promo.ctaLabel || "See the offer"}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {/* 44px target — a 24px × is the classic "can't close the banner". */}
        <Pressable
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss the 3D printing offer"
          hitSlop={6}
          className="h-11 w-11 items-center justify-center rounded-full"
        >
          <Feather name="x" size={16} color="#475569" />
        </Pressable>
      </View>
    </View>
  );
}
