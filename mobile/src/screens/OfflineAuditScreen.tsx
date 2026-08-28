// =====================================================================
// OfflineAuditScreen - create/view audit logs offline.
//
// TODO:
//   - On submit, persist the audit via StorageService.enqueue() so it is
//     stored locally and synced to Supabase later when online (SyncService).
//   - List previously saved audits from AsyncStorage.
// =====================================================================
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { BrandHeader } from '../components/BrandHeader';

export function OfflineAuditScreen() {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');

  const handleSave = async () => {
    // PLAYLACEHOLDER: call StorageService.enqueue('audits', { title, notes })
    // then SyncService.syncQueued() when connectivity allows.
    // eslint-disable-next-line no-console
    console.log('Audit placeholder saved:', { title, notes });
  };

  return (
    <ScrollView className="flex-1 bg-mist">
      <BrandHeader title="Offline Audits" subtitle="Create an audit, sync later" />
      <View className="p-5">
        <Text className="text-sm font-semibold text-ink">Audit title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Warehouse inventory check"
          className="mt-1 rounded-lg border border-line bg-surface px-4 py-3"
        />
        <Text className="mt-4 text-sm font-semibold text-ink">Notes</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          placeholder="Observations..."
          className="mt-1 rounded-lg border border-line bg-surface px-4 py-3 text-left"
        />
        <Pressable
          onPress={handleSave}
          className="mt-6 items-center rounded-lg bg-accent px-5 py-3"
        >
          <Text className="font-bold text-white">Save Offline</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
