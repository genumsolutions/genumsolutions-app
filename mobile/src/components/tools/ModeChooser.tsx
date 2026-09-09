// ModeChooser — car mode selector for the game remote: a compact anchored
// dropdown (the trigger is measured and the list opens just below it, capped
// so it always fits the window) plus a small cycle button that walks the
// firmware mode order like the physical remote's mode select.
import React, { useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, Text, View, Vibration, useWindowDimensions } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { LOCAL_CAR_MODES, MODE_NAMES, type CarMode } from '../../config/roboCarCatalog'
import type { ModeChooserProps } from './types'

export function ModeChooser({ activeMode, canControl, onSelect, onCycle, modes }: ModeChooserProps) {
  const [open, setOpen] = useState(false)
  const { height } = useWindowDimensions()
  // Catalogue is passed in DB-first (carModeService); the bundled modes are
  // the offline fallback until the fetch resolves.
  const catalogue = modes && modes.length > 0 ? modes : LOCAL_CAR_MODES
  const shortName = MODE_NAMES[activeMode.token] ?? activeMode.name.split('·')[0].trim()

  // Trigger measured in window coords so the dropdown anchors right under it.
  const triggerRef = useRef<View | null>(null)
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const openDropdown = () => {
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w: Math.max(w, 236), h })
      setOpen(true)
    })
  }

  // Cap the list so it never overflows the window below the trigger.
  const listMaxHeight = anchor ? Math.max(140, Math.min(height - (anchor.y + anchor.h) - 20, height * 0.42)) : height * 0.42

  return (
    // R4-3: single-line control (label removed) so it fits the one chrome
    // row of the remote — the mode name speaks for itself.
    <View className="flex-row items-center gap-1.5">
      <Pressable
        ref={triggerRef}
        onPress={openDropdown}
        accessibilityRole="button"
        accessibilityLabel="Choose car mode"
        className="min-w-0 max-w-[150px] flex-row items-center justify-between gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2"
      >
        <Text numberOfLines={1} className="min-w-0 flex-1 text-sm font-bold text-white">{shortName}</Text>
        <Feather name="chevron-down" size={15} color="#cbd5e1" />
      </Pressable>
      <Pressable
        onPress={() => { Vibration.vibrate(10); onCycle() }}
        disabled={!canControl}
        accessibilityRole="button"
        accessibilityLabel="Cycle mode"
        className="h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy disabled:opacity-40"
      >
        <Feather name="rotate-ccw" size={15} color="#fff" />
      </Pressable>

      {open && (
        <Modal transparent visible animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} accessibilityLabel="Close mode list" />
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
              contentContainerStyle={{ padding: 4 }}
              style={{ maxHeight: listMaxHeight }}
            >
              {catalogue.map((m: CarMode) => {
                const isActive = activeMode.id === m.id
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => { Vibration.vibrate(10); onSelect(m); setOpen(false) }}
                    accessibilityRole="button"
                    className={`mt-1 flex-row items-center justify-between rounded-lg px-3 py-2.5 ${isActive ? 'bg-navy' : 'border border-white/10 bg-white/5'}`}
                  >
                    <View className="min-w-0 flex-1 pr-2">
                      <Text className={`text-sm font-bold ${isActive ? 'text-white' : 'text-white'}`} numberOfLines={1}>
                        {MODE_NAMES[m.token] ?? m.name.split('·')[0].trim()}
                      </Text>
                      <Text className={`text-xs ${isActive ? 'text-white/70' : 'text-slate-400'}`} numberOfLines={1}>
                        {m.token} · {m.transport.join(' / ')}
                      </Text>
                    </View>
                    {isActive && <Feather name="check" size={16} color="#fff" />}
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