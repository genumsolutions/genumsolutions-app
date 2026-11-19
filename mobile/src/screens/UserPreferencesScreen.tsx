// =====================================================================
// UserPreferencesScreen — the USER hub, project-first (owner 2026-11-19).
//
// The hub used to be a flat list of connections. The owner's complaint:
// "it doesn't even show different project uniquely and the thing about each
// project and things that each project has as their telemetries" — a 4WD4M
// and a 2WD1M were two unlabeled rows, and their materials/health/logs had
// nowhere to live.
//
// Now one card = one PROJECT (canonical `FW_PROJECT` id, resolved through
// lib/projectIdentity):
//   • header — project name, its canonical id, how many units you own, and a
//     crash badge when any unit reported one;
//   • units — every device of that project, with its transport identity,
//     last-seen, saved drive state and the set/edit/forget actions;
//   • materials — the catalog's required-parts list for that project, ticked
//     per user and extendable with parts they bought (projectMaterialsService);
//   • health — this user's crash reports for that project's units.
// ② ROBOT PROFILES (per-robot code values / telemetry channel picks) stays
// below, unchanged.
//
// Offline-first: the list renders from phone memory instantly; cloud rows and
// crash reports merge in when the network allows.
// =====================================================================
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  forgetDevice,
  pushLocalDevicesToCloud,
  type KnownDevice,
} from "../services/deviceProfileRegistryService";
import {
  fetchUserCrashReports,
  type UserCrashReport,
} from "../services/crashReportService";
import {
  loadProjectMaterials,
  saveProjectMaterials,
  toggleProjectMaterial,
  addProjectMaterial,
  type ProjectMaterial,
} from "../services/projectMaterialsService";
import { resolveProject, type ProjectIdentity } from "../lib/projectIdentity";
import { feedbackTap } from "../services/hapticsService";

type DraftPair = { key: string; value: string };

type ProjectGroup = {
  identity: ProjectIdentity;
  devices: KnownDevice[];
};

function parseValue(raw: string): string | number | boolean {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed !== "" && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  return trimmed;
}

/** Does this crash report belong to this device? Board ids are `fw:<id>` keys. */
function crashMatchesDevice(
  crash: UserCrashReport,
  device: KnownDevice,
): boolean {
  if (!crash.boardId) return false;
  const board = crash.boardId;
  return (
    device.uniqueId === board ||
    device.uniqueId === `fw:${board}` ||
    device.profileKey === `fw:${board}` ||
    device.profileKey === board
  );
}

function relativeTime(ms: number | null): string {
  if (!ms) return "never seen";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  return `${Math.floor(diff / 86_400_000)} d ago`;
}

