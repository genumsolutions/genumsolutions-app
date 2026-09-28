// =====================================================================
// ConnectionsTeaching — "Every way the car can be controlled".
//
// Owner ⑦: register EVERY possible comm method — nothing missing — with
// detailed per-method text. The picker (above) is the chooser; this list
// (below "About this project") is the FULL teaching registry. Each row:
//   • Live today   → the transport exists and its row in the picker works.
//   • Roadmap      → registered, `isSupported()` false until firmware /
//                     infrastructure lands (tap for what it would take).
//   • Add-on       → needs extra hardware, not a software path at all.
// The data source is the SAME adapters registry the picker uses, so a
// method can never be missing here.
// =====================================================================
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTransportList } from "../../transports/linkManagerHooks";
import type { Transport, TransportRadio } from "../../transports/types";

const RADIO_ICON: Record<
  TransportRadio,
  React.ComponentProps<typeof Feather>["name"]
> = {
  bluetooth: "bluetooth",
  wifi: "wifi",
  internet: "globe",
  wired: "hard-drive",
};

const RADIO_LABEL: Record<TransportRadio, string> = {
  bluetooth: "Bluetooth",
  wifi: "WiFi",
  internet: "Internet & cloud",
  wired: "Cable",
};

/** Teaching-only items with NO transport (hardware add-ons, by design). */
const ADDONS: Array<{
  label: string;
  radio: TransportRadio;
  blurb: string;
  intro: string;
  note: string;
}> = [
  {
    label: "RF handset (MAN)",
    radio: "bluetooth",
    blurb: "The bundled RF remote drives the car without any phone",
    intro:
      "The RF hand-set is a dedicated radio link between the handset and the car — no phone and no network involved. The MAN mode accepts drive from it.",
    note: "Add-on: needs the RF handset hardware (not bundled with every car). When MAN is selected on the remote and the handset is powered, it drives directly.",
  },
];

function Row({ t }: { t: Transport }) {
  const [open, setOpen] = useState(false);
  const live = t.isSupported();
  return (
    <View className="rounded-xl border border-line bg-card px-3 py-2.5">
      <View className="flex-row items-center gap-2">
        <Feather name={RADIO_ICON[t.radio]} size={14} color="#1e3a8a" />
        <Text className="min-w-0 flex-1 text-[12px] font-black text-ink dark:text-white">
          {t.label}
        </Text>
        <View
          className={`rounded-full px-2 py-0.5 ${
            live
              ? "bg-emerald-500/15"
              : t.roadmapNote
                ? "bg-amber-500/15"
                : "bg-slate-500/15"
          }`}
        >
          <Text
            className={`text-[9px] font-black uppercase tracking-wide ${
              live
                ? "text-emerald-700 dark:text-emerald-300"
                : t.roadmapNote
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-slate-600 dark:text-slate-300"
            }`}
          >
            {live ? "Live today" : t.roadmapNote ? "Roadmap" : "Add-on"}
          </Text>
        </View>
      </View>
      <Text className="mt-1 text-[11px] leading-4 text-muted">{t.blurb}</Text>
      {t.teaching ? (
        <>
          <Pressable
            onPress={() => setOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            hitSlop={4}
            className="mt-1.5 flex-row items-center gap-1 self-start"
          >
            <Feather
              name={open ? "chevron-up" : "chevron-down"}
              size={12}
              color="#0284c7"
            />
            <Text className="text-[11px] font-black text-sky-700 dark:text-sky-300">
              {open ? "Hide details" : "How it works + what it needs"}
            </Text>
          </Pressable>
          {open ? (
            <View className="mt-2 rounded-lg border border-line/70 bg-mist px-2.5 py-2">
              <Text className="text-[12px] leading-4 text-ink dark:text-white">
                {t.teaching.intro}
              </Text>
              <Text className="mt-2 text-[10px] font-black uppercase tracking-wide text-muted">
                When to use it
              </Text>
              <Text className="text-[12px] leading-4 text-muted">
                {t.teaching.when}
              </Text>
              <Text className="mt-2 text-[10px] font-black uppercase tracking-wide text-muted">
                Connect + verify
              </Text>
              {t.teaching.steps.map((s, i) => (
                <View key={i} className="flex-row gap-1.5">
                  <Text className="text-[12px] leading-4 text-sky-700 dark:text-sky-300">
                    {i + 1}
                  </Text>
                  <Text className="flex-1 text-[12px] leading-4 text-ink dark:text-white">
                    {s}
                  </Text>
                </View>
              ))}
              {t.roadmapNote ? (
                <View className="mt-2 flex-row gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2">
                  <Feather name="clock" size={12} color="#d97706" />
                  <Text className="flex-1 text-[11px] font-bold leading-4 text-amber-700 dark:text-amber-400">
                    {t.roadmapNote}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export function ConnectionsTeaching() {
  const transports = useTransportList();
  const groups: Record<TransportRadio, Transport[]> = {
    bluetooth: [],
    wifi: [],
    internet: [],
    wired: [],
  };
  for (const t of transports) groups[t.radio].push(t);

  return (
    <View className="rounded-2xl border border-line bg-mist p-4">
      <View className="flex-row items-center gap-2">
        <Feather name="book-open" size={14} color="#1e3a8a" />
        <Text className="text-xs font-black uppercase tracking-widest text-navy">
          Every way the car can be controlled
        </Text>
      </View>
      <Text className="mt-1 text-[11px] leading-4 text-muted">
        Nothing is hidden — every method is listed here. Use the Connections
        section above to pick one; tap a row to read how it works, what it needs
        and what it would take to enable it.
      </Text>

      {(["bluetooth", "wifi", "internet", "wired"] as const).map((radio) => {
        const rows = groups[radio];
        if (rows.length === 0 && radio !== "bluetooth") return null;
        return (
          <View key={radio} className="mt-3">
            <Text className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-muted">
              {RADIO_LABEL[radio]}
            </Text>
            <View className="gap-1.5">
              {rows.map((t) => (
                <Row key={t.id} t={t} />
              ))}
              {radio === "bluetooth" ? (
                <View className="rounded-xl border border-dashed border-line px-3 py-2.5">
                  <View className="flex-row items-center gap-2">
                    <Feather name="radio" size={14} color="#1e3a8a" />
                    <Text className="min-w-0 flex-1 text-[12px] font-black text-ink dark:text-white">
                      {ADDONS[0]!.label}
                    </Text>
                    <View className="rounded-full bg-slate-500/15 px-2 py-0.5">
                      <Text className="text-[9px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        Add-on
                      </Text>
                    </View>
                  </View>
                  <Text className="mt-1 text-[11px] leading-4 text-muted">
                    {ADDONS[0]!.blurb}
                  </Text>
                  <Text className="mt-1.5 text-[11px] leading-4 text-amber-700 dark:text-amber-400">
                    {ADDONS[0]!.note}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        );
      })}

      <Text className="mt-3 text-[10px] leading-4 text-muted">
        Wiring paths matter too: an ESP32 can be the server (car runs the web
        page, phone connects to it) or the client (car joins your router). Both
        shapes are covered by the WiFi rows above; USB serial is the bench cable
        path.
      </Text>
    </View>
  );
}
