// =====================================================================
// DeviceGarageCard - the user's own list of devices.
//
// Split from CarProfileCard on purpose. CarProfileCard describes the car
// you are driving RIGHT NOW: its live identity, the settings that profile
// will restore, the auto-join toggle. This card is the standing inventory -
// every unit the account owns, each with a name the user chose, so a car
// stays recognisable between sessions instead of appearing as a raw
// Bluetooth MAC.
//
// Why the FROZEN advertised name is shown (the whole point of the registry):
// the catalogue calls a car "4WD 4-Motor Car" but the firmware announces
// "4WD4M Car", and the OS pairing list shows the announced one. A user who
// cannot match those two concludes their car has vanished. So the pairing
// name is rendered next to the name, never derived from it.
//
// The unit identity is `fw:<boardId>` / BT MAC / `wifi:<ssid>` - the exact
// string car_profiles already stores, so a car driven before the registry
// existed resolves to the same row instead of appearing twice.
//
// No telemetry and no drive controls live here. This card answers "what do I
// own and what is it called", which needs no connection at all.
// =====================================================================
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  fetchUserDevices,
  pairingLabel,
  removeUserDevice,
  setDeviceFavourite,
  setDeviceName,
  type UserDevice,
} from "../../services/deviceRegistryService";
import { relativeTime } from "./deviceGarageFormat";

export type DeviceGarageCardProps = {
  /** Signed-in user id; null when signed out, in which case nothing renders. */
  userId: string | null;
};