function UnitRow({
  device,
  busy,
  renaming,
  renameDraft,
  showDetails,
  latestCrash,
  onChangeRename,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onToggleDetails,
  onForget,
}: {
  device: KnownDevice;
  busy: boolean;
  renaming: boolean;
  renameDraft: string;
  showDetails: boolean;
  latestCrash: UserCrashReport | null;
  onChangeRename: (text: string) => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onToggleDetails: () => void;
  onForget: () => void;
}) {
  return (
    <View className="mt-2 rounded-xl border border-line bg-surface p-3">
      <View className="flex-row items-center justify-between">
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-sm font-bold text-ink">
            {device.name}
          </Text>
          <Text numberOfLines={1} className="mt-0.5 text-[11px] text-muted">
            {device.savedRouters.length > 0
              ? `Wi-Fi ${device.savedRouters.join(", ")}`
              : device.uniqueId
                ? `Board ${device.uniqueId}`
                : "Bluetooth link"}
            {" · "}
            {relativeTime(device.lastSeenAt)}
          </Text>
        </View>
        {latestCrash?.hasCrash ? (
          <View className="ml-2 shrink-0 rounded-full bg-red-100 px-2 py-0.5">
            <Text className="text-[10px] font-bold text-red-700">
              crash {latestCrash.crashCount ?? 1}
            </Text>
          </View>
        ) : device.mirrored ? (
          <View className="ml-2 shrink-0 rounded-full bg-emerald-100 px-2 py-0.5">
            <Text className="text-[10px] font-bold text-emerald-700">
              synced
            </Text>
          </View>
        ) : (
          <View className="ml-2 shrink-0 rounded-full bg-mist px-2 py-0.5">
            <Text className="text-[10px] font-bold text-muted">
              {device.source === "local" ? "this phone" : "account"}
            </Text>
          </View>
        )}
      </View>

      {/* Drive snapshot — the last telemetry-ish state saved for this unit. */}
      {device.settings ? (
        <View className="mt-1.5 flex-row flex-wrap gap-x-3 gap-y-0.5">
          <Text className="text-[11px] text-muted">
            Mode {device.settings.modeId ?? "—"}
          </Text>
          {device.settings.speed != null && (
            <Text className="text-[11px] text-muted">
              Speed {device.settings.speed}/255
            </Text>
          )}
          {device.settings.steerLimit != null && (
            <Text className="text-[11px] text-muted">
              Steer ±{device.settings.steerLimit}
            </Text>
          )}
          {device.settings.trim != null && device.settings.trim !== 0 && (
            <Text className="text-[11px] text-muted">
              Trim {device.settings.trim}
            </Text>
          )}
        </View>
      ) : (
        <Text className="mt-1.5 text-[11px] text-muted">
          Linked but not driven yet.
        </Text>
      )}

      {showDetails && (
        <Text
          numberOfLines={2}
          className="mt-1 font-mono text-[10px] text-muted"
        >
          Connection ID: {device.profileKey}
          {device.uniqueId ? ` · Board: ${device.uniqueId}` : ""}
        </Text>
      )}

      {renaming ? (
        <View className="mt-2 flex-row items-center gap-2">
          <TextInput
            value={renameDraft}
            onChangeText={onChangeRename}
            autoFocus
            placeholder="Project unit name"
            placeholderTextColor="#94a3b8"
            className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-1.5 text-xs text-ink"
          />
          <Pressable
            onPress={onCommitRename}
            disabled={busy}
            className="rounded-full bg-navy px-3 py-1.5 disabled:opacity-50"
          >
            <Text className="text-xs font-black text-white">Save</Text>
          </Pressable>
          <Pressable
            onPress={onCancelRename}
            className="rounded-full border border-line px-3 py-1.5"
          >
            <Text className="text-xs font-bold text-ink">Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <View className="mt-2 flex-row items-center gap-2">
          <Pressable
            onPress={onStartRename}
            className="rounded-full border border-line px-3 py-1 bg-card"
            hitSlop={6}
          >
            <Text className="text-[11px] font-bold text-navy">Set name</Text>
          </Pressable>
          <Pressable
            onPress={onToggleDetails}
            className="rounded-full border border-line px-3 py-1 bg-card"
            hitSlop={6}
          >
            <Text className="text-[11px] font-bold text-navy">
              {showDetails ? "Hide ID" : "Details"}
            </Text>
          </Pressable>
          <Pressable
            onPress={onForget}
            disabled={busy}
            className="ml-auto rounded-full border border-red-200 px-3 py-1 disabled:opacity-50"
            hitSlop={6}
          >
            <Text className="text-[11px] font-bold text-red-600">Forget</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function UserPreferencesScreen() {
  const { user, isSignedIn, isPro } = useApp();
  // Destructured so the crash loader's memo key is the id itself; keying on
  // `user?.id` while reading `user` is what the compiler flagged.
  const userId = user?.id;
  const [rows, setRows] = useState<RobotSettingRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // ── project hub state ──
  const [devices, setDevices] = useState<KnownDevice[]>([]);
  const [devicesLoaded, setDevicesLoaded] = useState(false);
  const [devicesOffline, setDevicesOffline] = useState(false);
  const [crashes, setCrashes] = useState<UserCrashReport[]>([]);
  const [openProject, setOpenProject] = useState<string | null>(null);
  const [materials, setMaterials] = useState<Record<string, ProjectMaterial[]>>(
    {},
  );
  // Which projects already asked the store for their checklist. A ref, not
  // state: it only guards the load, and writing state from the effect body was
  // a cascading render with no visible result.
  const materialsRequested = useRef<Set<string>>(new Set());
  const [materialDrafts, setMaterialDrafts] = useState<Record<string, string>>(
    {},
  );
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [detailsKey, setDetailsKey] = useState<string | null>(null);

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

  const loadDevices = useCallback(async () => {
    const result = await fetchKnownDevices();
    setDevices(result.devices);
    setDevicesOffline(result.offline);
    setDevicesLoaded(true);
  }, []);

  const loadCrashes = useCallback(async () => {
    if (!userId) return;
    setCrashes(await fetchUserCrashReports(userId));
  }, [userId]);

  useEffect(() => {
    if (isSignedIn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async load
      void load();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async load
      void loadDevices();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async load
      void loadCrashes();
    }
  }, [isSignedIn, load, loadDevices, loadCrashes]);
  useFocusEffect(
    useCallback(() => {
      if (!isSignedIn) return;
      void load();
      void loadDevices();
      void loadCrashes();
      void pushLocalDevicesToCloud().then((r) => {
        if (r.pushed > 0) void loadDevices();
      });
    }, [isSignedIn, load, loadDevices, loadCrashes]),
  );

  // ONE card per project: group the units by canonical project id.
  const groups = useMemo<ProjectGroup[]>(() => {
    const map = new Map<string, ProjectGroup>();
    for (const device of devices) {
      const identity = resolveProject(device.project);
      const entry = map.get(identity.key);
      if (entry) entry.devices.push(device);
      else map.set(identity.key, { identity, devices: [device] });
    }
    return [...map.values()].sort((a, b) => {
      if (a.identity.key === "unknown") return 1;
      if (b.identity.key === "unknown") return -1;
      return a.identity.label.localeCompare(b.identity.label);
    });
  }, [devices]);

  // Load each project's materials checklist once the units are known.
  const groupsSig = groups.map((g) => g.identity.key).join("|");
  useEffect(() => {
    for (const group of groups) {
      const key = group.identity.key;
      if (materialsRequested.current.has(key)) continue;
      materialsRequested.current.add(key);
      void loadProjectMaterials(key, group.identity.materials).then((items) =>
        setMaterials((cur) => ({ ...cur, [key]: items })),
      );
    }
    // groupsSig is the stable identity of `groups` for this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupsSig]);

  async function persistMaterials(key: string, items: ProjectMaterial[]) {
    setMaterials((cur) => ({ ...cur, [key]: items }));
    await saveProjectMaterials(key, items);
  }

  function onToggleMaterial(key: string, label: string) {
    const items = materials[key] ?? [];
    feedbackTap();
    void persistMaterials(key, toggleProjectMaterial(items, label));
  }

  function onAddMaterial(key: string) {
    const label = (materialDrafts[key] ?? "").trim();
    if (!label) return;
    void persistMaterials(key, addProjectMaterial(materials[key] ?? [], label));
    setMaterialDrafts((cur) => ({ ...cur, [key]: "" }));
  }

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
          Your projects, their materials and their health are saved to your
          GENUM account.
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
            My projects
          </Text>
          <Text className="mt-1 text-sm text-muted">
            One card per project — its units, the parts it needs, and its
            health. Synced to your account.
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
            Upgrade your account to Pro to keep per-project workspaces: units,
            materials checklists, crash health, and per-robot code values and
            telemetry channels. Contact GENUM Solutions to upgrade
            {user?.email ? ` (account: ${user.email})` : ""}.
          </Text>
        </View>
      ) : (
        <>
          {offline && (
            <Text className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700">
              Offline — showing your last saved projects.
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

          {/* ── ① MY PROJECTS — one card per canonical project ──────── */}
          <View className="mt-5">
            <View className="flex-row items-center gap-1">
              <Feather name="layers" size={12} color="#1e3a8a" />
              <Text className="text-[11px] font-black uppercase tracking-wide text-muted">
                Projects ({groups.length}) · Units ({devices.length})
              </Text>
              {devicesOffline ? (
                <View className="ml-auto rounded-full bg-amber-100 px-2 py-0.5">
                  <Text className="text-[10px] font-bold text-amber-700">
                    offline
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
            ) : groups.length === 0 ? (
              <View className="mt-3 rounded-2xl border border-line bg-card p-4">
                <Text className="text-sm text-muted">
                  No projects yet — connect a car from the Control Panel and it
                  appears here automatically, whichever way you linked it.
                </Text>
              </View>
            ) : (
              <View className="mt-3 space-y-3">
                {groups.map((group) => {
                  const key = group.identity.key;
                  const open = openProject === key;
                  const projectCrashes = crashes.filter((crash) =>
                    group.devices.some((d) => crashMatchesDevice(crash, d)),
                  );
                  const crashCount = projectCrashes.filter(
                    (c) => c.hasCrash,
                  ).length;
                  const items = materials[key] ?? [];
                  const done = items.filter((i) => i.done).length;
                  return (
                    <View
                      key={key}
                      className="overflow-hidden rounded-2xl border border-line bg-card"
                    >
                      <Pressable
                        onPress={() => {
                          feedbackTap();
                          setOpenProject(open ? null : key);
                        }}
                        className="flex-row items-center px-4 py-3 active:bg-surface"
                        accessibilityRole="button"
                        accessibilityState={{ expanded: open }}
                      >
                        <View className="min-w-0 flex-1">
                          <Text
                            numberOfLines={1}
                            className="text-sm font-bold text-ink"
                          >
                            {group.identity.label}
                          </Text>
                          <Text
                            numberOfLines={1}
                            className="mt-0.5 text-[11px] text-muted"
                          >
                            {key === "unknown"
                              ? `${group.devices.length} unit${group.devices.length === 1 ? "" : "s"} · project not reported yet`
                              : `Project ${key} · ${group.devices.length} unit${group.devices.length === 1 ? "" : "s"}`}
                          </Text>
                        </View>
                        {crashCount > 0 && (
                          <View className="mr-2 shrink-0 rounded-full bg-red-100 px-2 py-0.5">
                            <Text className="text-[10px] font-bold text-red-700">
                              {crashCount} crash{crashCount === 1 ? "" : "es"}
                            </Text>
                          </View>
                        )}
                        <Feather
                          name={open ? "chevron-up" : "chevron-down"}
                          size={16}
                          color="#64748b"
                        />
                      </Pressable>

                      {open && (
                        <View className="border-t border-line px-4 pb-4">
                          {/* Units */}
                          {group.devices.map((device) => (
                            <UnitRow
                              key={device.profileKey}
                              device={device}
                              busy={deviceBusy}
                              renaming={renamingKey === device.profileKey}
                              renameDraft={renameDraft}
                              showDetails={detailsKey === device.profileKey}
                              latestCrash={
                                crashes.find((c) =>
                                  crashMatchesDevice(c, device),
                                ) ?? null
                              }
                              onChangeRename={setRenameDraft}
                              onStartRename={() => {
                                feedbackTap();
                                setRenamingKey(device.profileKey);
                                setRenameDraft(device.name);
                              }}
                              onCommitRename={() =>
                                void commitRename(device.profileKey)
                              }
                              onCancelRename={() => setRenamingKey(null)}
                              onToggleDetails={() =>
                                setDetailsKey(
                                  detailsKey === device.profileKey
                                    ? null
                                    : device.profileKey,
                                )
                              }
                              onForget={() => confirmForget(device)}
                            />
                          ))}

                          {/* Materials — the project's parts, tracked by the user */}
                          <View className="mt-4">
                            <View className="flex-row items-center justify-between">
                              <Text className="text-[11px] font-black uppercase tracking-wide text-muted">
                                Materials
                              </Text>
                              <Text className="text-[11px] font-bold text-navy">
                                {done}/{items.length} ready
                              </Text>
                            </View>
                            {items.length > 0 && (
                              <View className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-mist">
                                <View
                                  className="h-1.5 rounded-full bg-navy"
                                  style={{
                                    width: `${items.length ? Math.round((done / items.length) * 100) : 0}%`,
                                  }}
                                />
                              </View>
                            )}
                            {items.length === 0 ? (
                              <Text className="mt-2 text-[11px] text-muted">
                                No parts listed for this project yet. Add the
                                parts you are gathering below.
                              </Text>
                            ) : (
                              items.map((item) => (
                                <Pressable
                                  key={item.label}
                                  onPress={() =>
                                    onToggleMaterial(key, item.label)
                                  }
                                  className="mt-1.5 flex-row items-center active:opacity-60"
                                  accessibilityRole="checkbox"
                                  accessibilityState={{ checked: item.done }}
                                >
                                  <View
                                    className={`h-4 w-4 items-center justify-center rounded border ${
                                      item.done
                                        ? "border-navy bg-navy"
                                        : "border-line bg-card"
                                    }`}
                                  >
                                    {item.done && (
                                      <Feather
                                        name="check"
                                        size={11}
                                        color="#ffffff"
                                      />
                                    )}
                                  </View>
                                  <Text
                                    className={`ml-2 flex-1 text-xs ${
                                      item.done
                                        ? "text-muted line-through"
                                        : "text-ink"
                                    }`}
                                  >
                                    {item.label}
                                  </Text>
                                  {item.custom && (
                                    <Text className="text-[9px] font-bold uppercase text-muted">
                                      mine
                                    </Text>
                                  )}
                                </Pressable>
                              ))
                            )}
                            <View className="mt-2 flex-row items-center gap-2">
                              <TextInput
                                value={materialDrafts[key] ?? ""}
                                onChangeText={(text) =>
                                  setMaterialDrafts((cur) => ({
                                    ...cur,
                                    [key]: text,
                                  }))
                                }
                                onSubmitEditing={() => onAddMaterial(key)}
                                placeholder="Add a part you have or need"
                                placeholderTextColor="#94a3b8"
                                returnKeyType="done"
                                className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink"
                              />
                              <Pressable
                                onPress={() => onAddMaterial(key)}
                                disabled={!(materialDrafts[key] ?? "").trim()}
                                className="rounded-full bg-navy px-3 py-1.5 disabled:opacity-40"
                              >
                                <Text className="text-[11px] font-black text-white">
                                  Add
                                </Text>
                              </Pressable>
                            </View>
                          </View>

                          {/* Health — this user's crash reports for the units */}
                          <View className="mt-4">
                            <Text className="text-[11px] font-black uppercase tracking-wide text-muted">
                              Health
                            </Text>
                            {projectCrashes.length === 0 ? (
                              <Text className="mt-1.5 text-[11px] text-muted">
                                No crash reports for this project.
                              </Text>
                            ) : (
                              projectCrashes.slice(0, 5).map((crash) => (
                                <View
                                  key={crash.id}
                                  className="mt-1.5 rounded-lg border border-line bg-surface px-3 py-2"
                                >
                                  <View className="flex-row items-center justify-between">
                                    <Text className="text-[11px] font-bold text-ink">
                                      {crash.hasCrash
                                        ? `Crashed in ${crash.lastCrashPhase ?? "unknown phase"}`
                                        : "Healthy boot"}
                                    </Text>
                                    <Text className="text-[10px] text-muted">
                                      {relativeTime(
                                        Date.parse(crash.reportedAt) || null,
                                      )}
                                    </Text>
                                  </View>
                                  <Text className="mt-0.5 text-[10px] text-muted">
                                    fw {crash.fwVersion || "?"} ·{" "}
                                    {crash.connectionMethod || "link"} ·{" "}
                                    {crash.resetReason ?? "no reset reason"}
                                    {crash.lastCrashHeap != null
                                      ? ` · heap ${crash.lastCrashHeap}`
                                      : ""}
                                  </Text>
                                </View>
                              ))
                            )}
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* ── ② ROBOT PROFILES (code values / telemetry channels) ──── */}
          <View className="mt-6">
            <Text className="text-[11px] font-black uppercase tracking-wide text-muted">
              Robot profiles
            </Text>
          </View>
          {editingId === null ? (
            <>
              {!loaded ? (
                <View className="mt-4 items-center">
                  <ActivityIndicator color="#1e3a8a" />
                </View>
              ) : rows.length === 0 ? (
                <View className="mt-3 rounded-2xl border border-line bg-card p-5">
                  <Text className="text-sm text-muted">
                    No robot profiles yet. Add your first one.
                  </Text>
                </View>
              ) : (
                <View className="mt-3 space-y-3">
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
                            className="mt-0.5 text-[11px] text-muted"
                          >
                            {Object.keys(row.settings).length} saved settings
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
            <View className="mt-3 rounded-2xl border border-line bg-card p-4">
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
                Telemetry channels / code values
              </Text>
              <Text className="mt-0.5 text-[11px] text-muted">
                One row per value. Comma-separate lists (e.g. speed,heap,rssi).
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
                    placeholder="e.g. 200 or speed,heap,rssi"
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
                <Text className="text-xs font-bold text-navy">+ Add value</Text>
              </Pressable>

              <View className="mt-4 flex-row flex-wrap gap-3">
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
