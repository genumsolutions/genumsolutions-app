// =====================================================================
// HomeScreen - native home. Reads site_content, services, products, and
// programs/curriculum from Supabase (shared tables), with the bundled
// config as offline fallback.
// =====================================================================
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { getProducts } from "../services/productService";
import { getServices } from "../services/serviceService";
import { fetchSiteContent } from "../services/orderService";
import { getProgramsContent } from "../services/programsService";
import {
  pilotCosts as fallbackPilotCosts,
  stemProjectHighlights as fallbackHighlights,
  trainingPrograms as fallbackPrograms,
} from "../config/programs";
import { galleryImages, type Product, type Service } from "../types";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList, "Main">;

export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const [services, setServices] = useState<Service[]>([]);
  const [featured, setFeatured] = useState<Product[]>([]);
  // U-41 (2026-09-26): home 3D-printing band — mirrors the website's home
  // section (offers + "Models we print" strip from the same `3D Models`
  // catalog rows the /3d-printing page shows).
  const [printModels, setPrintModels] = useState<Product[]>([]);
  const [heroTitle, setHeroTitle] = useState(
    "Technology you can touch, test, and trust.",
  );
  const [heroBody, setHeroBody] = useState(
    "Robotics kits, project solutions, fabrication, open tools, and training for curious builders, schools, and teams.",
  );
  const [trainingPrograms, setTrainingPrograms] = useState(fallbackPrograms);
  const [pilotCosts, setPilotCosts] = useState(fallbackPilotCosts);
  const [stemProjectHighlights, setStemProjectHighlights] =
    useState(fallbackHighlights);
  // PERF (2026-09-25): the old render gated EVERY band behind a full-screen
  // spinner until the SLOWEST of four fetches settled (services + catalog +
  // site content + programs). The hero now paints instantly on the bundled
  // fallbacks and each band re-renders as its own promise resolves — the
  // screen is usable while slower reads are still in flight.
  const [servicesReady, setServicesReady] = useState(false);
  const [featuredReady, setFeaturedReady] = useState(false);
  const [programsReady, setProgramsReady] = useState(false);

  useEffect(() => {
    let active = true;
    void getServices()
      .then((svcs) => {
        if (!active) return;
        setServices(svcs.slice(0, 4));
        setServicesReady(true);
      })
      .catch(() => {
        if (active) setServicesReady(true); // nothing to add — hide the band
      });
    void getProducts()
      .then((prods) => {
        if (!active) return;
        setFeatured(prods.filter((p) => p.stock > 0).slice(0, 6));
        // U-41: same `3D Models` rows the /3d-printing page renders.
        setPrintModels(
          prods
            .filter(
              (p) =>
                p.active !== false &&
                p.category?.trim().toLowerCase() === "3d models",
            )
            .slice(0, 4),
        );
        setFeaturedReady(true);
      })
      .catch(() => {
        if (active) setFeaturedReady(true);
      });
    void fetchSiteContent()
      .then((content) => {
        if (!active) return;
        if (content?.content?.home_title)
          setHeroTitle(content.content.home_title);
        if (content?.content?.home_body) setHeroBody(content.content.home_body);
      })
      .catch(() => {
        /* hero keeps the bundled copy */
      });
    void getProgramsContent()
      .then((programContent) => {
        if (!active) return;
        setTrainingPrograms(programContent.trainingPrograms);
        setPilotCosts(programContent.pilotCosts);
        setStemProjectHighlights(programContent.stemProjectHighlights);
        setProgramsReady(true);
      })
      .catch(() => {
        if (active) setProgramsReady(true); // bundled fallbacks already set
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <ScrollView
      className="flex-1 bg-surface"
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      {/* Hero */}
      <View className="bg-navy px-5 pb-8 pt-6">
        <Text className="text-xs font-black uppercase tracking-[0.24em] text-gold">
          Kathmandu · Nepal
        </Text>
        <Text className="mt-2 font-display text-3xl font-bold leading-tight tracking-tight text-white">
          {heroTitle}
        </Text>
        <Text className="mt-3 text-sm leading-6 text-white/80">{heroBody}</Text>
      </View>

      {/* PERF: no full-screen gate — the hero paints instantly and each band
          appears as its own read resolves. One small spinner covers the first
          paint window before the earliest band lands. */}
      {!servicesReady && !featuredReady && !programsReady && (
        <View className="items-center py-16">
          <ActivityIndicator size="large" color="#1e3a8a" />
        </View>
      )}
      {
        <>
          {/* PERF: hero + bands paint progressively — each band shows a quiet
              inline placeholder only while ITS OWN read is still in flight,
              so one slow fetch can never blank the whole screen again. */}
          {!servicesReady && (
            <View className="items-center py-6">
              <ActivityIndicator size="small" color="#1e3a8a" />
            </View>
          )}
          {/* Services */}
          {servicesReady && services.length > 0 && (
            <View className="px-5 pt-6">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
                  What GENUM does
                </Text>
                <Pressable onPress={() => navigation.push("Services")}>
                  <Text className="text-sm font-bold text-navy underline">
                    View all
                  </Text>
                </Pressable>
              </View>
              <View className="mt-3">
                {services.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => navigation.push("Services")}
                    className="mb-2 overflow-hidden rounded-2xl border border-line bg-card p-4"
                  >
                    <Text
                      numberOfLines={1}
                      className="font-display text-lg font-bold leading-snug text-ink"
                    >
                      {s.name}
                    </Text>
                    <Text
                      numberOfLines={2}
                      className="mt-1 text-sm leading-5 text-muted"
                    >
                      {s.description}
                    </Text>
                    <Text className="mt-2 text-sm font-black text-navy">
                      {s.priceLabel}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* 3D printing band (U-41 parity with the website home) */}
          {featuredReady && printModels.length > 0 && (
            <View className="px-5 pt-6">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
                  3D & 2D printing
                </Text>
                <Pressable onPress={() => navigation.push("Printing")}>
                  <Text className="text-sm font-bold text-navy underline">
                    Printing services
                  </Text>
                </Pressable>
              </View>
              <Text className="mt-1 text-sm leading-6 text-muted">
                Print-to-order fabrication — start with a file, a reference
                object, or a rough idea.
              </Text>
              <Text className="mt-4 text-xs font-black uppercase tracking-[0.24em] text-navy">
                Models we print
              </Text>
              <View className="mt-3 flex-row flex-wrap justify-between">
                {printModels.map((model) => (
                  <Pressable
                    key={model.id}
                    onPress={() =>
                      navigation.push("ProductDetail", { productId: model.id })
                    }
                    className="mb-3 w-[48%] overflow-hidden rounded-2xl border border-line bg-card p-3"
                  >
                    <View className="h-20 items-center justify-center overflow-hidden rounded-xl bg-mist">
                      {galleryImages(model)[0] || model.image ? (
                        <Image
                          source={{
                            uri: galleryImages(model)[0] || model.image,
                          }}
                          className="h-full w-full"
                          resizeMode="contain"
                        />
                      ) : (
                        <Feather name="box" size={24} color="#94a3b8" />
                      )}
                    </View>
                    <Text
                      numberOfLines={1}
                      className="mt-2 text-[13px] font-bold text-ink"
                    >
                      {model.name}
                    </Text>
                    <Text className="mt-1 text-xs font-black text-navy">
                      {model.priceLabel}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                onPress={() => navigation.push("Contact")}
                className="rounded-full bg-navy px-5 py-3"
              >
                <Text className="text-center text-sm font-black text-white">
                  Send a file for a print review
                </Text>
              </Pressable>
            </View>
          )}

          {/* Curriculum + training + pilot costing share one programs read —
              PERF: they render only once that read settles (bundled fallbacks
              mean it is ALWAYS populated by then; nothing to gate per-band). */}
          {programsReady && (
            <>
              {/* Curriculum */}
              <View className="px-5 pt-6">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
                    100+ project curriculum
                  </Text>
                  <Pressable onPress={() => navigation.push("Contact")}>
                    <Text className="text-sm font-bold text-navy underline">
                      Request the full catalog
                    </Text>
                  </Pressable>
                </View>
                <View className="mt-4 space-y-3">
                  {Object.entries(stemProjectHighlights).map(
                    ([ages, projects]) => (
                      <View
                        key={ages}
                        className="rounded-2xl border border-line bg-card p-4"
                      >
                        <Text className="text-xs font-black uppercase tracking-widest text-gold">
                          {ages}
                        </Text>
                        <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
                          {projects.map((p) => (
                            <Text
                              key={p}
                              className="text-sm leading-6 text-muted"
                            >
                              • {p}
                            </Text>
                          ))}
                        </View>
                      </View>
                    ),
                  )}
                </View>
              </View>

              {/* Training programs */}
              <View className="px-5 pt-6">
                <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
                  Training programs
                </Text>
                <View className="mt-4 space-y-3">
                  {trainingPrograms.map((prog) => (
                    <View
                      key={prog.title}
                      className="rounded-2xl border border-line bg-card p-4"
                    >
                      <View className="flex-row items-center justify-between gap-2">
                        <Text
                          numberOfLines={1}
                          className="min-w-0 flex-1 font-display text-lg font-bold text-ink"
                        >
                          {prog.title}
                        </Text>
                        <Text className="shrink-0 rounded-full bg-sky px-2 py-0.5 text-xs font-bold text-navy">
                          {prog.duration}
                        </Text>
                      </View>
                      <Text className="mt-1 text-xs font-black uppercase tracking-wide text-gold">
                        {prog.audience}
                      </Text>
                      <Text className="mt-2 text-sm leading-6 text-muted">
                        {prog.description}
                      </Text>
                      <Text className="mt-2 text-xs leading-5 text-muted">
                        <Text className="text-ink font-bold">Outcome:</Text>{" "}
                        {prog.outcome}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Pilot costing */}
              <View className="px-5 pt-6">
                <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
                  Illustrative pilot costing
                </Text>
                <Text className="mt-2 font-display text-2xl font-bold text-navy">
                  NPR 8,40,000{" "}
                  <Text className="font-sans text-sm font-normal text-muted">
                    illustrative total
                  </Text>
                </Text>
                <View className="mt-4">
                  {pilotCosts.map(([item, cost, note]) => (
                    <View
                      key={item}
                      className="flex-row items-center justify-between border-b border-line py-2"
                    >
                      <Text
                        numberOfLines={1}
                        className="min-w-0 flex-1 pr-2 text-sm font-semibold text-ink"
                      >
                        {item}
                        <Text className="text-xs font-normal text-muted">
                          {" "}
                          — {note}
                        </Text>
                      </Text>
                      <Text className="shrink-0 font-display text-base font-bold text-navy">
                        {cost}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          )}

          {/* Featured products */}
          {featuredReady && featured.length > 0 && (
            <View className="px-5 pt-6">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
                  Shop
                </Text>
                <Pressable
                  onPress={() =>
                    navigation.navigate("Main", { screen: "Shop" })
                  }
                >
                  <Text className="text-sm font-bold text-navy underline">
                    Browse catalog
                  </Text>
                </Pressable>
              </View>
              <View className="mt-3 flex-row flex-wrap justify-between">
                {featured.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() =>
                      navigation.push("ProductDetail", { productId: p.id })
                    }
                    className="mb-3 w-[48%] overflow-hidden rounded-2xl border border-line bg-card p-3"
                  >
                    <View className="h-24 items-center justify-center overflow-hidden rounded-xl bg-mist">
                      {galleryImages(p)[0] ? (
                        <Image
                          source={{ uri: galleryImages(p)[0] }}
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
                      {p.name}
                    </Text>
                    <Text className="mt-1 text-xs font-black text-navy">
                      {p.priceLabel}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* CTA */}
          <View className="px-5 pt-6">
            <View className="rounded-2xl bg-ink p-5">
              <Text className="text-xs font-black uppercase tracking-[0.24em] text-gold">
                Need a starting point?
              </Text>
              <Text className="mt-2 font-display text-xl font-bold tracking-tight text-white">
                Use the open tools or bring us the brief.
              </Text>
              <View className="mt-4 flex-row flex-wrap gap-3">
                <Pressable
                  onPress={() => navigation.push("Tools")}
                  className="rounded-full bg-card px-5 py-3"
                >
                  <Text className="text-sm font-black text-ink">
                    Open tools
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => navigation.push("Contact")}
                  className="rounded-full border border-white/40 px-5 py-3"
                >
                  <Text className="text-sm font-black text-white">
                    Contact GENUM
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </>
      }
    </ScrollView>
  );
}
