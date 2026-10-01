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
// "4WD CAR", and the OS pairing list shows the announced one. A user who
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
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setDevices([]);
      return;
    }
    setLoading(true);
    try {
      setDevices(await fetchUserDevices(userId));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

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
                        <Pressable
                          onPress={() => {
                            setEditingId(d.deviceId);
                            setDraft(d.displayName);
                          }}
                          accessibilityLabel={`Rename ${d.displayName}`}
                          className="ml-auto flex-row items-center rounded-lg border border-line px-2 py-1"
                        >
                          <Feather name="edit-2" size={11} color="#64748b" />
                          <Text className="ml-1 text-[10px] font-semibold text-muted">
                            Rename
                          </Text>
                        </Pressable>
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
