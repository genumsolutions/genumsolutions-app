// =====================================================================
// authService - native sign-in primitives used by AppContext.
//
//   signInWithPassword()  -> direct Supabase email/password sign-in.
//   signInWithGoogle()    -> native Google in-app sign-in via
//                            @react-native-google-signin/google-signin.
//                            On success the ID token is exchanged
//                            for a Supabase session, then forwarded
//                            to the website via /api/auth/native-handoff.
//   forwardSessionToWebView() -> injects a fetch() into the loaded site that
//                            posts the tokens to /api/auth/native-handoff.
//                            That endpoint validates the tokens and writes
//                            the website's auth cookies, so the WebView
//                            behaves as fully signed in.
//   SecureStore            -> keeps the latest tokens so a cold start can
//                            hand the session back to the site (cookies may
//                            be cleared by the OS between launches).
// =====================================================================
import * as SecureStore from 'expo-secure-store';
import type { Session } from '@supabase/supabase-js';
import type { MutableRefObject } from 'react';
import type { WebView } from 'react-native-webview';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import {
  googleConfigured,
  googleWebClientId,
  supabase,
  supabaseConfigured,
} from '../config/supabase';

const SESSION_KEY = 'genum-native-session';

// ---------------------------------------------------------------------
// Google sign-in result union
// ---------------------------------------------------------------------
export type GoogleAuthResult =
  | { status: 'ok'; session: Session }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

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
  if (/not configured/i.test(m)) {
    return 'Sign-in is not set up yet. Please sign in on the website.';
  }
  return m;
}

function sessionFromResponse(session: Session | null): Session {
  if (!session?.access_token || !session?.refresh_token) {
    throw new Error('Sign-in did not return a session.');
  }
  return session;
}

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
  return sessionFromResponse(data.session);
}

// ---------------------------------------------------------------------
// Google (native in-app sign-in via Play Services)
// ---------------------------------------------------------------------
// Uses @react-native-google-signin/google-signin to open the standard
// Google account picker inside the app (no Chrome Custom Tab, no browser diversion).
// On success the ID token is exchanged for a Supabase session via
// signInWithIdToken, then handed to the website the same way as native password.
// If Play Services or configuration is missing, a graceful notice is returned.
export async function signInWithGoogle(): Promise<GoogleAuthResult> {
  if (!supabaseConfigured) {
    return { status: 'error', message: mapAuthError('not configured') };
  }
  if (!googleConfigured) {
    return {
      status: 'error',
      message:
        'Google sign-in isn\'t set up in this build yet. Please use email & password instead.',
    };
  }
  try {
    // The SDK requires the web client ID before signIn() can mint an ID token.
    // This SDK version (v16) resolves the Android server client automatically
    // from GCP via package + SHA-1, so passing webClientId alone is correct;
    // the Android client ID from .env.local is kept for dashboard reference.
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
      return { status: 'ok', session: data.session };
    }
    // User cancelled the picker or no ID token returned.
    return { status: 'cancelled' };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Google sign-in failed.';
    return { status: 'error', message };
  }
}

// ---------------------------------------------------------------------
// SecureStore session persistence
// ---------------------------------------------------------------------
type StoredTokenPair = { accessToken: string; refreshToken: string };

export async function persistNativeSession(session: Session): Promise<void> {
  const pair: StoredTokenPair = {
    accessToken: session.access_token,
    refreshToken: session.refresh_token!,
  };
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(pair));
}

export async function loadNativeSession(): Promise<StoredTokenPair | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredTokenPair;
    if (!parsed?.accessToken || !parsed?.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearNativeSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

// ---------------------------------------------------------------------
// Hand session tokens to the loaded website (adopts auth cookies there)
// ---------------------------------------------------------------------
export function forwardSessionToWebView(
  webRef: MutableRefObject<WebView | null>,
  tokens: StoredTokenPair | Session,
  opts?: { thenGoTo?: string },
): void {
  const accessToken =
    'access_token' in tokens ? tokens.access_token : tokens.accessToken;
  const refreshToken =
    'refresh_token' in tokens ? tokens.refresh_token! : tokens.refreshToken;
  const destination = opts?.thenGoTo
    ? `window.location.assign(${JSON.stringify(opts.thenGoTo)});`
    : 'window.location.reload();';
  webRef.current?.injectJavaScript(
    `(async function () {
      try {
        var res = await window.fetch('/api/auth/native-handoff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken: ${JSON.stringify(accessToken)},
            refreshToken: ${JSON.stringify(refreshToken)}
          })
        });
        if (res.ok) { ${destination} }
      } catch (e) {}
    })(); true;`,
  );
}