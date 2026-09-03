// =====================================================================
// cartService - native cart. Works for guests and signed-in users alike.
//
// The shared `carts` table (user_id keyed, `lines` jsonb, RLS "own cart")
// is the source of truth whenever a user is signed in, so the native app
// and the website always show the same cart:
//   - guests: cart lives in AsyncStorage only
//   - signed in: every local mutation is pushed to the DB (write-through),
//     and on sign-in / app start the DB cart is loaded and merged with any
//     guest lines that were added before authentication.
// AppContext registers the push handler via setCartSyncHandler.
// =====================================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';
import type { CartLine, Product } from '../types';

const CART_KEY = 'genum_native_cart_v1';
// Must match the website (lib/cart-client.ts).
const MAX_QUANTITY_PER_LINE = 99;

/** Registered by AppContext while a user is signed in; called after every local mutation. */
let syncHandler: ((lines: CartLine[]) => void) | null = null;

export function setCartSyncHandler(handler: ((lines: CartLine[]) => void) | null): void {
  syncHandler = handler;
}

function clampQuantity(n: number): number {
  return Math.max(1, Math.min(MAX_QUANTITY_PER_LINE, Math.floor(n)));
}

/** Drop malformed/unknown lines and clamp quantities, matching the website. */
export function sanitizeLines(lines: unknown): CartLine[] {
  if (!Array.isArray(lines)) return [];
  return lines
    .filter(
      (line): line is CartLine =>
        Boolean(line && typeof line === 'object') &&
        typeof (line as CartLine).productId === 'string' &&
        Number.isFinite((line as CartLine).quantity),
    )
    .map((line) => ({ productId: line.productId, quantity: clampQuantity(line.quantity) }));
}

export async function getLocalCart(): Promise<CartLine[]> {
  try {
    const raw = await AsyncStorage.getItem(CART_KEY);
    if (!raw) return [];
    return sanitizeLines(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function persist(lines: CartLine[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CART_KEY, JSON.stringify(lines));
  } catch {
    /* ignore */
  }
}

/** Replace the whole local cart (used when adopting the DB cart on sign-in). */
export async function replaceLocalCart(lines: CartLine[]): Promise<void> {
  await persist(sanitizeLines(lines));
}

function notifySync(lines: CartLine[]): void {
  if (syncHandler) syncHandler(lines);
}

/** Add a product to the local cart (or bump quantity) and sync. Returns new count. */
export async function addToCart(productId: string, quantity = 1): Promise<number> {
  const lines = await getLocalCart();
  const existing = lines.find((l) => l.productId === productId);
  if (existing) {
    existing.quantity = Math.min(
      MAX_QUANTITY_PER_LINE,
      existing.quantity + Math.max(1, Math.floor(quantity)),
    );
  } else {
    lines.push({ productId, quantity: clampQuantity(quantity) });
  }
  await persist(lines);
  notifySync(lines);
  return totalCount(lines);
}

export async function setQuantity(productId: string, quantity: number): Promise<number> {
  let lines = await getLocalCart();
  if (quantity <= 0) {
    lines = lines.filter((l) => l.productId !== productId);
  } else {
    const existing = lines.find((l) => l.productId === productId);
    if (existing) existing.quantity = clampQuantity(quantity);
    else lines.push({ productId, quantity: clampQuantity(quantity) });
  }
  await persist(lines);
  notifySync(lines);
  return totalCount(lines);
}

export async function clearCart(): Promise<void> {
  await persist([]);
  notifySync([]);
}

export async function totalCount(lines: CartLine[]): Promise<number> {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

/** Combine cart lines with the product catalog for display/checkout. */
export async function resolveCart(products: Product[]): Promise<
  { line: CartLine; product: Product }[]
> {
  const lines = await getLocalCart();
  const byId = new Map(products.map((p) => [p.id, p]));
  return lines
    .filter((l) => byId.has(l.productId))
    .map((line) => ({ line, product: byId.get(line.productId)! }));
}

// ===================== Server (shared carts table) =====================

/** Read the signed-in user's DB cart (empty when none exists). */
export async function fetchServerCart(userId: string): Promise<CartLine[]> {
  try {
    const { data } = await supabase
      .from('carts')
      .select('lines')
      .eq('user_id', userId)
      .maybeSingle();
    return sanitizeLines(data?.lines);
  } catch {
    return [];
  }
}

/** Upsert the user's full cart into the DB (REPLACE semantics like the website). */
export async function pushCartToServer(userId: string, lines: CartLine[]): Promise<void> {
  try {
    const clean = sanitizeLines(lines);
    await supabase
      .from('carts')
      .upsert({ user_id: userId, lines: clean, updated_at: new Date().toISOString() });
  } catch {
    /* best effort - local cart remains usable offline */
  }
}

/**
 * Adopt the DB cart on sign-in: DB lines win per product, then guest-only
 * lines added before authentication are appended so nothing is lost. This
 * mirrors the website's /api/cart reconcile (server is the source of truth).
 */
export function mergeCarts(server: CartLine[], local: CartLine[]): CartLine[] {
  const serverIds = new Set(server.map((l) => l.productId));
  const localOnly = local.filter((l) => !serverIds.has(l.productId) && l.quantity > 0);
  return [...server, ...localOnly];
}
