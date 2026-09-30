// =====================================================================
// UserPreferencesScreen — the USER hub (R4-7, owner 2026-09-30: "Robot
// preferences → User preferences ... every car/device the user has EVER
// connected through ANY transport ... set · edit · delete per device,
// easily, from one place").
//
// Two sections, one place:
//   ① MY DEVICES — the union of cloud car_profiles + locally-known
//      transports (deviceProfileRegistryService). Per device: rename (set),
//      edit (name/auto-join/router mirror without a live link), forget
//      (delete — app memory + cloud row, NEVER the car itself). Each row
//      shows its identity, transport flavors (fw:/MAC/wifi:), and last
//      saved drive snapshot. Offline-first: the list renders from phone
//      memory instantly; the cloud merges in; locally-known devices not
//      yet in the DB auto-push (pushLocalDevicesToCloud on focus).
//   ② ROBOT PROFILES — the existing per-robot code values / parameters /
//      telemetry channels (robot_user_settings, untouched scope).
//
// Free users see the Pro explanation; signed-out users see sign-in.
// =====================================================================
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useApp } from "../context/AppContext";
import {
  fetchRobotSettings,
  saveRobotSetting,
  deleteRobotSetting,
  type RobotSettingRow,
} from "../services/robotSettingsService";
import {
  fetchKnownDevices,
  renameDevice,
  editDevice,
  forgetDevice,
  pushLocalDevicesToCloud,
  type KnownDevice,
} from "../services/deviceProfileRegistryService";
import { feedbackTap } from "../services/hapticsService";

type DraftPair = { key: string; value: string };

function parseValue(raw: string): string | number | boolean {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed !== "" && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  return trimmed;
}

