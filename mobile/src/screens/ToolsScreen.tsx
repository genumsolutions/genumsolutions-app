// =====================================================================
// ToolsScreen — the Control Panel.
//
// U-81 (owner 2026-10-03): the page order is now CAR -> CONNECT -> PROJECTS.
//
// It used to open with the project catalog — kind headers, seven category
// pills, then a detail card carrying a tagline, a description and a capability
// checklist — with the car itself reachable only after all of it. The owner's
// complaint was "too confusing and shows unnecessary data too much", and for
// someone whose car had just swallowed a newly added router that ordering is
// exactly backwards: product copy first, the one fact they came for last.
//
// So the top of the page is now the car's own instrument panel — a status dot,
// the reported mode / network / address, and six readings drawn as hairline
// tiles with uppercase micro-labels and monospaced values, matching the
// website's RoboCar control panel (genumsolutions-website/components/
// RoboCarControl.tsx). Every reading is either something the car reported or an
// em dash; the formatting and its edge cases are tested in telemetryFormat.ts.
//
// The catalog is unchanged and still chooses which deck opens. It just stopped
// being the first thing on the screen.
// =====================================================================
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import {
  useRoute,
  type RouteProp,
  useNavigation,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import type { RootStackParamList } from "../navigation/types";
import { useControlHub } from "../components/tools/useControlHub";
import { ProjectInfo } from "../components/tools/ProjectInfo";
import {
  ConnectionSection,
  type ConnectionMethodId,
} from "../components/tools/connection";
import { CarProfileCard } from "../components/tools/CarProfileCard";
import {
  CarStatusLine,
  TelemetryStrip,
} from "../components/tools/TelemetryStrip";
import {
  buildCarTelemetry,
  describeCar,
} from "../components/tools/telemetryFormat";
import { feedbackTap } from "../services/hapticsService";
import {
  KIND_GROUPS,
  PROJECT_CATEGORIES,
  PRODUCT_CATEGORY_TO_SLUG,
  type ProjectCategory,
} from "../config/project-catalog";
import { getProjectCategories } from "../services/projectCategoryService";
import {
  DECK_OPEN_DEBOUNCE_MS,
  queueDeckOpen,
} from "../components/tools/toolsScreenFlow";

type Route = RouteProp<RootStackParamList, "Tools">;

type FeatherIcon = ComponentProps<typeof Feather>["name"];

/**
 * ① (owner bench report 2026-10-02 evening: the Control Panel is "too
 * confusing and shows unnecessary datas too much"): settings/about blocks
 * fold away behind a section header row, so the page LEADS with control.
 * Deliberately NOT a card — it sits on the page like the Connections header
 * (double-card nesting would add back the noise this removes).
 */
function SectionDisclosure({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View className="mt-6">
      <Pressable
        onPress={() => {
          feedbackTap();
          setOpen((v) => !v);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        className="flex-row items-center gap-2 py-1"
      >
        <Text className="min-w-0 flex-1 text-xs font-black uppercase tracking-widest text-navy">
          {title}
        </Text>
        <Feather
          name={open ? "chevron-up" : "chevron-down"}
          size={14}
          color="#64748b"
        />
      </Pressable>
      {open ? <View className="mt-3">{children}</View> : null}
    </View>
  );
}

const CATEGORY_ICONS: Record<string, FeatherIcon> = {
  robocar: "cpu",
  "home-automation": "home",
  "smart-farm": "droplet",
  "smart-city": "zap",
  drones: "send",
};

const CAPABILITY_LABELS: Record<string, string> = {
  directional: "Directional drive",
  servo: "Servo steering",
  pid: "PID tuning",
  "start-stop": "Run / Stop routines",
  relay: "Relay outputs",
  sensor: "Live sensors",
  weblink: "Web dashboard link",
  slider: "Sliders",
  gimbal: "Gimbal pan/tilt",
  altitude: "Altitude control",
};

export function ToolsScreen() {
  const route = useRoute<Route>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // DB-driven categories with hardcoded fallback
  const [categories, setCategories] =
    useState<ProjectCategory[]>(PROJECT_CATEGORIES);
  // U-48: pull-to-refresh — re-read the admin-editable category list.
  const [refreshing, setRefreshing] = useState(false);
  const loadCategories = useCallback(async () => {
    try {
      setCategories(await getProjectCategories());
    } catch {
      // keep the bundled fallback
    }
  }, []);
  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadCategories();
    } finally {
      setRefreshing(false);
    }
  }, [loadCategories]);

  const routeCategory = (() => {
    const raw = route.params?.category;
    if (!raw) return undefined;
    if (PRODUCT_CATEGORY_TO_SLUG[raw]) return PRODUCT_CATEGORY_TO_SLUG[raw];
    if (categories.some((c) => c.slug === raw)) return raw;
    return undefined;
  })();

  // Shared hook — connection state + everything the Remote window handoff
  // needs (the window runs its own hub instance on the same transports).
  //
  // U-68: the screen no longer destructures the connection API. It passes the
  // WHOLE hub to ConnectionSection, which reads what it needs — so a field
  // added for the connection layer is picked up in one place instead of
  // needing a screen edit, and this list cannot rot into a second, partial
  // view of the connection. What remains destructured is what the UNTOUCHED
  // parts of the page read directly.
  const hub = useControlHub(routeCategory);
  const {
    connected,
    sppStatus,
    deviceName,
    sppSupported,
    wifiConnected,
    activeMode,
    telemetry,
    carApName,
    carSsid,
  } = hub;

  // U-68 (2026-10-02): the connection truth used to be read in three places
  // on this page — the banner (`useActiveTransport` + the manager's label),
  // the picker (`useActiveTransport` again), and the hub's own state. That is
  // how "connected but the UI says no" happened. There is now ONE reader: the
  // ConnectionSection derives everything from the hub's state, and the hub
  // registers the transport registry itself (see `ensureTransportsRegistered`
  // in useControlHub) so the manager never depends on a screen being mounted.
  // `anyLinked`/`linkVerified` stay here only for the Saved-settings card.
  const anyLinked = sppStatus === "connected" || wifiConnected;
  const linkVerified = hub.linkVerified || sppStatus === "connected";

  // R4-4 history (kept, because the reasoning still holds): the home-router
  // method used to get its own RouterPanel with an edit affordance (the car
  // stores one password per SSID, so an edit is a re-ADD — T-48a) and a USE
  // action, and the car-AP method never rendered it. That "no mixing" rule was
  // right about not mixing, and wrong about WHY: the panel was mounted per
  // METHOD, which is why router management did not exist on Bluetooth or on
  // the car's own hotspot even though those commands ride any live link (D8).
  // Router management is now a property of the CONNECTION and lives inside
  // ConnectionSection, for every method.
  // U-68 (2026-10-02): the connection method the new ConnectionSection shows.
  // Kept here rather than inside the section so the choice survives the
  // section re-rendering as car truth arrives. It is a SELECTION, never a
  // claim about what is connected — the section derives that from the link.
  //
  // This replaces the old `pickedMethod` (a TransportId driven by
  // TransportPicker's onPickedChange) together with `editingRouter`,
  // `isHomeRouterMethod` and the whole F-59 handoff state block. The router
  // edit state now lives inside the section's own form, because the form
  // lives there.
  const [connMethod, setConnMethod] = useState<ConnectionMethodId | null>(null);

  // F-57 / round-close: when the transport disconnects, reset the selected category
  // so the control panel returns to a clean default state rather than staying
  // stuck on a connected-category view. The sections remain in the same order
  // (U-53-4) — we only reset the active slice.
  useEffect(() => {
    // UX-3: only a transport loss resets the selection — never a mount, a
    // pull-to-refresh, or the user's own earlier pill tap.
    if (!connected && !userTouchedSelectionRef.current) {
      setSelectedSlug(categories[0]!.slug);
    }
  }, [connected, categories]);

  // UX-2: a queued deck-open must not fire after the screen is gone.
  useEffect(() => {
    return () => {
      deckOpenTimerRef.current?.();
      deckOpenTimerRef.current = null;
    };
  }, []);

  // Category organizer
  const [selectedSlug, setSelectedSlug] = useState<string>(
    routeCategory && categories.some((c) => c.slug === routeCategory)
      ? routeCategory
      : categories[0]!.slug,
  );
  // ①: the category detail card leads COMPACT (name · tagline · hardware);
  // the long description + capability checklist hide behind a Details toggle
  // and reset when the category changes (each category's card starts clean).
  const [showCategoryDetails, setShowCategoryDetails] = useState(false);
  // UX-3 (2026-10-02 audit): a pill tap is USER INTENT. The reset below is
  // for TRANSPORT LOSS only — this flag lets it tell the difference, so a
  // mount/refresh cycle can no longer snap a chosen category back to the
  // first pill.
  const userTouchedSelectionRef = useRef(false);
  const selectCategory = useCallback((slug: string) => {
    userTouchedSelectionRef.current = true;
    setShowCategoryDetails(false);
    setSelectedSlug(slug);
  }, []);
  const category: ProjectCategory =
    categories.find((c) => c.slug === selectedSlug) ?? categories[0]!;

  const isRobocarCat = category.slug === "robocar";
  const remoteLabel = isRobocarCat
    ? "Drive deck"
    : category.slug === "drones"
      ? "Flight deck"
      : "Relay & sensor deck";

  // A1 (2026-09-24): DB capability_labels (admin-editable per category) win;
  // unknown keys fall back to the static map, then the raw key.
  const capabilityLabel = useCallback(
    (cap: string) =>
      category.capabilityLabels?.[cap] ?? CAPABILITY_LABELS[cap] ?? cap,
    [category.capabilityLabels],
  );

  // UX-2 (2026-10-02 audit): the deck-open debounce's cancel handle lives in a
  // ref — the tap handler must never create-and-cancel a timer in the same
  // tick (the old inline cleanup made the button a dead end on the first
  // press), and queueDeckOpen replaces an in-flight timer on a double-tap.
  const deckOpenTimerRef = useRef<(() => void) | null>(null);
  // Connection tab:
  // U-68: the disconnect-confirm overlay is GONE. It existed because two
  // disconnect flows disagreed (the picker's footer fired immediately, the
  // F-47 dialog was unreachable dead state). The rebuilt section has exactly
  // ONE disconnect button, so there is nothing left to disagree about, and a
  // dialog with a single path behind it is ceremony (F-67).

  // Values the (untouched) Saved-settings card still reads. These describe the
  // car, not the connection UI, so they stay here rather than in the section.
  const carIdentityId = telemetry.id ?? null;
  const staSsid =
    telemetry.connected === true
      ? telemetry.ssid?.trim() || carSsid || null
      : null;
  const apName = staSsid ? null : carApName?.trim() || "4WDCar_Wifi";

  // F-69 (U-68): the keyboard used to cover the field being typed into, and
  // the tap that focused it was also consumed by the keyboard opening. Two
  // halves: `keyboardShouldPersistTaps="handled"` on the ScrollView below, and
  // this handler — the focused field reports its own offset and we scroll it
  // above the keyboard. One handler for the whole page, so every future input
  // gets it for free.
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollInputIntoView = useCallback((y: number) => {
    // A generous offset so the field clears the keyboard on a short screen.
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: true });
  }, []);

  return (
    // F-47: a flex-1 SCREEN-WIDE root wrapping the ScrollView. The disconnect
    // confirm used to live INSIDE the ScrollView, so its "absolute inset-0"
    // mapped to the whole scrollable PAGE (taller than the screen) and the
    // dialog centered on the page — far below the fold in portrait. Rendered
    // as a SIBLING of the ScrollView under this root, "inset-0" is the
    // visible screen and the dialog truly centers on the phone.
    <View className="flex-1 bg-mist">
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* ---- U-81: the CAR leads. ------------------------------------
            The page used to open with the project catalog — kind headers,
            seven category pills, then a detail card carrying a tagline, a
            description and a capability checklist — and only reached the car
            after all of it. For someone asking "where is my car / the router
            I just added is not there", that is the exact wrong first screen:
            three screens of product copy, then the one fact they came for.

            So the order is now car -> connect -> catalogue. The catalog is
            still here and still does its job (it picks which deck opens); it
            just stopped being the thing you read first.

            Visual language is the website's RoboCar control panel
            (genumsolutions-website/components/RoboCarControl.tsx): a status
            dot, hairline tiles, uppercase micro-labels, monospaced values.
            Every reading is either something the car said or an em dash. */}
        <View className="rounded-2xl border border-line bg-card p-4 shadow-card">
          <View className="flex-row items-center justify-between">
            <Text className="text-[11px] font-bold uppercase tracking-[0.24em] text-navy">
              Control Panel
            </Text>
            <Text className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">
              {connected ? "Live" : "No link"}
            </Text>
          </View>
          <CarStatusLine
            connected={connected}
            summary={describeCar({
              id: telemetry.id,
              mode: telemetry.mode,
              ssid: telemetry.ssid ?? carSsid,
              ip: telemetry.ip,
            })}
          />
          <TelemetryStrip
            fields={buildCarTelemetry({
              connected,
              // The car's REPORTED mode, not `activeMode` — the app can be
              // showing a mode the car has not confirmed, and the strip is
              // where that difference has to be visible.
              mode: telemetry.mode,
              speed: telemetry.speed,
              rssi: telemetry.rssi,
              signal: telemetry.signal,
              uptimeMs: telemetry.uptimeMs,
              freeHeap: telemetry.freeHeap,
              linkLabel: wifiConnected
                ? "Wi-Fi"
                : sppStatus === "connected"
                  ? "Bluetooth"
                  : deviceName
                    ? "Bluetooth"
                    : null,
            })}
          />
        </View>

        {/* Connections — the ONE connection surface (owner ①②). Placed
            directly under the car status because connecting IS the next
            action, not something to scroll to. */}
        <View className="mt-4 rounded-2xl border border-line bg-card p-4 shadow-card">
          <Text className="text-[11px] font-bold uppercase tracking-[0.24em] text-navy">
            Connect
          </Text>

          {/* U-68 (2026-10-02): the connection layer, rebuilt. This ONE
              section replaces ConnectionBanner, the F-59 handoff card,
              TransportPicker and RouterPanel on this page - they were four
              card shapes with four behaviours (F-67). The Remote screen still
              mounts RouterPanel and is deliberately untouched.

              `keyboardShouldPersistTaps="handled"` + the scroll-into-view
              handler above are F-69: the tap that focuses a field must not be
              eaten by the keyboard opening, and the focused field must end up
              above it. */}
          <ConnectionSection
            hub={hub}
            method={connMethod}
            onMethodChange={setConnMethod}
            onInputFocus={scrollInputIntoView}
            feedbackTap={feedbackTap}
          />
        </View>

        {/* ---- Projects: the catalog, now BELOW the car (U-81). ----
            Unchanged in behaviour — same pills, same order, same detail card
            and the same deck CTA. It only lost the top of the page. */}
        <Text className="mt-6 text-[11px] font-bold uppercase tracking-[0.24em] text-navy">
          Projects
        </Text>

        {/* Category selector — grouped by KIND (PLAN-2026-09-29 §2): two slim
            section headers above the same 7 pills in the SAME order as before.
            Kinds are visual labels only — nothing merges, nothing moves. */}
        {KIND_GROUPS.map((group) => {
          const pills = categories.filter((c) => group.slugs.includes(c.slug));
          if (pills.length === 0) return null;
          return (
            <View key={group.label} className="mt-3">
              <Text className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">
                {group.label}
              </Text>
              <View className="mt-2 flex-row flex-wrap gap-2">
                {pills.map((c) => {
                  const active = c.slug === selectedSlug;
                  return (
                    <Pressable
                      key={c.slug}
                      onPress={() => selectCategory(c.slug)}
                      accessibilityRole="button"
                      accessibilityLabel={`Select category ${c.name}`}
                      accessibilityState={{ selected: active }}
                      className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-2 ${active ? "bg-navy" : "border border-line bg-card"}`}
                    >
                      <Feather
                        name={CATEGORY_ICONS[c.slug] ?? "box"}
                        size={13}
                        color={active ? "#fff" : "#1e3a8a"}
                      />
                      <Text
                        numberOfLines={1}
                        className={`text-xs font-bold ${active ? "text-white" : "text-navy"}`}
                      >
                        {c.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}

        {/* Category detail card */}
        <View
          key={category.slug}
          className="mt-4 rounded-2xl border border-line bg-card p-5 shadow-card"
        >
          <View className="flex-row items-start">
            <View className="h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-light">
              <Feather
                name={CATEGORY_ICONS[category.slug] ?? "box"}
                size={18}
                color="#1e3a8a"
              />
            </View>
            <View className="ml-3 min-w-0 flex-1">
              <Text
                numberOfLines={1}
                className="font-display text-lg font-bold text-ink"
              >
                {category.name}
              </Text>
              <Text
                numberOfLines={1}
                className="mt-0.5 text-xs font-semibold text-navy"
              >
                {category.tagline}
              </Text>
            </View>
          </View>
          {/* ①: description + capability checklist fold behind Details —
              the card leads with what the page is FOR (the deck CTA). */}
          <Pressable
            onPress={() => {
              feedbackTap();
              setShowCategoryDetails((v) => !v);
            }}
            accessibilityRole="button"
            accessibilityState={{ expanded: showCategoryDetails }}
            accessibilityLabel={`Details about ${category.name}`}
            className="mt-3 flex-row items-center gap-1.5"
          >
            <Text className="text-xs font-bold text-sky-700 dark:text-sky-300">
              {showCategoryDetails ? "Hide details" : "Details"}
            </Text>
            <Feather
              name={showCategoryDetails ? "chevron-up" : "chevron-down"}
              size={13}
              color="#64748b"
            />
          </Pressable>
          {showCategoryDetails ? (
            <>
              <Text className="mt-2 text-sm leading-5 text-muted">
                {category.description}
              </Text>
              <View className="mt-3 flex-row flex-wrap gap-x-4 gap-y-1.5">
                {category.capabilities.map((cap) => (
                  <View key={cap} className="flex-row items-center gap-1.5">
                    <Feather name="check-circle" size={12} color="#059669" />
                    <Text className="text-xs font-semibold text-ink">
                      {capabilityLabel(cap)}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          <Pressable
            onPress={() => {
              feedbackTap();
              setSelectedSlug(categories[0]!.slug);
              // UX-2: replace any in-flight timer; the cancel handle is stored
              // (cleared on unmount below) — never consumed in this same tick.
              deckOpenTimerRef.current = queueDeckOpen(
                deckOpenTimerRef.current,
                () => {
                  navigation.navigate("RemoteControl", {
                    category: category.slug,
                  });
                },
              );
            }}
            accessibilityRole="button"
            accessibilityLabel={`Open ${category.name} remote window`}
            className="mt-4 flex-row items-center justify-center gap-2 rounded-full bg-navy py-3"
          >
            <Feather name="target" size={15} color="#fff" />
            <Text className="text-sm font-black text-white">
              Open {remoteLabel} · {category.name}
            </Text>
            <Feather name="arrow-right" size={15} color="#fff" />
          </Pressable>
        </View>

        {/* ①: the saved-settings block folds away — control surfaces lead. */}
        <SectionDisclosure title="Saved settings">
          <CarProfileCard
            profileKey={hub.profileKey}
            savedPrefs={hub.savedPrefs}
            autoJoinRouter={hub.autoJoinRouter}
            setAutoJoinRouter={(v) => {
              feedbackTap();
              hub.setAutoJoinRouter(v);
            }}
            profileSync={hub.profileSync}
            modeName={
              hub.savedPrefs?.modeId
                ? (hub.carModes.find((m) => m.id === hub.savedPrefs?.modeId)
                    ?.name ?? null)
                : null
            }
            carLabel={
              sppStatus === "connected"
                ? deviceName || null
                : wifiConnected
                  ? apName
                  : null
            }
            carId={carIdentityId}
            staSsid={staSsid}
            apName={apName}
          />
        </SectionDisclosure>

        {/* About this project — the page ENDS here (owner 2026-09-29: the
          teaching card after it is gone). ①: folded behind a disclosure so
          the page ends on CONTROL, not reading material. */}
        <SectionDisclosure title="About this project">
          <ProjectInfo mode={activeMode} categorySlug={category.slug} />
        </SectionDisclosure>
      </ScrollView>
    </View>
  );
}
