// CarProfileCard — the per-device profile surface for the Connections Hub
// (owner ⑨⑩, elaborated this round): this car's stable identity, the
// last-saved drive settings the profile will restore (mode / speed / steer /
// trim / joystick — exactly what syncs to the user's account and comes back
// on any phone), saved-router mirror, Wi-Fi history (names only) and the
// smart-link auto-join toggle.
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
import type { CarLogRow } from "./carLogModel";

/** P7: the viewer's per-car log facts, already merged/scoped by the hub. */
export type CarLogView = {
  rows: CarLogRow[];
  total: number;
  /** When the viewer learned it (fetch or restore); null = nothing yet. */
  fetchedAt: number | null;
};

export type CarProfileCardProps = {
  /** Stable profile key — `fw:<id>` / BT MAC / `wifi:<identity>`. */
  profileKey: string | null;
  /** This car's remembered device prefs (restored on link). */
  savedPrefs: DevicePrefs | null;
  /** Smart-link toggle: auto-join a saved router on car selection. Optional — only shown when provided. */
  autoJoinRouter?: boolean;
  setAutoJoinRouter?: (value: boolean) => void;
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
  /** P7: this car's bug/reset/freeze log (merged + scoped by the caller). */
  carLog?: CarLogView | null;
  onRefreshCarLog?: () => void;
  /** P7: clear-on-car action; rendered only with a confirmed dialog behind it. */
  onClearCarLog?: () => void;
  confirmClearCarLog?: boolean;
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

/**
 * P7 (owner item D): the per-car BUG/RESET/FREEZE log viewer — a disclosure
 * inside THIS car's profile, never a merged fleet feed (F-90). Rows arrive
 * already merged (car ring + this phone's ring + cloud) and labelled with
 * their source; the viewer adds none of its own opinions:
 *
 *   * the never-fetched state is honest ("no log read yet — Refresh"),
 *     not an empty-list lie;
 *   * a cached/offline view is LABELLED with when it was read, so a stale
 *     fact is never presented as the present (F-87 shape borrowed from P4);
 *   * Clear on car requires CONFIRM — the parent passes `confirmClearCarLog`
 *     only when a confirm dialog backs it; the viewer refuses otherwise.
 */
function CarLogDisclosure({
  log,
  onRefresh,
  clearCarLog,
  confirmClearCarLog,
}: {
  log: CarLogView | null;
  onRefresh?: () => void;
  clearCarLog?: () => void;
  confirmClearCarLog?: boolean;
}) {
  if (!onRefresh && !log) return null;
  return (
    <View
      className="mt-3 rounded-lg border border-line bg-surface p-2"
      testID="car-log-viewer"
    >
      <View className="flex-row items-center gap-1">
        <Feather name="alert-triangle" size={12} color="#b45309" />
        <Text className="text-[10px] font-black uppercase tracking-widest text-navy">
          Car log · bugs / resets / freezes
        </Text>
        {onRefresh ? (
          <Feather
            name="refresh-cw"
            size={12}
            color="#1e3a8a"
            onPress={onRefresh}
            accessibilityLabel="Refresh the car's event log"
            testID="car-log-refresh"
          />
        ) : null}
      </View>
      {log?.fetchedAt ? (
        <Text className="mt-0.5 text-[10px] text-muted" testID="car-log-stamp">
          {log.total === 0
            ? "The car reports no events — nothing has gone wrong that it recorded."
            : `${log.total} event${log.total === 1 ? "" : "s"} · read ${new Date(log.fetchedAt).toLocaleTimeString()}`}
        </Text>
      ) : (
        <Text className="mt-0.5 text-[10px] text-muted">
          No log read yet — Refresh reads the car's own event ring.
        </Text>
      )}
      {(log?.rows ?? []).slice(0, 12).map((r, i) => (
        <View
          key={`${r.source}-${r.at}-${i}`}
          className="mt-1 flex-row items-start gap-1"
        >
          <View
            className={`rounded-full px-1.5 py-0.5 ${
              r.chip === "reset"
                ? "bg-red-100"
                : r.chip === "freeze"
                  ? "bg-amber-100"
                  : r.chip === "bug"
                    ? "bg-orange-100"
                    : "bg-slate-100"
            }`}
          >
            <Text className="text-[9px] font-black text-ink">
              {r.chip.toUpperCase()} · {r.source.toUpperCase()}
            </Text>
          </View>
          <Text
            numberOfLines={2}
            className="min-w-0 flex-1 text-[10px] text-ink"
          >
            {r.line}
          </Text>
        </View>
      ))}
      {clearCarLog ? (
        <Text
          onPress={() => {
            if (!confirmClearCarLog) return;
            clearCarLog();
          }}
          accessibilityRole="button"
          accessibilityLabel="Clear the car's event log"
          testID="car-log-clear"
          className="mt-1.5 text-[10px] font-bold text-red-700"
        >
          Clear on car
        </Text>
      ) : null}
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
  carLog,
  onRefreshCarLog,
  onClearCarLog,
  confirmClearCarLog,
}: CarProfileCardProps) {
  const showAutoJoin =
    autoJoinRouter !== undefined && setAutoJoinRouter !== undefined;
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

      {/* R4-1 (owner): router sections are STA-flavored — on an AP link (or a
          Bluetooth link) they describe a network shape the car is NOT using,
          which read as "unrelated things about other routers". They render
          ONLY when the car is actually on a router (staSsid) or when there is
          no live method-flavor to show (idle), so the profile card matches the
          CURRENT connection method exactly. The smart-link toggle below stays
          visible in every state: it controls what the car does NEXT, not what
          it is on now. */}
      {(onRouter || history.length === 0) && (
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
                  <Text className="text-[10px] font-semibold text-navy">
                    {n}
                  </Text>
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
      )}

      {/* Wi-Fi history — names only, newest first; same method-aware rule. */}
      {history.length > 0 && onRouter && (
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

      {/* Smart-link toggle — the user's control for auto-join (owner ③). Only rendered when props are provided. */}
      {showAutoJoin && (
        <View className="mt-3 flex-row items-center gap-3 border-t border-line pt-3">
          <View className="min-w-0 flex-1">
            <Text className="text-xs font-bold text-ink">
              Auto-join saved router (app)
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
      )}

      {/* P7/owner item D: THIS car's bug/reset/freeze log — a per-car fact
          under the per-car profile. Rendered only when the caller wires it. */}
      <CarLogDisclosure
        log={carLog ?? null}
        onRefresh={onRefreshCarLog}
        clearCarLog={onClearCarLog}
        confirmClearCarLog={confirmClearCarLog === true}
      />
    </View>
  );
}
