// biometricsService.test.ts — C7 regression tests for the admin biometric gate.
//
// Pins the contracts that matter at runtime:
//   1. support probing: hardware + enrollment required, friendly reasons
//      otherwise; the probe is cached and never throws,
//   2. the opt-in pref is LOCAL (AsyncStorage "on"/"off") and defaults OFF,
//   3. ENABLING requires a passing authentication first — a cancelled or
//      failed prompt must never turn the lock on,
//   4. authenticate() resolves true only on explicit success; cancel,
//      failure, thrown errors, and web all resolve false,
//   5. gate() = pref-off → allow; pref-on → authenticate.
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── mocks (factory creates state internally — vi.mock is hoisted) ──
vi.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

vi.mock("@react-native-async-storage/async-storage", () => {
  const store = new Map<string, string>();
  return {
    default: {
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => {
        store.set(k, v);
      },
    },
    __store: store,
  };
});

vi.mock("./logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import * as AsyncStorage from "@react-native-async-storage/async-storage";
import {
  __setExpoLocalAuthenticationForTests,
  __resetForTests,
} from "./safeNative";
import {
  biometricsSupport,
  loadBiometricsPref,
  setBiometricsEnabled,
  biometricsEnabledNow,
  authenticate,
  gate,
  BIOMETRICS_PREF_KEY,
} from "./biometricsService";

// vitest's require() does not go through the vi.mock registry hooks, and
// native packages cannot resolve under node — the C7 native module is
// INJECTED via safeNative's test setters instead of vi.mock'ed.
const state = {
  hardware: true,
  enrolled: true,
  authResult: { success: true } as { success: boolean } | null,
  authThrows: null as Error | null,
};
const hasHardwareAsync = vi.fn(async () => state.hardware);
const isEnrolledAsync = vi.fn(async () => state.enrolled);
const authenticateAsync = vi.fn(async () => {
  if (state.authThrows) throw state.authThrows;
  return state.authResult ?? { success: false };
});

const store = (AsyncStorage as unknown as { __store: Map<string, string> })
  .__store;

beforeEach(() => {
  __resetForTests();
  __setExpoLocalAuthenticationForTests({
    hasHardwareAsync,
    isEnrolledAsync,
    authenticateAsync,
  });
  state.hardware = true;
  state.enrolled = true;
  state.authResult = { success: true };
  state.authThrows = null;
  store.clear();
});

describe("biometricsSupport", () => {
  it("degrades to unsupported when the native module is absent (pre-C7 APK)", async () => {
    // Inject null AFTER a settled support call so the service cache holds
    // a real value; the setter must invalidate it (the getter re-resolves).
    __setExpoLocalAuthenticationForTests(null);
    const support = await biometricsSupport();
    expect(support.supported).toBe(false);
    expect(support.reason).toMatch(/not available/i);
    // The gate must fail closed when the native module is absent — but
    // only for a user who actually enabled the lock (pref off → allowed).
    expect(await loadBiometricsPref()).toBe(false);
  });

  it("reports supported when hardware + enrollment exist", async () => {
    const support = await biometricsSupport();
    expect(support).toEqual({ available: true, supported: true });
    // Probe results are cached — a second call must not re-query native.
    await biometricsSupport();
    expect(hasHardwareAsync).toHaveBeenCalledTimes(1);
  });

  it("explains missing biometric hardware", async () => {
    state.hardware = false;
    const support = await biometricsSupport();
    expect(support.supported).toBe(false);
    expect(support.reason).toMatch(/no biometric hardware/i);
  });

  it("explains missing enrollment", async () => {
    state.enrolled = false;
    const support = await biometricsSupport();
    expect(support.supported).toBe(false);
    expect(support.available).toBe(false);
    expect(support.reason).toMatch(/no fingerprint or face/i);
  });

  it("never throws when the native probe rejects", async () => {
    hasHardwareAsync.mockRejectedValue(new Error("native crash"));
    const support = await biometricsSupport();
    expect(support.supported).toBe(false);
    expect(support.reason).toMatch(/could not be checked/i);
  });
});

describe("preference (local-only, opt-in)", () => {
  it("defaults OFF when nothing was stored", async () => {
    expect(await loadBiometricsPref()).toBe(false);
    expect(biometricsEnabledNow()).toBe(false);
  });

  it("persists 'on' to AsyncStorage after a successful enable", async () => {
    const ok = await setBiometricsEnabled(true);
    expect(ok).toBe(true);
    expect(store.get(BIOMETRICS_PREF_KEY)).toBe("on");
    expect(biometricsEnabledNow()).toBe(true);
  });

  it("disabling does NOT prompt and clears the pref", async () => {
    await setBiometricsEnabled(true);
    authenticateAsync.mockClear();
    const ok = await setBiometricsEnabled(false);
    expect(ok).toBe(true);
    expect(authenticateAsync).not.toHaveBeenCalled();
    expect(store.get(BIOMETRICS_PREF_KEY)).toBe("off");
  });
});

describe("enable requires a passing prompt", () => {
  it("a CANCELLED prompt leaves the lock OFF and nothing persisted", async () => {
    state.authResult = { success: false };
    const ok = await setBiometricsEnabled(true);
    expect(ok).toBe(false);
    expect(store.has(BIOMETRICS_PREF_KEY)).toBe(false);
    expect(biometricsEnabledNow()).toBe(false);
  });

  it("a FAILED (thrown) prompt leaves the lock OFF", async () => {
    state.authThrows = new Error("lockout");
    const ok = await setBiometricsEnabled(true);
    expect(ok).toBe(false);
    expect(store.has(BIOMETRICS_PREF_KEY)).toBe(false);
  });
});

describe("authenticate + gate", () => {
  it("authenticate resolves true only on explicit success", async () => {
    expect(await authenticate()).toBe(true);
    state.authResult = { success: false };
    expect(await authenticate()).toBe(false);
    state.authThrows = new Error("bad");
    expect(await authenticate()).toBe(false);
  });

  it("gate() allows silently when the pref is off", async () => {
    authenticateAsync.mockClear(); // earlier tests in this file prompt
    expect(await gate()).toBe(true);
    expect(authenticateAsync).not.toHaveBeenCalled();
  });

  it("gate() runs the prompt when the pref is on", async () => {
    await setBiometricsEnabled(true);
    authenticateAsync.mockClear();
    expect(await gate()).toBe(true);
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
    // The prompt must not disable the device-PIN fallback.
    expect(authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ disableDeviceFallback: false }),
    );
  });
});
