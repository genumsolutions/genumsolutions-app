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
// cold start when the OS clears the in-memory session.
// =====================================================================
import * as SecureStore from 'expo-secure-store';
import type { Session } from '@supabase/supabase-js';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import {
  googleConfigured,
  googleWebClientId,
  supabase,
  supabaseConfigured,
} from '../config/supabase';

const SESSION_KEY = 'genum-native-session';

/** Map Supabase's server messages to user-friendly text. */
export function mapAuthError(message: string): string {
  const m = message || '';
  if (/invalid login credentials/i.test(m)) {
    return 'Email or password is incorrect.';
  }
  if (/email not confirmed/i.test(m)) {
    return 'Please confirm your email before signing in.';
  }
  if (/already registered/i.test(m)) {
    return 'An account with this email already exists.';
  }
  if (/rate limit/i.test(m)) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (/password should be at least/i.test(m)) {
    return 'Password must be at least 6 characters.';
  }
  if (/not configured/i.test(m)) {
    return 'Sign-in is not set up yet. Please try email & password.';
  }
  return m;
}

export type GoogleAuthResult =
  | { status: 'ok'; session: Session }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

// ---------------------------------------------------------------------
// Email / password
// ---------------------------------------------------------------------
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<Session> {
  if (!supabaseConfigured) throw new Error('not configured');
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw new Error(error.message);
  const session = data.session;
  if (!session?.access_token) throw new Error('Sign-in did not return a session.');
  await persistSession(session);
  return session;
}

export async function signUp(
  name: string,
  email: string,
  password: string,
): Promise<Session | null> {
  if (!supabaseConfigured) throw new Error('not configured');
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
export async function signInWithGoogle(): Promise<GoogleAuthResult> {
  if (!supabaseConfigured) {
    return { status: 'error', message: mapAuthError('not configured') };
  }
  if (!googleConfigured) {
    return {
      status: 'error',
      message:
        "Google sign-in isn't set up in this build yet. Please use email & password instead.",
    };
  }
  try {
    GoogleSignin.configure({ webClientId: googleWebClientId });
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (response.data?.idToken) {
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: response.data.idToken,
      });
      if (error) {
        return {
          status: 'error',
          message:
            'Google sign-in failed. Please try signing in with email, or make sure Google is configured in the Supabase dashboard.',
        };
      }
      if (data.session) await persistSession(data.session);
      return { status: 'ok', session: data.session! };
    }
    return { status: 'cancelled' };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Google sign-in failed.';
    return { status: 'error', message };
  }
}

// ---------------------------------------------------------------------
// Session persistence (SecureStore) + logout
// ---------------------------------------------------------------------
export async function persistSession(session: Session): Promise<void> {
  try {
    const pair = {
      accessToken: session.access_token,
      refreshToken: session.refresh_token ?? '',
    };
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(pair));
  } catch {
    /* SecureStore failure is non-fatal; the live session still counts */
  }
}

export async function loadStoredSession(): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      accessToken: string;
      refreshToken: string;
    };
    if (!parsed?.accessToken) return null;
    return parsed;
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
  await supabase.auth.signOut();
  await clearStoredSession();
}
