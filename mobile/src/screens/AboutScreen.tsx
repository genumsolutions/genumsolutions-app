// =====================================================================
// AboutScreen - company overview (native UI).
// Live stats from the same DB the storefront reads (products + project
// categories), bundled fallback when the read has not resolved yet.
// =====================================================================
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { getProducts } from "../services/productService";
import { getProjectCategories } from "../services/projectCategoryService";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList, "About">;

// Mirrors the website /about shop-links row. Shop and 3D products are bottom
// TABS (navigate through Main); Projects and Open tools are plain STACK
// routes pushed directly — they have no tab. The earlier draft typed all
// four as Main tab screens, which type-checked against a locally invented
// param type but pointed two buttons at screens that are not tabs.
const SHOP_LINKS: (
  | { label: string; tab: "Shop" | "Printing" }
  | { label: string; route: "Projects" | "Tools" }
)[] = [
  { label: "Shop components", tab: "Shop" },
  { label: "3D products", tab: "Printing" },
  { label: "Projects", route: "Projects" },
  { label: "Open tools", route: "Tools" },
];

const STATIC_STATS = [
  { value: "25+", label: "projects completed" },
  { value: "10+", label: "years in engineering" },
  { value: "50+", label: "clients served" },
  { value: "500+", label: "students trained" },
];

const points = [
  {
    icon: "cpu" as const,
    title: "Robotics kits & components",
    body: "Controllers, motors, sensors, and full robot-car platforms sourced and tested in Kathmandu.",
  },
  {
    icon: "printer" as const,
    title: "3D & 2D printing",
    body: "Prototypes, spare parts, and signage printed to spec with materials advice included.",
  },
  {
    icon: "book-open" as const,
    title: "School STEM packages",
    body: "Kits, curriculum, teacher training, and coaching bundled into a single pilot program.",
  },
  {
    icon: "tool" as const,
    title: "Custom projects & labs",
    body: "IoT, AI prototypes, workshop setups, and lab consultation delivered end to end.",
  },
];

// Compute live stats from the product catalog (same DB the storefront reads),
// mirroring the website's /about liveCounts — all FOUR rows, in its order:
// components, models, projects, then the project-category count. The app used
// to publish only the first and third, which is why getProjectCategories sat
// imported and unused here.
type LiveStat = [string, string];

function computeLiveStats(
  products: ReturnType<typeof getProducts> extends Promise<infer T> ? T : never,
  projectCategoryCount: number,
): LiveStat[] {
  const active = products.filter((p) => p.active !== false);
  const electronic = active.filter(
    (p) =>
      !["Robot Cars", "Pre-packaged Kits"].includes(p.category) &&
      p.category?.trim().toLowerCase() !== "3d models" &&
      p.productType !== "Project package",
  ).length;
  const models = active.filter(
    (p) => p.category?.trim().toLowerCase() === "3d models",
  ).length;
  const projectPackages = active.filter(
    (p) =>
      p.productType === "Project package" || p.category === "Pre-packaged Kits",
  ).length;
  return [
    [String(electronic), "electronic components in store"],
    [String(models), "3D models printed on demand"],
    [String(projectPackages), "project packages & builds"],
    // 2026-11-13: this used to read `projectCategoryCount || 3`, mirroring an
    // old website fallback that invented a count. The website shows the real
    // length now (and a refresh note when every count is zero), so match it.
    [String(projectCategoryCount), "project categories supported"],
  ];
}

