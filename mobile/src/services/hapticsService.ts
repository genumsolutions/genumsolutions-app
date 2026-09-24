// =====================================================================
// hapticsService — C7: the ONE haptic-feedback entry point of the app.
//
// The codebase had ~20 raw `Vibration.vibrate(10)` calls scattered across
// screens/components. expo-haptics gives platform-correct feedback
// (Android: VibrationEffect amplitude control; iOS: UIImpactFeedbackGenerator
// / UINotificationFeedbackGenerator), so this service:
//
//   • exposes semantic primitives (tap / impact / success / warning /
//     selection) instead of magic millisecond numbers,
//   • respects the user's haptics on/off preference (AsyncStorage,
//     default ON to match today's always-vibrate behavior),
//   • NEVER throws — a cosmetic feedback failure must never break the
//     tap that triggered it — falling back to the plain `Vibration` API
//     on web or when the native side is unavailable.
//
// Static import is OTA-safe here BY DESIGN: `runtimeVersion: appVersion`
// (see app.json) pins every OTA bundle to its own native release, so a
// bundle referencing expo-haptics can only ever execute inside an APK
// that already contains the native module.
// =====================================================================
import { Platform, Vibration } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { logger } from "./logger";

/** AsyncStorage key holding "on" | "off" (absent = ON, the old behavior). */
export const HAPTICS_PREF_KEY = "genum-haptics";

// --- preference (read-through cache; best-effort persistence) ---------
let hapticsEnabled = true;
let prefLoaded = false;

function cachePref(on: boolean) {
  hapticsEnabled = on;
  prefLoaded = true;
}

/** Load the stored preference once per session (AsyncStorage best-effort). */
export async function loadHapticsPref(): Promise<boolean> {
  if (prefLoaded) return hapticsEnabled;
  try {
    const stored = await AsyncStorage.getItem(HAPTICS_PREF_KEY);
    cachePref(stored !== "off");
  } catch {
    cachePref(true); // default ON — matches the pre-C7 always-vibrate behavior
  }
  return hapticsEnabled;
}

/** Enable/disable haptic feedback and persist the choice. */
export async function setHapticsEnabled(on: boolean): Promise<void> {
  cachePref(on);
  try {
    await AsyncStorage.setItem(HAPTICS_PREF_KEY, on ? "on" : "off");
  } catch (e) {
    logger.warn("haptics", "persist haptics pref failed", e);
  }
}

/** Current in-memory preference (call loadHapticsPref() first to hydrate). */
export function hapticsEnabledNow(): boolean {
  return hapticsEnabled;
}

// --- feedback primitives (all fire-and-forget, never throw) -----------

/** Short tick for taps/presses (replaces `Vibration.vibrate(10)`). */
export function feedbackTap(): void {
  impact(Haptics.ImpactFeedbackStyle.Light, 10);
}

/**
 * Heavier pulse for confirmations / high-emphasis actions (replaces the
 * 50ms vibrate on e.g. the drone Emergency Stop).
 */
export function feedbackImpact(): void {
  impact(Haptics.ImpactFeedbackStyle.Medium, 20);
}

/** Success notification (order placed, save succeeded, …). */
export function feedbackSuccess(): void {
  notify(Haptics.NotificationFeedbackType.Success);
}

/** Warning notification (validation issues, connection lost, …). */
export function feedbackWarning(): void {
  notify(Haptics.NotificationFeedbackType.Warning);
}

/** Subtle selection change (pickers, segmented toggles). */
export function feedbackSelection(): void {
  if (!hapticsEnabled || Platform.OS === "web") return;
  try {
    void Haptics.selectionAsync().catch(() => undefined);
  } catch {
    /* never break the caller over a cosmetic failure */
  }
}

// --- internals ---------------------------------------------------------

function impact(style: Haptics.ImpactFeedbackStyle, fallbackMs: number): void {
  if (!hapticsEnabled) return;
  if (Platform.OS !== "web") {
    try {
      void Haptics.impactAsync(style).catch(() => undefined);
      return;
    } catch {
      /* fall through to Vibration */
    }
  }
  // Fallback: the pre-C7 behavior (also covers web, where Vibration is a
  // no-op, and any exotic runtime where the native side rejects at call).
  try {
    Vibration.vibrate(fallbackMs);
  } catch {
    /* ignore */
  }
}

function notify(type: Haptics.NotificationFeedbackType): void {
  if (!hapticsEnabled) return;
  if (Platform.OS !== "web") {
    try {
      void Haptics.notificationAsync(type).catch(() => undefined);
      return;
    } catch {
      /* fall through to Vibration */
    }
  }
  try {
    Vibration.vibrate(30);
  } catch {
    /* ignore */
  }
}

/** @internal test-only reset of the module-level caches (pref). */
export function __resetForTests(): void {
  prefLoaded = false;
  hapticsEnabled = true;
}
