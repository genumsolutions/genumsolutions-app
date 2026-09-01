// =====================================================================
// supabase - native-side Supabase client used for authentication and for
// reading/writing the SAME database the website uses (products, services,
// projects, orders, carts, profiles, ...).
//
// Security: only the SUPABASE anon key is embedded (it is public by design
// and gated by RLS). The service-role key lives exclusively in the
// server-side .env.local and is never bundled into the app.
//
// Native session handling: persistSession is disabled so nothing is written
// to the OS keychain automatically; instead AppContext restores the latest
// tokens from SecureStore (see authService) on launch. autoRefreshToken is
// enabled so the in-memory session refreshes while the app is running.
// =====================================================================
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// EXPO_PUBLIC_* vars are inlined by Metro at build time (add them to
// mobile/.env.local). SUPABASE_URL is kept as a fallback for existing setups.
const url =
  process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

/** True once the native anon key is configured. */
export const supabaseConfigured = Boolean(url && anonKey);

/** Google Web OAuth client ID (inlined by Metro at build time). */
export const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
export const googleConfigured = Boolean(googleWebClientId);

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    storage: AsyncStorage,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});
