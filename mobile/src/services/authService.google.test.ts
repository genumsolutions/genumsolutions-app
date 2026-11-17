// Regression test for the Google sign-in path (2026-11-12).
//
// The old flow treated "Continue with Google" on the sign-in form as
// sign-in-only: when Supabase created a row for a new Google identity, the app
// POSTed to the website's /api/auth/google/fresh so the service role could
// delete it. The intent hint was best-effort, so genuine sign-ups were created
// and then deleted minutes later, and the customer was asked to sign up again.
//
// A verified Google identity now registers as well as signs in. This test pins
// that: a session is persisted and the app never calls a delete endpoint.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signInWithIdToken = vi.fn();
const secureSet = vi.fn();
const googleSignIn = vi.fn();

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: (...args: unknown[]) => secureSet(...args),
  deleteItemAsync: vi.fn(async () => undefined),
}));

vi.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: vi.fn(),
    hasPlayServices: vi.fn(async () => true),
    hasPreviousSignIn: vi.fn(() => false),
    signOut: vi.fn(async () => undefined),
    signIn: (...args: unknown[]) => googleSignIn(...args),
  },
}));

vi.mock("../config/supabase", () => ({
  supabaseConfigured: true,
  googleConfigured: true,
  googleWebClientId: "test-web-client-id",
  supabase: {
    auth: {
      signInWithIdToken: (...args: unknown[]) => signInWithIdToken(...args),
    },
  },
}));

import { signInWithGoogle } from "./authService";

function session(createdAt: string) {
  return {
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_at: 1_790_000_000,
    user: { id: "user-1", created_at: createdAt, email: "new@example.com" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("signInWithGoogle", () => {
  it("keeps a brand-new Google account instead of deleting it", async () => {
    googleSignIn.mockResolvedValue({ data: { idToken: "google-id-token" } });
    signInWithIdToken.mockResolvedValue({
      data: { session: session(new Date().toISOString()) },
      error: null,
    });

    const result = await signInWithGoogle();

    expect(result.status).toBe("ok");
    expect(signInWithIdToken).toHaveBeenCalledWith({
      provider: "google",
      token: "google-id-token",
    });
    expect(secureSet).toHaveBeenCalledWith(
      "genum-native-session",
      expect.any(String),
    );
    const stored = JSON.parse(secureSet.mock.calls[0][1] as string);
    expect(stored.accessToken).toBe("access-token");
    // The retired flow called the website's delete endpoint for fresh rows.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("signs in an existing account the same way", async () => {
    googleSignIn.mockResolvedValue({ data: { idToken: "google-id-token" } });
    signInWithIdToken.mockResolvedValue({
      data: { session: session("2026-01-01T00:00:00.000Z") },
      error: null,
    });

    const result = await signInWithGoogle();

    expect(result.status).toBe("ok");
    expect(secureSet).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports a cancelled account chooser without persisting anything", async () => {
    googleSignIn.mockResolvedValue({ data: null });

    const result = await signInWithGoogle();

    expect(result.status).toBe("cancelled");
    expect(secureSet).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
