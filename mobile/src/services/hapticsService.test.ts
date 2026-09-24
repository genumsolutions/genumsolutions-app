// hapticsService.test.ts — C7 regression tests for the shared haptics API.
//
// Pins the contracts that matter at runtime:
//   1. expo-haptics is used on the native path (Light/Medium impact,
//      notification types, selection),
//   2. the preference gate silences EVERYTHING — including the raw
//      Vibration fallback — when haptics are off,
//   3. feedback calls NEVER throw, even when the native module rejects,
//   4. the pref persists to AsyncStorage ("on"/"off") and defaults ON.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

// ── mocks (factory creates state internally — vi.mock is hoisted) ──
vi.mock("react-native", () => {
  const vibrate = vi.fn();
  return {
    Platform: { OS: "android" },
    Vibration: { vibrate },
    __vibrate: vibrate,
  };
});

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

vi.mock("expo-haptics", () => {
  const state = { rejectWith: null as Error | null };
  const maybe = async () => {
    if (state.rejectWith) throw state.rejectWith;
  };
  return {
    ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
    NotificationFeedbackType: {
      Success: "success",
      Warning: "warning",
      Error: "error",
    },
    impactAsync: vi.fn(maybe),
    notificationAsync: vi.fn(maybe),
    selectionAsync: vi.fn(maybe),
    __state: state,
  };
});

vi.mock("./logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import { Vibration } from "react-native";
import * as Haptics from "expo-haptics";
import * as AsyncStorage from "@react-native-async-storage/async-storage";
import {
  feedbackTap,
  feedbackImpact,
  feedbackSuccess,
  feedbackWarning,
  feedbackSelection,
  loadHapticsPref,
  setHapticsEnabled,
  hapticsEnabledNow,
  HAPTICS_PREF_KEY,
  __resetForTests,
} from "./hapticsService";

// The service calls Vibration.vibrate — the mock factory attached __vibrate
// at the module's TOP level, but the Vibration export itself carries the
// `vibrate` mock directly (verified: Object.keys(Vibration) === ['vibrate']).
const vibrate = (Vibration as unknown as { vibrate: Mock }).vibrate;
const { impactAsync, notificationAsync, selectionAsync } =
  Haptics as unknown as {
    impactAsync: Mock;
    notificationAsync: Mock;
    selectionAsync: Mock;
  };
const store = (AsyncStorage as unknown as { __store: Map<string, string> })
  .__store;
const { __state } = Haptics as unknown as {
  __state: { rejectWith: Error | null };
};

beforeEach(() => {
  __resetForTests();
  vibrate.mockClear();
  impactAsync.mockClear();
  notificationAsync.mockClear();
  selectionAsync.mockClear();
  __state.rejectWith = null;
  store.clear();
});

describe("feedback primitives (native expo-haptics path)", () => {
  it("feedbackTap fires a Light impact instead of raw Vibration", () => {
    feedbackTap();
    expect(impactAsync).toHaveBeenCalledTimes(1);
    expect(impactAsync).toHaveBeenCalledWith("light");
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("feedbackImpact fires a Medium impact", () => {
    feedbackImpact();
    expect(impactAsync).toHaveBeenCalledWith("medium");
  });

  it("feedbackSuccess / feedbackWarning fire the notification types", () => {
    feedbackSuccess();
    expect(notificationAsync).toHaveBeenCalledWith("success");
    feedbackWarning();
    expect(notificationAsync).toHaveBeenCalledWith("warning");
  });

  it("feedbackSelection fires selectionAsync", () => {
    feedbackSelection();
    expect(selectionAsync).toHaveBeenCalledTimes(1);
  });

  it("never throws when the native module rejects", () => {
    __state.rejectWith = new Error("not on main thread");
    expect(() => feedbackTap()).not.toThrow();
    expect(() => feedbackImpact()).not.toThrow();
    expect(() => feedbackSuccess()).not.toThrow();
    expect(() => feedbackWarning()).not.toThrow();
    expect(() => feedbackSelection()).not.toThrow();
  });
});

describe("haptics preference", () => {
  it("defaults ON when nothing was stored", async () => {
    expect(await loadHapticsPref()).toBe(true);
    expect(hapticsEnabledNow()).toBe(true);
  });

  it("setHapticsEnabled(false) persists 'off' and silences ALL feedback", async () => {
    await setHapticsEnabled(false);
    expect(store.get(HAPTICS_PREF_KEY)).toBe("off");

    feedbackTap();
    feedbackImpact();
    feedbackSuccess();
    feedbackWarning();
    feedbackSelection();
    expect(impactAsync).not.toHaveBeenCalled();
    expect(notificationAsync).not.toHaveBeenCalled();
    expect(selectionAsync).not.toHaveBeenCalled();
    // Disabling does NOT fall back to the raw Vibration API — silence is silence.
    expect(vibrate).not.toHaveBeenCalled();

    await setHapticsEnabled(true);
    expect(store.get(HAPTICS_PREF_KEY)).toBe("on");
    feedbackTap();
    expect(impactAsync).toHaveBeenCalledTimes(1);
  });

  it("setHapticsEnabled survives an AsyncStorage failure (session still applies)", async () => {
    const original = store.set.bind(store);
    store.set = () => {
      throw new Error("disk full");
    };
    await expect(setHapticsEnabled(false)).resolves.toBeUndefined();
    expect(hapticsEnabledNow()).toBe(false);
    store.set = original;
  });
});
