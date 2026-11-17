// =====================================================================
// ServiceCard — the storefront's service row, extracted so the admin's
// preview can render the SAME component instead of an approximation.
//
// Markup mirrors the website's ArticleCard: the tag sits on its own line
// above a full-width title (sharing the row clamped names to
// "Robotics Lab Consul…"), and the title never truncates.
// =====================================================================
import React from "react";
import { Text, View } from "react-native";
import type { Service } from "../types";

export function ServiceCard({ service }: { service: Service }) {
  return (
    <View className="mb-3 overflow-hidden rounded-2xl border border-line bg-card p-5">
      {service.tag ? (
        <View className="self-start rounded-full bg-sky px-2.5 py-0.5">
          <Text className="text-xs font-black uppercase text-navy">
            {service.tag}
          </Text>
        </View>
      ) : null}
      <Text className="mt-2 font-display text-lg font-bold leading-snug text-ink">
        {service.name}
      </Text>
      <Text className="mt-2 text-sm leading-6 text-muted">
        {service.description}
      </Text>
      <Text className="mt-3 text-sm font-black text-navy">
        {service.priceLabel}
      </Text>
    </View>
  );
}

export default ServiceCard;
