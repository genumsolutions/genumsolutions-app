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
} from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Appearance, AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { supabase, supabaseConfigured } from "../config/supabase";
import * as auth from "../services/authService";
import * as push from "../services/pushService";
import * as settings from "../services/settingsService";
import * as cart from "../services/cartService";
import * as productService from "../services/productService";
import { logger } from "../services/logger";
import type { CartLine } from "../types";
import type { CarMode } from "../config/roboCarCatalog";
import { checkForAnyUpdate } from "../services/updateService";

// W6: 48-hour offline grace period for entitlement cache
const OFFLINE_GRACE_MS = 48 * 60 * 60 * 1000;

/** Check if a stored session is within the offline grace period. */
function isWithinOfflineGrace(savedAt: number | undefined | null): boolean {
  if (!savedAt) return false;
  return Date.now() - savedAt < OFFLINE_GRACE_MS;
}

export type GenumUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  role: string; /** Account tier from profiles.tier (admin-managed). All tiers now have
   * full access — pro unlocks removed, all users have the same capabilities. */
  tier: "free" | "pro";
};

export type ThemeMode = "system" | "light" | "dark";

/** State for the top-bar "vX available" pill (a NEWER APK exists). */
export type UpdatePill = { version: string };

type AppContextValue = {
  user: GenumUser | null;
  sessionReady: boolean;
  isSignedIn: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  isOwner: boolean;
  isPro: boolean;
  cartCount: number;
  setCart: (cart: { count: number; size: number }) => void;
  authSheetOpen: boolean;
  setAuthSheetOpen: (open: boolean) => void;
  accountSheetOpen: boolean;
  setAccountSheetOpen: (open: boolean) => void;
  authBusy: boolean;
  authError: string | null;
  clearAuthError: () => void;
  refreshProfile: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<boolean>;
  signUp: (
    name: string,
    email: string,
    password: string,
  ) => Promise<"ok" | "confirm" | "error">;
  signInWithGoogle: () => Promise<boolean>;
  resetPassword: (email: string) => Promise<boolean>;
  resendConfirmation: (email: string) => Promise<boolean>;
  signOut: () => void;
  carModes: CarMode[];
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  /** True when a newer APK release exists — shows the top-bar update pill. */
  updatePill: UpdatePill | null;
  setUpdatePill: (pill: UpdatePill | null) => void;
  /** True when an OTA bundle was fetched on launch — offer a reload. */
  appUpdated: boolean;
  setAppUpdated: (updated: boolean) => void;
  /** One-shot check on every app open: silent OTA apply + newer-APK pill. */
  runLaunchUpdateCheck: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

// =====================================================================
// Role resolution
//
// Mirrors the website's lib/roles.ts. Two rules matter for the admin
// dashboard gate (`isStaff` / `isAdmin` in the context value):
//   1. the sole owner address is owner even when its profiles row is missing
//      or predates the promotion trigger, and
//   2. a stored role is compared normalized, so "Admin ", "ADMIN" or a stray
//      value can never silently collapse to customer and hide the console.
// =====================================================================
const OWNER_EMAIL = "genumsolutions@gmail.com";

type Role = "customer" | "staff" | "admin" | "owner";

function isOwnerEmail(email: unknown): boolean {
  return (
    typeof email === "string" && email.trim().toLowerCase() === OWNER_EMAIL
  );
}

function normalizeRole(value: unknown): Role {
  const role = String(value ?? "")
    .trim()
    .toLowerCase();
  return role === "staff" || role === "admin" || role === "owner"
    ? role
    : "customer";
}

/**
 * Build a GenumUser from a Supabase session. Profile is authoritative when
 * readable, but metadata/cached fallbacks keep staff/admin access working if
 * the profile read is unavailable or stale (mirrors website role handling).
 */
async function genumUserFromSession(
  session: Session,
  fallbackUser?: auth.StoredSessionUser | null,
): Promise<auth.StoredSessionUser> {
  type ProfileRow = {
    name?: string | null;
    phone?: string | null;
    address?: string | null;
    role?: string | null;
    tier?: "free" | "pro" | null;
  };
  const meta = (session.user?.user_metadata ?? {}) as Record<string, unknown>;
  const app = (session.user?.app_metadata ?? {}) as Record<string, unknown>;
  let profile: ProfileRow | null = null;

  try {
    // `tier` is optional: a shared database that has not received the tier
    // migration fails the WHOLE select for an unknown column (PostgREST
    // 42703), which used to leave profile = null and demote every staff/admin
    // account to "customer" — hiding the Admin dashboard for everyone except
    // the owner (matched by email). Never let an optional column decide the
    // role: retry without it so the role-critical columns still resolve.
    const profileResult = await supabase
      .from("profiles")
      .select("name, phone, address, role, tier")
      .eq("id", session.user.id)
      .maybeSingle();
    if (profileResult.error) {
      const core = await supabase
        .from("profiles")
        .select("name, phone, address, role")
        .eq("id", session.user.id)
        .maybeSingle();
      profile = (core.data as ProfileRow | null) ?? null;
    } else {
      profile = (profileResult.data as ProfileRow | null) ?? null;
    }
  } catch {
    // Offline or network error: fall back to metadata/cached user below.
  }

  const p = profile;
  const metaRole = normalizeRole(app.role ?? meta.role ?? meta.user_role);
  const fallbackRole = normalizeRole(fallbackUser?.role);
  const profileRoleRaw =
    p && typeof p.role === "string" && p.role.trim() ? p.role : null;
  const profileRole = profileRoleRaw ? normalizeRole(profileRoleRaw) : null;
  const candidates: Array<"customer" | "staff" | "admin" | "owner"> = [
    profileRole ?? "customer",
    metaRole,
    fallbackRole,
  ];
  // Prefer any non-customer role from profile/metadata/cache so admin & staff
  // accounts keep dashboard access even when one source is stale/unreadable.
  const effectiveRole = candidates.find((r) => r !== "customer") ?? "customer";

  const tier: "free" | "pro" =
    effectiveRole === "staff" ||
    effectiveRole === "admin" ||
    effectiveRole === "owner" ||
    p?.tier === "pro" ||
    fallbackUser?.tier === "pro"
      ? "pro"
      : "free";

  const metaName = typeof meta.name === "string" ? meta.name : "";
  const metaPhone = typeof meta.phone === "string" ? meta.phone : "";
  const metaAddress = typeof meta.address === "string" ? meta.address : "";

  return {
    id: session.user?.id ?? "",
    name:
      (p?.name as string | undefined) || metaName || fallbackUser?.name || "",
    email: session.user?.email ?? fallbackUser?.email ?? "",
    phone:
      (p?.phone as string | undefined) ||
      metaPhone ||
      fallbackUser?.phone ||
      "",
    address:
      (p?.address as string | undefined) ||
      metaAddress ||
      fallbackUser?.address ||
      "",
    role: isOwnerEmail(session.user?.email) ? "owner" : effectiveRole,
    tier,
  };
}

/**
 * Apply the chosen theme everywhere the app can render.
 *
 * - Native: `Appearance.setColorScheme` forces the OS scheme (exits there),
 *   which NativeWind's `@media (prefers-color-scheme: dark)` picks up.
 * - Web: react-native-web's Appearance exposes `setColorScheme` but throws
 *   ("Cannot manually set color scheme, as dark mode is type 'media'"), so we
 *   never call it there. Instead we set `data-theme` on <html> and `global.css`
 *   has matching `html[data-theme='dark'|'light']` overrides (see global.css).
 */
function applyColorScheme(mode: ThemeMode) {
  try {
    if (
      Platform.OS !== "web" &&
      typeof Appearance.setColorScheme === "function"
    ) {
      Appearance.setColorScheme(mode === "system" ? null : mode);
    }
  } catch {
    // some platforms (react-native-web) don't implement setColorScheme
  }
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const root = document.documentElement;
    if (mode === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GenumUser | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [authSheetOpen, setAuthSheetOpen] = useState(false);
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [carModes, setCarModes] = useState<CarMode[]>([]);
  const [themeMode, setThemeModeState] = useState<ThemeMode>("light");
  const [updatePill, setUpdatePill] = useState<UpdatePill | null>(null);
  const [appUpdated, setAppUpdated] = useState(false);
  // True while a cached (offline) user is shown pending the real session; the
  // auth listener must not blank that user on a startup INITIAL_SESSION(null).
  const cachedRestoreRef = useRef(false);

  const setCart = useCallback((next: { count: number; size: number }) => {
    setCartCount(Math.max(0, next.count || 0));
  }, []);

  // --- keep the session current (sign-in / sign-out / refresh) ---
  // MUST be set up BEFORE the initial session restore so we don't miss
  // the SIGNED_IN event from setSession() during cold-start restoration.
  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        cachedRestoreRef.current = false;
        // Supabase holds its auth lock while it notifies listeners. Querying
        // `profiles` from inside this callback therefore stalls sign-in and
        // can run before the token is attached, leaving staff/admin roles as
        // "customer" (only the owner, matched by email, kept the Admin
        // dashboard). Defer past the lock.
        // Re-persist on every change (sign-in, restore, TOKEN_REFRESHED):
        // the in-memory session is lost on restart and the access token is
        // rotated ~hourly, so the SecureStore snapshot must always hold the
        // CURRENT pair — otherwise a cold start would restore a stale token.
        // (A transient offline refresh is preserved by GoTrue, so a session
        // reaching this handler is always valid.)
        setTimeout(() => {
          void (async () => {
            const stored = await auth.loadStoredSession().catch(() => null);
            const fallbackUser = stored?.user ?? null;
            const g = await genumUserFromSession(session, fallbackUser);
            setUser(g);
            await auth.persistSession(session, g);
            await settings.syncOnSignIn(applyThemeOnly);
          })().catch((e: unknown) =>
            logger.error("auth", "session event handling failed", e),
          );
        }, 0);
      } else {
        // SIGNED_OUT is the only event this branch deserves — a genuine
        // sign-out or a server-rejected refresh. INITIAL_SESSION(null) at a
        // cold start must NOT wipe SecureStore (the restore effect owns that
        // decision) and must not blank a user being shown from cache.
        if (event === "SIGNED_OUT") {
          setUser(null);
          void auth.clearStoredSession();
        } else if (!cachedRestoreRef.current) {
          setUser(null);
        }
      }
      setSessionReady(true);
    });
    return () => sub.data.subscription.unsubscribe();
  }, []);

  // --- restore the native session on launch ---
  // Offline-tolerant: a transient network/refresh failure must NOT be treated
  // as signed-out or wipe SecureStore. When the refresh cannot reach the
  // server, the stored snapshot and its cached GenumUser are kept and the
  // real session is re-attached the moment connectivity returns.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // 1) Supabase already has a session in memory.
        const current = await supabase.auth.getSession();
        const session = current.data.session;
        if (session) {
          if (active) {
            // Load stored session for fallback user (offline grace)
            const stored = await auth.loadStoredSession();
            const fallbackUser =
              stored?.user && isWithinOfflineGrace(stored.savedAt)
                ? stored.user
                : null;
            setUser(await genumUserFromSession(session, fallbackUser));
            // Re-persist: the in-memory session may carry rotated tokens
            // that have not been written to SecureStore yet.
            void auth.persistSession(session);
          }
          void settings.syncOnSignIn(applyThemeOnly);
          return;
        }

        // 2) Fall back to the SecureStore snapshot.
        const stored = await auth.loadStoredSession();
        if (stored?.accessToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: stored.accessToken,
            refresh_token: stored.refreshToken,
          });
          if (!error && data.session) {
            if (active) {
              const fallbackUser =
                stored.user && isWithinOfflineGrace(stored.savedAt)
                  ? stored.user
                  : null;
              setUser(await genumUserFromSession(data.session, fallbackUser));
              void auth.persistSession(data.session);
            }
            void settings.syncOnSignIn(applyThemeOnly);
          } else if (!error) {
            // setSession succeeded but produced no session — the pair is junk.
            logger.warn(
              "auth",
              "setSession returned no session, clearing stored tokens",
            );
            await auth.clearStoredSession();
          } else if (auth.isRetryableAuthError(error)) {
            // Offline / Wi-Fi hand-off. KEEP the stored session and restore
            // the cached user so the app stays signed-in; re-attach the real
            // session when the network is back.
            logger.warn(
              "auth",
              "session restore stalled (offline/transient), keeping stored session",
              error,
            );
            if (active) {
              if (stored.user && isWithinOfflineGrace(stored.savedAt)) {
                cachedRestoreRef.current = true;
                setUser(stored.user);
              } else if (stored.user) {
                // Grace period expired — don't use cached entitlement
                logger.warn(
                  "auth",
                  "offline grace period expired, clearing user",
                );
                setUser(null);
              }
              await retryStoredSessionWhenOnline(stored);
            }
          } else {
            // Rejected for real — refresh token revoked/expired server-side.
            logger.error(
              "auth",
              "session restore rejected, clearing stored tokens",
              error,
            );
            await auth.clearStoredSession();
          }
        }
      } catch (e) {
        logger.error("auth", "session restore failed", e);
      } finally {
        if (active) setSessionReady(true);
      }
    })();

    /** Re-attach a stalled stored session once connectivity returns.
     *  NetInfo fires the instant the network is back; AppState 'active'
     *  covers re-foregrounds while the device already reports "connected". */
    async function retryStoredSessionWhenOnline(stored: auth.StoredSession) {
      let unsubNet: (() => void) | null = null;
      let unsubApp: (() => void) | null = null;
      const done = () => {
        unsubNet?.();
        unsubApp?.();
      };
      const attempt = async (): Promise<boolean> => {
        const { data, error } = await supabase.auth.setSession({
          access_token: stored.accessToken,
          refresh_token: stored.refreshToken,
        });
        if (!error && data.session) {
          done();
          cachedRestoreRef.current = false;
          const fallbackUser =
            stored.user && isWithinOfflineGrace(stored.savedAt)
              ? stored.user
              : null;
          setUser(await genumUserFromSession(data.session, fallbackUser));
          void auth.persistSession(data.session);
          void settings.syncOnSignIn(applyThemeOnly);
          return true;
        }
        if (error && !auth.isRetryableAuthError(error)) {
          done();
          cachedRestoreRef.current = false;
          setUser(null);
          await auth.clearStoredSession();
          return true;
        }
        return false; // still transient — keep waiting for connectivity
      };

      if (await attempt()) return;
      unsubNet = NetInfo.addEventListener((state) => {
        if (state.isConnected && state.isInternetReachable !== false) {
          void attempt().then((attached) => {
            if (attached) unsubNet?.();
          });
        }
      });
      const appSub = AppState.addEventListener("change", (status) => {
        if (status === "active") {
          void attempt().then((attached) => {
            if (attached) appSub.remove();
          });
        }
      });
      unsubApp = () => appSub.remove();
    }

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // Theme restore — 2-mode (owner decision 2026-09-22): only 'light' /
    // 'dark' are stored; the legacy 'system' (OS-follow) default migrates to
    // 'dark' (= the website's 'dim'), and a fresh install with no stored
    // choice starts 'light' — matching the website exactly.
    void AsyncStorage.getItem("genum-theme-mode").then((stored) => {
      const mode: ThemeMode =
        stored === "dark" || stored === "light"
          ? stored
          : stored === "system" || stored === "dim"
            ? "dark"
            : "light";
      setThemeModeState(mode);
      applyColorScheme(mode);
      void AsyncStorage.setItem("genum-theme-mode", mode);
    });
  }, []);

  // Apply + cache WITHOUT the DB write-back (used when adopting the cloud
  // preference on sign-in — the value just came FROM the database).
  const applyThemeOnly = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    applyColorScheme(mode);
    void AsyncStorage.setItem("genum-theme-mode", mode);
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    applyColorScheme(mode);
    void AsyncStorage.setItem("genum-theme-mode", mode);
    // Cloud mirror: the canonical preference lives on profiles
    // (theme_preference) so the website sees the same choice (W-6 parity).
    void settings.saveThemePreference(mode);
  }, []);

  // ── launch-level update check (every app open) ────────────────────
  // Checks OTA first (silent JS/asset update, applied on next launch) then
  // falls back to the APK manifest. A NEWER APK exists → show the top-bar
  // "vX available" pill; an OTA was fetched → offer "App updated · reload".
  // PERF (2026-09-25): ONE check per app launch, module-level. The effect
  // re-fires on every AppContext remount (error-boundary recoveries, StrictMode
  // double-invoke in dev) and each run hits BOTH the OTA server and the
  // release manifest — a shared promise makes remounts await the same flight
  // and keeps the network cost at exactly one check per launch.
  let launchUpdateFlight: Promise<void> | null = null;
  const runLaunchUpdateCheck = useCallback(async () => {
    if (launchUpdateFlight) return launchUpdateFlight;
    launchUpdateFlight = (async () => {
      const result = await checkForAnyUpdate();
      if (result.status === "update-available" && result.latestVersion) {
        setUpdatePill({ version: result.latestVersion });
      }
      if (result.otaApplied) setAppUpdated(true);
    })();
    try {
      await launchUpdateFlight;
    } finally {
      launchUpdateFlight = null;
    }
  }, []);

  useEffect(() => {
    void runLaunchUpdateCheck();
  }, [runLaunchUpdateCheck]);

  // --- order-status push token: register on sign-in, drop on sign-out ---
  useEffect(() => {
    if (!user?.id) return;
    void push.registerPushToken(user.id);
    return () => {
      void push.removePushTokens(user.id);
    };
  }, [user?.id]);

  // --- load the cart badge on launch + keep it current ---
  // U-24 (2026-09-24): the badge must match CartScreen, which only renders
  // lines that resolve to ACTIVE catalog products. Prune orphan lines (stale
  // product ids from deactivated/removed items, or a persisted server cart
  // after a wipe) against the active id list, and persist the pruned cart so
  // the phantom count disappears permanently — not just for this session.
  const refreshCartCount = useCallback(async () => {
    const lines = await cart.getLocalCart();
    let counted = lines;
    try {
      const validIds = await productService.listActiveProductIds();
      const pruned = cart.pruneOrphanLines(lines, validIds);
      if (pruned.length !== lines.length) {
        counted = pruned;
        await cart.replaceLocalCart(pruned);
      }
    } catch {
      // offline / no id cache yet -> keep unverified lines as-is
    }
    setCartCount(cart.totalCount(counted));
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
      .catch((e: unknown) => {
        // C8: was silent — server cart writes failing meant website/app cart
        // drift with no trace. Logged (not thrown) to keep the queue alive.
        logger.error("cart", "server cart push failed", e);
        return undefined;
      });
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
        let clean = merged;
        try {
          const validIds = await productService.listActiveProductIds();
          clean = cart.pruneOrphanLines(merged, validIds);
        } catch {
          // keep merged as-is when the id list is unavailable
        }
        await cart.replaceLocalCart(clean);
        if (cancelled) return;
        // DB sticks with the merged cart so both clients start from the same state.
        pushCartToServer(userId, clean);
        setCartCount(cart.totalCount(clean));
      } catch (e) {
        logger.error("cart", "cart merge on sign-in failed", e);
        if (!cancelled) void refreshCartCount();
      }
    })();
    cart.setCartSyncHandler((lines) => pushCartToServer(userId, lines));
    return () => {
      cancelled = true;
      cart.setCartSyncHandler(null);
    };
  }, [user?.id, pushCartToServer, refreshCartCount]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

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
        setAuthError("Sign-in is not configured yet.");
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
        return applyError(e instanceof Error ? e.message : "Sign-in failed.");
      }
    },
    [applyAuthed, applyError],
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      if (!supabaseConfigured) {
        setAuthError("Sign-up is not configured yet.");
        return "error";
      }
      setAuthBusy(true);
      setAuthError(null);
      try {
        const session = await auth.signUp(name, email, password);
        if (session) {
          setAuthSheetOpen(false);
          applyAuthed();
          return "ok";
        }
        // confirmation email required
        applyAuthed();
        return "confirm";
      } catch (e) {
        applyError(e instanceof Error ? e.message : "Sign-up failed.");
        return "error";
      }
    },
    [applyAuthed, applyError],
  );

  const resendConfirmation = useCallback(
    async (email: string) => {
      if (!supabaseConfigured) return false;
      setAuthBusy(true);
      setAuthError(null);
      try {
        await auth.resendConfirmation(email);
        setAuthBusy(false);
        return true;
      } catch (e) {
        setAuthBusy(false);
        return applyError(
          e instanceof Error
            ? e.message
            : "Failed to resend the confirmation email.",
        );
      }
    },
    [applyError],
  );

  const signInWithGoogle = useCallback(async () => {
    if (!supabaseConfigured) {
      setAuthError("Sign-in is not configured yet.");
      return false;
    }
    setAuthBusy(true);
    setAuthError(null);
    const result = await auth.signInWithGoogle();
    if (result.status === "ok") {
      setAuthSheetOpen(false);
      applyAuthed();
      return true;
    }
    if (result.status === "error") setAuthError(result.message);
    setAuthBusy(false);
    return false;
  }, [applyAuthed]);

  const resetPassword = useCallback(
    async (email: string) => {
      if (!supabaseConfigured) return false;
      setAuthBusy(true);
      setAuthError(null);
      try {
        await auth.resetPassword(email);
        setAuthBusy(false);
        return true;
      } catch (e) {
        setAuthBusy(false);
        return applyError(
          e instanceof Error ? e.message : "Failed to send reset link.",
        );
      }
    },
    [applyError],
  );

  /** Re-read the signed-in profile (role/tier/name). Called when the Account
   *  or Menu surface gains focus, so a promotion to staff/admin made in the
   *  website's Users tab shows the Admin dashboard without a re-login. */
  const refreshProfile = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) return;
      const stored = await auth.loadStoredSession().catch(() => null);
      const fallbackUser = stored?.user ?? null;
      const g = await genumUserFromSession(session, fallbackUser);
      setUser(g);
      await auth.persistSession(session, g);
    } catch (e) {
      logger.warn("auth", "profile refresh failed", e);
    }
  }, []);

  const signOut = useCallback(() => {
    void auth.signOut();
    setUser(null);
    setAuthSheetOpen(false);
    // U-24 (2026-09-24): signing out starts a clean guest cart — the previous
    // session's lines stay safely in the DB `carts` table and return on the
    // next sign-in. This removes the "6 items while logged out" phantom. The
    // cart badge clears immediately without waiting for the storage write.
    void cart.clearCart().then(() => setCartCount(0));
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      sessionReady,
      isSignedIn: Boolean(user),
      // staff+ can operate every admin panel except deletions; isAdmin means
      // admin+owner (deletion rights); only the sole owner can delete users.
      isStaff:
        user?.role === "staff" ||
        user?.role === "admin" ||
        user?.role === "owner",
      isAdmin: user?.role === "admin" || user?.role === "owner",
      isOwner: user?.role === "owner",
      isPro: true, // All tiers now have pro features — pro unlocks removed, all users have full access
      cartCount,
      setCart,
      authSheetOpen,
      setAuthSheetOpen,
      accountSheetOpen,
      setAccountSheetOpen,
      authBusy,
      authError,
      clearAuthError,
      refreshProfile,
      signInWithPassword,
      signUp,
      signInWithGoogle,
      resetPassword,
      resendConfirmation,
      signOut,
      carModes,
      themeMode,
      setThemeMode,
      updatePill,
      setUpdatePill,
      appUpdated,
      setAppUpdated,
      runLaunchUpdateCheck,
    }),
    [
      user,
      sessionReady,
      cartCount,
      setCart,
      authSheetOpen,
      setAuthSheetOpen,
      accountSheetOpen,
      setAccountSheetOpen,
      authBusy,
      authError,
      clearAuthError,
      refreshProfile,
      signInWithPassword,
      signUp,
      signInWithGoogle,
      resetPassword,
      resendConfirmation,
      signOut,
      carModes,
      themeMode,
      setThemeMode,
      updatePill,
      setUpdatePill,
      appUpdated,
      setAppUpdated,
      runLaunchUpdateCheck,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
