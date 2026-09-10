// ModeChooser — car mode selector: compact trigger + dropdown list.
// Mode order, names, and available/coming-soon status match the car
// firmware (ModeManager.h enum order, modeToString() names).
import React, { useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, Text, View, Vibration, useWindowDimensions } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { LOCAL_CAR_MODES, MODE_NAMES, type CarMode } from '../../config/roboCarCatalog'
import type { ModeChooserProps } from './types'

// Car firmware Mode enum order (ModeManager.h) with wire tokens.
// The dropdown list and cycle button both use this order.
const CAR_MODE_ORDER = [
  { token: 'BT', oled: '4WD4M', available: true },
  { token: 'ESP_SER', oled: 'SERVER', available: false },
  { token: 'ESP_CLI', oled: 'CLIENT', available: true },
  { token: 'PATH', oled: 'PATH', available: false },
  { token: 'OBS_US', oled: 'OBSTACLE(US)', available: false },
  { token: 'OBS_IR', oled: 'OBSTACLE(IR)', available: false },
  { token: 'MAN', oled: 'MANUAL', available: false },
  { token: '2WD1M', oled: '2WD1M', available: true },
  { token: 'AUTO', oled: 'AUTO', available: true },
]

function sortModesByCarOrder(modes: CarMode[]): CarMode[] {
  return [...modes].sort(
    (a, b) => CAR_MODE_ORDER.findIndex(c => c.token === a.token) - CAR_MODE_ORDER.findIndex(c => c.token === b.token)
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

  // Sorted list for display — matches car firmware cycle order.
  const sortedCatalogue = sortModesByCarOrder(catalogue)
  // Max height: cap so the list never overflows the screen.
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

      {/* Cycle button */}
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
                const meta = CAR_MODE_ORDER.find(c => c.token === m.token)
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
