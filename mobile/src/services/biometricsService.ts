// =====================================================================
// biometricsService — C7: device-biometric gate for the admin console.
//
// Staff/admin/owner can opt into requiring Face ID / fingerprint (or the
// device PIN as fallback) before the Admin screen becomes operable. The
// choice is a LOCAL device preference (AsyncStorage, `on`/`off`) — it
// must never live in the cloud settings bag, so it never leaves the
// device and can't be flipped remotely.
//
// What it is NOT: a substitute for the server-side RBAC. Every admin
// action is still authorized server-side (staff+/admin+ re-verified by
// the edge functions / RPCs). This only stops a passer-by from opening
// an unlocked phone straight into the admin dashboard.
//
// Static import is OTA-safe here BY DESIGN: `runtimeVersion: appVersion`
// (see app.json) pins every OTA bundle to its own native release, so a
// bundle referencing expo-local-authentication can only ever execute
// inside an APK that already contains the native module. Web is
// unsupported → `supported` is false and every call no-ops.
// =====================================================================
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getExpoLocalAuthentication,
  __onNativeModuleChanged,
  type ExpoLocalAuthModule,
} from "./safeNative";
import { logger } from "./logger";

/** AsyncStorage key holding "on" | "off" (absent = OFF — opt-in). */
export const BIOMETRICS_PREF_KEY = "genum-biometrics-admin";

export type BiometricsSupport = {
  /** The device has enrolled biometrics (hardware + enrollment). */
  available: boolean;
  /** The platform can offer the feature at all (native + hardware). */
  supported: boolean;
  /** Human-readable reason when unsupported (shown in the Settings row). */
  reason?: string;
};

// --- support probing ----------------------------------------------------

/** Probe the device once per session; never throws. */
let supportCache: BiometricsSupport | undefined;
// Test-injection hook: when safeNative's module handle is (re)set, drop the
// cached probe so the next call re-evaluates against the new module.
__onNativeModuleChanged(() => {
  supportCache = undefined;
});
export async function biometricsSupport(): Promise<BiometricsSupport> {
  if (supportCache) return supportCache;
  // Lazy require via safeNative: an OTA bundle inside a pre-C7 APK has no
  // native module — degrade to "unsupported" (feature hidden) instead of
  // crashing at import time.
  const LocalAuthentication =
    getExpoLocalAuthentication() as ExpoLocalAuthModule | null;
  if (Platform.OS === "web" || !LocalAuthentication) {
    supportCache = {
      available: false,
      supported: false,
      reason: "Not available on the web app.",
    };
    return supportCache;
  }
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      supportCache = {
        available: false,
        supported: false,
        reason: "This device has no biometric hardware.",
      };
      return supportCache;
    }
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) {
      supportCache = {
        available: false,
        supported: false,
        reason: "No fingerprint or face is enrolled on this device.",
      };
      return supportCache;
    }
    supportCache = { available: true, supported: true };
    return supportCache;
  } catch (e) {
    logger.warn("biometrics", "support probe failed", e);
    supportCache = {
      available: false,
      supported: false,
      reason: "Biometrics could not be checked on this device.",
    };
    return supportCache;
  }
}

// --- preference (local-only, opt-in) ------------------------------------

let prefLoaded = false;
let biometricsEnabled = false;

function cachePref(on: boolean) {
  biometricsEnabled = on;
  prefLoaded = true;
}

/** Load the stored opt-in once per session (AsyncStorage best-effort). */
export async function loadBiometricsPref(): Promise<boolean> {
  if (prefLoaded) return biometricsEnabled;
  try {
    const stored = await AsyncStorage.getItem(BIOMETRICS_PREF_KEY);
    cachePref(stored === "on");
  } catch {
    cachePref(false);
  }
  return biometricsEnabled;
}

/**
 * Enable/disable the admin gate. Enabling REQUIRES a successful
 * authentication first — the user proves it works before we lock
 * anything (and this doubles as the OS "consent" prompt on some ROMs).
 * Returns false (and leaves the pref untouched) when the prompt fails
 * or is cancelled.
 */
export async function setBiometricsEnabled(on: boolean): Promise<boolean> {
  if (on) {
    const ok = await authenticate("Confirm to enable admin lock");
    if (!ok) return false; // caller keeps the toggle off
  }
  cachePref(on);
  try {
    await AsyncStorage.setItem(BIOMETRICS_PREF_KEY, on ? "on" : "off");
  } catch (e) {
    logger.warn("biometrics", "persist biometrics pref failed", e);
  }
  return true;
}

export function biometricsEnabledNow(): boolean {
  return biometricsEnabled;
}

// --- the gate ------------------------------------------------------------

/**
 * Show the biometric prompt. Resolves true ONLY on an explicit success;
 * cancel/failure/lockout all resolve false (the caller shows the lock UI).
 * The device PIN/passcode fallback stays enabled — biometrics can be
 * flaky (wet fingers, face masks) and the admin must never be locked out
 * of their own device.
 */
export async function authenticate(
  promptMessage = "Unlock the admin console",
): Promise<boolean> {
  const LocalAuthentication =
    getExpoLocalAuthentication() as ExpoLocalAuthModule | null;
  if (Platform.OS === "web" || !LocalAuthentication) return false;
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
    });
    return result?.success === true;
  } catch (e) {
    logger.warn("biometrics", "authenticate failed", e);
    return false;
  }
}

/**
 * One-call gate for screens: returns true when access may proceed —
 * either the gate is off, or the user just passed the biometric prompt.
 */
export async function gate(): Promise<boolean> {
  const enabled = await loadBiometricsPref();
  if (!enabled) return true;
  return authenticate();
}

/** @internal test-only reset of the module-level caches (support + pref). */
export function __resetForTests(): void {
  supportCache = undefined;
  prefLoaded = false;
  biometricsEnabled = false;
}
