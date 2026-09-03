// ModeChooser — car mode selector + cycle button.
import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { LOCAL_CAR_MODES } from '../../config/roboCarCatalog'
import type { ModeChooserProps } from './types'

export function ModeChooser({ activeMode, canControl, onSelect, onCycle, modes }: ModeChooserProps) {
  // Catalogue is passed in DB-first (carModeService); the bundled modes are
  // the offline fallback until the fetch resolves.
  const catalogue = modes && modes.length > 0 ? modes : LOCAL_CAR_MODES
  return (
    <View className="rounded-2xl border border-line bg-card p-5 shadow-card">
      <Text className="text-xs font-bold uppercase tracking-wide text-muted">Mode</Text>
      <View className="mt-2 flex-row flex-wrap gap-2">
        {catalogue.map((m) => {
          const isActive = activeMode.id === m.id
          return (
            <Pressable
              key={m.id}
              onPress={() => onSelect(m)}
              disabled={!canControl}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                isActive ? 'bg-navy text-white' : 'border border-line bg-surface text-muted'
              } ${!canControl ? 'opacity-40' : ''}`}
            >
              {m.name.split('·')[0].trim()}
            </Pressable>
          )
        })}
        <Pressable
          onPress={onCycle}
          disabled={!canControl}
          className="flex-row items-center gap-1 rounded-full bg-navy px-4 py-1.5 disabled:opacity-40"
        >
          <Feather name="rotate-ccw" size={12} color="#fff" />
          <Text className="text-xs font-black text-white">Mode</Text>
        </Pressable>
      </View>
    </View>
  )
}
