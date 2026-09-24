// =====================================================================
// SocialsRow — C5: the app mirror of the website's social pill chips
// (SiteFooter / contact page / checkout-success). Renders one pressable
// chip per configured network and hides itself entirely when no URL is
// set — an empty surface must never render a dead link.
//
// The data contract (order, keys, empty-hidden rule) lives in the pure
// helper config/socials.ts (mirroring the web's lib/socials.ts); this
// component only maps each network to its Feather icon and opens the
// browser.
//
// Data comes from the shared company_info row (via getCompany), so a
// link edited in the web admin Settings shows here after a reload.
// =====================================================================
import React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import type { Company } from "../config/company";
import { socialLinks } from "../config/socials";

type IconName = ComponentProps<typeof Feather>["name"];

/** Feather icon per network (TikTok has none — 'music' is its stand-in). */
const CHIP_ICONS: Record<string, IconName> = {
  facebook: "facebook",
  instagram: "instagram",
  tiktok: "music",
  linkedin: "linkedin",
  youtube: "youtube",
};

export function SocialsRow({ company }: { company: Company }) {
  const links = socialLinks(company);
  if (links.length === 0) return null;

  return (
    <View className="mt-3 flex-row flex-wrap gap-2">
      {links.map((link) => (
        <Pressable
          key={link.key}
          onPress={() => void Linking.openURL(link.url).catch(() => undefined)}
          accessibilityRole="link"
          accessibilityHint={`Opens ${link.label} in the browser`}
          accessibilityLabel={link.label}
          className="flex-row items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-2 active:bg-mist"
        >
          <Feather
            name={CHIP_ICONS[link.key] ?? "external-link"}
            size={13}
            color="#1e3a8a"
          />
          <Text className="text-[11px] font-black uppercase tracking-wide text-navy">
            {link.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
