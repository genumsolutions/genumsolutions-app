// =====================================================================
// OfflineAuditScreen - create/view audit logs offline.
//
// Flow:
//   - handleSave() builds a record with a client-generated id and queues
//     it via StorageService.enqueue('audits', ...). Nothing reaches
//     Supabase yet.
//   - SyncService.processQueue('audits') runs right after saving; it is a
//     no-op while offline and succeeds once NetInfo reports connectivity.
//   - The "Pending" list is a view of the local queue. Records disappear
//     from it only after a successful sync (they then live in Supabase).
// =====================================================================
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { BrandHeader } from '../components/BrandHeader';
import { StorageService } from '../services/StorageService';
import { SyncService } from '../services/SyncService';
import { newId } from '../utils/uuid';

type AuditRecord = {
  id: string;
  title: string;
  notes: string;
  status: 'draft';
  synced_at: string | null;
  created_at: string;
};

export function OfflineAuditScreen() {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState<AuditRecord[]>([]);

  const loadPending = useCallback(async () => {
    setPending(await StorageService.queryQueue<AuditRecord>('audits'));
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert('Missing field', 'Audit title is required.');
      return;
    }
    const record: AuditRecord = {
      id: newId(),
      title: trimmedTitle,
      notes: notes.trim(),
      status: 'draft',
      synced_at: null,
      created_at: new Date().toISOString(),
    };
    await StorageService.enqueue<AuditRecord>('audits', record);
    setTitle('');
    setNotes('');
    await loadPending();
    // Best-effort sync; fails silently offline and retries on reconnect.
    SyncService.processQueue('audits').catch((e) =>
      console.error('OfflineAuditScreen sync failed', e),
    );
  };

  const handleDelete = async (id: string) => {
    const remaining = pending.filter((r) => r.id !== id);
    await StorageService.replaceQueue<AuditRecord>('audits', remaining);
    setPending(remaining);
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

        {pending.length > 0 && (
          <View className="mt-8">
            <Text className="text-lg font-bold text-ink">
              Pending ({pending.length}) — syncs when online
            </Text>
            {pending.map((audit) => (
              <View
                key={audit.id}
                className="mt-3 rounded-lg border border-line bg-surface px-4 py-3"
              >
                <Text className="font-semibold text-navy">{audit.title}</Text>
                {audit.notes ? <Text className="text-sm text-muted">{audit.notes}</Text> : null}
                <Text className="mt-1 text-xs text-muted">
                  {new Date(audit.created_at).toLocaleString()}
                </Text>
                <Pressable onPress={() => handleDelete(audit.id)} className="mt-2 self-start">
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