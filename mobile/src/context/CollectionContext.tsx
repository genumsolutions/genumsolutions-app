// =====================================================================
// CollectionContext — U-47 (2026-09-27): APP-WIDE heart sync, mirroring
// the website's collection-provider. One source of truth for "is this
// item in the signed-in user's collection":
//   • hydrates once per sign-in from user_collection (RLS own-rows)
//   • toggle() is optimistic — the heart flips instantly and reverts on
//     failure; guest taps surface a flag so screens can prompt sign-in
//   • every ProductCard / collection view reads the SAME state, so a
//     heart on Shop shows on Projects and in the profile immediately
// =====================================================================
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useApp } from "./AppContext";
import {
  listCollection,
  type CollectionItem,
} from "../services/collectionService";

type CollectionContextValue = {
  /** Item ids currently saved by the signed-in user. */
  savedIds: Set<string>;
  has: (itemId: string) => boolean;
  /** Optimistic toggle; returns the new state. Throws when signed out. */
  toggle: (itemId: string, kind?: "product" | "service") => Promise<boolean>;
  /** Guest tapped a heart — set until consumed (screens prompt sign-in). */
  guestAttempt: boolean;
  clearGuestAttempt: () => void;
  /** Re-pull from the DB (after profile changes, pull-to-refresh…). */
  refresh: () => Promise<void>;
};

const CollectionContext = createContext<CollectionContextValue | null>(null);

export function CollectionProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, sessionReady } = useApp();
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [guestAttempt, setGuestAttempt] = useState(false);

  // Hydrate once per sign-in; clear on sign-out.
  useEffect(() => {
    if (!sessionReady) return;
    let active = true;
    if (!isSignedIn) {
      setItems([]);
      return () => {
        active = false;
      };
    }
    listCollection()
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [isSignedIn, sessionReady]);

  const savedIds = useMemo(() => new Set(items.map((i) => i.itemId)), [items]);

  const refresh = useCallback(async () => {
    const rows = await listCollection().catch(() => [] as CollectionItem[]);
    setItems(rows);
  }, []);

  const toggle = useCallback(
    async (itemId: string, kind: "product" | "service" = "product") => {
      const wasSaved = savedIds.has(itemId);
      if (!isSignedIn) {
        setGuestAttempt(true);
        throw new Error("Sign in to save items to your collection.");
      }
      // Optimistic flip.
      setItems((current) =>
        wasSaved
          ? current.filter((i) => !(i.itemId === itemId && i.itemKind === kind))
          : [
              {
                itemId,
                itemKind: kind,
                createdAt: new Date().toISOString(),
              },
              ...current,
            ],
      );
      try {
        const { toggleCollection } =
          await import("../services/collectionService");
        await toggleCollection(itemId, kind);
        return !wasSaved;
      } catch (e) {
        // Revert the optimistic flip on failure.
        setItems((current) =>
          wasSaved
            ? current.filter(
                (i) => !(i.itemId === itemId && i.itemKind === kind),
              )
            : [
                {
                  itemId,
                  itemKind: kind,
                  createdAt: new Date().toISOString(),
                },
                ...current,
              ],
        );
        throw e;
      }
    },
    [savedIds, isSignedIn],
  );

  const has = useCallback((itemId: string) => savedIds.has(itemId), [savedIds]);
  const clearGuestAttempt = useCallback(() => setGuestAttempt(false), []);

  const value = useMemo(
    () => ({
      savedIds,
      has,
      toggle,
      guestAttempt,
      clearGuestAttempt,
      refresh,
    }),
    [savedIds, has, toggle, guestAttempt, clearGuestAttempt, refresh],
  );

  return (
    <CollectionContext.Provider value={value}>
      {children}
    </CollectionContext.Provider>
  );
}

export function useCollection(): CollectionContextValue {
  const ctx = useContext(CollectionContext);
  if (!ctx) {
    // Screens render before the provider mounts in tests/story contexts —
    // fail soft with a no-op collection rather than crash.
    return {
      savedIds: new Set(),
      has: () => false,
      toggle: async () => {
        throw new Error("CollectionProvider is not mounted.");
      },
      guestAttempt: false,
      clearGuestAttempt: () => undefined,
      refresh: async () => undefined,
    };
  }
  return ctx;
}
