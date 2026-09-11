// =====================================================================
// BalanceControls — self-balancing (AUTO) deck for the per-package Car
// Remote.
//
// Compact layout (immersive remote):
//   Left:  [ANGLE +12.3° / ●BAL / OUT:50]   (single hero card)
//   Right: [OLED 160×80]
//   Grid:  Kp/Ki/Kd/OFF with fine + coarse ± buttons
//
// Step sizes match the firmware's significant bits.
// OUT is display-only (computed by firmware, not user-adjustable).
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

/** PID row with fine + coarse ± buttons: [label] [−−] [−] [value] [+] [++] */
function PidRow({
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
    <View className="flex-[1_1_45%] flex-row items-center gap-0.5 rounded-lg border border-white/10 bg-white/5 px-1.5 py-1">
      {/* Label */}
      <Text className="w-7 text-[9px] font-black uppercase text-slate-400">{def.label}</Text>

      {/* Coarse − */}
      <Pressable
        onPress={() => adjust(-def.bigStep)}
        disabled={!canControl}
        hitSlop={4}
        className="h-7 w-7 items-center justify-center rounded-md bg-white/5 active:bg-white/15 disabled:opacity-30"
      >
        <Feather name="minus" size={12} color="#64748b" />
      </Pressable>

      {/* Fine − */}
      <Pressable
        onPress={() => adjust(-def.step)}
        disabled={!canControl}
        hitSlop={4}
        className="h-6 w-6 items-center justify-center rounded-md active:bg-white/15 disabled:opacity-30"
      >
        <Feather name="minus" size={11} color="#94a3b8" />
      </Pressable>

      {/* Value (tap to type) */}
      <Pressable
        onPress={() => onOpenModal(pidKey)}
        hitSlop={4}
        className="min-h-7 min-w-[40px] flex-1 items-center justify-center rounded-md border border-white/10 bg-slate-800 px-1 py-0.5 active:bg-slate-700"
      >
        <Text className="font-mono text-[11px] font-bold text-emerald-300">{display}</Text>
      </Pressable>

      {/* Fine + */}
      <Pressable
        onPress={() => adjust(def.step)}
        disabled={!canControl}
        hitSlop={4}
        className="h-6 w-6 items-center justify-center rounded-md active:bg-white/15 disabled:opacity-30"
      >
        <Feather name="plus" size={11} color="#94a3b8" />
      </Pressable>

      {/* Coarse + */}
      <Pressable
        onPress={() => adjust(def.bigStep)}
        disabled={!canControl}
        hitSlop={4}
        className="h-7 w-7 items-center justify-center rounded-md bg-white/5 active:bg-white/15 disabled:opacity-30"
      >
        <Feather name="plus" size={12} color="#64748b" />
      </Pressable>
    </View>
  )
}

export function BalanceControls({
  canControl, angle, kp, ki, kd, out, off, onPid, compact, oledSlot,
}: BalanceControlsProps) {
  const st = pidStatus(angle)
  const angleText = angle == null ? '—' : `${angle >= 0 ? '+' : ''}${angle.toFixed(1)}°`

  // Modal state
  const [modalKey, setModalKey] = useState<PidKey | null>(null)

  const values: Record<PidKey, number> = { kp, ki, kd, out, off }
  const modalDef = modalKey ? PID_DEFS[modalKey] : null

  return (
    <View className={`rounded-2xl border border-line bg-card shadow-card ${compact ? 'px-2 pt-2 pb-3' : 'mt-4 p-5'}`}>
      {/* ── Top section: angle/OUT cards + OLED ── */}
      <View className="flex-row gap-2">
        {/* Left: angle + OUT single hero card */}
        <View className="flex-1 rounded-xl bg-slate-900 px-4 py-3">
          <Text className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Angle</Text>
          <Text className="mt-1 font-mono text-[42px] font-black leading-none text-emerald-300">{angleText}</Text>
          <View className="mt-2 flex-row items-center gap-1.5">
            <View className={`rounded-full ${st.dot} h-2 w-2`} />
            <Text className={`text-[11px] font-black ${st.text}`}>{st.label}</Text>
          </View>
          <View className="mt-2 border-t border-white/10 pt-2">
            <Text className="text-[9px] font-bold uppercase tracking-wide text-slate-500">OUT : {out}</Text>
          </View>
        </View>

        {/* Right: OLED slot */}
        {oledSlot && (
          <View className="shrink-0">{oledSlot}</View>
        )}
      </View>

      {/* ── PID grid: 2 columns, fine + coarse ── */}
      <View className="mt-2 flex-row flex-wrap gap-1.5">
        <PidRow pidKey="kp" value={kp} canControl={canControl} onPid={onPid} onOpenModal={setModalKey} />
        <PidRow pidKey="ki" value={ki} canControl={canControl} onPid={onPid} onOpenModal={setModalKey} />
        <PidRow pidKey="kd" value={kd} canControl={canControl} onPid={onPid} onOpenModal={setModalKey} />
        <PidRow pidKey="off" value={off} canControl={canControl} onPid={onPid} onOpenModal={setModalKey} />
      </View>

      {/* ── Direct-input modal ── */}
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
