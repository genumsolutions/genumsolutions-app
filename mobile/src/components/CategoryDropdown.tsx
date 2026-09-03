// =====================================================================
// CategoryDropdown - a reusable "finest dropdown" selector for the app.
// React Native has no native <select>, so this renders a pressable button
// that opens a bottom-sheet Modal list (following the AppMenu native-Modal
// pattern) and calls onChange when an option is picked. `allowCustom` adds a
// "type a new value" row so admins can introduce categories not yet in the
// list.
// =====================================================================
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

type Props = {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  allowCustom?: boolean;
  title?: string;
  buttonClassName?: string;
  label?: string;
};

export function CategoryDropdown({
  value,
  options,
  onChange,
  placeholder,
  allowCustom,
  title,
  buttonClassName,
  label,
}: Props) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const opts = Array.from(new Set(options.filter(Boolean)));

  return (
    <>
      {label ? (
        <Text className="mb-1 text-xs font-bold text-muted">{label}</Text>
      ) : null}
      <Pressable
        onPress={() => setOpen(true)}
        className={`flex-row items-center justify-between rounded-lg border border-line bg-card px-3 py-2 ${buttonClassName || ''}`}
      >
        <Text className={`min-w-0 flex-1 text-sm ${value ? 'text-ink' : 'text-muted'}`} numberOfLines={1}>
          {value || placeholder || 'Select…'}
        </Text>
        <Feather name="chevron-down" size={16} color="#64748b" style={{ marginLeft: 8 }} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)}>
          <Pressable
            className="mt-auto rounded-t-2xl border-t border-line bg-white pb-8"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between border-b border-line px-4 py-3">
              <Text className="font-display text-base font-bold text-ink">{title || 'Select'}</Text>
              <Pressable onPress={() => setOpen(false)} className="h-8 w-8 items-center justify-center rounded-full bg-mist" accessibilityLabel="Close selector">
                <Feather name="x" size={16} color="#1e3a8a" />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {opts.length === 0 && (
                <Text className="px-4 py-6 text-center text-sm text-muted">No options yet.</Text>
              )}
              {opts.map((o) => (
                <Pressable
                  key={o}
                  onPress={() => { onChange(o); setOpen(false); }}
                  className={`flex-row items-center justify-between px-4 py-3 ${o === value ? 'bg-mist' : ''}`}
                >
                  <Text className={`min-w-0 flex-1 text-sm ${o === value ? 'font-bold text-navy' : 'text-ink'}`} numberOfLines={1}>{o}</Text>
                  {o === value && <Feather name="check" size={16} color="#1e3a8a" />}
                </Pressable>
              ))}
            </ScrollView>
            {allowCustom ? (
              <View className="border-t border-line px-4 py-3">
                <Text className="mb-1 text-xs font-bold text-muted">Or type a new {(title || 'option').toLowerCase()}</Text>
                <View className="flex-row gap-2">
                  <TextInput
                    value={custom}
                    onChangeText={setCustom}
                    placeholder="New value…"
                    className="flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink"
                    onSubmitEditing={() => { if (custom.trim()) { onChange(custom.trim()); setCustom(''); setOpen(false); } }}
                  />
                  <Pressable
                    onPress={() => { if (custom.trim()) { onChange(custom.trim()); setCustom(''); setOpen(false); } }}
                    className="rounded-lg bg-navy px-4 py-2"
                  >
                    <Text className="text-xs font-black text-white">Add</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
