// =====================================================================
// SyncService - offline queue processing + Supabase sync skeleton.
//
// High-level design:
//   1. App writes records offline via StorageService.enqueue(...).
//   2. On connectivity restored (NetInfo.listener), call processQueue().
//   3. For each queued record per entity, upsert into Supabase, then
//      remove it from the local queue on success.
//
// Conflict strategy (notes only - implement as you see fit):
//   - Use a monotonic `updated_at` / `rev` field on each record.
//   - Last-write-wins is the simplest baseline; escalate to per-field
//     merge or a server-side `rev` bump if edits can conflict.
//   - Log every skipped/failed record to a dead-letter list for retry.
// =====================================================================
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../../shared/supabase';
import { StorageService } from './StorageService';

// Registry mapping entity -> Supabase table name.
// Extend this when you add more offline entities.
const TABLE_BY_ENTITY: Record<string, string> = {
  audits: 'audits',
  products: 'products',
};

export async function processQueue(entity: string): Promise<number> {
  const table = TABLE_BY_ENTITY[entity];
  if (!table) {
    console.warn(`SyncService: no table mapped for entity "${entity}"`);
    return 0;
  }

  const queue = await StorageService.queryQueue<Record<string, unknown>>(entity);
  const remaining: Record<string, unknown>[] = [];
  let synced = 0;

  for (const record of queue) {
    // PLAYLACEHOLDER: handle offline -> skip, online -> upsert
    const { error } = await supabase.from(table).upsert(record).select();
    if (error) {
      // keep the failed record for retry / dead-lettering
      remaining.push(record);
    } else {
      synced += 1;
    }
  }

  await StorageService.replaceQueue(entity, remaining);
  return synced;
}

export async function syncAll(): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  for (const entity of Object.keys(TABLE_BY_ENTITY)) {
    results[entity] = await processQueue(entity);
  }
  return results;
}

// Subscribe to connectivity changes and sync when we come back online.
export function startSyncListener(): () => void {
  const unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      syncAll().catch((e) => console.error('SyncService.syncAll failed', e));
    }
  });
  return unsubscribe;
}

export const SyncService = {
  processQueue,
  syncAll,
  startSyncListener,
};
