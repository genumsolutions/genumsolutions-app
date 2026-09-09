// =====================================================================
// ProjectInfo — collapsible "About this project" card for the Control
// Panel (replaces the old "About this mode", owner request round 6).
// Shows the PROJECT behind the selected category, not the firmware mode:
//   • Robo Car → the active car build profile (name, car, wheels,
//     steering, sensors, transport, remote pairing) — the build you are
//     about to control.
//   • Other categories → the category's project profile from
//     project-catalog (hardware, capabilities, description).
// =====================================================================
import React, { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { CarMode } from '../../config/roboCarCatalog'
import type { ProjectCategory } from '../../config/project-catalog'
import { getProjectCategory } from '../../config/project-catalog'

const CAPABILITY_LABELS: Record<string, string> = {
  directional: 'Directional drive',
  servo: 'Servo steering',
  pid: 'PID tuning',
  'start-stop': 'Run / Stop routines',
  relay: 'Relay outputs',
  sensor: 'Live sensors',
  weblink: 'Web dashboard link',
  slider: 'Sliders',
  gimbal: 'Gimbal pan/tilt',
  altitude: 'Altitude control',
}

export function ProjectInfo({ mode, categorySlug }: { mode: CarMode; categorySlug: string }) {
  const [expanded, setExpanded] = useState(true)
  const category = getProjectCategory(categorySlug)
  const isRobocar = categorySlug === 'robocar'

  return (
    <View className="rounded-2xl border border-line bg-card p-5 shadow-card">
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse project info' : 'Expand project info'}
        className="flex-row items-center justify-between"
      >
        <View className="flex-row items-center gap-2">
          <Feather name="package" size={14} color="#1e3a8a" />
          <Text className="text-xs font-black uppercase tracking-widest text-navy">About this project</Text>
        </View>
        <Feather name={expanded ? 'chevron-down' : 'chevron-up'} size={16} color="#64748b" />
      </Pressable>

      {expanded && isRobocar && (
        <View className="mt-4">
          <InfoRow label="Project" value={mode.name} strong />
          <InfoRow label="Build" value={mode.car} />
          <InfoRow label="Drive" value={mode.wheel} />
          <InfoRow label="Steering" value={mode.steering} />
          <InfoRow label="Sensors" value={mode.sensors.length ? mode.sensors.join(', ') : '—'} />
          <InfoRow label="Control link" value={mode.transport.join(', ')} />
          <InfoRow label="Pairs with" value={mode.remoteWith} />
          <Text className="mt-3 text-xs leading-5 text-muted">{mode.blurb}</Text>
        </View>
      )}

      {expanded && !isRobocar && category && (
        <View className="mt-4">
          <InfoRow label="Project" value={category.name} strong />
          <InfoRow label="Hardware" value={category.hardware.join(', ')} />
          <View className="flex-row items-start justify-between gap-3 border-b border-line py-2 last:border-b-0">
            <Text className="shrink-0 text-xs font-bold uppercase tracking-wide text-muted">Capabilities</Text>
            <View className="min-w-0 flex-1 flex-row flex-wrap justify-end gap-1.5">
              {category.capabilities.map((cap) => (
                <Text key={cap} className="rounded-full bg-mist px-2 py-0.5 text-[10px] font-bold text-navy">
                  {CAPABILITY_LABELS[cap] ?? cap}
                </Text>
              ))}
            </View>
          </View>
          <Text className="mt-3 text-xs leading-5 text-muted">{category.description}</Text>
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
      <Text numberOfLines={2} className={`min-w-0 flex-1 text-right text-xs text-ink ${mono ? 'font-mono' : ''} ${strong ? 'font-bold' : ''}`}>
        {value}
      </Text>
    </View>
  )
}
