// =====================================================================
// ProductEditScreen - create/edit products offline.
//
// Flow:
//   - handleSave() builds a record with a client-generated id and queues
//     it via StorageService.enqueue('products', ...).
//   - SyncService maps 'products' -> offline_product_edits (queue-only for
//     now; promotion into the live `products` table is a future admin
//     workflow).
//   - payload holds the full record for that future promotion step.
// =====================================================================
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { BrandHeader } from '../components/BrandHeader';
import { StorageService } from '../services/StorageService';
import { SyncService } from '../services/SyncService';
import { newId } from '../utils/uuid';

type ProductRecord = {
  id: string;
  name: string;
  price: number;
  payload: { name: string; price: number };
  synced_at: string | null;
};

export function ProductEditScreen() {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [pending, setPending] = useState<ProductRecord[]>([]);

  const loadPending = useCallback(async () => {
    setPending(await StorageService.queryQueue<ProductRecord>('products'));
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    const priceNum = Math.round(Number(price));
    if (!trimmedName) {
      Alert.alert('Missing field', 'Product name is required.');
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      Alert.alert('Invalid price', 'Enter a valid non-negative price.');
      return;
    }
    const record: ProductRecord = {
      id: newId(),
      name: trimmedName,
      price: priceNum,
      payload: { name: trimmedName, price: priceNum },
      synced_at: null,
    };
    await StorageService.enqueue<ProductRecord>('products', record);
    setName('');
    setPrice('');
    await loadPending();
    // Best-effort sync; fails silently offline and retries on reconnect.
    SyncService.processQueue('products').catch((e) =>
      console.error('ProductEditScreen sync failed', e),
    );
  };

  const handleDelete = async (id: string) => {
    const remaining = pending.filter((r) => r.id !== id);
    await StorageService.replaceQueue<ProductRecord>('products', remaining);
    setPending(remaining);
  };

  return (
    <ScrollView className="flex-1 bg-mist">
      <BrandHeader title="Product Editor" subtitle="Create / edit products offline" />
      <View className="p-5">
        <Text className="text-sm font-semibold text-ink">Product name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Arduino UNO"
          className="mt-1 rounded-lg border border-line bg-surface px-4 py-3"
        />
        <Text className="mt-4 text-sm font-semibold text-ink">Price (NPR)</Text>
        <TextInput
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          placeholder="0.00"
          className="mt-1 rounded-lg border border-line bg-surface px-4 py-3"
        />
        <Pressable
          onPress={handleSave}
          className="mt-6 items-center rounded-lg bg-navy px-5 py-3"
        >
          <Text className="font-bold text-white">Save Product</Text>
        </Pressable>

        {pending.length > 0 && (
          <View className="mt-8">
            <Text className="text-lg font-bold text-ink">
              Pending edits ({pending.length}) — syncs when online
            </Text>
            {pending.map((edit) => (
              <View
                key={edit.id}
                className="mt-3 rounded-lg border border-line bg-surface px-4 py-3"
              >
                <Text className="font-semibold text-navy">{edit.name}</Text>
                <Text className="text-sm text-muted">NPR {edit.price}</Text>
                <Pressable onPress={() => handleDelete(edit.id)} className="mt-2 self-start">
                  <Text className="text-sm font-semibold text-red-600">Delete</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}