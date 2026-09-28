// CarProfileCard — the per-device profile surface for the Connections Hub
// (owner ⑨⑩): this car's stable identity, saved-router mirror, Wi-Fi history
// (names only) and the smart-link auto-join toggle (owner ③ — user-controlled).
// The profile lives in DevicePrefs via useControlHub (persistPrefs); this card
// renders it read-only-ish except the toggle, which is the user's control knob
// for "send saved router on car selection (with strength), else own AP".
import React from "react";
import { Switch, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { DevicePrefs } from "./types";

export type CarProfileCardProps = {
  /** Stable profile key — `fw:<id>` / BT MAC / `wifi:<identity>`. */
  profileKey: string | null;
  /** This car's remembered device prefs (restored on link). */
  savedPrefs: DevicePrefs | null;
  /** Smart-link toggle: auto-join a saved router on car selection. */
  autoJoinRouter: boolean;
  setAutoJoinRouter: (value: boolean) => void;
  /** Live identity from the open link (banner already shows it). */
  carLabel: string | null;
  carId: string | null;
  /** Current network the car reports (router ssid or null = own AP). */
  staSsid: string | null;
  apName: string | null;
};

export function CarProfileCard({
  profileKey,
  savedPrefs,
  autoJoinRouter,
  setAutoJoinRouter,
  carLabel,
  carId,
  staSsid,
  apName,
}: CarProfileCardProps) {
  const routers = savedPrefs?.savedRouters ?? [];
  const history = savedPrefs?.wifiHistory ?? [];
  const onRouter = !!staSsid;
  const networkName = staSsid || apName || null;

  return (
    <View className="mt-3 rounded-xl border border-line bg-surface p-4">
      <View className="flex-row items-center gap-1">
        <Feather name="tag" size={12} color="#1e3a8a" />
        <Text className="text-xs font-bold uppercase tracking-wide text-muted">
          Car profile
        </Text>
        {onRouter ? (
          <View className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5">
            <Text className="text-[10px] font-bold text-emerald-700">
              on router
            </Text>
          </View>
        ) : (
          <View className="ml-auto rounded-full bg-slate-100 px-2 py-0.5">
            <Text className="text-[10px] font-bold text-slate-500">
              own access point
            </Text>
          </View>
        )}
      </View>

      <View className="mt-3 gap-1.5">
        <View className="flex-row items-start gap-2">
          <Text className="w-20 text-xs font-bold text-navy">Car</Text>
          <Text numberOfLines={1} className="flex-1 text-xs text-ink">
            {carLabel || (savedPrefs?.name ?? "—")}
            {carId ? (
              <Text className="text-muted"> · {carId}</Text>
            ) : savedPrefs?.uniqueId ? (
              <Text className="text-muted"> · {savedPrefs.uniqueId}</Text>
            ) : null}
          </Text>
        </View>
        {profileKey?.startsWith("fw:") && (
          <View className="flex-row items-start gap-2">
            <Text className="w-20 text-xs font-bold text-navy">Board id</Text>
            <Text numberOfLines={1} className="flex-1 text-xs text-ink">
              {profileKey.slice(3)}
            </Text>
          </View>
        )}
        {networkName && (
          <View className="flex-row items-start gap-2">
            <Text className="w-20 text-xs font-bold text-navy">Network</Text>
            <Text numberOfLines={1} className="flex-1 text-xs text-ink">
              {networkName}
            </Text>
          </View>
        )}
      </View>

      {/* Saved routers — names only; the car stays the source of truth. */}
      <View className="mt-3">
        <Text className="text-[11px] font-bold uppercase tracking-wide text-muted">
          Saved routers ({routers.length})
        </Text>
        {routers.length === 0 ? (
          <Text className="mt-1 text-xs text-muted">
            None stored on this car yet — find one in Router settings.
          </Text>
        ) : (
          <View className="mt-1.5 flex-row flex-wrap gap-1.5">
            {routers.slice(0, 6).map((n) => (
              <View key={n} className="rounded-full bg-navy/10 px-2.5 py-1">
                <Text className="text-[10px] font-semibold text-navy">{n}</Text>
              </View>
            ))}
            {routers.length > 6 && (
              <View className="rounded-full bg-slate-100 px-2.5 py-1">
                <Text className="text-[10px] font-semibold text-slate-500">
                  +{routers.length - 6}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Wi-Fi history — names only, newest first. */}
      {history.length > 0 && (
        <View className="mt-3">
          <Text className="text-[11px] font-bold uppercase tracking-wide text-muted">
            Wi-Fi history
          </Text>
          <View className="mt-1.5 flex-row flex-wrap gap-1.5">
            {history.slice(0, 4).map((h) => (
              <View
                key={h.ssid}
                className="rounded-full bg-slate-100 px-2.5 py-1"
              >
                <Text className="text-[10px] font-semibold text-slate-600">
                  {h.ssid}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Smart-link toggle — the user's control for auto-join (owner ③). */}
      <View className="mt-3 flex-row items-center gap-3 border-t border-line pt-3">
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-bold text-ink">
            Auto-join saved router
          </Text>
          <Text className="mt-0.5 text-[11px] leading-4 text-muted">
            On car selection: join the strongest saved router the car hears —
            else stay on its own access point.
          </Text>
        </View>
        <Switch
          value={autoJoinRouter}
          onValueChange={(v) => {
            setAutoJoinRouter(v);
          }}
          disabled={!profileKey}
          trackColor={{ true: "#1e3a8a", false: "#e2e8f0" }}
        />
      </View>
    </View>
  );
}
