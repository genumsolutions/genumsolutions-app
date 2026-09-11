// =====================================================================
// BalanceControls — self-balancing (AUTO) deck for the per-package Car
// Remote.
//
// Shows the live tilt angle from the car's TEL;…ANGLE telemetry next to
// compact PID tuning (Kp/Ki/Kd/OUT), mirroring the ESP remote's AUTO
// dashboard. Step sizes match the firmware's significant bits:
//   Kp: fine=0.01, coarse=0.1   (2 dp)
//   Ki: fine=0.001, coarse=0.01 (3 dp)
//   Kd: fine=0.001, coarse=0.01 (3 dp)
//   OUT: fine=1, coarse=10      (integer)
//   OFF: fine=0.01, coarse=0.1  (2 dp) — lives in RemoteControlScreen Settings
//
// Compact mode (immersive remote):
// Inline label + [−] [value] [+]. Tapping value opens PidInputModal.
// =====================================================================
import React, { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { BalanceControlsProps } from './types'
import { PidInputModal } from './PidInputModal'

function pidStatus(angle: number | null): { label: string; dot: string; text: string } {
  if (angle == null) return { label: 'NO TEL', dot: 'bg-border', text: 'text-slate-500' }
  const a = Math.abs(angle)
  if (a < 2.5) return { label: 'BAL', dot: 'bg-emerald-500', text: 'text-emerald-600' }
  if (a < 10) return { label: 'ADJ', dot: 'bg-amber-500', text: 'text-amber-600' }
  return { label: 'TILT!', dot: 'bg-red-500', text: 'text-red-600' }
}

/** PID parameter definitions — range, step sizes, formatting.
 *  Fine step = 1 significant bit, coarse = 10× fine (one significant bit apart). */
export const PID_DEFS = {
  kp:  { min: 0,   max: 200, step: 0.01, bigStep: 0.1, decimals: 2, label: 'Kp' },
  ki:  { min: 0,   max: 50,  step: 0.001,bigStep: 0.01,decimals: 3, label: 'Ki' },
  kd:  { min: 0,   max: 50,  step: 0.001,bigStep: 0.01,decimals: 3, label: 'Kd' },
  out: { min: 0,   max: 255, step: 1,    bigStep: 10,  decimals: 0, label: 'OUT' },
  off: { min: -90, max: 90,  step: 0.01, bigStep: 0.1, decimals: 2, label: 'OFF' },
} as const

export type PidKey = keyof typeof PID_DEFS

/** Compact PID row: [label] [−] [value] [+] inline on one line. */
export function PidRow({
  pidKey, value, canControl, onPid, onOpenModal,
}: {
  pidKey: PidKey
  value: number
  canControl: boolean
  onPid: (key: PidKey, v: number) => void
  onOpenModal: (key: PidKey) => void
}) {
  const def = PID_DEFS[pidKey]
  const display = pidKey === 'off'
    ? `${value >= 0 ? '+' : ''}${value.toFixed(def.decimals)}`
    : value.toFixed(def.decimals)

  const adjust = (delta: number) => {
    const next = Math.round((value + delta) / def.step) * def.step
    const clamped = Math.max(def.min, Math.min(def.max, parseFloat(next.toFixed(def.decimals))))
    onPid(pidKey, clamped)
  }

  return (
    <View className="flex-row items-center gap-1.5">
      {/* Inline label */}
      <Text className="w-8 text-[10px] font-black uppercase tracking-wide text-slate-400">{def.label}</Text>

      {/* Coarse − */}
      <Pressable
        onPress={() => adjust(-def.bigStep)}
        disabled={!canControl}
        hitSlop={6}
        className="h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 active:bg-white/15 disabled:opacity-30"
      >
        <Feather name="minus" size={14} color="#94a3b8" />
      </Pressable>

      {/* Value field (tap to type) */}
      <Pressable
        onPress={() => onOpenModal(pidKey)}
        hitSlop={6}
        className="min-h-9 min-w-[52px] flex-1 items-center justify-center rounded-lg border border-white/10 bg-slate-800 px-2 py-1 active:bg-slate-700"
      >
        <Text className="text-center font-mono text-[13px] font-bold text-emerald-300">{display}</Text>
      </Pressable>

      {/* Coarse + */}
      <Pressable
        onPress={() => adjust(def.bigStep)}
        disabled={!canControl}
        hitSlop={6}
        className="h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 active:bg-white/15 disabled:opacity-30"
      >
        <Feather name="plus" size={14} color="#94a3b8" />
      </Pressable>
    </View>
  )
}

export function BalanceControls({
  canControl, angle, kp, ki, kd, out, off, onPid, onEnterMode, compact,
}: BalanceControlsProps) {
  const st = pidStatus(angle)
  const angleText = angle == null ? '—' : `${angle >= 0 ? '+' : ''}${angle.toFixed(1)}°`

  // Modal state
  const [modalKey, setModalKey] = useState<PidKey | null>(null)

  const values: Record<PidKey, number> = { kp, ki, kd, out, off }
  const modalDef = modalKey ? PID_DEFS[modalKey] : null

  return (
    <View className={`rounded-2xl border border-line bg-card shadow-card ${compact ? 'px-3 pt-3 pb-4' : 'mt-4 p-5'}`}>
      {/* Header + AUTO mode entry */}
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1">
          <Text className={`font-black uppercase tracking-widest text-navy ${compact ? 'text-[11px]' : 'text-xs'}`}>
            Self-balancing · PID
          </Text>
          {!compact && (
            <Text className="mt-1 text-[11px] leading-4 text-muted">
              MPU6050 + PID keeps the bot upright. Step sizes match firmware precision.
            </Text>
          )}
        </View>
        <Pressable
          onPress={onEnterMode}
          disabled={!canControl}
          className="shrink-0 items-center rounded-full bg-navy px-4 py-2 disabled:opacity-60"
        >
          <Text className="text-[11px] font-black text-white">Enter AUTO</Text>
        </Pressable>
      </View>

      {/* Compact telemetry bar: angle + status + OUT — single line */}
      <View className={`mt-2 flex-row items-center justify-between rounded-lg bg-slate-900 px-3 py-1.5 ${compact ? '' : 'mt-4'}`}>
        <View className="flex-row items-center gap-2">
          <Text className="font-mono text-[10px] font-bold text-slate-500">ANG</Text>
          <Text className="font-mono text-sm font-bold text-emerald-300">{angleText}</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className={`rounded-full ${st.dot} h-1.5 w-1.5`} />
          <Text className={`font-black text-[9px] ${st.text}`}>{st.label}</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Text className="font-mono text-[10px] font-bold text-slate-500">OUT</Text>
          <Text className="font-mono text-[11px] font-bold text-white">{out}</Text>
        </View>
      </View>

      {/* PID tuning — Kp/Ki/Kd/OUT rows */}
      <View className={`gap-2 ${compact ? 'mt-2' : 'mt-3'}`}>
        {(['kp', 'ki', 'kd', 'out'] as PidKey[]).map((k) => (
          <PidRow
            key={k}
            pidKey={k}
            value={values[k]}
            canControl={canControl}
            onPid={onPid}
            onOpenModal={setModalKey}
          />
        ))}
      </View>

      {!compact && (
        <View className="mt-3 flex-row items-start gap-2">
          <Feather name="activity" size={13} color="#1e3a8a" />
          <Text className="flex-1 text-[11px] leading-4 text-muted">
            Fine = 1 significant bit, coarse = 10× fine. Tap a value to type precisely.
          </Text>
        </View>
      )}

      {/* Direct-input modal */}
      {modalKey && modalDef && (
        <PidInputModal
          visible
          label={modalDef.label}
          value={values[modalKey]}
          min={modalDef.min}
          max={modalDef.max}
          step={modalDef.step}
          decimals={modalDef.decimals}
          onConfirm={(v) => { onPid(modalKey, v); setModalKey(null) }}
          onCancel={() => setModalKey(null)}
        />
      )}
    </View>
  )
}
