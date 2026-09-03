// =====================================================================
// ModeInfo — collapsible "About this mode" card. Mobile adaptation of the
// website's legend / mode-info side panel (RoboCarControl.tsx): shows
// name, token, car, wheel, steering, sensors, transport, remote-with and
// the mode blurb for the currently active car mode.
// =====================================================================
import React, { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { CarMode } from '../../config/roboCarCatalog'

export function ModeInfo({ mode }: { mode: CarMode }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <View className="rounded-2xl border border-line bg-card p-5 shadow-card">
      <Pressable onPress={() => setExpanded((v) => !v)} className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Feather name="info" size={14} color="#1e3a8a" />
          <Text className="text-xs font-black uppercase tracking-widest text-navy">About this mode</Text>
        </View>
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#64748b" />
      </Pressable>

      {expanded && (
        <View className="mt-4">
          <InfoRow label="Name" value={mode.name} strong />
          <InfoRow label="Token" value={mode.token} mono />
          <InfoRow label="Car" value={mode.car} />
          <InfoRow label="Wheel" value={mode.wheel} />
          <InfoRow label="Steering" value={mode.steering} />
          <InfoRow label="Sensors" value={mode.sensors.length ? mode.sensors.join(', ') : '—'} />
          <InfoRow label="Transport" value={mode.transport.join(', ')} />
          <InfoRow label="Remote with" value={mode.remoteWith} />
          <Text className="mt-3 text-xs leading-5 text-muted">{mode.blurb}</Text>
        </View>
      )}
    </View>
  )
}

function InfoRow({ label, value, mono, strong }: {
  label: string
  value: string
  mono?: boolean
  strong?: boolean
}) {
  return (
    <View className="flex-row items-start justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <Text className="shrink-0 text-xs font-bold uppercase tracking-wide text-muted">{label}</Text>
      <Text className={`min-w-0 flex-1 text-right text-xs text-ink ${mono ? 'font-mono' : ''} ${strong ? 'font-bold' : ''}`}>
        {value}
      </Text>
    </View>
  )
}