// =====================================================================
// AppUpdateCard - shared "app update" control used in two places:
//   - compact: the AppMenu footer (current version + one-tap update)
//   - full:    the Account screen's "App version & update check" card
//
// Both use the same logic (checkForUpdate / downloadAndInstall) so the
// update UX is identical everywhere. The component auto-checks once on
// mount, lets the user re-check, and guides the download + install.
// =====================================================================
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { APP_VERSION } from '../config/site';
import {
  checkForUpdate,
  downloadAndInstall,
  type UpdateState,
} from '../services/updateService';

type Props = {
  /** compact = slim row for the menu footer; full = card for Account. */
  compact?: boolean;
};

export function AppUpdateCard({ compact = false }: Props) {
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'unknown' });

  // Auto-check once on mount so the badge/status is current when opened.
  useEffect(() => {
    setUpdateState({ status: 'checking' });
    checkForUpdate().then(setUpdateState).catch(() => setUpdateState({ status: 'error' }));
  }, []);

  const handleCheckUpdate = useCallback(() => {
    setUpdateState({ status: 'checking' });
    checkForUpdate().then(setUpdateState).catch(() => setUpdateState({ status: 'error' }));
  }, []);

  const handleDownloadInstall = useCallback(async () => {
    if (!updateState.apkUrl) return;
    setUpdateState((prev) => ({ ...prev, status: 'downloading' }));
    try {
      await downloadAndInstall(updateState.apkUrl);
      setUpdateState((prev) => ({ ...prev, status: 'installing' }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Update failed.';
      Alert.alert('Update failed', msg, [
        { text: 'Open in browser', onPress: () => Linking.openURL(updateState.apkUrl!) },
        { text: 'Cancel', style: 'cancel' },
      ]);
      setUpdateState((prev) => ({ ...prev, status: 'update-available' }));
    }
  }, [updateState.apkUrl]);

  const isBusy =
    updateState.status === 'checking' || updateState.status === 'downloading';
  const hasUpdate = updateState.status === 'update-available';

  if (compact) {
    // ── Menu footer row: version + status + one-tap update ─────────────
    return (
      <View className="mx-4 mt-2 rounded-xl border border-line bg-mist px-3 py-2.5">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Feather name="download" size={14} color="#64748b" />
            <Text className="text-xs font-bold text-ink">App v{APP_VERSION}</Text>
          </View>
          {isBusy && <ActivityIndicator size="small" color="#1e3a8a" />}
          {updateState.status === 'up-to-date' && (
            <Text className="text-[11px] font-bold text-emerald-600">Up to date</Text>
          )}
          {hasUpdate && (
            <Text className="text-[11px] font-bold text-gold">v{updateState.latestVersion} available</Text>
          )}
          {updateState.status === 'error' && (
            <Text className="text-[11px] font-bold text-red-500">Check failed</Text>
          )}
          {updateState.status === 'installing' && (
            <Text className="text-[11px] font-bold text-navy">Installing…</Text>
          )}
        </View>

        {hasUpdate && (
          <Pressable
            onPress={() => void handleDownloadInstall()}
            disabled={isBusy}
            className="mt-2 items-center rounded-full bg-navy py-2 disabled:opacity-50"
          >
            <Text className="text-xs font-black text-white">
              Update now{updateState.size ? ` · ${updateState.size}` : ''}
            </Text>
          </Pressable>
        )}

        {updateState.status === 'error' && (
          <Pressable onPress={handleCheckUpdate} className="mt-1.5 items-center">
            <Text className="text-[11px] font-bold text-navy">Retry check</Text>
          </Pressable>
        )}

        {updateState.status === 'downloading' && (
          <Text className="mt-1.5 text-center text-[11px] text-muted">Downloading update…</Text>
        )}
      </View>
    );
  }

  // ── Account screen card (full variant) ──────────────────────────────
  return (
    <View className="rounded-xl border border-line bg-card p-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Feather name="info" size={14} color="#64748b" />
          <Text className="text-xs font-bold text-muted">App v{APP_VERSION}</Text>
        </View>
        {updateState.status === 'checking' && (
          <ActivityIndicator size="small" color="#1e3a8a" />
        )}
      </View>

      {updateState.status === 'up-to-date' && updateState.latestVersion && (
        <Text className="mt-2 text-xs font-medium text-emerald-600">
          ✓ Up to date (latest: v{updateState.latestVersion})
        </Text>
      )}

      {hasUpdate && (
        <View className="mt-3">
          <Text className="text-xs font-bold text-navy">
            Update available: v{updateState.latestVersion}
            {updateState.size ? ` (${updateState.size})` : ''}
          </Text>
          {updateState.notes && (
            <Text className="mt-1 text-xs text-muted" numberOfLines={2}>
              {updateState.notes}
            </Text>
          )}
          <Pressable
            onPress={() => void handleDownloadInstall()}
            className="mt-3 items-center rounded-full bg-navy py-2.5"
          >
            <Text className="text-xs font-black text-white">Download & Install</Text>
          </Pressable>
        </View>
      )}

      {updateState.status === 'downloading' && (
        <View className="mt-2 flex-row items-center gap-2">
          <ActivityIndicator size="small" color="#1e3a8a" />
          <Text className="text-xs text-muted">Downloading update…</Text>
        </View>
      )}

      {updateState.status === 'installing' && (
        <Text className="mt-2 text-xs font-medium text-navy">
          Installer opened — tap Install on your device.
        </Text>
      )}

      {updateState.status === 'error' && (
        <View className="mt-2 flex-row items-center justify-between">
          <Text className="text-xs text-red-500">Could not check for updates</Text>
          <Pressable onPress={handleCheckUpdate}>
            <Text className="text-xs font-bold text-navy">Retry</Text>
          </Pressable>
        </View>
      )}

      {updateState.status === 'unknown' && (
        <Pressable onPress={handleCheckUpdate} className="mt-2">
          <Text className="text-xs font-bold text-navy">Check for updates</Text>
        </Pressable>
      )}
    </View>
  );
}