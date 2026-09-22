// =====================================================================
// settingsService — per-user preferences shared by the app + website
// through Supabase only (no direct app↔website calls; the bridge rule).
//
// Two pieces of shared truth:
//   • profiles.theme_preference — the flat theme choice. Canonical DB
//     values going forward: 'light' | 'dim' (2-mode, owner decision
//     2026-09-22). The legacy 'system' (OS-follow) value migrates to
//     'dim' on read; never stored again. The app's ThemeMode is
//     'system' | 'light' | 'dark', so map at this boundary: the app's
//     'dark' ↔ the canonical 'dim', and any legacy 'system' reads as
//     'dark'. Never store 'system'/'dark' in the DB.
//   • user_settings.settings    — a JSONB bag for arbitrary per-user
//     preferences (e.g. robot command keywords, notification quirks).
//     The website mirrors the same rows via /api/user-settings, so a
//     preference set here shows up on the website and vice versa.
//
// Offline-first: the last saved value is cached in AsyncStorage so the
// app keeps its look and feel with no session and no network; cloud
// values are adopted opportunistically on sign-in (cloud wins only
// when the user has actually saved a preference there).
// =====================================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';
import type { ThemeMode } from '../context/AppContext';

const THEME_CACHE_KEY = 'genum-theme-mode'; // existing AppContext cache key
const SETTINGS_CACHE_KEY = 'genum-user-settings';

/** App ThemeMode -> canonical DB value (2-mode: 'dark' → 'dim', 'system' never stored). */
export function themeModeToPreference(mode: ThemeMode): 'light' | 'dim' {
  return mode === 'light' ? 'light' : 'dim';
}

/** Canonical DB value -> app ThemeMode (legacy 'system' → 'dark'; unknown → 'light'). */
export function preferenceToThemeMode(value: unknown): ThemeMode {
  if (value === 'light') return 'light';
  if (value === 'dark') return 'dark';
  if (value === 'dim' || value === 'system') return 'dark';
  return 'light';
}

export type UserSettings = Record<string, string | number | boolean | (string | number | boolean)[]>;

function cacheSettings(value: UserSettings) {
  void AsyncStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(value)).catch(() => undefined);
}

// ---------------------------------------------------------------------
// Theme preference (profiles.theme_preference)
// ---------------------------------------------------------------------

export async function fetchThemePreference(): Promise<ThemeMode | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('theme_preference')
    .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
    .maybeSingle();
  if (error) return null;
  const stored = preferenceToThemeMode(data?.theme_preference);
  await AsyncStorage.setItem(THEME_CACHE_KEY, stored);
  return stored;
}

export async function saveThemePreference(mode: ThemeMode): Promise<boolean> {
  // Cache holds the app's own ThemeMode (light/dark) — NOT the canonical
  // DB value — so a restart restores the same look (was writing 'dim' here,
  // which the restore effect never recognized → dark never survived restarts).
  await AsyncStorage.setItem(THEME_CACHE_KEY, mode);
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ theme_preference: themeModeToPreference(mode) })
      .eq('id', (await supabase.auth.getUser().then((r) => r.data.user?.id)) ?? '');
    return !error;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------
// Generic settings (user_settings.settings JSONB)
// ---------------------------------------------------------------------

export async function fetchSettings(): Promise<UserSettings> {
  try {
    const cached = await AsyncStorage.getItem(SETTINGS_CACHE_KEY);
    if (cached) return JSON.parse(cached) as UserSettings;
  } catch {
    /* ignore cache read failures */
  }
  return {};
}

/** Overwrite the whole settings bag (simple scalar/array values only). */
export async function saveSettings(settings: UserSettings): Promise<boolean> {
  const clean: UserSettings = {};
  for (const [key, value] of Object.entries(settings)) {
    if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(key)) continue;
    if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) {
      clean[key] = value;
    } else if (Array.isArray(value) && value.length <= 100 && value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))) {
      clean[key] = value;
    }
  }
  cacheSettings(clean);
  try {
    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: (await supabase.auth.getUser().then((r) => r.data.user?.id)) ?? '', settings: clean, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    return !error;
  } catch {
    return false;
  }
}

/** Merge one or many keys into the settings bag (last write wins per key). */
export async function updateSettings(patch: UserSettings): Promise<boolean> {
  const current = await fetchSettings();
  return saveSettings({ ...current, ...patch });
}

/** Read one typed value from the local cache (fast, offline-safe). */
export async function readSetting<T extends string | number | boolean>(key: string, fallback: T): Promise<T> {
  const settings = await fetchSettings();
  const value = settings[key];
  return typeof value === typeof fallback ? (value as T) : fallback;
}

/**
 * Adopt the cloud preference on sign-in: fetch theme + settings, apply,
 * and cache. Cloud wins only when the user has actually saved something
 * there — an absent profile value falls back to the local choice.
 */
export async function syncOnSignIn(applyTheme: (mode: ThemeMode) => void): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('theme_preference')
      .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
      .maybeSingle();
    if (error || !data) return;
    const stored = data.theme_preference;
    // Unknown or absent cloud value — the local choice stays authoritative.
    // Legacy 'system' rows are accepted and read as 'dark' (= 'dim').
    if (stored !== 'system' && stored !== 'light' && stored !== 'dim') return;
    const mode = preferenceToThemeMode(stored);
    await AsyncStorage.setItem(THEME_CACHE_KEY, mode);
    applyTheme(mode);
    const settingsResult = await supabase
      .from('user_settings')
      .select('settings')
      .eq('user_id', (await supabase.auth.getUser().then((r) => r.data.user?.id)) ?? '')
      .maybeSingle();
    if (settingsResult.error || !settingsResult.data?.settings) return;
    cacheSettings(settingsResult.data.settings as UserSettings);
  } catch {
    /* offline or not configured — local values stay authoritative */
  }
}
