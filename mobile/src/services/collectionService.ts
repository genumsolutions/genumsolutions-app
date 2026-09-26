// =====================================================================
// collectionService — U-47 (2026-09-27): per-user saved cards.
//
// The `user_collection` table (RLS: own rows only) backs the heart on
// every card and the "My collection" section on the profile. item_kind
// distinguishes products (incl. project packages — they are products
// rows) from services. All calls are no-ops when signed out or offline
// so browsing never breaks.
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

/** Add to the collection (idempotent). No-op when signed out. */
export async function addToCollection(
  itemId: string,
  kind: CollectionItemKind = "product",
): Promise<boolean> {
  if (!supabaseConfigured) return false;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return false;
  const { error } = await supabase
    .from("user_collection")
    .upsert(
      { item_id: itemId, item_kind: kind },
      { onConflict: "user_id,item_id,item_kind" },
    );
  return !error;
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
  return !error;
}

/** Toggle; returns the new state. No-op (false) when signed out. */
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
