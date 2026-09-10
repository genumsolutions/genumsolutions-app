// ModeChooser — car mode selector for the game remote: a compact anchored
// dropdown (the trigger is measured and the list opens just below it, capped
// so it always fits the window) plus a small cycle button that walks the
// firmware mode order like the physical remote's mode select.
import React, { useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, Text, View, Vibration, useWindowDimensions } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { LOCAL_CAR_MODES, MODE_NAMES, type CarMode } from '../../config/roboCarCatalog'
import type { ModeChooserProps } from './types'

export function ModeChooser({ activeMode, canControl, onSelect, onCycle, modes, highlighted = false, previewMode = null, locked = false }: ModeChooserProps) {
  const [open, setOpen] = useState(false)
  const { height } = useWindowDimensions()
  // Catalogue is passed in DB-first (carModeService); the bundled modes are
  // the offline fallback until the fetch resolves.
  const catalogue = modes && modes.length > 0 ? modes : LOCAL_CAR_MODES
  // NAV preview wins over the active mode (previewModeIndex parity): the
  // trigger shows the browsed-to mode before Select confirms it.
  const shown = previewMode ?? activeMode
  const shortName = MODE_NAMES[shown.token] ?? shown.name.split('·')[0].trim()
  const shortToken = shown.token

  // Trigger measured in window coords so the dropdown anchors right under it.
  const triggerRef = useRef<View | null>(null)
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const openDropdown = () => {
    if (open) { setOpen(false); return }
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w: Math.max(w, 236), h })
      setOpen(true)
    })
  }

  // Cap the list so it never overflows the window below the trigger.
  const listMaxHeight = anchor ? Math.max(120, Math.min(height - (anchor.y + anchor.h) - 20, height * 0.50)) : height * 0.50

  return (
    // R4-3: compact one-row control on the chrome row. The "Mode" label is
    // kept inline (approved look) and the trigger keeps its approved 180px
    // cap so long mode names never truncate.
    <View className="flex-row items-center gap-1.5">
      {/* Trigger: ESP-style INVERTED box while NAV-highlighted (u8g2 drawBox
          parity), showing the previewed mode while browsing. */}
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
      <Pressable
        onPress={() => { Vibration.vibrate(10); onCycle() }}
        disabled={!canControl || locked}
        accessibilityRole="button"
        accessibilityLabel="Cycle mode"
        className="h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 disabled:opacity-40"
      >
        <Feather name="rotate-ccw" size={15} color="#fff" />
      </Pressable>

      {open && (
        <Modal transparent visible animationType="fade" onRequestClose={() => setOpen(false)} pointerEvents="box-none">
          <View
            style={{
              position: 'absolute',
              left: anchor?.x ?? 16,
              top: (anchor?.y ?? 96) + (anchor?.h ?? 0) + 4,
              width: anchor?.w ?? 236,
            }}
          >
            <ScrollView
              className="rounded-xl border border-white/10 bg-slate-900 shadow-xl"
              contentContainerStyle={{ padding: 2 }}
              style={{ maxHeight: listMaxHeight }}
            >
              {catalogue.map((m: CarMode) => {
                const isActive = shown.id === m.id
                // Unavailable firmware modes (isModeAvailable parity):
                // preview in the list as COMING SOON.
                const coming = !['BT', 'AUTO', '2WD1M'].includes(m.token)
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => {
                      if (locked) return
                      Vibration.vibrate(10)
                      onSelect(m)
                      setOpen(false)
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
                        {m.token} · {coming ? 'coming soon' : m.transport.join(' / ')}
                      </Text>
                    </View>
                    {isActive && <Feather name="check" size={12} color="#fff" />}
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        </Modal>
      )}
    </View>
  )
}