// =====================================================================
// AppContext - native-side global state: auth (Supabase), the cart badge,
// and app-wide toggles. No WebView is involved - the app reads/writes the
// shared Supabase database directly.
// =====================================================================
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '../config/supabase';
import * as auth from '../services/authService';
import { getLocalCart, totalCount } from '../services/cartService';
import type { CarMode } from '../config/roboCarCatalog';

export type GenumUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  role: string;
};

type AppContextValue = {
  user: GenumUser | null;
  sessionReady: boolean;
  isSignedIn: boolean;
  isAdmin: boolean;
  cartCount: number;
  setCart: (cart: { count: number; size: number }) => void;
  authSheetOpen: boolean;
  setAuthSheetOpen: (open: boolean) => void;
  authBusy: boolean;
  authError: string | null;
  signInWithPassword: (email: string, password: string) => Promise<boolean>;
  signUp: (name: string, email: string, password: string) => Promise<'ok' | 'confirm' | 'error'>;
  signInWithGoogle: () => Promise<boolean>;
  resetPassword: (email: string) => Promise<boolean>;
  signOut: () => void;
  carModes: CarMode[];
};

const AppContext = createContext<AppContextValue | null>(null);

function genumUserFromSession(session: Session): GenumUser {
  const meta = session.user?.user_metadata ?? {};
  const app = session.user?.app_metadata ?? {};
  return {
    id: session.user?.id ?? '',
    name: typeof meta.name === 'string' ? meta.name : '',
    email: session.user?.email ?? '',
    phone: session.user?.user_metadata?.phone ?? '',
    address: session.user?.user_metadata?.address ?? '',
    role: app.role === 'admin' ? 'admin' : 'customer',
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GenumUser | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [authSheetOpen, setAuthSheetOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [carModes, setCarModes] = useState<CarMode[]>([]);

  const setCart = useCallback((next: { count: number; size: number }) => {
    setCartCount(Math.max(0, next.count || 0));
  }, []);

  // --- restore the native session on launch ---
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const current = await supabase.auth.getSession();
        const session = current.data.session;
        if (session) {
          if (active) setUser(genumUserFromSession(session));
        } else {
          // Try to restore from SecureStore so Google/email login survives
          // an OS restart even if the client did not persist it.
          const stored = await auth.loadStoredSession();
          if (stored?.accessToken) {
            const { data } = await supabase.auth.setSession({
              access_token: stored.accessToken,
              refresh_token: stored.refreshToken,
            });
            if (data.session && active) setUser(genumUserFromSession(data.session));
          }
        }
      } catch {
        /* ignore */
      } finally {
        if (active) setSessionReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // --- keep the session current (sign-in / sign-out / refresh) ---
  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session ? genumUserFromSession(session) : null);
      setSessionReady(true);
    });
    return () => sub.data.subscription.unsubscribe();
  }, []);

  // --- load the cart badge on launch + keep it current ---
  const refreshCartCount = useCallback(async () => {
    const lines = await getLocalCart();
    setCartCount(await totalCount(lines));
  }, []);

  useEffect(() => {
    void refreshCartCount();
  }, [refreshCartCount]);

  const applyAuthed = useCallback(() => {
    setAuthError(null);
    setAuthBusy(false);
    void refreshCartCount();
  }, [refreshCartCount]);

  const applyError = useCallback((message: string) => {
    setAuthError(auth.mapAuthError(message));
    setAuthBusy(false);
    return false;
  }, []);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!supabaseConfigured) {
        setAuthError('Sign-in is not configured yet.');
        return false;
      }
      setAuthBusy(true);
      setAuthError(null);
      try {
        await auth.signInWithPassword(email, password);
        setAuthSheetOpen(false);
        applyAuthed();
        return true;
      } catch (e) {
        return applyError(e instanceof Error ? e.message : 'Sign-in failed.');
      }
    },
    [applyAuthed, applyError],
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      if (!supabaseConfigured) {
        setAuthError('Sign-up is not configured yet.');
        return 'error';
      }
      setAuthBusy(true);
      setAuthError(null);
      try {
        const session = await auth.signUp(name, email, password);
        if (session) {
          setAuthSheetOpen(false);
          applyAuthed();
          return 'ok';
        }
        // confirmation email required
        applyAuthed();
        return 'confirm';
      } catch (e) {
        applyError(e instanceof Error ? e.message : 'Sign-up failed.');
        return 'error';
      }
    },
    [applyAuthed, applyError],
  );

  const signInWithGoogle = useCallback(async () => {
    if (!supabaseConfigured) {
      setAuthError('Sign-in is not configured yet.');
      return false;
    }
    setAuthBusy(true);
    setAuthError(null);
    const result = await auth.signInWithGoogle();
    if (result.status === 'ok') {
      setAuthSheetOpen(false);
      applyAuthed();
      return true;
    }
    if (result.status === 'error') setAuthError(result.message);
    setAuthBusy(false);
    return false;
  }, [applyAuthed]);

  const resetPassword = useCallback(async (email: string) => {
    if (!supabaseConfigured) return false;
    setAuthBusy(true);
    setAuthError(null);
    try {
      await auth.resetPassword(email);
      setAuthBusy(false);
      return true;
    } catch (e) {
      setAuthBusy(false);
      return applyError(e instanceof Error ? e.message : 'Failed to send reset link.');
    }
  }, [applyError]);

  const signOut = useCallback(() => {
    void auth.signOut();
    setUser(null);
    setAuthSheetOpen(false);
    void refreshCartCount();
  }, [refreshCartCount]);

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      sessionReady,
      isSignedIn: Boolean(user),
      isAdmin: user?.role === 'admin',
      cartCount,
      setCart,
      authSheetOpen,
      setAuthSheetOpen,
      authBusy,
      authError,
      signInWithPassword,
      signUp,
      signInWithGoogle,
      resetPassword,
      signOut,
      carModes,
    }),
    [
      user,
      sessionReady,
      cartCount,
      setCart,
      authSheetOpen,
      authBusy,
      authError,
      signInWithPassword,
      signUp,
      signInWithGoogle,
      resetPassword,
      signOut,
      carModes,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
