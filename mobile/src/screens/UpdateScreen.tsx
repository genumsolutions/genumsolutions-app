// =====================================================================
// UpdateScreen - native "Check for update" with guided install.
//
// Compares the running APP_VERSION against the published release manifest,
// and when a newer build exists downloads the APK and launches the Android
// installer. The final INSTALL tap is always done by the user (Android does
// not allow silent installs), so the screen shows the exact steps.
// =====================================================================
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { APP_VERSION } from '../config/site';
import {
  checkForUpdate,
  downloadAndInstall,
  type UpdateState,
} from '../services/updateService';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const GUIDE_STEPS = [
  'Tap "Download & install" — the update is saved to this device.',
  'When the installer opens, tap INSTALL.',
  'If Android warns about unknown sources, allow it once (the APK is signed by GENUM).',
  'Open GENUM again — your data is kept.',
];

export function UpdateScreen({ visible, onClose }: Props) {
  const [state, setState] = useState<UpdateState>({ status: 'unknown' });

  const runCheck = useCallback(async () => {
    setState({ status: 'checking' });
    const result = await checkForUpdate();
    setState(result);
  }, []);

  useEffect(() => {
    if (visible) {
      void runCheck();
    } else {
      setState({ status: 'unknown' });
    }
  }, [visible, runCheck]);

  const handleInstall = useCallback(async () => {
    if (!state.apkUrl) return;
    setState({ status: 'downloading', latestVersion: state.latestVersion, apkUrl: state.apkUrl, size: state.size, notes: state.notes });
    try {
      await downloadAndInstall(state.apkUrl);
      setState({ status: 'installing', latestVersion: state.latestVersion, apkUrl: state.apkUrl, size: state.size, notes: state.notes });
    } catch {
      setState({ status: 'error', error: 'Download or install failed. Check your connection and try again.', latestVersion: state.latestVersion });
    }
  }, [state]);

  const busy = state.status === 'checking' || state.status === 'downloading';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-mist">
        <View className="flex-row items-center justify-between bg-navy px-5 pb-4 pt-3">
          <View>
            <Text className="font-display text-2xl font-bold text-white">Update</Text>
            <Text className="mt-0.5 text-sm text-navy-light">
              You are on v{APP_VERSION}
            </Text>
          </View>
          <Pressable onPress={onClose} className="rounded-full bg-white/15 px-4 py-2">
            <Text className="font-bold text-white">✕ Close</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          {/* Current version card */}
          <View className="rounded-lg border border-line bg-card p-4">
            <Text className="text-sm font-semibold text-ink">Installed version</Text>
            <Text className="mt-1 font-display text-2xl font-bold text-navy">
              v{APP_VERSION}
            </Text>
          </View>

          {/* Status / result */}
          <View className="mt-4 rounded-lg border border-line bg-card p-4">
            {state.status === 'unknown' && (
              <Text className="text-sm text-muted">Checking the release server…</Text>
            )}

            {state.status === 'checking' && (
              <View className="flex-row items-center">
                <ActivityIndicator size="small" color="#1e3a8a" />
                <Text className="ml-3 text-sm text-muted">Checking for updates…</Text>
              </View>
            )}

            {state.status === 'up-to-date' && (
              <>
                <Text className="text-base font-bold text-emerald-600">
                  You're up to date
                </Text>
                <Text className="mt-1 text-sm leading-6 text-muted">
                  v{state.latestVersion} is the newest version. Come back later for
                  the next release.
                </Text>
              </>
            )}

            {state.status === 'update-available' && (
              <>
                <Text className="text-base font-bold text-gold">
                  Update available — v{state.latestVersion}
                </Text>
                {state.size ? (
                  <Text className="mt-1 text-sm text-muted">Size: {state.size}</Text>
                ) : null}
                {state.notes ? (
                  <Text className="mt-1 text-sm leading-6 text-muted">{state.notes}</Text>
                ) : null}
                <Pressable
                  onPress={handleInstall}
                  disabled={busy}
                  className="mt-4 items-center rounded-full bg-navy px-5 py-3 disabled:opacity-60"
                >
                  <Text className="font-bold text-white">Download & install</Text>
                </Pressable>
                <Text className="mt-2 text-center text-xs text-muted">
                  You'll tap INSTALL to finish.
                </Text>
              </>
            )}

            {state.status === 'downloading' && (
              <View className="flex-row items-center">
                <ActivityIndicator size="small" color="#1e3a8a" />
                <Text className="ml-3 text-sm text-muted">Downloading update…</Text>
              </View>
            )}

            {state.status === 'installing' && (
              <Text className="text-sm leading-6 text-muted">
                The installer is open. Tap INSTALL to update to v{state.latestVersion} — then reopen the app.
              </Text>
            )}

            {state.status === 'error' && (
              <>
                <Text className="text-base font-bold text-red-600">Update check failed</Text>
                <Text className="mt-1 text-sm leading-6 text-muted">
                  {state.error || 'Something went wrong.'}
                </Text>
              </>
            )}
          </View>

          {/* Guided install steps (shown when relevant) */}
          {(state.status === 'update-available' ||
            state.status === 'downloading' ||
            state.status === 'installing') && (
            <View className="mt-4 rounded-lg border border-line bg-sky p-4">
              <Text className="text-sm font-bold text-navy">How to finish the install</Text>
              {GUIDE_STEPS.map((step, i) => (
                <View key={step} className="mt-3 flex-row">
                  <Text className="mr-3 h-6 w-6 shrink-0 rounded-full bg-card text-center text-xs font-bold text-navy">
                    {i + 1}
                  </Text>
                  <Text className="flex-1 text-sm leading-6 text-muted">{step}</Text>
                </View>
              ))}
            </View>
          )}

          <Pressable
            onPress={() => void runCheck()}
            disabled={busy}
            className="mt-6 items-center rounded-full border border-line bg-card px-5 py-3 disabled:opacity-60"
          >
            <Text className="font-bold text-navy">
              {state.status === 'checking' ? 'Checking…' : 'Check again'}
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
