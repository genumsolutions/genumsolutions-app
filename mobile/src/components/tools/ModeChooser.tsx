// ModeChooser — car mode selector: a compact dropdown (current mode summary
// expands into the full mode picker) plus a cycle toggle button that walks
// the firmware mode order like the physical remote's mode select.
import React, { useState } from 'react'
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { LOCAL_CAR_MODES, MODE_NAMES, type CarMode } from '../../config/roboCarCatalog'
import type { ModeChooserProps } from './types'

export function ModeChooser({ activeMode, canControl, onSelect, onCycle, modes }: ModeChooserProps) {
  const [open, setOpen] = useState(false)
  const { width, height } = useWindowDimensions()
  const isLandscape = width > height
  // Catalogue is passed in DB-first (carModeService); the bundled modes are
  // the offline fallback until the fetch resolves.
  const catalogue = modes && modes.length > 0 ? modes : LOCAL_CAR_MODES
  const shortName = MODE_NAMES[activeMode.token] ?? activeMode.name.split('·')[0].trim()

  return (
    <View className="rounded-2xl border border-line bg-card p-5 shadow-card">
      <Text className="text-xs font-bold uppercase tracking-wide text-muted">Mode</Text>
      <View className="mt-2 flex-row items-center gap-2">
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          className="min-w-0 flex-1 flex-row items-center justify-between rounded-xl border border-line bg-surface px-4 py-3"
        >
          <Text className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{shortName}</Text>
          <Feather name="chevron-down" size={18} color="#64748b" />
        </Pressable>
        <Pressable
          onPress={onCycle}
          disabled={!canControl}
          accessibilityRole="button"
          className="flex-row items-center gap-1.5 rounded-xl bg-navy px-4 py-3 disabled:opacity-40"
        >
          <Feather name="rotate-ccw" size={16} color="#fff" />
          <Text className="text-sm font-black text-white">Cycle</Text>
        </Pressable>
      </View>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <Pressable className="absolute inset-0" onPress={() => setOpen(false)} />
          <View className="rounded-t-3xl bg-card px-5 pb-6 pt-5 shadow-card">
            <Text className="text-[11px] font-black uppercase tracking-[0.2em] text-navy">
              Select a mode
            </Text>
            <ScrollView className={`mt-2 ${isLandscape ? 'max-h-[40vh]' : 'max-h-[60vh]'}`}>
              {catalogue.map((m: CarMode) => {
                const isActive = activeMode.id === m.id
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => { onSelect(m); setOpen(false) }}
                    accessibilityRole="button"
                    className={`mt-1 flex-row items-center justify-between rounded-xl px-4 py-3 ${isActive ? 'bg-navy' : 'border border-line bg-surface'}`}
                  >
                    <View className="min-w-0 flex-1 pr-2">
                      <Text className={`text-sm font-bold ${isActive ? 'text-white' : 'text-ink'}`}>
                        {MODE_NAMES[m.token] ?? m.name.split('·')[0].trim()}
                      </Text>
                      <Text className={`text-[11px] ${isActive ? 'text-white/70' : 'text-muted'}`} numberOfLines={1}>
                        {m.token} · {m.transport.join(' / ')}
                      </Text>
                    </View>
                    {isActive && <Feather name="check" size={16} color="#fff" />}
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}