// =====================================================================
// PidInputModal — numeric input overlay for direct PID value entry.
//
// Tapping a PID value row opens this modal with a TextInput pre-filled
// with the current value. The user can type a new value and confirm.
// Uses React Native Modal to render in its own layer (no overlap).
// =====================================================================
import React, { useEffect, useRef, useState } from 'react'
import { Keyboard, Modal, Pressable, Text, TextInput, View } from 'react-native'

type Props = {
  visible: boolean
  label: string
  value: number
  min: number
  max: number
  step: number
  decimals: number
  onConfirm: (v: number) => void
  onCancel: () => void
}

export function PidInputModal({ visible, label, value, min, max, step, decimals, onConfirm, onCancel }: Props) {
  const [text, setText] = useState(value.toFixed(decimals))
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<TextInput>(null)

  useEffect(() => {
    if (visible) {
      setText(value.toFixed(decimals))
      setError(null)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [visible, value, decimals])

  const handleConfirm = () => {
    const num = parseFloat(text)
    if (isNaN(num)) {
      setError('Enter a number')
      return
    }
    const snapped = Math.round(num / step) * step
    const clamped = Math.max(min, Math.min(max, snapped))
    if (Math.abs(clamped - num) > step / 2) {
      setError(`Snapped to ${clamped.toFixed(decimals)}`)
    }
    Keyboard.dismiss()
    onConfirm(parseFloat(clamped.toFixed(decimals)))
  }

  const handleQuickSet = (v: number) => {
    setText(v.toFixed(decimals))
    setError(null)
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        className="flex-1 items-center justify-center bg-black/60"
        onPress={onCancel}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="w-80 rounded-2xl border border-white/15 bg-slate-900 p-5 shadow-xl"
        >
          <Text className="text-center text-sm font-black uppercase tracking-wide text-white">
            Set {label}
          </Text>
          <Text className="mt-1 text-center text-[10px] text-slate-500">
            {min} — {max} · step {step}
          </Text>

          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={(t) => { setText(t); setError(null) }}
            keyboardType="decimal-pad"
            selectTextOnFocus
            className="mt-3 rounded-lg border border-white/15 bg-slate-800 px-3 py-3 text-center font-mono text-lg font-bold text-white"
            placeholderTextColor="#64748b"
            placeholder={value.toFixed(decimals)}
          />

          {error && (
            <Text className="mt-1.5 text-center text-[11px] text-amber-400">{error}</Text>
          )}

          {/* Quick-set chips for common values */}
          <View className="mt-3 flex-row flex-wrap justify-center gap-1.5">
            {[min, step * 10, step * 20, step * 50].filter((v) => v <= max && v >= min).map((v) => (
              <Pressable
                key={v}
                onPress={() => handleQuickSet(v)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5"
              >
                <Text className="font-mono text-[11px] text-slate-300">{v.toFixed(decimals)}</Text>
              </Pressable>
            ))}
          </View>

          <View className="mt-4 flex-row justify-center gap-3">
            <Pressable
              onPress={onCancel}
              className="rounded-full border border-white/15 bg-white/5 px-6 py-2.5"
            >
              <Text className="text-xs font-bold text-white">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleConfirm}
              className="rounded-full bg-navy px-6 py-2.5"
            >
              <Text className="text-xs font-black text-white">Set</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
