// =====================================================================
// ProductEditScreen - create/edit products offline.
//
// TODO (employee product edits):
//   - Form fields for product name, price, description, stock, category.
//   - Save locally via StorageService, then sync to Supabase "products"
//     table when online (SyncService).
// =====================================================================
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { BrandHeader } from '../components/BrandHeader';

export function ProductEditScreen() {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');

  const handleSave = async () => {
    // PLAYLACEHOLDER: StorageService.enqueue('products', { name, price })
    // eslint-disable-next-line no-console
    console.log('Product placeholder saved:', { name, price });
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
      </View>
    </ScrollView>
  );
}
