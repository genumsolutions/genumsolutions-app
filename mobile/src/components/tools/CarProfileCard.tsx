// CarProfileCard — the per-device profile surface for the Connections Hub
// (owner ⑨⑩, elaborated this round): this car's stable identity, the
// last-saved drive settings the profile will restore (mode / speed / steer /
// trim / joystick — exactly what syncs to the user's account and comes back
// on any phone), saved-router mirror, Wi-Fi history (names only) and the
// smart-link auto-join toggle (owner ③).
//
// The profile lives in DevicePrefs via useControlHub (persistPrefs), which
// now also mirrors every save to the user's cloud `car_profiles` row — the
// sync badge reports that mirror's state. Values are edited where they
// belong (drive deck / WiFi panel / Router settings); this card shows what
// will be restored and carries the user knobs that are not drive inputs.
import React from "react";
import { Switch, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { DevicePrefs } from "./types";
import type { ProfileSyncState } from "../../services/carProfileService";

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
  /** Cloud mirror state for this profile (null = no attempt yet). */
  profileSync?: ProfileSyncState | null;
  /** Resolved display name of the saved mode (catalogue-resolved). */
  modeName?: string | null;
};

function SyncBadge({ sync }: { sync: ProfileSyncState | null | undefined }) {
  if (!sync) return null;
  if (sync.state === "synced") {
    return (
      <View className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5">
        <Text className="text-[10px] font-bold text-emerald-700">
          synced to account
        </Text>
      </View>
    );
  }
  if (sync.state === "adopted") {
    return (
      <View className="ml-auto rounded-full bg-sky-100 px-2 py-0.5">
        <Text className="text-[10px] font-bold text-sky-700">
          restored from account
        </Text>
      </View>
    );
  }
  return (
    <View className="ml-auto rounded-full bg-amber-100 px-2 py-0.5">
      <Text className="text-[10px] font-bold text-amber-700">
        saved on this phone
      </Text>
    </View>
  );
}

function SettingRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <Feather name={icon} size={11} color="#64748b" />
      <Text className="w-16 text-xs font-bold text-navy">{label}</Text>
      <Text numberOfLines={1} className="flex-1 text-xs text-ink">
        {value}
      </Text>
    </View>
  );
}

export function CarProfileCard({
  profileKey,
  savedPrefs,
  autoJoinRouter,
  setAutoJoinRouter,
  carLabel,
  carId,
  staSsid,
  apName,
  profileSync,
  modeName,
}: CarProfileCardProps) {
  const routers = savedPrefs?.savedRouters ?? [];
  const history = savedPrefs?.wifiHistory ?? [];
  const onRouter = !!staSsid;
  const networkName = staSsid || apName || null;
  const signedIn = profileSync?.state !== "offline";

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

      {/* Identity — stable across renames and across BT/WiFi links. */}
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

      {/* Last-saved drive settings — what sync restores on the next link.
          Mode-specific: steer/trim rows only render for cars that use them
          (2WD1M servo steer; 4WD4M trim; self-balance shows mode + speed). */}
      <View className="mt-3 rounded-lg bg-slate-50 p-2.5">
        <View className="flex-row items-center gap-1">
          <Text className="text-[11px] font-bold uppercase tracking-wide text-muted">
            Last saved on this car
          </Text>
          <View className="ml-auto">
            <SyncBadge sync={profileSync} />
          </View>
        </View>
        <View className="mt-2 gap-1.5">
          <SettingRow
            icon="zap"
            label="Mode"
            value={modeName || savedPrefs?.modeId || "—"}
          />
          <SettingRow
            icon="activity"
            label="Speed"
            value={
              savedPrefs?.speed != null ? `${savedPrefs.speed} / 255` : "—"
            }
          />
          {(savedPrefs?.steerLimit != null && savedPrefs.steerLimit !== 90) ||
          modeName === "2WD1M" ? (
            <SettingRow
              icon="move"
              label="Steer"
              value={
                savedPrefs?.steerLimit != null
                  ? `${savedPrefs.steerLimit}°`
                  : "—"
              }
            />
          ) : null}
          {savedPrefs?.trim != null && savedPrefs.trim !== 0 ? (
            <SettingRow
              icon="sliders"
              label="Trim"
              value={`${savedPrefs.trim > 0 ? "+" : ""}${savedPrefs.trim}`}
            />
          ) : null}
          <SettingRow
            icon="git-merge"
            label="Control"
            value={
              savedPrefs?.useJoystick
                ? `Joystick · ${savedPrefs.joystickLayout ?? "dual"}`
                : "D-pad"
            }
          />
        </View>
        {!signedIn && (
          <Text className="mt-2 text-[11px] leading-4 text-amber-700">
            Sign in to mirror this profile to your account — it then restores
            automatically on any phone that links this car.
          </Text>
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
