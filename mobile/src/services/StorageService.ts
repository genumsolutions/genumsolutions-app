// =====================================================================
// StorageService - offline-first local storage via AsyncStorage.
//
// Design:
//   - Each entity type ("audits", "products", ...) keeps a JSON queue in
//     AsyncStorage under a namespaced key.
//   - enqueue() appends records locally so they survive app restarts and
//     can be synced later by SyncService when the device is online.
//
// If you prefer a relational store, swap AsyncStorage for expo-sqlite and
// mirror these method signatures.
// =====================================================================
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'genum:queue:';

function keyFor(entity: string): string {
  return `${PREFIX}${entity}`;
}

async function readQueue<T>(entity: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(entity));
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch (e) {
    // PLAYLACEHOLDER: surface corrupted-queue to a logger / sentry
    console.error('StorageService.readQueue failed', e);
    return [];
  }
}

export async function enqueue<T>(entity: string, record: T): Promise<void> {
  const queue = await readQueue<T>(entity);
  queue.push(record);
  await AsyncStorage.setItem(keyFor(entity), JSON.stringify(queue));
}

export async function queryQueue<T>(entity: string): Promise<T[]> {
  return readQueue<T>(entity);
}

// Replace the entire queue (used by SyncService after successful sync).
export async function replaceQueue<T>(entity: string, queue: T[]): Promise<void> {
  await AsyncStorage.setItem(keyFor(entity), JSON.stringify(queue));
}

// Clear a queue fully (e.g. after a forced reset).
export async function clearQueue(entity: string): Promise<void> {
  await AsyncStorage.removeItem(keyFor(entity));
}

export const StorageService = {
  enqueue,
  queryQueue,
  replaceQueue,
  clearQueue,
};
