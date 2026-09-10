// ModeChooser — car mode selector matching the ESP32 remote's mode UI.
// Mode order, names, and available status match the remote firmware
// (state.cpp MODE_CMDS[] / MODE_NAMES[], ui_core.cpp isModeAvailable()).
import React, { useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, Text, View, Vibration, useWindowDimensions } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { LOCAL_CAR_MODES, MODE_NAMES, type CarMode } from '../../config/roboCarCatalog'
import type { ModeChooserProps } from './types'

// ESP32 remote mode order (state.cpp MODE_CMDS[] / MODE_NAMES[]).
// Scroll order, display names, and available status match the remote.
const REMOTE_MODES = [
  { token: 'BT', available: true },
  { token: 'ESP_SER', available: false },
  { token: 'PATH', available: false },
  { token: 'OBS_US', available: false },
  { token: 'OBS_IR', available: false },
  { token: 'MAN', available: false },
  { token: 'AUTO', available: true },
  { token: 'ESP_CLI', available: false },
  { token: '2WD1M', available: true },
]

function sortModesByRemoteOrder(modes: CarMode[]): CarMode[] {
  return [...modes].sort(
    (a, b) => REMOTE_MODES.findIndex(r => r.token === a.token) - REMOTE_MODES.findIndex(r => r.token === b.token)
  )
}

export function ModeChooser({ activeMode, canControl, onSelect, onCycle, modes, highlighted = false, previewMode = null, locked = false }: ModeChooserProps) {
  const [open, setOpen] = useState(false)
  const { height } = useWindowDimensions()
  const catalogue = modes && modes.length > 0 ? modes : LOCAL_CAR_MODES
  const shown = previewMode ?? activeMode
  const shortName = MODE_NAMES[shown.token] ?? shown.name.split('·')[0].trim()
  const shortToken = shown.token

  const triggerRef = useRef<View | null>(null)
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const openDropdown = () => {
    if (open) { setOpen(false); return }
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w: Math.max(w, 236), h })
      setOpen(true)
    })
  }

  const closeDropdown = () => setOpen(false)

  const sortedCatalogue = sortModesByRemoteOrder(catalogue)
  const listMaxHeight = anchor
    ? Math.max(120, Math.min(height - (anchor.y + anchor.h) - 20, height * 0.55))
    : height * 0.55

  return (
    <View className="flex-row items-center gap-1.5">
      {/* Trigger button */}
      <Pressable
        ref={triggerRef}
        onPress={openDropdown}
        disabled={locked}
        accessibilityRole="button"
        accessibilityLabel="Choose car mode"
        className={`min-w-0 max-w-[220px] flex-row items-center justify-between gap-1.5 rounded-xl px-3 py-2 ${
          highlighted ? 'bg-slate-200' : 'border border-white/15 bg-white/5'
        }`}
      >
        <Text
          numberOfLines={1}
          className={`min-w-0 flex-1 text-sm font-bold ${highlighted ? 'text-slate-900' : 'text-white'}`}
        >
          {shortName}
        </Text>
        <Text
          numberOfLines={1}
          className={`text-[10px] font-mono ${highlighted ? 'text-slate-600' : 'text-slate-400'}`}
        >
          {shortToken}
        </Text>
        <Feather name="chevron-down" size={15} color={highlighted ? '#334155' : '#cbd5e1'} />
      </Pressable>

      {/* Cycle button — walks the remote's mode order like the physical remote */}
      <Pressable
        onPress={() => { Vibration.vibrate(10); onCycle() }}
        disabled={!canControl || locked}
        accessibilityRole="button"
        accessibilityLabel="Cycle mode"
        className="h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 disabled:opacity-40"
      >
        <Feather name="rotate-ccw" size={15} color="#fff" />
      </Pressable>

      {/* Dropdown — Modal with flex:1 root so the overlay covers the screen */}
      <Modal transparent visible={open} animationType="fade" onRequestClose={closeDropdown}>
        <View style={{ flex: 1 }}>
          {/* Tap-away overlay */}
          <Pressable style={{ flex: 1 }} onPress={closeDropdown} />
          {/* Dropdown list anchored below the trigger */}
          <View
            style={{
              position: 'absolute',
              left: anchor?.x ?? 16,
              top: (anchor?.y ?? 96) + (anchor?.h ?? 0) + 8,
              width: anchor?.w ?? 236,
            }}
          >
            <ScrollView
              className="rounded-xl border border-white/10 bg-slate-900 shadow-xl"
              contentContainerStyle={{ padding: 2 }}
              style={{ maxHeight: listMaxHeight }}
            >
              {sortedCatalogue.map((m: CarMode) => {
                const isActive = shown.id === m.id
                const meta = REMOTE_MODES.find(r => r.token === m.token)
                const coming = meta ? !meta.available : true
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => {
                      if (locked) return
                      Vibration.vibrate(10)
                      onSelect(m)
                      closeDropdown()
                    }}
                    disabled={locked}
                    accessibilityRole="button"
                    className={`mt-0.5 flex-row items-center justify-between rounded-lg px-2 py-1 ${isActive ? 'bg-navy' : 'border border-white/10 bg-white/5'}`}
                  >
                    <View className="min-w-0 flex-1 pr-1.5">
                      <Text className={`text-[11px] font-bold ${isActive ? 'text-white' : 'text-slate-300'}`} numberOfLines={1}>
                        {MODE_NAMES[m.token] ?? m.name.split('·')[0].trim()}
                      </Text>
                      <Text className={`text-[9px] ${isActive ? 'text-white/70' : 'text-slate-400'}`} numberOfLines={1}>
                        {m.token}{coming ? ' · coming soon' : ` · ${m.transport.join(' / ')}`}
                      </Text>
                    </View>
                    {isActive && <Feather name="check" size={12} color="#fff" />}
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
