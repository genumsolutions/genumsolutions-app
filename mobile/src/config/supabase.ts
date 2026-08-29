// =====================================================================
// supabase - native-side Supabase client used ONLY for signing in.
//
// Why native sign-in at all? The website runs inside an Android WebView
// and Google blocks OAuth callbacks inside embedded WebViews. So Google
// sign-in opens in the system browser (Chrome Custom Tab) instead - that
// flow needs a native Supabase client and this app's custom scheme
// (see app.json "scheme": "genumsolutions").
//
// Security: only the SUPABASE anon key is embedded (it is public by
// design and gated by RLS). The service-role key lives exclusively in the
// server-side .env.local and is never bundled into the app.
//
// After a native sign-in succeeds, the session tokens are forwarded to
// /api/auth/native-handoff on the website, which adopts the session and
// writes the site's auth cookies so the WebView behaves as signed in.
// =====================================================================
import { createClient } from '@supabase/supabase-js';

// EXPO_PUBLIC_* vars are inlined by Metro at build time (add them to
// mobile/.env.local). SUPABASE_URL is kept as a fallback for existing setups.
const url =
  process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

/** True once the native anon key is configured; the app falls back to the
 * website's own email/password sign-in on the login page otherwise. */
export const supabaseConfigured = Boolean(url && anonKey);

/** Deep link received back after Google OAuth (matches app.json "scheme"). */
export const NATIVE_AUTH_REDIRECT = 'genumsolutions://auth';

export const supabase = createClient(url, anonKey, {
  auth: {
    // The app manages its own tokens (SecureStore + handoff). Disable the
    // client's built-in persistence/refresh so nothing leaks into storage.
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
    // PKCE flow: the callback carries a short-lived code, not tokens.
    flowType: 'pkce',
  },
});