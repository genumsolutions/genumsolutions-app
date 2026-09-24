// =====================================================================
// OrderSuccessScreen - confirmation after an order is placed. Shows a paid
// state when eSewa/khalti was confirmed, otherwise a pending state.
//
// A3/A7 (2026-09-24): mirrors the website's checkout-success page — the
// WhatsApp nudge ("I just placed an order") + social chips come from the
// shared company_info row (hidden when unset, same rule as the web).
// =====================================================================
import React, { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import type { RootStackParamList } from "../navigation/types";
import {
  company as fallbackCompany,
  whatsappLink,
  type Company,
} from "../config/company";
import { getCompany } from "../services/companyService";
import { SocialsRow } from "../components/SocialsRow";

type Nav = NativeStackNavigationProp<RootStackParamList, "OrderSuccess">;
type Route = RouteProp<RootStackParamList, "OrderSuccess">;

const PROVIDER_LABELS: Record<string, string> = {
  cod: "cash on delivery",
  esewa: "eSewa",
  khalti: "Khalti",
};

export function OrderSuccessScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const orderId = route.params?.orderId;
  const paid = route.params?.paid === true;
  const providerLabel = PROVIDER_LABELS[route.params?.provider ?? ""] ?? "";

  const [company, setCompany] = useState<Company>(fallbackCompany);
  useEffect(() => {
    let active = true;
    getCompany()
      .then((c) => {
        if (active) setCompany(c);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const waHref = company.whatsappNumber
    ? whatsappLink(
        company.whatsappNumber,
        "Hi GENUM Solutions! I just placed an order.",
      )
    : "";

  return (
    <ScrollView
      className="flex-1 bg-surface"
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        paddingHorizontal: 32,
        paddingVertical: 24,
      }}
    >
      <View
        className={`h-20 w-20 items-center justify-center self-center rounded-full ${paid ? "bg-emerald-50" : "bg-amber-50"}`}
      >
        <Feather
          name={paid ? "check-circle" : "clock"}
          size={40}
          color={paid ? "#059669" : "#b45309"}
        />
      </View>
      <Text className="mt-5 text-center font-display text-2xl font-bold text-ink">
        {paid ? "Payment received" : "Order placed"}
      </Text>
      <Text className="mt-2 text-center text-sm leading-6 text-muted">
        {paid
          ? `Thank you! Your payment${providerLabel ? ` via ${providerLabel}` : ""} is confirmed and we'll start preparing your order${orderId ? ` (${orderId.slice(0, 8)})` : ""}.`
          : `Thank you! We've received your order${orderId ? ` (${orderId.slice(0, 8)})` : ""} and will be in touch with payment and delivery details.`}
      </Text>

      {/* A7: WhatsApp nudge — same as web checkout-success, hidden when the
          shared company row has no number (default carries the business
          phone, so it normally shows). */}
      {waHref ? (
        <Pressable
          onPress={() => void Linking.openURL(waHref).catch(() => undefined)}
          accessibilityRole="link"
          accessibilityLabel="Chat on WhatsApp"
          className="mt-6 w-full max-w-xs flex-row items-center justify-center gap-2 self-center rounded-full bg-emerald-600 py-3"
        >
          <Feather name="message-circle" size={16} color="#ffffff" />
          <Text className="font-bold text-white">Chat on WhatsApp</Text>
        </Pressable>
      ) : null}

      {/* A3: social chips — same shared row the web footer/checkout use. */}
      <View className="mx-auto mt-4 w-full max-w-xs items-center">
        <SocialsRow company={company} />
      </View>

      <Pressable
        onPress={() => {
          // Go back ONE step to where the order flow started (usually Main/
          // Checkout). popToTop previously collapsed the whole stack, which
          // could skip screens when OrderSuccess was reached via a deep link.
          if (navigation.canGoBack()) navigation.goBack();
        }}
        className="mt-8 w-full max-w-xs items-center rounded-full bg-navy py-3"
      >
        <Text className="font-bold text-white">Back</Text>
      </Pressable>
    </ScrollView>
  );
}
