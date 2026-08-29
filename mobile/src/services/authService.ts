// =====================================================================
// authService - native sign-in primitives used by AppContext.
//
//   signInWithPassword()  -> direct Supabase email/password sign-in.
//   signInWithGoogle()    -> PKCE OAuth via a system browser tab. The
//                            browser is opened with openAuthSessionAsync
//                            (Chrome Custom Tab), NOT the WebView, because
//                            Google rejects OAuth inside embedded WebViews.
//                            On return, the code is exchanged for a session.
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
import * as WebBrowser from 'expo-web-browser';
import type { Session } from '@supabase/supabase-js';
import type { MutableRefObject } from 'react';
import type { WebView } from 'react-native-webview';
import { NATIVE_AUTH_REDIRECT, supabase, supabaseConfigured } from '../config/supabase';

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
// Google (PKCE OAuth in a system browser)
// ---------------------------------------------------------------------
export async function signInWithGoogle(): Promise<GoogleAuthResult> {
  if (!supabaseConfigured) {
    return { status: 'error', message: mapAuthError('not configured') };
  }
  try {
    // Generate the auth URL WITHOUT opening a browser (skipBrowserRedirect).
    // We open it ourselves so completion handling is explicit and reliable.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: NATIVE_AUTH_REDIRECT,
        skipBrowserRedirect: true,
      },
    });
    if (error) return { status: 'error', message: error.message };
    if (!data?.url) {
      return { status: 'error', message: 'Could not start Google sign-in.' };
    }

    // System browser tab; returns the final redirect URL on success.
    const result = await WebBrowser.openAuthSessionAsync(data.url, NATIVE_AUTH_REDIRECT);
    if (result.type !== 'success') {
      // cancel / dismiss / opened / locked: the user never finished, or the
      // browser came back without a redirect - treat as cancelled, never error.
      return { status: 'cancelled' };
    }
    const code = extractCode(result.url);
    if (!code) {
      return { status: 'error', message: 'Google sign-in callbacks missing a code.' };
    }
    const { data: exchanged, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) return { status: 'error', message: exchangeError.message };
    return { status: 'ok', session: sessionFromResponse(exchanged.session) };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Google sign-in failed.';
    return { status: 'error', message: message || 'Google sign-in failed.' };
  }
}

/** Pulls `?code=` (PKCE) out of the redirect URL - works for custom schemes. */
function extractCode(url: string): string | null {
  if (!url) return null;
  const match = url.match(/[?&]code=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
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