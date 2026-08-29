// =====================================================================
// AppContext - native-side state that mirrors live information from the
// WebView (cart count, session, current page, connectivity) plus the shared
// navigation bridge (`navigate`) that drives the loaded website.
//
// The Website -> native data flow:
//   SiteScreen.onMessage -> setCart / setUser / setCurrentPath / setOffline
// Native -> Website data flow:
//   navigate(path) injects window.location.assign(path) into the WebView.
//
// Native auth also lives here:
//   signInWithPassword / signInWithGoogle  -> native sign-in (see
//     authService.ts). On success the session is handed to the website via
//     /api/auth/native-handoff so the WebView behaves as signed in.
//   signOut                                -> POSTs /api/auth/logout in the
//     site, clears the native session, lands on the home page.
//   restore-on-launch                      -> if a native session survived a
//     cold start (SecureStore) but the WebView starts signed out, the session
//     is handed back automatically.
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
import type { MutableRefObject } from 'react';
import type { WebView } from 'react-native-webview';
import type { Session } from '@supabase/supabase-js';
import { WEBSITE_URL } from '../config/site';
import { supabaseConfigured } from '../config/supabase';
import {
  clearNativeSession,
  forwardSessionToWebView,
  loadNativeSession,
  mapAuthError,
  persistNativeSession,
  signInWithGoogle as nativeGoogleSignIn,
  signInWithPassword as nativePasswordSignIn,
} from '../services/authService';

export type GenumUser = {
  name: string;
  email: string;
  role: string;
};

type StoredTokenPair = { accessToken: string; refreshToken: string };

type AppContextValue = {
  webRef: MutableRefObject<WebView | null>;
  cartCount: number;
  cartSize: number;
  user: GenumUser | null;
  sessionReady: boolean;
  isSignedIn: boolean;
  isAdmin: boolean;
  currentPath: string;
  offline: boolean;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  setCart: (cart: { count: number; size: number }) => void;
  setUser: (user: GenumUser | null) => void;
  setCurrentPath: (path: string) => void;
  setOffline: (offline: boolean) => void;
  navigate: (path: string) => void;
  signOut: () => void;
  authSheetOpen: boolean;
  setAuthSheetOpen: (open: boolean) => void;
  authBusy: boolean;
  authError: string | null;
  signInWithPassword: (email: string, password: string) => Promise<boolean>;
  signInWithGoogle: () => Promise<boolean>;
};

const AppContext = createContext<AppContextValue | null>(null);

function genumUserFromSession(session: Session): GenumUser {
  const meta = session.user?.user_metadata ?? {};
  const app = session.user?.app_metadata ?? {};
  return {
    name: typeof meta.name === 'string' ? meta.name : '',
    email: session.user?.email ?? '',
    role: app.role === 'admin' ? 'admin' : 'customer',
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const webRef = useRef<WebView | null>(null);
  const [cart, setCartState] = useState({ count: 0, size: 0 });
  const [user, setUserState] = useState<GenumUser | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [currentPath, setCurrentPath] = useState('/');
  const [offline, setOffline] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // --- native auth state ---
  const [authSheetOpen, setAuthSheetOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [storedTokens, setStoredTokens] = useState<StoredTokenPair | null>(null);
  const handoffSentRef = useRef(false);

  const setCart = useCallback((next: { count: number; size: number }) => {
    setCartState({ count: Math.max(0, next.count || 0), size: Math.max(0, next.size || 0) });
  }, []);

  const setUser = useCallback((u: GenumUser | null) => {
    setUserState(u);
    setSessionReady(true);
  }, []);

  const navigate = useCallback((path: string) => {
    const safe = path.replace(/\\/g, '').replace(/[\r\n]/g, '');
    const origin =
      typeof WEBSITE_URL === 'string'
        ? WEBSITE_URL.replace(/\/$/, '')
        : '';
    webRef.current?.injectJavaScript(
      `if (window.location.origin === '${origin}') { window.location.assign('${safe}'); } true;`,
    );
    setDrawerOpen(false);
  }, []);

  // --- sign out in the website's session, then clear native state ---
  const signOut = useCallback(() => {
    webRef.current?.injectJavaScript(
      `window.fetch('/api/auth/logout', { method: 'POST' })
        .catch(function(){})
        .then(function(){ window.location.assign('/'); }); true;`,
    );
    setUser(null);
    setStoredTokens(null);
    void clearNativeSession().catch(() => {});
    setDrawerOpen(false);
  }, [setUser]);

  // --- native sign-in completion: persist tokens, hand to website, close ---
  const applyNativeSession = useCallback(
    async (session: Session) => {
      setStoredTokens({
        accessToken: session.access_token,
        refreshToken: session.refresh_token ?? '',
      });
      try {
        await persistNativeSession(session);
      } catch {
        // SecureStore failure must not block sign-in - the site cookies are
        // the source of truth for the running session.
      }
      forwardSessionToWebView(webRef, session, { thenGoTo: '/account' });
      setUser(genumUserFromSession(session));
      setAuthError(null);
      setAuthSheetOpen(false);
    },
    [setUser, webRef],
  );

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!supabaseConfigured) {
        setAuthError('Native sign-in is not configured yet. Please sign in on the website.');
        return false;
      }
      setAuthBusy(true);
      setAuthError(null);
      try {
        const session = await nativePasswordSignIn(email, password);
        await applyNativeSession(session);
        return true;
      } catch (e) {
        setAuthError(mapAuthError(e instanceof Error ? e.message : 'Sign-in failed.'));
        return false;
      } finally {
        setAuthBusy(false);
      }
    },
    [applyNativeSession],
  );

  const signInWithGoogle = useCallback(async () => {
    if (!supabaseConfigured) {
      setAuthError('Native sign-in is not configured yet. Please sign in on the website.');
      return false;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      const result = await nativeGoogleSignIn();
      if (result.status === 'ok') {
        await applyNativeSession(result.session);
        return true;
      }
      if (result.status === 'error') {
        setAuthError(result.message);
      }
      return false;
    } finally {
      setAuthBusy(false);
    }
  }, [applyNativeSession]);

  // --- load a persisted native session on launch ---
  useEffect(() => {
    let active = true;
    loadNativeSession()
      .then((tokens) => {
        if (active) setStoredTokens(tokens);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // --- if the WebView starts signed out but we hold a native session,
  // hand it back (one-time per launch) so cookies get re-adopted ---
  useEffect(() => {
    if (sessionReady && !user && storedTokens && !handoffSentRef.current) {
      handoffSentRef.current = true;
      forwardSessionToWebView(webRef, storedTokens);
    }
  }, [sessionReady, user, storedTokens, webRef]);

  const value = useMemo<AppContextValue>(
    () => ({
      webRef,
      cartCount: cart.count,
      cartSize: cart.size,
      user,
      sessionReady,
      isSignedIn: Boolean(user),
      isAdmin: user?.role === 'admin',
      currentPath,
      offline,
      drawerOpen,
      setDrawerOpen,
      setCart,
      setUser,
      setCurrentPath,
      setOffline,
      navigate,
      signOut,
      authSheetOpen,
      setAuthSheetOpen,
      authBusy,
      authError,
      signInWithPassword,
      signInWithGoogle,
    }),
    [
      webRef,
      cart,
      user,
      sessionReady,
      currentPath,
      offline,
      drawerOpen,
      setCart,
      setUser,
      navigate,
      signOut,
      authSheetOpen,
      authBusy,
      authError,
      signInWithPassword,
      signInWithGoogle,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}