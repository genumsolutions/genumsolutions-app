// =====================================================================
// safeNative — crash-safe lazy access to Expo native modules.
//
// C7 adds expo-haptics + expo-local-authentication as NATIVE deps. The
// appVersion runtime policy pins OTA bundles to the SAME version APK that
// is already installed, so an OTA published after these deps were added
// can still execute on devices whose APK predates them. A static import
// of a missing native module can throw during bundle evaluation (app
// won't start), so every access goes through here: cached require, never
// throws, null = "not available" — callers degrade gracefully
// (haptics → Vibration fallback; biometrics → feature hidden).
//
// Once the next APK ships (3.2.6+), the modules exist natively and these
// accessors simply return the real module.
// =====================================================================

/* eslint-disable @typescript-eslint/no-require-imports */

type AnyModule = Record<string, unknown> | null;

let hapticsModule: AnyModule | undefined;
let localAuthModule: AnyModule | undefined;

/** Shape of expo-haptics the haptics service relies on (strings at runtime). */
export type ExpoHapticsModule = {
  ImpactFeedbackStyle: { Light: string; Medium: string; Heavy: string };
  NotificationFeedbackType: {
    Success: string;
    Warning: string;
    Error: string;
  };
  impactAsync: (style: string) => Promise<void>;
  notificationAsync: (type: string) => Promise<void>;
  selectionAsync: () => Promise<void>;
};

/** expo-haptics (null on web / old APK without the native side). */
export function getExpoHaptics(): AnyModule {
  if (hapticsModule === undefined) {
    try {
      hapticsModule = require("expo-haptics") as AnyModule;
    } catch {
      hapticsModule = null;
    }
  }
  return hapticsModule;
}

/** Shape of expo-local-authentication the biometrics service relies on. */
export type ExpoLocalAuthModule = {
  hasHardwareAsync: () => Promise<boolean>;
  isEnrolledAsync: () => Promise<boolean>;
  authenticateAsync: (options?: {
    promptMessage?: string;
    cancelLabel?: string;
    disableDeviceFallback?: boolean;
  }) => Promise<{ success: boolean; error?: string; warning?: string }>;
};

/** expo-local-authentication (null on web / old APK without the native side). */
export function getExpoLocalAuthentication(): AnyModule {
  if (localAuthModule === undefined) {
    try {
      localAuthModule = require("expo-local-authentication") as AnyModule;
    } catch {
      localAuthModule = null;
    }
  }
  return localAuthModule;
}

/** @internal test-only reset of the cached module handles. */
export function __resetForTests(): void {
  hapticsModule = undefined;
  localAuthModule = undefined;
  notifyModuleChanged();
}

/**
 * @internal test-only injection: node-side vitest cannot resolve native
 * packages via require() (and vi.mock does not intercept require), so tests
 * install fakes through these setters instead of mocking the module.
 *
 * Consumers that cache decisions derived from the module (e.g. the
 * biometrics support probe) register an invalidation hook via
 * __onNativeModuleChanged so a re-injection clears stale cached results.
 */
export function __setExpoHapticsForTests(mod: AnyModule): void {
  hapticsModule = mod;
  notifyModuleChanged();
}

/** @internal test-only injection (see __setExpoHapticsForTests). */
export function __setExpoLocalAuthenticationForTests(mod: AnyModule): void {
  localAuthModule = mod;
  notifyModuleChanged();
}

// --- change notifications --------------------------------------------

type ChangedHook = () => void;
const changedHooks: ChangedHook[] = [];

function notifyModuleChanged(): void {
  for (const hook of changedHooks) {
    try {
      hook();
    } catch {
      /* hooks are test-only — never let one break the others */
    }
  }
}

/**
 * @internal register a hook fired whenever a module handle is (re)set or
 * cleared. Returns an unsubscribe function.
 */
export function __onNativeModuleChanged(hook: ChangedHook): () => void {
  changedHooks.push(hook);
  return () => {
    const i = changedHooks.indexOf(hook);
    if (i >= 0) changedHooks.splice(i, 1);
  };
}
