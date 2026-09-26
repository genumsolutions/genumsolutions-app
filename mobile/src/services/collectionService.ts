// =====================================================================
// collectionService — U-47 (2026-09-27): per-user saved cards.
//
// The `user_collection` table (RLS: own rows only) backs the heart on
// every card and the "My collection" section on the profile. item_kind
// distinguishes products (incl. project packages — they are products
// rows) from services. All calls are no-ops when signed out or offline
// so browsing never breaks.
//
// FIX (2026-09-27): writes MUST carry user_id explicitly — the column is
// `not null` and, without it, every write failed silently under RLS
// (the "collection never shows on the profile" bug). The DB also got a
// `default auth.uid()` on the column as belt-and-braces.
// =====================================================================
import { supabase, supabaseConfigured } from "../config/supabase";

export type CollectionItemKind = "product" | "service";

export type CollectionItem = {
  itemId: string;
  itemKind: CollectionItemKind;
  createdAt: string;
};

/** All collection rows for the signed-in user (newest first). */
export async function listCollection(): Promise<CollectionItem[]> {
  if (!supabaseConfigured) return [];
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return [];
  const { data, error } = await supabase
    .from("user_collection")
    .select("item_id, item_kind, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    itemId: String(row.item_id ?? ""),
    itemKind: row.item_kind === "service" ? "service" : "product",
    createdAt: String(row.created_at ?? ""),
  }));
}

/** Is this item in the signed-in user's collection? */
export async function isInCollection(
  itemId: string,
  kind: CollectionItemKind = "product",
): Promise<boolean> {
  if (!supabaseConfigured) return false;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return false;
  const { data, error } = await supabase
    .from("user_collection")
    .select("item_id")
    .eq("item_id", itemId)
    .eq("item_kind", kind)
    .limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}

/** Add to the collection (idempotent). Throws when signed out. */
export async function addToCollection(
  itemId: string,
  kind: CollectionItemKind = "product",
): Promise<boolean> {
  if (!supabaseConfigured) return false;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("Sign in to save items to your collection.");
  const { error } = await supabase.from("user_collection").upsert(
    // user_id explicit: the not-null column made silent inserts fail.
    {
      user_id: userId,
      item_id: itemId,
      item_kind: kind,
    },
    { onConflict: "user_id,item_id,item_kind" },
  );
  if (error) throw error;
  return true;
}

/** Remove from the collection. No-op when signed out. */
export async function removeFromCollection(
  itemId: string,
  kind: CollectionItemKind = "product",
): Promise<boolean> {
  if (!supabaseConfigured) return false;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return false;
  const { error } = await supabase
    .from("user_collection")
    .delete()
    .eq("item_id", itemId)
    .eq("item_kind", kind);
  if (error) throw error;
  return true;
}

/** Toggle; returns the new state. Throws (guest) so the UI can prompt. */
export async function toggleCollection(
  itemId: string,
  kind: CollectionItemKind = "product",
): Promise<boolean> {
  const saved = await isInCollection(itemId, kind);
  if (saved) {
    await removeFromCollection(itemId, kind);
    return false;
  }
  await addToCollection(itemId, kind);
  return true;
}

// ---------------------------------------------------------------------
// U-47v2: per-user habit counters (user_habits + track_habit RPC).
// Aggregated counts only — no raw history. Fire-and-forget from screens;
// guests are ignored server-side, failures never surface in the UI.
// ---------------------------------------------------------------------

export type HabitKind = "view" | "search" | "cart" | "order";

export async function trackHabit(kind: HabitKind): Promise<void> {
  if (!supabaseConfigured) return;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return;
    await supabase.rpc("track_habit", { p_kind: kind });
  } catch {
    // best-effort by design
  }
}
