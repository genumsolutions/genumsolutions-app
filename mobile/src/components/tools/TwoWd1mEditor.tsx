// TwoWd1mEditor dedicated editor panel for 2WD1M mode
import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { TwoWd1mEditorProps } from './types'

function StepperBtn({ onPress, disabled, icon }: { onPress: () => void; disabled: boolean; icon: 'minus' | 'plus' }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" className="h-9 w-9 items-center justify-center rounded-full border border-line bg-surface shadow-sm disabled:opacity-40">
      <Feather name={icon} size={16} color="#1e3a8a" />
    </Pressable>
  )
}

export function TwoWd1mEditor({ canControl, speed, steerLimit, trim, servo, onAdjustSpeed, onAdjustSteerLimit, onAdjustTrim, editorFieldIndex, onEditorNav }: TwoWd1mEditorProps) {
  const fields = [
    { label: 'Speed', value: String(speed), unit: '', onUp: () => onAdjustSpeed(5), onDown: () => onAdjustSpeed(-5) },
    { label: 'Steer', value: '' + steerLimit, unit: '°', onUp: () => onAdjustSteerLimit(5), onDown: () => onAdjustSteerLimit(-5) },
    { label: 'Trim', value: trim > 0 ? '+' + trim : '' + trim, unit: '°', onUp: () => onAdjustTrim(1), onDown: () => onAdjustTrim(-1) },
  ]
  return (
    <View className="mt-4 rounded-2xl border border-line bg-card p-4 shadow-card">
      <Text className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">2WD1M Editor</Text>
      {fields.map((field, i) => (
        <View key={field.label} className={'flex-row items-center justify-between py-2' + (i < fields.length - 1 ? ' border-b border-line' : '')}>
          <View className="flex-row items-center gap-2">
            <Text className="text-xs font-bold uppercase tracking-wide text-muted">{field.label}</Text>
            {editorFieldIndex === i && <View className="h-2 w-2 rounded-full bg-blue-500" />}
          </View>
          <View className="flex-row items-center gap-2">
            <Text className="font-mono text-sm font-bold text-navy">{field.value}{field.unit}</Text>
            <View className="flex-row gap-1">
              <StepperBtn onPress={field.onDown} disabled={!canControl} icon="minus" />
              <StepperBtn onPress={field.onUp} disabled={!canControl} icon="plus" />
            </View>
          </View>
        </View>
      ))}
      <View className="mt-3 flex-row items-center justify-between border-t border-line pt-3">
        <Text className="text-xs font-bold uppercase tracking-wide text-muted">Servo</Text>
        <Text className="font-mono text-sm font-bold text-navy">{servo}°</Text>
      </View>
    </View>
  )
}