export function UserPreferencesScreen() {
  const { user, isSignedIn, isPro } = useApp();
  const [rows, setRows] = useState<RobotSettingRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // ── R4-7: MY DEVICES state ──
  const [devices, setDevices] = useState<KnownDevice[]>([]);
  const [devicesLoaded, setDevicesLoaded] = useState(false);
  const [devicesOffline, setDevicesOffline] = useState(false);
  // The device row with the rename editor open (null = none). Editing is a
  // one-field inline form — "set" must be easy, per the owner.
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deviceBusy, setDeviceBusy] = useState(false);

  // Editor state: null = list view; a robotId = editing (or '' = creating).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftRobotId, setDraftRobotId] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftPairs, setDraftPairs] = useState<DraftPair[]>([
    { key: "", value: "" },
  ]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchRobotSettings();
    setRows(result.rows);
    setOffline(result.offline);
    setLoaded(true);
  }, []);

  // R4-7: devices read (local-first, cloud merge) + the offline-first push
  // (locally-known devices not yet in the DB land there once online).
  const loadDevices = useCallback(async () => {
    const result = await fetchKnownDevices();
    setDevices(result.devices);
    setDevicesOffline(result.offline);
    setDevicesLoaded(true);
  }, []);

  useEffect(() => {
    if (isSignedIn) {
      void load();
      void loadDevices();
    }
  }, [isSignedIn, load, loadDevices]);
  useFocusEffect(
    useCallback(() => {
      if (!isSignedIn) return;
      void load();
      void loadDevices();
      void pushLocalDevicesToCloud().then((r) => {
        if (r.pushed > 0) void loadDevices();
      });
    }, [isSignedIn, load, loadDevices]),
  );

  // ── R4-7 device actions (set · edit · delete) ──
  async function commitRename(key: string) {
    setDeviceBusy(true);
    const result = await renameDevice(key, renameDraft);
    setDeviceBusy(false);
    if (!result.ok) {
      Alert.alert("Could not rename", result.error ?? "Try again.");
      return;
    }
    setRenamingKey(null);
    feedbackTap();
    void loadDevices();
  }

  function confirmForget(device: KnownDevice) {
    Alert.alert(
      "Forget this device?",
      `${device.name} is removed from this app and your account. The car itself is not touched — link it again any time.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Forget",
          style: "destructive",
          onPress: () => {
            setDeviceBusy(true);
            void forgetDevice(device.profileKey).then((r) => {
              setDeviceBusy(false);
              if (!r.ok) {
                Alert.alert("Could not forget", r.error ?? "Try again.");
                return;
              }
              feedbackTap();
              void loadDevices();
            });
          },
        },
      ],
    );
  }

  // EDIT: toggles the router auto-join preference from the hub (a real,
  // editable device preference) — the drive settings themselves belong to
  // the live Control Panel; the hub edits identity + preferences.
  async function toggleAutoJoin(device: KnownDevice) {
    const current = device.settings?.autoJoinRouter ?? true;
    setDeviceBusy(true);
    const result = await editDevice(device.profileKey, {
      autoJoinRouter: !current,
    });
    setDeviceBusy(false);
    void loadDevices();
    if (!result.ok) {
      Alert.alert("Could not update", result.error ?? "Try again.");
      return;
    }
    feedbackTap();
  }

  function startCreate() {
    setEditingId("");
    setDraftRobotId("");
    setDraftName("");
    setDraftPairs([{ key: "", value: "" }]);
    setSaved(false);
    setError("");
  }

  function startEdit(row: RobotSettingRow) {
    setEditingId(row.robotId);
    setDraftRobotId(row.robotId);
    setDraftName(row.robotName);
    setDraftPairs(
      Object.entries(row.settings)
        .map(([key, value]) => ({
          key,
          value: Array.isArray(value) ? value.join(", ") : String(value),
        }))
        .concat([{ key: "", value: "" }]),
    );
    setSaved(false);
    setError("");
  }

  async function save() {
    const id = draftRobotId.trim().toLowerCase().replace(/\s+/g, "-");
    if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(id)) {
      setError(
        "Robot id is required (letters, numbers, dashes — max 64 chars).",
      );
      return;
    }
    const settings: Record<string, unknown> = {};
    for (const pair of draftPairs) {
      const key = pair.key.trim();
      if (!key) continue;
      if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(key)) {
        setError(
          `Setting name "${key}" is invalid (letters, numbers, dots, dashes).`,
        );
        return;
      }
      // Comma-separated values become string arrays (telemetry channel picks).
      settings[key] =
        pair.value.includes(",") && pair.value.trim() !== ""
          ? pair.value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          : parseValue(pair.value);
    }
    setBusy(true);
    setError("");
    const result = await saveRobotSetting(id, draftName.trim() || id, settings);
    setBusy(false);
    if (result.ok) {
      setSaved(true);
      setEditingId(null);
      void load();
    } else {
      setError(result.error || "Could not save.");
    }
  }

  async function remove(robotId: string) {
    setBusy(true);
    await deleteRobotSetting(robotId);
    setBusy(false);
    void load();
  }

  if (!isSignedIn) {
    return (
      <View className="flex-1 items-center justify-center bg-surface px-8">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-navy">
          <Feather name="user" size={26} color="#ffffff" />
        </View>
        <Text className="mt-4 font-display text-xl font-bold text-ink">
          Sign in required
        </Text>
        <Text className="mt-1 text-center text-sm text-muted">
          Robot preference profiles are saved to your GENUM account.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-surface"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      <View className="flex-row items-center justify-between">
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
            Settings
          </Text>
          <Text className="mt-2 font-display text-2xl font-bold text-ink">
            User preferences
          </Text>
          <Text className="mt-1 text-sm text-muted">
            Every device you've connected — plus your per-robot profiles. One
            place, synced to your account.
          </Text>
        </View>
        <View
          className={`ml-2 shrink-0 rounded-full px-2.5 py-1 ${isPro ? "bg-navy" : "bg-mist"}`}
        >
          <Text
            className={`text-[10px] font-black uppercase tracking-wide ${isPro ? "text-white" : "text-muted"}`}
          >
            {isPro ? "Pro" : "Free"}
          </Text>
        </View>
      </View>

      {!isPro ? (
        <View className="mt-5 rounded-2xl border border-line bg-card p-5">
          <View className="flex-row items-center">
            <Feather name="lock" size={18} color="#1e3a8a" />
            <Text className="ml-2 text-sm font-bold text-ink">
              A Pro feature
            </Text>
          </View>
          <Text className="mt-2 text-sm leading-5 text-muted">
            Upgrade your account to Pro to save per-robot profiles: custom
            command values, PID and speed parameters, and the telemetry channels
            you care about. The Remote window unlocks with Pro too. Contact
            GENUM Solutions to upgrade
            {user?.email ? ` (account: ${user.email})` : ""}.
          </Text>
        </View>
      ) : (
        <>
          {offline && (
            <Text className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700">
              Offline — showing your last saved profiles.
            </Text>
          )}
          {saved && (
            <Text className="mt-3 rounded-xl bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700">
              Profile saved.
            </Text>
          )}
          {error !== "" && (
            <Text className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-xs font-bold text-red-600">
              {error}
            </Text>
          )}

          {/* ── ① MY DEVICES (R4-7) ─────────────────────────────────── */}
          {isPro && (
            <View className="mt-5">
              <View className="flex-row items-center gap-1">
                <Feather name="hard-drive" size={12} color="#1e3a8a" />
                <Text className="text-[11px] font-black uppercase tracking-wide text-muted">
                  My devices ({devices.length})
                </Text>
                {devicesOffline ? (
                  <View className="ml-auto rounded-full bg-amber-100 px-2 py-0.5">
                    <Text className="text-[10px] font-bold text-amber-700">
                      offline — phone memory
                    </Text>
                  </View>
                ) : (
                  <View className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5">
                    <Text className="text-[10px] font-bold text-emerald-700">
                      synced
                    </Text>
                  </View>
                )}
              </View>

              {!devicesLoaded ? (
                <View className="mt-4 items-center">
                  <ActivityIndicator color="#1e3a8a" />
                </View>
              ) : devices.length === 0 ? (
                <View className="mt-3 rounded-2xl border border-line bg-card p-4">
                  <Text className="text-sm text-muted">
                    No devices yet — connect a car from the Control Panel and it
                    appears here automatically, whichever way you linked it.
                  </Text>
                </View>
              ) : (
                <View className="mt-3 space-y-3">
                  {devices.map((device) => (
                    <View
                      key={device.profileKey}
                      className="rounded-2xl border border-line bg-card p-4"
                    >
                      <View className="flex-row items-center justify-between">
                        <View className="min-w-0 flex-1">
                          <Text
                            numberOfLines={1}
                            className="text-sm font-bold text-ink"
                          >
                            {device.name}
                          </Text>
                          <Text
                            numberOfLines={1}
                            className="mt-0.5 font-mono text-[11px] text-muted"
                          >
                            {device.profileKey}
                            {device.uniqueId &&
                            !device.profileKey.startsWith("fw:")
                              ? ` · #${device.uniqueId}`
                              : ""}
                          </Text>
                        </View>
                        {device.mirrored ? (
                          <View className="ml-2 shrink-0 rounded-full bg-emerald-100 px-2 py-0.5">
                            <Text className="text-[10px] font-bold text-emerald-700">
                              synced
                            </Text>
                          </View>
                        ) : (
                          <View className="ml-2 shrink-0 rounded-full bg-mist px-2 py-0.5">
                            <Text className="text-[10px] font-bold text-muted">
                              {device.source === "local"
                                ? "this phone"
                                : "account"}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Drive snapshot + transport flavor */}
                      {device.settings ? (
                        <Text
                          numberOfLines={1}
                          className="mt-1.5 text-[11px] text-muted"
                        >
                          {device.settings.modeId ?? "no mode"}
                          {device.settings.speed != null
                            ? ` · speed ${device.settings.speed}/255`
                            : ""}
                          {device.settings.autoJoinRouter != null
                            ? ` · auto-join ${device.settings.autoJoinRouter ? "on" : "off"}`
                            : ""}
                        </Text>
                      ) : (
                        <Text className="mt-1.5 text-[11px] text-muted">
                          Linked but not configured yet.
                        </Text>
                      )}
                      {device.savedRouters.length > 0 ? (
                        <Text
                          numberOfLines={1}
                          className="mt-0.5 text-[11px] text-muted"
                        >
                          Routers: {device.savedRouters.join(", ")}
                        </Text>
                      ) : null}

                      {/* Actions — set · edit · delete (owner: easily, from
                          one place) */}
                      {renamingKey === device.profileKey ? (
                        <View className="mt-2.5 flex-row items-center gap-2">
                          <TextInput
                            value={renameDraft}
                            onChangeText={setRenameDraft}
                            autoFocus
                            placeholder="Device name"
                            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink"
                          />
                          <Pressable
                            onPress={() => void commitRename(device.profileKey)}
                            disabled={deviceBusy}
                            className="rounded-full bg-navy px-3 py-2 disabled:opacity-50"
                          >
                            <Text className="text-xs font-black text-white">
                              Save
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => setRenamingKey(null)}
                            className="rounded-full border border-line px-3 py-2"
                          >
                            <Text className="text-xs font-bold text-ink">
                              Cancel
                            </Text>
                          </Pressable>
                        </View>
                      ) : (
                        <View className="mt-2.5 flex-row items-center gap-2">
                          <Pressable
                            onPress={() => {
                              feedbackTap();
                              setRenamingKey(device.profileKey);
                              setRenameDraft(device.name);
                            }}
                            className="rounded-full border border-line px-3 py-1.5"
                            hitSlop={6}
                          >
                            <Text className="text-xs font-bold text-navy">
                              Set name
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              void toggleAutoJoin(device);
                            }}
                            disabled={deviceBusy}
                            className="rounded-full border border-line px-3 py-1.5 disabled:opacity-50"
                            hitSlop={6}
                          >
                            <Text className="text-xs font-bold text-navy">
                              Auto-join:{" "}
                              {device.settings?.autoJoinRouter === false
                                ? "off"
                                : "on"}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => confirmForget(device)}
                            disabled={deviceBusy}
                            className="ml-auto rounded-full border border-red-200 px-3 py-1.5 disabled:opacity-50"
                            hitSlop={6}
                          >
                            <Text className="text-xs font-bold text-red-600">
                              Forget
                            </Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* ── ② ROBOT PROFILES (existing scope, untouched) ─────────── */}
          {editingId === null ? (
            <>
              {!loaded ? (
                <View className="mt-8 items-center">
                  <ActivityIndicator color="#1e3a8a" />
                </View>
              ) : rows.length === 0 ? (
                <View className="mt-5 rounded-2xl border border-line bg-card p-5">
                  <Text className="text-sm text-muted">
                    No robot profiles yet. Add your first one.
                  </Text>
                </View>
              ) : (
                <View className="mt-4 space-y-3">
                  {rows.map((row) => (
                    <View
                      key={row.robotId}
                      className="rounded-2xl border border-line bg-card p-4"
                    >
                      <View className="flex-row items-center justify-between">
                        <View className="min-w-0 flex-1">
                          <Text
                            numberOfLines={1}
                            className="text-sm font-bold text-ink"
                          >
                            {row.robotName || row.robotId}
                          </Text>
                          <Text
                            numberOfLines={1}
                            className="mt-0.5 font-mono text-[11px] text-muted"
                          >
                            {row.robotId} · {Object.keys(row.settings).length}{" "}
                            keys
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => startEdit(row)}
                          className="ml-2 shrink-0 rounded-full border border-line px-3 py-1.5"
                          hitSlop={6}
                        >
                          <Text className="text-xs font-bold text-navy">
                            Edit
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              <Pressable
                onPress={startCreate}
                className="mt-4 flex-row items-center justify-center gap-2 rounded-full bg-navy py-3"
              >
                <Feather name="plus" size={15} color="#fff" />
                <Text className="text-sm font-black text-white">
                  Add robot profile
                </Text>
              </Pressable>
            </>
          ) : (
            <View className="mt-4 rounded-2xl border border-line bg-card p-4">
              <Text className="text-xs font-bold uppercase tracking-wide text-muted">
                Robot id
              </Text>
              <TextInput
                value={draftRobotId}
                onChangeText={setDraftRobotId}
                editable={editingId === ""}
                placeholder="e.g. 2wd1m-basic"
                autoCapitalize="none"
                className="mt-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              />
              <Text className="mt-3 text-xs font-bold uppercase tracking-wide text-muted">
                Display name
              </Text>
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                placeholder="e.g. My 2WD car"
                className="mt-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              />

              <Text className="mt-4 text-xs font-bold uppercase tracking-wide text-muted">
                Settings (name → value; comma-separate lists)
              </Text>
              {draftPairs.map((pair, index) => (
                <View key={index} className="mt-2 flex-row items-center gap-2">
                  <TextInput
                    value={pair.key}
                    onChangeText={(text) =>
                      setDraftPairs((cur) =>
                        cur.map((p, i) =>
                          i === index ? { ...p, key: text } : p,
                        ),
                      )
                    }
                    placeholder="e.g. maxSpeed"
                    autoCapitalize="none"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink"
                  />
                  <TextInput
                    value={pair.value}
                    onChangeText={(text) =>
                      setDraftPairs((cur) =>
                        cur.map((p, i) =>
                          i === index ? { ...p, value: text } : p,
                        ),
                      )
                    }
                    placeholder="e.g. 200 or F,B,STOP"
                    autoCapitalize="none"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink"
                  />
                  {draftPairs.length > 1 && (
                    <Pressable
                      onPress={() =>
                        setDraftPairs((cur) =>
                          cur.filter((_, i) => i !== index),
                        )
                      }
                      className="shrink-0 rounded-full border border-red-200 px-2.5 py-1.5"
                      hitSlop={6}
                    >
                      <Feather name="x" size={12} color="#dc2626" />
                    </Pressable>
                  )}
                </View>
              ))}
              <Pressable
                onPress={() =>
                  setDraftPairs((cur) => [...cur, { key: "", value: "" }])
                }
                className="mt-2 self-start rounded-full border border-line px-3 py-1.5"
                hitSlop={6}
              >
                <Text className="text-xs font-bold text-navy">
                  + Add setting
                </Text>
              </Pressable>

              <View className="mt-4 flex-row gap-3">
                <Pressable
                  onPress={save}
                  disabled={busy}
                  className="rounded-full bg-gold px-5 py-2.5"
                >
                  <Text className="text-xs font-black text-ink">
                    {busy ? "Saving…" : "Save profile"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setEditingId(null)}
                  className="rounded-full border border-line px-5 py-2.5"
                >
                  <Text className="text-xs font-bold text-ink">Cancel</Text>
                </Pressable>
                {editingId !== "" && (
                  <Pressable
                    onPress={() => void remove(editingId)}
                    disabled={busy}
                    className="rounded-full border border-red-200 px-5 py-2.5"
                  >
                    <Text className="text-xs font-bold text-red-600">
                      Delete
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}
