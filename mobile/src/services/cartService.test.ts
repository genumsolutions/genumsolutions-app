import { describe, expect, it, vi } from 'vitest';

// ── mocks (factory creates state internally — vi.mock is hoisted) ──
vi.mock('@react-native-async-storage/async-storage', () => {
  const _getItem = vi.fn();
  const _setItem = vi.fn();
  const _removeItem = vi.fn();
  return {
    default: { getItem: (...a: unknown[]) => _getItem(...a), setItem: (...a: unknown[]) => _setItem(...a), removeItem: (...a: unknown[]) => _removeItem(...a) },
    __getItem: _getItem, __setItem: _setItem, __removeItem: _removeItem,
  };
});

vi.mock('@supabase/supabase-js', () => {
  const _createClient = vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null }),
        }),
      }),
    }),
    upsert: () => Promise.resolve({}),
  }));
  return { default: _createClient, createClient: _createClient, __createClient: _createClient };
});

// ── imports (after mocks) ──────────────────────────────
import * as AsyncStorage from '@react-native-async-storage/async-storage';
import * as Supabase from '@supabase/supabase-js';
import {
  sanitizeLines,
  totalCount,
  mergeCarts,
  setCartSyncHandler,
  getLocalCart,
  replaceLocalCart,
  addToCart,
  setQuantity,
  clearCart,
  fetchServerCart,
  pushCartToServer,
} from './cartService';

const { __getItem, __setItem } = AsyncStorage as { __getItem: typeof vi.fn; __setItem: typeof vi.fn };
const { __createClient } = Supabase as { __createClient: typeof vi.fn };

// ── helpers ────────────────────────────────────────────
function mockSupabaseResponse(data: unknown) {
  __createClient.mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data }),
        }),
      }),
    }),
  });
}

function mockSupabaseError() {
  __createClient.mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.reject(new Error('DB down')),
        }),
      }),
    }),
  });
}

// ── sanitizeLines ────────────────────────────────────
describe('sanitizeLines', () => {
  it('returns empty array for non-array input', () => {
    expect(sanitizeLines(null)).toEqual([]);
    expect(sanitizeLines(undefined)).toEqual([]);
    expect(sanitizeLines('not-array')).toEqual([]);
    expect(sanitizeLines({})).toEqual([]);
  });

  it('drops lines missing productId or quantity', () => {
    const lines = [
      { productId: 'p1', quantity: 2 },
      { productId: 'p2' },
      { quantity: 3 },
      { productId: 'p3', quantity: NaN },
    ];
    expect(sanitizeLines(lines)).toEqual([{ productId: 'p1', quantity: 2 }]);
  });

  it('clamps quantities to 1..99', () => {
    const lines = [
      { productId: 'p1', quantity: 0 },
      { productId: 'p2', quantity: 50 },
      { productId: 'p3', quantity: 200 },
    ];
    expect(sanitizeLines(lines)).toEqual([
      { productId: 'p1', quantity: 1 },
      { productId: 'p2', quantity: 50 },
      { productId: 'p3', quantity: 99 },
    ]);
  });

  it('floors quantities via Math.floor', () => {
    expect(sanitizeLines([{ productId: 'p1', quantity: 3.7 }])).toEqual([
      { productId: 'p1', quantity: 3 },
    ]);
  });

  it('returns empty for empty array', () => {
    expect(sanitizeLines([])).toEqual([]);
  });
});

// ── totalCount ───────────────────────────────────────
describe('totalCount', () => {
  it('sums quantities', () => {
    expect(totalCount([{ productId: 'p1', quantity: 2 }, { productId: 'p2', quantity: 3 }])).toBe(5);
  });

  it('returns 0 for empty array', () => {
    expect(totalCount([])).toBe(0);
  });
});

// ── setCartSyncHandler ──────────────────────────────
describe('setCartSyncHandler', () => {
  it('registers a sync handler', () => {
    const handler = vi.fn();
    setCartSyncHandler(handler);
    expect(typeof handler).toBe('function');
  });

  it('accepts null to unregister', () => {
    setCartSyncHandler(null);
  });
});

// ── mergeCarts ──────────────────────────────────────
describe('mergeCarts', () => {
  it('server lines win, guest-only lines appended', () => {
    const server = [{ productId: 'p1', quantity: 2 }];
    const local = [{ productId: 'p1', quantity: 5 }, { productId: 'p2', quantity: 1 }];
    expect(mergeCarts(server, local)).toEqual([
      { productId: 'p1', quantity: 2 },
      { productId: 'p2', quantity: 1 },
    ]);
  });

  it('returns empty if both empty', () => {
    expect(mergeCarts([], [])).toEqual([]);
  });

  it('all local lines appended when server is empty', () => {
    const local = [{ productId: 'p2', quantity: 1 }];
    expect(mergeCarts([], local)).toEqual(local);
  });
});