export default function DeviceGarageCard({ userId }: DeviceGarageCardProps) {
  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [loading, setLoading] = useState(!!userId);
  // Bumped after a remove so the effect re-fetches; handlers never call the
  // loader directly, which keeps every setState out of the effect's sync path.
  const [reloadKey, setReloadKey] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  // U-95 Phase 4a: the in-flight row action, so a slow network cannot
  // double-fire a delete or a favourite toggle.
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    fetchUserDevices(userId)
      .then((rows) => {
        if (alive) setDevices(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const save = useCallback(
    async (device: UserDevice) => {
      if (!userId) return;
      setSaving(true);
      try {
        const ok = await setDeviceName(userId, device.deviceId, draft);
        if (ok) {
          setDevices((prev) =>
            prev.map((d) =>
              d.deviceId === device.deviceId
                ? { ...d, displayName: draft.trim() }
                : d,
            ),
          );
          setEditingId(null);
        } else {
          Alert.alert(
            "Could not save that name",
            "Check your connection and try again.",
          );
        }
      } finally {
        setSaving(false);
      }
    },
    [userId, draft],
  );

  // FAVOURITE — the is_favourite column is read by fetchUserDevices and written
  // here and nowhere else. The row updates optimistically through the same
  // setDevices map the rename uses, and reverts through load() on failure so a
  // star can never claim a state the database does not hold.
  const toggleFavourite = useCallback(
    async (device: UserDevice) => {
      if (!userId || busyId) return;
      const next = !device.isFavourite;
      setBusyId(device.deviceId);
      try {
        const ok = await setDeviceFavourite(userId, device.deviceId, next);
        if (!ok) {
          Alert.alert(
            "Could not update favourite",
            "Check your connection and try again.",
          );
          reload();
          return;
        }
        setDevices((prev) =>
          prev.map((d) =>
            d.deviceId === device.deviceId ? { ...d, isFavourite: next } : d,
          ),
        );
      } finally {
        setBusyId(null);
      }
    },
    [userId, busyId, reload],
  );

  // ROW-LEVEL DELETE — unlinks this ONE unit from this user's garage (the
  // user_devices row). The fleet record and the car's saved settings are
  // untouched, and driving the car again re-claims it — the confirm text says
  // so, because a delete that reads as permanent is a delete users avoid.
  const confirmRemove = useCallback(
    (device: UserDevice) => {
      if (!userId || busyId) return;
      Alert.alert(
        "Remove from garage?",
        `${device.displayName} is unlinked from your account's garage. The car itself and its saved settings are not touched — drive it again and it comes back.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => {
              setBusyId(device.deviceId);
              void removeUserDevice(userId, device.deviceId).then((ok) => {
                setBusyId(null);
                if (!ok) {
                  Alert.alert(
                    "Could not remove",
                    "Check your connection and try again.",
                  );
                  return;
                }
                setEditingId((cur) => (cur === device.deviceId ? null : cur));
                reload();
              });
            },
          },
        ],
      );
    },
    [userId, busyId, reload],
  );

  // Nothing to show when signed out, and an empty list must read as
  // "nothing yet", not as a broken panel.
  if (!userId) return null;

  return (
    <View className="rounded-2xl border border-line bg-card p-4">
      <View className="mb-1 flex-row items-center">
        <Text className="text-sm font-bold text-ink">My garage</Text>
        {devices.length > 0 ? (
          <Text className="ml-auto text-[11px] font-semibold text-muted">
            {devices.length} device{devices.length === 1 ? "" : "s"}
          </Text>
        ) : null}
      </View>
      <Text className="mb-3 text-[11px] leading-4 text-muted">
        Every car your account has driven, with the name you gave it.
      </Text>

      {loading ? <ActivityIndicator className="py-2" color="#64748b" /> : null}

      {!loading && devices.length === 0 ? (
        <Text className="text-[11px] leading-4 text-muted">
          No devices yet. Drive a car once in the app and it will appear here.
        </Text>
      ) : null}

      {!loading && devices.length > 0
        ? devices.map((d) => {
            const editing = editingId === d.deviceId;
            // The pairing name only earns its line when it differs from the
            // name already on screen; repeating an identical string is noise.
            const pairing = pairingLabel(d.model);
            const showPairing = pairing !== d.displayName;
            return (
              <View
                key={d.deviceId}
                className="mt-2 rounded-xl border border-line bg-surface p-3"
              >
                <View className="flex-row items-start">
                  <Feather
                    name="truck"
                    size={15}
                    color="#94a3b8"
                    style={{ marginTop: 2 }}
                  />
                  <View className="ml-2 flex-1">
                    {editing ? (
                      <View className="flex-row items-center">
                        <TextInput
                          value={draft}
                          onChangeText={setDraft}
                          maxLength={60}
                          autoFocus
                          placeholder="Name this car"
                          placeholderTextColor="#94a3b8"
                          className="flex-1 rounded-lg border border-line bg-card px-2 py-1 text-xs text-ink"
                          onSubmitEditing={() => void save(d)}
                          returnKeyType="done"
                        />
                        <Pressable
                          onPress={() => void save(d)}
                          disabled={saving}
                          accessibilityLabel="Save name"
                          className="ml-2 rounded-lg bg-navy px-2 py-1.5"
                        >
                          <Feather name="check" size={13} color="#ffffff" />
                        </Pressable>
                        <Pressable
                          onPress={() => setEditingId(null)}
                          accessibilityLabel="Cancel rename"
                          className="ml-1 rounded-lg border border-line px-2 py-1.5"
                        >
                          <Feather name="x" size={13} color="#64748b" />
                        </Pressable>
                      </View>
                    ) : (
                      <>
                        <Text className="text-xs font-bold text-ink">
                          {d.displayName}
                        </Text>
                        {showPairing ? (
                          <Text className="mt-0.5 text-[10px] text-muted">
                            {pairing}
                          </Text>
                        ) : null}
                      </>
                    )}

                    <View className="mt-1.5 flex-row flex-wrap items-center">
                      <Text className="text-[10px] text-muted">
                        {relativeTime(d.lastSeenAt)}
                      </Text>
                      {d.fwVersion ? (
                        <Text className="ml-2 text-[10px] text-muted">
                          fw {d.fwVersion}
                        </Text>
                      ) : null}
                      {d.uniqueId ? (
                        <Text className="ml-2 font-mono text-[10px] text-muted">
                          {d.uniqueId}
                        </Text>
                      ) : null}
                      {!editing ? (
                        <View className="ml-auto flex-row items-center gap-1">
                          <Pressable
                            onPress={() => void toggleFavourite(d)}
                            disabled={busyId === d.deviceId}
                            accessibilityRole="button"
                            accessibilityState={{ selected: d.isFavourite }}
                            accessibilityLabel={
                              d.isFavourite
                                ? `Remove ${d.displayName} from favourites`
                                : `Favourite ${d.displayName}`
                            }
                            className={`rounded-lg border px-2 py-1 ${d.isFavourite ? "border-amber-300 bg-amber-50" : "border-line"}`}
                          >
                            <Feather
                              name="star"
                              size={11}
                              color={d.isFavourite ? "#b45309" : "#64748b"}
                            />
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              setEditingId(d.deviceId);
                              setDraft(d.displayName);
                            }}
                            accessibilityLabel={`Rename ${d.displayName}`}
                            className="flex-row items-center rounded-lg border border-line px-2 py-1"
                          >
                            <Feather name="edit-2" size={11} color="#64748b" />
                            <Text className="ml-1 text-[10px] font-semibold text-muted">
                              Rename
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => confirmRemove(d)}
                            disabled={busyId === d.deviceId}
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${d.displayName} from garage`}
                            className="rounded-lg border border-red-200 px-2 py-1"
                          >
                            <Feather name="trash-2" size={11} color="#b91c1c" />
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              </View>
            );
          })
        : null}
    </View>
  );
}
