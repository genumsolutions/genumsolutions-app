import { describe, expect, it } from "vitest";
import appJson from "../../app.json";
import { APP_VERSION } from "./site";
import { LOCAL_CAR_MODES } from "./roboCarCatalog";
import { APK_URL, RELEASE_MANIFEST_URL } from "./update";

// =====================================================================
// Cross-cutting parity guards for the GENUM mobile app.
//
// These verify the contracts that keep the app self-consistent across
// release bumps (AGENTS.md -> "Release") and the shared app-releases
// bucket that the website /app page + in-app updater both read.
// =====================================================================

describe("release version parity (app.json <-> src/config/site.ts)", () => {
  // AGENTS.md: app.json version + versionCode is the single source of truth;
  // APP_VERSION in site.ts must be bumped together on every release.
  it("matches APP_VERSION to the app.json version", () => {
    expect(APP_VERSION).toBe(appJson.expo.version);
  });

  it("uses a semver version and a positive versionCode", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(appJson.expo.android.versionCode).toBeGreaterThan(0);
  });
});

describe("robo-car catalogue parity (9 modes from the ESP32 remote firmware)", () => {
  it("exposes exactly the 9 firmware modes", () => {
    expect(LOCAL_CAR_MODES.length).toBe(9);
  });

  it("has unique ids and uppercase tokens", () => {
    const ids = LOCAL_CAR_MODES.map((m) => m.id);
    const tokens = LOCAL_CAR_MODES.map((m) => m.token);
    expect(new Set(ids).size).toBe(9);
    expect(new Set(tokens).size).toBe(9);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Z0-9_]+$/);
    }
  });

  it("carries the full UI + drive fields on every mode", () => {
    for (const mode of LOCAL_CAR_MODES) {
      expect(mode.car.length).toBeGreaterThan(0);
      expect(mode.wheel.length).toBeGreaterThan(0);
      expect(mode.steering.length).toBeGreaterThan(0);
      expect(mode.blurb.length).toBeGreaterThan(0);
      expect(mode.transport.length).toBeGreaterThan(0);
      expect(mode.controls.length).toBeGreaterThan(0);
    }
  });
});

describe("update channel parity (shared app-releases bucket)", () => {
  // The app's in-app updater and the website /app page read the SAME
  // Supabase bucket, so these URLs must never drift to another store.
  it("points the APK at the shared app-releases bucket", () => {
    expect(APK_URL).toContain("/storage/v1/object/public/app-releases/");
    expect(APK_URL).toMatch(/genum-solutions-latest\.apk$/);
  });

  it("points the manifest at the shared app-releases bucket", () => {
    expect(RELEASE_MANIFEST_URL).toContain(
      "/storage/v1/object/public/app-releases/",
    );
    expect(RELEASE_MANIFEST_URL).toMatch(/release\.json$/);
  });

  it("uses the same Supabase project across both URLs", () => {
    const ref = (url: string) =>
      url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
    expect(ref(APK_URL)).toBe(ref(RELEASE_MANIFEST_URL));
    expect(ref(APK_URL)).toBe("bkylfnlybtsujwzropru");
  });
});