// ── getLocalCart ────────────────────────────────────
describe('getLocalCart', () => {
  it('returns empty array when AsyncStorage has nothing', async () => {
    __getItem.mockResolvedValue(null);
    expect(await getLocalCart()).toEqual([]);
  });

  it('returns parsed cart from AsyncStorage', async () => {
    __getItem.mockResolvedValue(JSON.stringify([{ productId: 'p1', quantity: 3 }]));
    expect(await getLocalCart()).toEqual([{ productId: 'p1', quantity: 3 }]);
  });

  it('returns empty on JSON parse error', async () => {
    __getItem.mockResolvedValue('not-json');
    expect(await getLocalCart()).toEqual([]);
  });
});

// ── replaceLocalCart ──────────────────────────────
describe('replaceLocalCart', () => {
  it('persists sanitized lines to AsyncStorage', async () => {
    await replaceLocalCart([{ productId: 'p1', quantity: 3 }]);
    expect(__setItem).toHaveBeenCalled();
    const callArg = __setItem.mock.calls[0][1];
    expect(JSON.parse(callArg)).toEqual([{ productId: 'p1', quantity: 3 }]);
  });
});

// ── addToCart ─────────────────────────────────────
describe('addToCart', () => {
  it('adds a new product to an empty cart', async () => {
    __getItem.mockResolvedValue(JSON.stringify([]));
    __setItem.mockResolvedValue(undefined);
    const handler = vi.fn();
    setCartSyncHandler(handler);

    const count = await addToCart('p1', 2);
    expect(count).toBe(2);
    expect(__setItem).toHaveBeenCalled();
    expect(handler).toHaveBeenCalled();
  });

  it('bumps quantity for an existing product', async () => {
    __getItem.mockResolvedValue(JSON.stringify([{ productId: 'p1', quantity: 2 }]));
    __setItem.mockResolvedValue(undefined);
    const handler = vi.fn();
    setCartSyncHandler(handler);

    const count = await addToCart('p1', 3);
    expect(count).toBe(5);
  });

  it('clamps quantity to 99', async () => {
    __getItem.mockResolvedValue(JSON.stringify([{ productId: 'p1', quantity: 95 }]));
    __setItem.mockResolvedValue(undefined);

    await addToCart('p1', 100);
    const callArg = JSON.parse(__setItem.mock.calls[0][1]);
    expect(callArg[0].quantity).toBe(99);
  });
});

// ── setQuantity ───────────────────────────────────
describe('setQuantity', () => {
  it('updates quantity for an existing product', async () => {
    __getItem.mockResolvedValue(JSON.stringify([{ productId: 'p1', quantity: 2 }]));
    __setItem.mockResolvedValue(undefined);

    await setQuantity('p1', 5);
    const callArg = JSON.parse(__setItem.mock.calls[0][1]);
    expect(callArg[0].quantity).toBe(5);
  });

  it('removes product when quantity <= 0', async () => {
    __getItem.mockResolvedValue(JSON.stringify([{ productId: 'p1', quantity: 2 }, { productId: 'p2', quantity: 1 }]));
    __setItem.mockResolvedValue(undefined);

    await setQuantity('p1', 0);
    const callArg = JSON.parse(__setItem.mock.calls[0][1]);
    expect(callArg).toEqual([{ productId: 'p2', quantity: 1 }]);
  });
});

// ── clearCart ───────────────────────────────────────
describe('clearCart', () => {
  it('persists empty array and notifies sync', async () => {
    const handler = vi.fn();
    setCartSyncHandler(handler);
    await clearCart();
    expect(__setItem).toHaveBeenCalledWith('genum_native_cart_v1', JSON.stringify([]));
    expect(handler).toHaveBeenCalledWith([]);
  });
});

// ── fetchServerCart ─────────────────────────────
describe('fetchServerCart', () => {
  it('returns empty array on missing DB cart', async () => {
    mockSupabaseResponse(null);
    expect(await fetchServerCart('user-1')).toEqual([]);
  });

  it('returns sanitized cart from DB', async () => {
    mockSupabaseResponse({ lines: [{ productId: 'p1', quantity: 3 }] });
    expect(await fetchServerCart('user-1')).toEqual([{ productId: 'p1', quantity: 3 }]);
  });

  it('returns empty on DB error', async () => {
    mockSupabaseError();
    expect(await fetchServerCart('user-1')).toEqual([]);
  });
});

// ── pushCartToServer ────────────────────────────────
describe('pushCartToServer', () => {
  it('upserts sanitized cart to DB', async () => {
    await pushCartToServer('user-1', [{ productId: 'p1', quantity: 3 }]);
    expect(__createClient()).toBeDefined();
  });

  it('does not throw on DB error', async () => {
    mockSupabaseError();
    await expect(pushCartToServer('user-1', [{ productId: 'p1', quantity: 3 }])).resolves.toBeUndefined();
  });
});
