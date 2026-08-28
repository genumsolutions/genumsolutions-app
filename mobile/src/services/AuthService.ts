// =====================================================================
// AuthService - Supabase email/password auth + local session persistence.
//
// Objectives:
//   - Sign in / sign up via supabase.auth.
//   - Persist the session in AsyncStorage so the user stays logged in
//     across app restarts.
//   - README note: for production, switch AsyncStorage to expo-secure-store
//     to keep the access/refresh tokens in the device keychain/keystore.
// =====================================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../shared/supabase';

const SESSION_KEY = 'genum:auth:session';

export type AuthResult = {
  ok: boolean;
  message?: string;
  needsEmailConfirmation?: boolean;
};

// Persist the current session (access + refresh token) locally.
async function persistSession(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(data.session));
  } else {
    await AsyncStorage.removeItem(SESSION_KEY);
  }
}

// Restore a saved session on app start (call once, before rendering).
export async function restoreSession(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const session = JSON.parse(raw);
    // Re-validate the saved tokens against the server.
    const { error } = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    if (error) {
      await AsyncStorage.removeItem(SESSION_KEY);
    }
  } catch (e) {
    // Corrupt/no session - start logged out.
    await AsyncStorage.removeItem(SESSION_KEY);
  }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, message: error.message };
  }
  await persistSession();
  return { ok: true };
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    return { ok: false, message: error.message };
  }
  // Unless auto-confirm is enabled, the user must verify their email first.
  const needsEmailConfirmation = !data.session;
  if (!needsEmailConfirmation) {
    await persistSession();
  }
  return { ok: true, needsEmailConfirmation };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  await AsyncStorage.removeItem(SESSION_KEY);
}

export async function getUserEmail(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
}

export const AuthService = {
  restoreSession,
  signIn,
  signUp,
  signOut,
  getUserEmail,
};
