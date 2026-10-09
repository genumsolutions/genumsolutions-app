// =====================================================================
// authService - native Supabase authentication primitives.
//
// The app signs in DIRECTLY against the shared Supabase project (the same
// Auth + profiles the website uses), so there is no WebView/hand-off step.
//
//   signInWithPassword()   -> email/password
//   signUp()               -> create an account (profile auto-created by DB)
//   signInWithGoogle()     -> native Google in-app sign-in
//   resetPassword()        -> email a reset link (Supabase handles the page)
//
// The live session is read via supabase.auth.getSession() and kept current
// with onAuthStateChange (see AppContext). SecureStore is used to survive a
// cold start. The saved snapshot is REWRITTEN on every refresh so the stored
// pair never goes stale, and transient/offline errors never delete it — the
// session is only ever wiped by an explicit sign-out or a refresh the server
// has genuinely rejected (see isRetryableAuthError).
// =====================================================================
import * as SecureStore from "expo-secure-store";
import { isAuthRetryableFetchError, type Session } from "@supabase/supabase-js";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import {
  googleConfigured,
  googleWebClientId,
  supabase,
  supabaseConfigured,
} from "../config/supabase";

const SESSION_KEY = "genum-native-session";

/** The last-known signed-in user, cached next to the tokens so a session
 *  can be restored optimistically while offline (tier/role are the fields
 *  that gate Pro features, so they must survive a network hand-off). */
export type StoredSessionUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  role: string;
  tier: "free" | "pro";
};

/** The SecureStore snapshot. Older entries (v1) stored only the token pair;
 *  `user` is optional so those still restore. */
export type StoredSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  savedAt: number;
  user: StoredSessionUser | null;
};

/**
 * Decide whether an auth failure is worth retrying rather than treating as
 * signed-out. A network/offline drop while the refresh token is still good is
 * transient — wiping the session there is what forced the "sign in again"
 * loop after Wi-Fi changes. A non-retryable error (refresh token revoked or
 * expired server-side) is a genuine logout.
 *
 * Supabase wraps offline fetch failures in AuthRetryableFetchError; RN fetch
 * can also surface a raw TypeError, so the message is checked too.
 */
export function isRetryableAuthError(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /network|fetch failed|failed to fetch|timeout|aborted|offline|no internet|connection|socket|ECONN/i.test(
    message,
  );
}

/** Map Supabase's server messages to user-friendly text. */
export function mapAuthError(message: string): string {
  const m = message || "";
  if (/invalid login credentials/i.test(m)) {
    return "Email or password is incorrect.";
  }
  if (/email not confirmed/i.test(m)) {
    return "Please confirm your email before signing in.";
  }
  if (/already registered/i.test(m)) {
    return "An account with this email already exists.";
  }
  if (/rate limit/i.test(m)) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (/password should be at least/i.test(m)) {
    return "Password must be at least 6 characters.";
  }
  if (/not configured/i.test(m)) {
    return "Sign-in is not set up yet. Please try email & password.";
  }
  return m;
}

export type GoogleAuthResult =
  | { status: "ok"; session: Session }
  | { status: "cancelled" }
  | { status: "error"; message: string };

// ---------------------------------------------------------------------
// Email / password
// ---------------------------------------------------------------------
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<Session> {
  if (!supabaseConfigured) throw new Error("not configured");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw new Error(error.message);
  const session = data.session;
  if (!session?.access_token)
    throw new Error("Sign-in did not return a session.");
  await persistSession(session);
  return session;
}

export async function signUp(
  name: string,
  email: string,
  password: string,
): Promise<Session | null> {
  if (!supabaseConfigured) throw new Error("not configured");
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { name: name.trim() } },
  });
  if (error) throw new Error(error.message);
  // If confirmation is required the returned session may be null; the user
  // must confirm their email before signing in.
  return data.session;
}

export async function resetPassword(email: string): Promise<void> {
  if (!supabaseConfigured) return;
  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
  );
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------

/**
 * Clear the native Google account cached by GoogleSignin so the next
 * signIn() always presents the account chooser. Without this, the native
 * layer silently reuses the last signed-in Google account (even across app
 * restarts), so signing in again never lets the user pick a different id.
 */
async function clearCachedGoogleAccount(): Promise<void> {
  try {
    if (GoogleSignin.hasPreviousSignIn()) {
      await GoogleSignin.signOut();
    }
  } catch {
    // No native Google session to clear - the chooser will appear anyway.
  }
}

export async function signInWithGoogle(): Promise<GoogleAuthResult> {
  if (!supabaseConfigured) {
    return { status: "error", message: mapAuthError("not configured") };
  }
  if (!googleConfigured) {
    return {
      status: "error",
      message:
        "Google sign-in isn't set up in this build yet. Please use email & password instead.",
    };
  }
  try {
    GoogleSignin.configure({ webClientId: googleWebClientId });
    await GoogleSignin.hasPlayServices();
    // Drop any cached native account first so signIn() shows the account
    // picker instead of instantly reusing the last signed-in Google id.
    await clearCachedGoogleAccount();
    const response = await GoogleSignin.signIn();
    if (response.data?.idToken) {
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: response.data.idToken,
      });
      if (error) {
        return {
          status: "error",
          message:
            "Google sign-in failed. Please try signing in with email, or make sure Google is configured in the Supabase dashboard.",
        };
      }
      if (data.session) await persistSession(data.session);
      return { status: "ok", session: data.session! };
    }
    return { status: "cancelled" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Google sign-in failed.";
    return { status: "error", message };
  }
}

// ---------------------------------------------------------------------
// Session persistence (SecureStore) + logout
// ---------------------------------------------------------------------
export async function persistSession(
  session: Session,
  user?: StoredSessionUser | null,
): Promise<void> {
  try {
    const snapshot: StoredSession = {
      accessToken: session.access_token,
      refreshToken: session.refresh_token ?? "",
      expiresAt: session.expires_at ?? null,
      savedAt: Date.now(),
      user: user ?? null,
    };
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(snapshot));
  } catch {
    /* SecureStore failure is non-fatal; the live session still counts */
  }
}

export async function loadStoredSession(): Promise<StoredSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    // v1 entries stored only the token pair; `user` is optional.
    if (!parsed?.accessToken) return null;
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken ?? "",
      expiresAt: parsed.expiresAt ?? null,
      savedAt: parsed.savedAt ?? 0,
      user: parsed.user ?? null,
    };
  } catch {
    return null;
  }
}

export async function clearStoredSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export async function signOut(): Promise<void> {
  // Clear the native Google cached account too, so a later sign-in via
  // Google always prompts for which account to use rather than restoring
  // the last one automatically.
  await clearCachedGoogleAccount();
  await supabase.auth.signOut();
  await clearStoredSession();
}
