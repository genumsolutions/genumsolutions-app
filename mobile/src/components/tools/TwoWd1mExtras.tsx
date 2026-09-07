// =====================================================================
// TwoWd1mExtras — the ONLY extra controls the 2WD1M page carries:
//   1. max steering limit (0..90, −/+ steppers)
//   2. trim (−/+ steppers)
// Both values are remembered per device across restarts (ToolsScreen
// persists them via deviceMemory). Mirror the hand-held ESP remote.
// Emergency stop now lives in the drive deck (DriveControls.onEStop).
// =====================================================================
import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { TwoWd1mExtrasProps } from './types'

function StepperBtn({ onPress, disabled, icon }: {
  onPress: () => void
  disabled: boolean
  icon: 'minus' | 'plus'
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className="h-12 w-12 items-center justify-center rounded-full border border-line bg-surface shadow-sm disabled:opacity-40"
    >
      <Feather name={icon} size={20} color="#1e3a8a" />
    </Pressable>
  )
}

export function TwoWd1mExtras({
  canControl, steerLimit, trim,
  onAdjustSteerLimit, onAdjustTrim,
}: TwoWd1mExtrasProps) {
  return (
    <View className="mt-4 rounded-2xl border border-line bg-card p-5 shadow-card">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-bold uppercase tracking-wide text-muted">Max steering limit</Text>
        <Text className="font-mono text-sm font-bold text-navy">{steerLimit}°</Text>
      </View>
      <Text className="mt-1 text-[11px] leading-4 text-muted">
        Steering never goes past this angle. Small = narrow turns, 90 = full lock.
      </Text>
      <View className="mt-3 flex-row items-center justify-center gap-5">
        <StepperBtn onPress={() => onAdjustSteerLimit(-5)} disabled={!canControl} icon="minus" />
        <Text className="w-24 text-center font-mono text-3xl font-bold text-navy">{steerLimit}°</Text>
        <StepperBtn onPress={() => onAdjustSteerLimit(5)} disabled={!canControl} icon="plus" />
      </View>

      <View className="mt-5 flex-row items-center justify-between border-t border-line pt-4">
        <Text className="text-xs font-bold uppercase tracking-wide text-muted">Trim</Text>
        <Text className="font-mono text-sm font-bold text-navy">{trim > 0 ? `+${trim}` : trim}°</Text>
      </View>
      <Text className="mt-1 text-[11px] leading-4 text-muted">
        Steering offset to straighten the car when driving straight.
      </Text>
      <View className="mt-3 flex-row items-center justify-center gap-5">
        <StepperBtn onPress={() => onAdjustTrim(-1)} disabled={!canControl} icon="minus" />
        <Text className="w-24 text-center font-mono text-3xl font-bold text-navy">{trim > 0 ? `+${trim}` : trim}°</Text>
        <StepperBtn onPress={() => onAdjustTrim(1)} disabled={!canControl} icon="plus" />
      </View>
    </View>
  )
}