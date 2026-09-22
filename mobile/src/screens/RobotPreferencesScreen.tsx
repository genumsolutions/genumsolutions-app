// =====================================================================
// RobotPreferencesScreen — Settings menu entry for the per-robot
// preference profiles (pro users).
//
// Each profile = one robot/project: the user's own code values, tuning
// parameters, and telemetry channels they want mirrored. Rows live in
// the dedicated robot_user_settings table (separate from orders/carts)
// and are the SAME rows the website admin panel manages, so nothing is
// ever untracked per user.
//
// Free users see the Pro explanation; signed-out users see sign-in.
// =====================================================================
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import {
  fetchRobotSettings,
  saveRobotSetting,
  deleteRobotSetting,
  type RobotSettingRow,
} from '../services/robotSettingsService';

type DraftPair = { key: string; value: string };

function parseValue(raw: string): string | number | boolean {
  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  return trimmed;
}

export function RobotPreferencesScreen() {
  const navigation = useNavigation<any>();
  const { user, isSignedIn, isPro } = useApp();
  const [rows, setRows] = useState<RobotSettingRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // Editor state: null = list view; a robotId = editing (or '' = creating).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftRobotId, setDraftRobotId] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftPairs, setDraftPairs] = useState<DraftPair[]>([{ key: '', value: '' }]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchRobotSettings();
    setRows(result.rows);
    setOffline(result.offline);
    setLoaded(true);
  }, []);

  useEffect(() => { if (isSignedIn) void load(); }, [isSignedIn, load]);
  useFocusEffect(useCallback(() => { if (isSignedIn) void load(); }, [isSignedIn, load]));

  function startCreate() {
    setEditingId('');
    setDraftRobotId('');
    setDraftName('');
    setDraftPairs([{ key: '', value: '' }]);
    setSaved(false);
    setError('');
  }

  function startEdit(row: RobotSettingRow) {
    setEditingId(row.robotId);
    setDraftRobotId(row.robotId);
    setDraftName(row.robotName);
    setDraftPairs(
      Object.entries(row.settings).map(([key, value]) => ({
        key,
        value: Array.isArray(value) ? value.join(', ') : String(value),
      })).concat([{ key: '', value: '' }]),
    );
    setSaved(false);
    setError('');
  }

  async function save() {
    const id = draftRobotId.trim().toLowerCase().replace(/\s+/g, '-');
    if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(id)) {
      setError('Robot id is required (letters, numbers, dashes — max 64 chars).');
      return;
    }
    const settings: Record<string, unknown> = {};
    for (const pair of draftPairs) {
      const key = pair.key.trim();
      if (!key) continue;
      if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(key)) {
        setError(`Setting name "${key}" is invalid (letters, numbers, dots, dashes).`);
        return;
      }
      // Comma-separated values become string arrays (telemetry channel picks).
      settings[key] = pair.value.includes(',') && pair.value.trim() !== ''
        ? pair.value.split(',').map((item) => item.trim()).filter(Boolean)
        : parseValue(pair.value);
    }
    setBusy(true); setError('');
    const result = await saveRobotSetting(id, draftName.trim() || id, settings);
    setBusy(false);
    if (result.ok) {
      setSaved(true);
      setEditingId(null);
      void load();
    } else {
      setError(result.error || 'Could not save.');
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
        <Text className="mt-4 font-display text-xl font-bold text-ink">Sign in required</Text>
        <Text className="mt-1 text-center text-sm text-muted">
          Robot preference profiles are saved to your GENUM account.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View className="flex-row items-center justify-between">
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">Settings</Text>
          <Text className="mt-2 font-display text-2xl font-bold text-ink">Robot preferences</Text>
          <Text className="mt-1 text-sm text-muted">
            Your own code values, parameters, and telemetry channels for each robot — kept separate from orders.
          </Text>
        </View>
        <View className={`ml-2 shrink-0 rounded-full px-2.5 py-1 ${isPro ? 'bg-navy' : 'bg-slate-200'}`}>
          <Text className={`text-[10px] font-black uppercase tracking-wide ${isPro ? 'text-white' : 'text-slate-500'}`}>
            {isPro ? 'Pro' : 'Free'}
          </Text>
        </View>
      </View>

      {!isPro ? (
        <View className="mt-5 rounded-2xl border border-line bg-card p-5">
          <View className="flex-row items-center">
            <Feather name="lock" size={18} color="#1e3a8a" />
            <Text className="ml-2 text-sm font-bold text-ink">A Pro feature</Text>
          </View>
          <Text className="mt-2 text-sm leading-5 text-muted">
            Upgrade your account to Pro to save per-robot profiles: custom command values, PID and
            speed parameters, and the telemetry channels you care about. The Remote window unlocks
            with Pro too. Contact GENUM Solutions to upgrade
            {user?.email ? ` (account: ${user.email})` : ''}.
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
          {error !== '' && (
            <Text className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-xs font-bold text-red-600">{error}</Text>
          )}

          {editingId === null ? (
            <>
              {!loaded ? (
                <View className="mt-8 items-center">
                  <ActivityIndicator color="#1e3a8a" />
                </View>
              ) : rows.length === 0 ? (
                <View className="mt-5 rounded-2xl border border-line bg-card p-5">
                  <Text className="text-sm text-muted">No robot profiles yet. Add your first one.</Text>
                </View>
              ) : (
                <View className="mt-4 space-y-3">
                  {rows.map((row) => (
                    <View key={row.robotId} className="rounded-2xl border border-line bg-card p-4">
                      <View className="flex-row items-center justify-between">
                        <View className="min-w-0 flex-1">
                          <Text numberOfLines={1} className="text-sm font-bold text-ink">{row.robotName || row.robotId}</Text>
                          <Text numberOfLines={1} className="mt-0.5 font-mono text-[11px] text-muted">
                            {row.robotId} · {Object.keys(row.settings).length} keys
                          </Text>
                        </View>
                        <Pressable onPress={() => startEdit(row)} className="ml-2 shrink-0 rounded-full border border-line px-3 py-1.5" hitSlop={6}>
                          <Text className="text-xs font-bold text-navy">Edit</Text>
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
                <Text className="text-sm font-black text-white">Add robot profile</Text>
              </Pressable>
            </>
          ) : (
            <View className="mt-4 rounded-2xl border border-line bg-card p-4">
              <Text className="text-xs font-bold uppercase tracking-wide text-muted">Robot id</Text>
              <TextInput
                value={draftRobotId}
                onChangeText={setDraftRobotId}
                editable={editingId === ''}
                placeholder="e.g. 2wd1m-basic"
                autoCapitalize="none"
                className="mt-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              />
              <Text className="mt-3 text-xs font-bold uppercase tracking-wide text-muted">Display name</Text>
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
                    onChangeText={(text) => setDraftPairs((cur) => cur.map((p, i) => (i === index ? { ...p, key: text } : p)))}
                    placeholder="e.g. maxSpeed"
                    autoCapitalize="none"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink"
                  />
                  <TextInput
                    value={pair.value}
                    onChangeText={(text) => setDraftPairs((cur) => cur.map((p, i) => (i === index ? { ...p, value: text } : p)))}
                    placeholder="e.g. 200 or F,B,STOP"
                    autoCapitalize="none"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink"
                  />
                  {draftPairs.length > 1 && (
                    <Pressable
                      onPress={() => setDraftPairs((cur) => cur.filter((_, i) => i !== index))}
                      className="shrink-0 rounded-full border border-red-200 px-2.5 py-1.5"
                      hitSlop={6}
                    >
                      <Feather name="x" size={12} color="#dc2626" />
                    </Pressable>
                  )}
                </View>
              ))}
              <Pressable
                onPress={() => setDraftPairs((cur) => [...cur, { key: '', value: '' }])}
                className="mt-2 self-start rounded-full border border-line px-3 py-1.5"
                hitSlop={6}
              >
                <Text className="text-xs font-bold text-navy">+ Add setting</Text>
              </Pressable>

              <View className="mt-4 flex-row gap-3">
                <Pressable onPress={save} disabled={busy} className="rounded-full bg-gold px-5 py-2.5">
                  <Text className="text-xs font-black text-ink">{busy ? 'Saving…' : 'Save profile'}</Text>
                </Pressable>
                <Pressable onPress={() => setEditingId(null)} className="rounded-full border border-line px-5 py-2.5">
                  <Text className="text-xs font-bold text-ink">Cancel</Text>
                </Pressable>
                {editingId !== '' && (
                  <Pressable onPress={() => void remove(editingId)} disabled={busy} className="rounded-full border border-red-200 px-5 py-2.5">
                    <Text className="text-xs font-bold text-red-600">Delete</Text>
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
