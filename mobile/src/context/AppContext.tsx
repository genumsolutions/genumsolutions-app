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
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Appearance, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, supabaseConfigured } from '../config/supabase';
import * as auth from '../services/authService';
import * as push from '../services/pushService';
import * as cart from '../services/cartService';
import type { CartLine } from '../types';
import type { CarMode } from '../config/roboCarCatalog';

export type GenumUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  role: string;
};

export type ThemeMode = 'system' | 'light' | 'dark';

type AppContextValue = {
  user: GenumUser | null;
  sessionReady: boolean;
  isSignedIn: boolean;
  isAdmin: boolean;
  cartCount: number;
  setCart: (cart: { count: number; size: number }) => void;
  authSheetOpen: boolean;
  setAuthSheetOpen: (open: boolean) => void;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  authBusy: boolean;
  authError: string | null;
  signInWithPassword: (email: string, password: string) => Promise<boolean>;
  signUp: (name: string, email: string, password: string) => Promise<'ok' | 'confirm' | 'error'>;
  signInWithGoogle: () => Promise<boolean>;
  resetPassword: (email: string) => Promise<boolean>;
  signOut: () => void;
  carModes: CarMode[];
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

async function genumUserFromSession(session: Session): Promise<GenumUser> {
  const meta = session.user?.user_metadata ?? {};
  const app = session.user?.app_metadata ?? {};
  const profileResult = await supabase
    .from('profiles')
    .select('name, phone, address, role')
    .eq('id', session.user.id)
    .maybeSingle();
  const profile = profileResult.data;
  return {
    id: session.user?.id ?? '',
    name: profile?.name || (typeof meta.name === 'string' ? meta.name : ''),
    email: session.user?.email ?? '',
    phone: profile?.phone || session.user?.user_metadata?.phone || '',
    address: profile?.address || session.user?.user_metadata?.address || '',
    role: profile?.role === 'admin' || app.role === 'admin' ? 'admin' : 'customer',
  };
}

/**
 * Apply the chosen theme everywhere the app can render.
 *
 * - Native: `Appearance.setColorScheme` forces the OS scheme (exits there),
 *   which NativeWind's `@media (prefers-color-scheme: dark)` picks up.
 * - Web: react-native-web's Appearance has NO `setColorScheme`, so calling it
 *   would throw. Instead we set `data-theme` on <html> and `global.css` has
 *   matching `html[data-theme='dark'|'light']` overrides (see global.css).
 */
function applyColorScheme(mode: ThemeMode) {
  try {
    if (typeof Appearance.setColorScheme === 'function') {
      Appearance.setColorScheme(mode === 'system' ? null : mode);
    }
  } catch {
    // some platforms (react-native-web) don't implement setColorScheme
  }
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const root = document.documentElement;
    if (mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GenumUser | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [authSheetOpen, setAuthSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [carModes, setCarModes] = useState<CarMode[]>([]);
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');

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
          if (active) setUser(await genumUserFromSession(session));
        } else {
          // Try to restore from SecureStore so Google/email login survives
          // an OS restart even if the client did not persist it.
          const stored = await auth.loadStoredSession();
          if (stored?.accessToken) {
            const { data } = await supabase.auth.setSession({
              access_token: stored.accessToken,
              refresh_token: stored.refreshToken,
            });
            if (data.session && active) setUser(await genumUserFromSession(data.session));
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

  useEffect(() => {
    void AsyncStorage.getItem('genum-theme-mode').then((stored) => {
      if (stored === 'system' || stored === 'light' || stored === 'dark') {
        setThemeModeState(stored);
        applyColorScheme(stored);
      }
    });
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    applyColorScheme(mode);
    void AsyncStorage.setItem('genum-theme-mode', mode);
  }, []);

  // --- keep the session current (sign-in / sign-out / refresh) ---
  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        void genumUserFromSession(session).then(setUser);
      } else {
        setUser(null);
      }
      setSessionReady(true);
    });
    return () => sub.data.subscription.unsubscribe();
  }, []);

  // --- order-status push token: register on sign-in, drop on sign-out ---
  useEffect(() => {
    if (!user?.id) return;
    void push.registerPushToken(user.id);
    return () => {
      void push.removePushTokens(user.id);
    };
  }, [user?.id]);

  // --- load the cart badge on launch + keep it current ---
  const refreshCartCount = useCallback(async () => {
    const lines = await cart.getLocalCart();
    setCartCount(await cart.totalCount(lines));
  }, []);

  useEffect(() => {
    void refreshCartCount();
  }, [refreshCartCount]);

  // --- DB-backed cart sync (shared `carts` table = source of truth) ---
  // Writes are serialized through a promise queue so the LAST user action
  // always wins on the server even when requests land out of order.
  const cartWriteQueueRef = useRef<Promise<void>>(Promise.resolve());

  const pushCartToServer = useCallback((userId: string, lines: CartLine[]) => {
    cartWriteQueueRef.current = cartWriteQueueRef.current
      .then(() => cart.pushCartToServer(userId, lines))
      .catch(() => undefined);
  }, []);

  // Signed in: adopt the DB cart (merge guest lines, DB wins per product),
  // write the result back, then push every local mutation to the DB.
  // Signed out: local cart only, no server writes.
  useEffect(() => {
    if (!user?.id) {
      cart.setCartSyncHandler(null);
      void refreshCartCount();
      return;
    }
    const userId = user.id;
    let cancelled = false;
    (async () => {
      try {
        const [serverLines, localLines] = await Promise.all([
          cart.fetchServerCart(userId),
          cart.getLocalCart(),
        ]);
        if (cancelled) return;
        const merged = cart.mergeCarts(serverLines, localLines);
        await cart.replaceLocalCart(merged);
        if (cancelled) return;
        // DB sticks with the merged cart so both clients start from the same state.
        pushCartToServer(userId, merged);
        setCartCount(await cart.totalCount(merged));
      } catch {
        if (!cancelled) void refreshCartCount();
      }
    })();
    cart.setCartSyncHandler((lines) => pushCartToServer(userId, lines));
    return () => {
      cancelled = true;
      cart.setCartSyncHandler(null);
    };
  }, [user?.id, pushCartToServer, refreshCartCount]);

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
      menuOpen,
      setMenuOpen,
      authBusy,
      authError,
      signInWithPassword,
      signUp,
      signInWithGoogle,
      resetPassword,
      signOut,
      carModes,
      themeMode,
      setThemeMode,
    }),
    [
      user,
      sessionReady,
      cartCount,
      setCart,
      authSheetOpen,
      setAuthSheetOpen,
      menuOpen,
      setMenuOpen,
      authBusy,
      authError,
      signInWithPassword,
      signUp,
      signInWithGoogle,
      resetPassword,
      signOut,
      carModes,
      themeMode,
      setThemeMode,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
