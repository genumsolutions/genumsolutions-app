// =====================================================================
// ProjectInfo — collapsible "About this project" card for the Control
// Panel (replaces the old "About this mode", owner request round 6).
// Shows the PROJECT behind the selected category, not the firmware mode:
//   • Robo Car → 9-mode horizontal tab strip from LOCAL_CAR_MODES with
//     per-mode build profiles. Active tab = the currently connected mode.
//     "Coming Soon" badge on modes not yet available on the physical remote.
//   • Other categories → the category's project profile from
//     project-catalog (hardware, capabilities, description).
// =====================================================================
import React, { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { CarMode } from '../../config/roboCarCatalog'
import { LOCAL_CAR_MODES } from '../../config/roboCarCatalog'
import type { ProjectCategory } from '../../config/project-catalog'
import { getProjectCategory } from '../../config/project-catalog'
import { company } from '../../config/company'

// Folder-derived human project names for the shipped fleet cars (DEVICE-ROUND-3 §2.7).
// Tokens map 1:N — multiple modes share the same physical car.
const CAR_PROJECT_NAME: Record<string, string> = {
  '4WD4M':  'Wireless Car',
  'ESP_SER':'Wireless Car',
  'ESP_CLI':'Wireless Car',
  '2WD1M':  '2WD1M Car',
  'AUTO':   'Self Balance Car',
}

// Tokens the physical ESP32 remote + GENUM fleet drive today. All 9 firmware
// modes are SELECTABLE in the 2026-09-15 fleet; the only default "coming
// soon" mark is MAN (RF-manual — needs the RF handset, which no car carries).
// X-8: `4WD4M` is the canonical drive token (legacy `BT` retired).
const AVAILABLE_TOKENS = new Set(['4WD4M', 'ESP_SER', 'PATH', 'OBS_US', 'OBS_IR', 'AUTO', 'ESP_CLI', '2WD1M'])

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
  const [expanded, setExpanded] = useState(false)
  const category = getProjectCategory(categorySlug)
  const isRobocar = categorySlug === 'robocar'

  // For robocar: 9-mode tab strip with the active mode pre-selected
  const [selectedModeId, setSelectedModeId] = useState(mode.id)
  const selectedMode = LOCAL_CAR_MODES.find((m) => m.id === selectedModeId) ?? mode

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
          {/* 9-mode horizontal tab strip */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingRight: 8 }}
          >
            {LOCAL_CAR_MODES.map((m) => {
              const isActive = m.id === selectedModeId
              const isAvailable = AVAILABLE_TOKENS.has(m.token)
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setSelectedModeId(m.id)}
                  className={`flex-shrink-0 flex-row items-center gap-1 rounded-full border px-3 py-1.5 ${
                    isActive
                      ? 'border-navy bg-navy'
                      : 'border-line bg-white'
                  }`}
                  accessibilityRole="button"
                  accessibilityLabel={`${m.name}${!isAvailable ? ' (Coming Soon)' : ''}`}
                >
                  <Text className={`text-[11px] font-bold ${isActive ? 'text-white' : 'text-ink'}`}>
                    {m.token}
                  </Text>
                  {!isAvailable && (
                    <View className="rounded-full bg-amber-100 px-1.5 py-0.5">
                      <Text className="text-[8px] font-black uppercase text-amber-700">Coming soon</Text>
                    </View>
                  )}
                </Pressable>
              )
            })}
          </ScrollView>

          {/* Selected mode detail card */}
          <View className="mt-4 rounded-xl border border-line bg-surface p-4">
            <InfoRow label="Project" value={selectedMode.name} strong />
            {CAR_PROJECT_NAME[selectedMode.token] && (
              <InfoRow label="Car" value={CAR_PROJECT_NAME[selectedMode.token]} />
            )}
            <InfoRow label="Build" value={selectedMode.car} />
            <InfoRow label="Drive" value={selectedMode.wheel} />
            <InfoRow label="Steering" value={selectedMode.steering} />
            <InfoRow label="Sensors" value={selectedMode.sensors.length ? selectedMode.sensors.join(', ') : '—'} />
            <InfoRow label="Control link" value={selectedMode.transport.join(', ')} />
            <InfoRow label="Pairs with" value={selectedMode.remoteWith} />
            <Text className="mt-3 text-xs leading-5 text-muted">{selectedMode.blurb}</Text>
            {!AVAILABLE_TOKENS.has(selectedMode.token) && (
              <View className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                <Text className="text-[11px] font-bold text-amber-700">
                  {selectedMode.token === 'MAN'
                    ? 'RF-manual needs the RF handset (not bundled with any GENUM car). Selectable from the remote — the handset makes it drive.'
                    : 'Not yet available on this car. Selectable from the remote — the car shows its own COMING SOON frame.'}
                </Text>
              </View>
            )}
            <Text className="mt-3 text-[9px] text-muted">Asset of {company.name}</Text>
          </View>
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
          <Text className="mt-3 text-[9px] text-muted">Asset of {company.name}</Text>
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