export function AboutScreen() {
  const navigation = useNavigation<Nav>();
  const [liveStats, setLiveStats] = useState<LiveStat[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const hasLiveStats = liveStats.some(([value]) => Number(value) > 0);

  useEffect(() => {
    let active = true;
    // Both reads feed the same four rows; a failing categories read still
    // lets the product counts render (and vice-versa), like the website.
    Promise.all([getProducts(), getProjectCategories().catch(() => [])])
      .then(([products, categories]) => {
        if (active) {
          setLiveStats(computeLiveStats(products, categories.length));
        }
      })
      .catch(() => {
        if (active) setLiveStats([]);
      })
      .finally(() => {
        if (active) setStatsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <ScrollView
      className="flex-1 bg-surface"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
    >
      <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
        About
      </Text>
      <Text className="mt-1 font-display text-2xl font-bold leading-tight tracking-tight text-ink">
        Engineering with a reason to exist.
      </Text>
      <Text className="mt-3 text-sm leading-6 text-muted">
        GENUM brings a decade of telecom, IoT, embedded systems, project
        delivery, and STEAM education experience into a company built for
        practical technology.
      </Text>

      {/* Stats row — mirrors website /about stat cards */}
      {/* 2026-11-13: the two four-up number rows sat unlabelled on top of each
          other (static "25+ projects completed" above a live package count),
          so they read as a contradiction. Each row is named now. */}
      <Text className="mt-6 text-xs font-black uppercase tracking-[0.24em] text-navy">
        Track record
      </Text>
      <View className="mt-3 space-y-3">
        <View className="flex-row flex-wrap gap-3">
          {STATIC_STATS.map((s) => (
            <View key={s.label} className="flex-1">
              <View className="border-t-2 border-ink pt-3">
                <Text className="font-display text-2xl font-bold text-ink">
                  {s.value}
                </Text>
                <Text className="mt-1 text-xs text-muted">{s.label}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Live store stats — mirrors website /about liveCounts section */}
      {statsLoading ? (
        <View className="mt-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <View
              key={i}
              className="mb-2 h-16 animate-pulse rounded-2xl border border-line bg-card"
            />
          ))}
        </View>
      ) : (
        <View className="mt-5 rounded-2xl border border-line bg-card p-4">
          <View className="flex-row flex-wrap items-baseline justify-between gap-2">
            <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
              In the store today
            </Text>
            <Text className="text-xs font-medium text-muted">
              Same catalog the storefront reads
            </Text>
          </View>
          {hasLiveStats ? (
            <View className="mt-4 flex-row flex-wrap gap-3">
              {liveStats.map(([value, label]) => (
                <View key={label} className="min-w-[40%] flex-1">
                  <Text className="font-display text-2xl font-bold text-navy">
                    {value}
                  </Text>
                  <Text className="mt-1 text-xs leading-5 text-muted">
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text className="mt-3 text-sm leading-6 text-muted">
              Catalog figures are refreshing — open the Shop or 3D Products tab
              to see what is listed right now.
            </Text>
          )}
        </View>
      )}

      {/* Cross-link CTAs — mirrors website /about shop-links row */}
      <View className="mt-5">
        <View className="flex-row flex-wrap gap-2">
          {SHOP_LINKS.map((link) => (
            <Pressable
              key={link.label}
              onPress={() => {
                if ("tab" in link) {
                  navigation.navigate("Main", { screen: link.tab });
                } else {
                  navigation.push(link.route);
                }
              }}
              className="rounded-full border border-line px-4 py-2 active:opacity-60"
            >
              {/* No `transition`/`hover:` here: those are CSS-only and would
                  silently do nothing on native. Pressable feedback is the
                  `active:opacity-60` above, the same idiom HomeScreen uses. */}
              <Text className="text-xs font-black text-navy">{link.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* How we work — mirrors website /about how-we-work section */}
      <View className="mt-6">
        <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
          How we work
        </Text>
        <Text className="mt-2 font-display text-xl font-bold text-ink">
          Make the complex useful.
        </Text>
        <Text className="mt-3 text-sm leading-6 text-muted">
          GENUM started with a fascination for how things communicate wirelessly
          and grew through telecom infrastructure, embedded systems, smart
          automation, cloud-connected devices, and technical education. The
          company now gives that experience a home: products people can build
          with, services that solve real problems, and training that leaves
          people more capable than when they arrived.
        </Text>
        <Text className="mt-3 text-sm leading-6 text-muted">
          Our working values are simple: innovation with evidence, collaboration
          with clear ownership, and continuous growth through testing and
          sharing.
        </Text>
      </View>

      {/* What we do — mirrors website /about what-we-do 4-card grid */}
      <View className="mt-6">
        <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
          What we do
        </Text>
        <Text className="mt-2 font-display text-xl font-bold text-ink">
          Our work in practice.
        </Text>
        <View className="mt-3 space-y-3">
          <View className="flex-row items-start rounded-2xl border border-line bg-card p-4">
            <View className="shrink-0">
              <Feather name="shopping-bag" size={18} color="#1e3a8a" />
            </View>
            <View className="ml-3 min-w-0 flex-1">
              {/* No numberOfLines: the website renders these four as ArticleCard
                  <h3>s, unclamped, so the app must not clip them either. */}
              <Text className="text-base font-bold text-ink">
                Products & components
              </Text>
              <Text className="mt-1 text-sm leading-5 text-muted">
                Robotics kits, controllers, sensors, motors, and modules —
                sourced, tested, and ready to build with.
              </Text>
              <Text className="mt-2 text-xs font-bold text-navy">
                Browse catalog
              </Text>
            </View>
          </View>
          <View className="flex-row items-start rounded-2xl border border-line bg-card p-4">
            <View className="shrink-0">
              <Feather name="layers" size={18} color="#1e3a8a" />
            </View>
            <View className="ml-3 min-w-0 flex-1">
              {/* No numberOfLines: the website renders these four as ArticleCard
                  <h3>s, unclamped, so the app must not clip them either. */}
              <Text className="text-base font-bold text-ink">
                Projects & robot cars
              </Text>
              <Text className="mt-1 text-sm leading-5 text-muted">
                Assembled robot-car builds and named project packages for
                teaching, automation, and prototyping.
              </Text>
              <Text className="mt-2 text-xs font-bold text-navy">
                See projects
              </Text>
            </View>
          </View>
          <View className="flex-row items-start rounded-2xl border border-line bg-card p-4">
            <View className="shrink-0">
              <Feather name="bar-chart" size={18} color="#1e3a8a" />
            </View>
            <View className="ml-3 min-w-0 flex-1">
              {/* No numberOfLines: the website renders these four as ArticleCard
                  <h3>s, unclamped, so the app must not clip them either. */}
              <Text className="text-base font-bold text-ink">
                Services & training
              </Text>
              <Text className="mt-1 text-sm leading-5 text-muted">
                Web delivery, 3D printing, school STEM packages, teacher
                workshops, and curriculum programs.
              </Text>
              <Text className="mt-2 text-xs font-bold text-navy">
                View services
              </Text>
            </View>
          </View>
          <View className="flex-row items-start rounded-2xl border border-line bg-card p-4">
            <View className="shrink-0">
              <Feather name="tool" size={18} color="#1e3a8a" />
            </View>
            <View className="ml-3 min-w-0 flex-1">
              {/* No numberOfLines: the website renders these four as ArticleCard
                  <h3>s, unclamped, so the app must not clip them either. */}
              <Text className="text-base font-bold text-ink">Open tools</Text>
              <Text className="mt-1 text-sm leading-5 text-muted">
                Free and open-source tools for makers, educators, and
                developers.
              </Text>
              <Text className="mt-2 text-xs font-bold text-navy">
                Explore tools
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Technical foundation — mirrors website /about competencies grid */}
      <View className="mt-6">
        <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
          Technical foundation
        </Text>
        <Text className="mt-2 font-display text-xl font-bold text-ink">
          Capabilities we bring to every project.
        </Text>
        {/* Same rounded panel as the what-we-do cards above; this grid used to
            be the only place on /about drawing square, gold-ruled cards. */}
        <View className="mt-3 space-y-3">
          <View className="rounded-2xl border border-line bg-card p-4">
            <View className="min-w-0 flex-1">
              <Text className="text-base font-bold text-ink">
                Microcontrollers
              </Text>
              <Text className="mt-1 text-sm leading-5 text-muted">
                ESP32, Arduino, STM32, and ARM-based systems
              </Text>
            </View>
          </View>
          <View className="rounded-2xl border border-line bg-card p-4">
            <View className="min-w-0 flex-1">
              <Text className="text-base font-bold text-ink">
                Cloud platforms
              </Text>
              <Text className="mt-1 text-sm leading-5 text-muted">
                AWS, Azure, Google Cloud, Firebase, and IoT backends
              </Text>
            </View>
          </View>
          <View className="rounded-2xl border border-line bg-card p-4">
            <View className="min-w-0 flex-1">
              <Text className="text-base font-bold text-ink">IoT networks</Text>
              <Text className="mt-1 text-sm leading-5 text-muted">
                WiFi, Bluetooth, LoRaWAN, MQTT, CoAP, and Zigbee
              </Text>
            </View>
          </View>
          <View className="rounded-2xl border border-line bg-card p-4">
            <View className="min-w-0 flex-1">
              <Text className="text-base font-bold text-ink">
                Embedded systems
              </Text>
              <Text className="mt-1 text-sm leading-5 text-muted">
                Firmware, real-time systems, and hardware-software integration
              </Text>
            </View>
          </View>
          <View className="rounded-2xl border border-line bg-card p-4">
            <View className="min-w-0 flex-1">
              <Text className="text-base font-bold text-ink">Programming</Text>
              <Text className="mt-1 text-sm leading-5 text-muted">
                Python, C++, JavaScript, Java, and Embedded C
              </Text>
            </View>
          </View>
          <View className="rounded-2xl border border-line bg-card p-4">
            <View className="min-w-0 flex-1">
              <Text className="text-base font-bold text-ink">
                STEAM education
              </Text>
              <Text className="mt-1 text-sm leading-5 text-muted">
                Curriculum development, mentoring, and technical workshops
              </Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
