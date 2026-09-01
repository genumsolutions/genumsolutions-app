// =====================================================================
// cartService - native cart backed by AsyncStorage. Works for guests and
// signed-in users alike. When signed in, the cart can be synced to the
// shared `carts` table (user_id keyed) so the website checkout sees it too.
// =====================================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';
import type { CartLine, Product } from '../types';

const CART_KEY = 'genum_native_cart_v1';

export async function getLocalCart(): Promise<CartLine[]> {
  try {
    const raw = await AsyncStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartLine[]) : [];
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

/** Add a product to the local cart (or bump quantity). Returns new count. */
export async function addToCart(productId: string, quantity = 1): Promise<number> {
  const lines = await getLocalCart();
  const existing = lines.find((l) => l.productId === productId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    lines.push({ productId, quantity });
  }
  await persist(lines);
  return totalCount(lines);
}

export async function setQuantity(productId: string, quantity: number): Promise<number> {
  let lines = await getLocalCart();
  if (quantity <= 0) {
    lines = lines.filter((l) => l.productId !== productId);
  } else {
    const existing = lines.find((l) => l.productId === productId);
    if (existing) existing.quantity = quantity;
    else lines.push({ productId, quantity });
  }
  await persist(lines);
  return totalCount(lines);
}

export async function clearCart(): Promise<void> {
  await persist([]);
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

/** Sync the local cart to the shared `carts` table for a signed-in user. */
export async function syncCartToServer(userId: string): Promise<void> {
  try {
    const lines = await getLocalCart();
    await supabase
      .from('carts')
      .upsert({ user_id: userId, lines, updated_at: new Date().toISOString() });
  } catch {
    /* best effort */
  }
}
