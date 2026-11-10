// =====================================================================
// ServicesScreen - reads the shared `services` Supabase table.
// Customer-facing filter organization (Phase F): search + category chips,
// result count, and pagination — all derived from the DB rows only.
// Also mirrors website ServicesPage: training programs, pilot costs,
// and curriculum highlights (same DB tables, same DB-first + fallback).
// =====================================================================
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { CategoryDropdown } from "../components/CategoryDropdown";
import { PagePager } from "../components/PagePager";
import { getServices } from "../services/serviceService";
import { getProgramsContent } from "../services/programsService";
import {
  pilotCosts as fallbackPilotCosts,
  stemProjectHighlights as fallbackHighlights,
  trainingPrograms as fallbackPrograms,
} from "../config/programs";
import type { Service } from "../types";

export function ServicesScreen() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("All");
  const [page, setPage] = useState(1);
  const pageSize = 6;
  const [trainingPrograms, setTrainingPrograms] = useState(fallbackPrograms);
  const [pilotCosts, setPilotCosts] = useState(fallbackPilotCosts);
  const [stemProjectHighlights, setStemProjectHighlights] =
    useState(fallbackHighlights);
  const [programsReady, setProgramsReady] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      getServices()
        .then((svcs) => {
          if (active) setServices(svcs);
        })
        .catch(() => {
          if (active) setServices([]);
        }),
      getProgramsContent()
        .then((pc) => {
          if (active) {
            setTrainingPrograms(pc.trainingPrograms);
            setPilotCosts(pc.pilotCosts);
            setStemProjectHighlights(pc.stemProjectHighlights);
            setProgramsReady(true);
          }
        })
        .catch(() => {
          if (active) setProgramsReady(true);
        }),
    ]).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  // Reset pagination whenever the category changes.
  useEffect(() => {
    setPage(1);
  }, [category]);

  const categories = useMemo(
    () => [
      "All",
      ...Array.from(new Set(services.map((s) => s.category).filter(Boolean))),
    ],
    [services],
  );

  const visible = useMemo(() => {
    return services.filter((s) => {
      const matchesCategory = category === "All" || s.category === category;
      return matchesCategory && s.active !== false;
    });
  }, [services, category]);

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const pageItems = visible.slice((page - 1) * pageSize, page * pageSize);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-surface"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
    >
      <View className="mb-3">
        <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
          Services
        </Text>
        <Text className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">
          What GENUM does
        </Text>

        {/* Category filter (derived from the DB rows) */}
        {categories.length > 1 && (
          <View className="mt-2">
            <CategoryDropdown
              value={category}
              options={categories}
              onChange={setCategory}
              placeholder="All categories"
              title="Filter by category"
            />
          </View>
        )}

        {visible.length > 0 && (
          <Text className="mt-3 text-xs font-bold uppercase tracking-wide text-muted">
            {visible.length} service{visible.length === 1 ? "" : "s"}
          </Text>
        )}
      </View>

      {/* Services grid — mirrors website ServicesGrid /app/services */}
      {visible.length > 0 ? (
        <View className="mt-4">
          {pageItems.map((item) => (
            <View
              key={item.id}
              className="mb-3 overflow-hidden rounded-2xl border border-line bg-card p-5"
            >
              <View className="flex-row items-center justify-between">
                <Text
                  numberOfLines={1}
                  className="min-w-0 flex-1 font-display text-lg font-bold leading-snug text-ink"
                >
                  {item.name}
                </Text>
                {item.tag ? (
                  <View className="ml-2 shrink-0 rounded-full bg-sky px-2.5 py-0.5">
                    <Text className="text-xs font-black uppercase text-navy">
                      {item.tag}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text className="mt-2 text-sm leading-6 text-muted">
                {item.description}
              </Text>
              <Text className="mt-3 text-sm font-black text-navy">
                {item.priceLabel}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View className="items-center py-16">
          <Feather name="inbox" size={40} color="#cbd5e1" />
          <Text className="mt-3 text-sm text-muted">
            No services in this category. Contact us for details.
          </Text>
        </View>
      )}

      {/* Pagination — mirrors website numbered page buttons */}
      <View className="mt-4">
        <PagePager page={page} totalPages={totalPages} onPage={setPage} />
      </View>

      {/* Training programs — mirrors website /services training section */}
      {programsReady && trainingPrograms.length > 0 && (
        <View className="mt-10 border-t border-line pt-6">
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
                  <Text className="font-bold text-ink">Outcome:</Text>{" "}
                  {prog.outcome}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Illustrative pilot costing — mirrors website /services pilot section */}
      {programsReady && pilotCosts.length > 0 && (
        <View className="mt-10 border-t border-line pt-6">
          <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
            Illustrative pilot costing
          </Text>
          <Text className="mt-2 font-display text-2xl font-bold text-navy">
            NPR 8,40,000
          </Text>
          <Text className="mt-1 text-xs font-normal text-muted">
            illustrative total
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
      )}

      {/* Curriculum highlights — mirrors website /services curriculum section */}
      {programsReady && Object.keys(stemProjectHighlights).length > 0 && (
        <View className="mt-10 border-t border-line pt-6">
          <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
            100+ project curriculum
          </Text>
          <View className="mt-4 space-y-3">
            {Object.entries(stemProjectHighlights).map(([ages, projects]) => (
              <View
                key={ages}
                className="rounded-2xl border border-line bg-card p-4"
              >
                <Text className="text-xs font-black uppercase tracking-widest text-gold">
                  {ages}
                </Text>
                <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
                  {projects.map((p) => (
                    <Text key={p} className="text-sm leading-6 text-muted">
                      • {p}
                    </Text>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}
