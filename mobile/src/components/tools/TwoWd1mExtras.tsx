// =====================================================================
// TwoWd1mExtras — ESP-remote extras for the 2WD1M (servo-steer) pairing:
// steer-limit, trim, and emergency stop. Shared by the per-package Car
// Remote and the Tools hub so the two screens cannot drift apart.
//
// Mirrors the hand-held ESP remote (Genum_ESP32_Remote_v1.0.0): the
// steer limit is a client-side clamp on the right-stick SERVO angle
// (±limit around center 90, default 90 = full lock-to-lock); trim sends
// TRIM<offset> (persisted on the car); e-stop sends ESTOP + SPD0.
// =====================================================================
import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { TwoWd1mExtrasProps } from './types'

export function TwoWd1mExtras({
  canControl, steerLimit, trim,
  onAdjustSteerLimit, onAdjustTrim, onEStop,
}: TwoWd1mExtrasProps) {
  return (
    <View className="mt-4 rounded-2xl border border-line bg-card p-5 shadow-card">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-bold uppercase tracking-wide text-muted">Steer limit</Text>
        <Text className="font-mono text-sm font-bold text-navy">{steerLimit}°</Text>
      </View>
      <Text className="mt-1 text-[11px] leading-4 text-muted">
        Max servo angle from center 90. Like the ESP remote: set it small for narrow steering,
        keep 90 for full lock-to-lock. Right joystick never exceeds this.
      </Text>
      <View className="mt-3 flex-row gap-2">
        <Pressable onPress={() => onAdjustSteerLimit(-5)} disabled={!canControl} className="flex-1 rounded-full border border-line px-4 py-2 disabled:opacity-60">
          <Text className="text-center text-xs font-black text-navy">−5°</Text>
        </Pressable>
        <Pressable onPress={() => onAdjustSteerLimit(5)} disabled={!canControl} className="flex-1 rounded-full border border-line px-4 py-2 disabled:opacity-60">
          <Text className="text-center text-xs font-black text-navy">+5°</Text>
        </Pressable>
      </View>

      <View className="mt-4 flex-row items-center justify-between border-t border-line pt-4">
        <Text className="text-xs font-bold uppercase tracking-wide text-muted">Trim</Text>
        <Text className="font-mono text-sm font-bold text-navy">{trim > 0 ? `+${trim}` : trim}°</Text>
      </View>
      <View className="mt-3 flex-row gap-2">
        <Pressable onPress={() => onAdjustTrim(-1)} disabled={!canControl} className="flex-1 rounded-full border border-line px-4 py-2 disabled:opacity-60">
          <Text className="text-center text-xs font-black text-navy">Trim −1</Text>
        </Pressable>
        <Pressable onPress={() => onAdjustTrim(1)} disabled={!canControl} className="flex-1 rounded-full border border-line px-4 py-2 disabled:opacity-60">
          <Text className="text-center text-xs font-black text-navy">Trim +1</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={onEStop}
        disabled={!canControl}
        className="mt-4 flex-row items-center justify-center gap-2 rounded-full bg-red-600 px-6 py-3 disabled:opacity-60"
      >
        <Feather name="octagon" size={14} color="#fff" />
        <Text className="text-sm font-black text-white">Emergency stop</Text>
      </Pressable>
    </View>
  )
}
