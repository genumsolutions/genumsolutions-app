// =====================================================================
// BalanceControls — self-balancing (AUTO) deck for the per-package Car
// Remote.
//
// Shows the live tilt angle from the car's TEL;…ANGLE telemetry next to
// PID tuning (Kp/Ki/Kd), mirroring the ESP remote's AUTO dashboard.
// OUT is shown alongside the angle readout; OFF is in a compact settings
// row below the angle card. Each value change goes through onPid ->
// the screen's applyPid, which sends the same `CFG;Kp:..;Ki:..;Kd:..;
// OUT:..;OFF:..` line the remote sends when calibration is saved.
//
// COMPACT MODE (immersive / control panel):
// Value field with fine/coarse +/- buttons on each side.
// Tapping the value opens a direct-input modal for precise entry.
// No sliders — just buttons and typed values for precise PID tuning.
// Step sizes match the ESP32 remote firmware:
//   Kp: fine=0.01, coarse=0.1
//   Ki: fine=0.001, coarse=0.01
//   Kd: fine=0.001, coarse=0.01
// =====================================================================
import React, { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import Slider from '@react-native-community/slider'
import type { BalanceControlsProps } from './types'
import { PidInputModal } from './PidInputModal'

function pidStatus(angle: number | null): { label: string; dot: string; text: string } {
  if (angle == null) return { label: 'NO TELEMETRY', dot: 'bg-border', text: 'text-slate-500' }
  const a = Math.abs(angle)
  if (a < 2.5) return { label: 'BALANCING', dot: 'bg-emerald-500', text: 'text-emerald-600' }
  if (a < 10) return { label: 'CORRECTING', dot: 'bg-amber-500', text: 'text-amber-600' }
  return { label: 'TILT!', dot: 'bg-red-500', text: 'text-red-600' }
}

/** PID parameter definitions — range, step sizes, formatting.
 *  Step sizes match ESP32 remote firmware (ui_core.cpp). */
const PID_DEFS = {
  kp:  { min: 0,   max: 200, step: 0.01, bigStep: 0.1, decimals: 2, label: 'Kp' },
  ki:  { min: 0,   max: 50,  step: 0.001, bigStep: 0.01, decimals: 3, label: 'Ki' },
  kd:  { min: 0,   max: 50,  step: 0.001, bigStep: 0.01, decimals: 3, label: 'Kd' },
  out: { min: 0,   max: 255, step: 1,    bigStep: 10,  decimals: 0, label: 'OUT' },
  off: { min: -90, max: 90,  step: 0.01, bigStep: 0.1, decimals: 2, label: 'OFF' },
} as const

type PidKey = keyof typeof PID_DEFS

/** Compact PID row: label on top, then [−fine] [−coarse] [value] [+coarse] [+fine]. */
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
    <View className="gap-1">
      {/* Label */}
      <Text className="ml-1 text-[10px] font-black uppercase tracking-wide text-navy">{def.label}</Text>

      {/* Buttons row: [−fine] [−coarse] [value] [+coarse] [+fine] */}
      <View className="flex-row items-center gap-1.5">
        {/* Fine − */}
        <Pressable
          onPress={() => adjust(-def.step)}
          disabled={!canControl}
          hitSlop={6}
          className="h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 active:bg-white/15 disabled:opacity-30"
        >
          <Feather name="minus" size={14} color="#94a3b8" />
        </Pressable>

        {/* Coarse − */}
        <Pressable
          onPress={() => adjust(-def.bigStep)}
          disabled={!canControl}
          hitSlop={6}
          className="h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 active:bg-white/15 disabled:opacity-30"
        >
          <Feather name="minus" size={14} color="#1e3a8a" />
          <Feather name="minus" size={14} color="#1e3a8a" style={{ position: 'absolute', left: 3 }} />
        </Pressable>

        {/* Value field (tap to type) */}
        <Pressable
          onPress={() => onOpenModal(pidKey)}
          hitSlop={6}
          className="min-h-9 min-w-[64px] flex-1 items-center justify-center rounded-lg border border-white/10 bg-slate-800 px-2 py-1.5 active:bg-slate-700"
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
          <Feather name="plus" size={14} color="#1e3a8a" />
          <Feather name="plus" size={14} color="#1e3a8a" style={{ position: 'absolute', left: 3 }} />
        </Pressable>

        {/* Fine + */}
        <Pressable
          onPress={() => adjust(def.step)}
          disabled={!canControl}
          hitSlop={6}
          className="h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 active:bg-white/15 disabled:opacity-30"
        >
          <Feather name="plus" size={14} color="#94a3b8" />
        </Pressable>
      </View>
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
              MPU6050 + PID keeps the bot upright. Angle streams from the car's
              TEL;… telemetry; tuning below mirrors the ESP remote's AUTO dashboard.
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

      {/* Live tilt readout + OUT */}
      <View className={`rounded-xl bg-slate-900 shadow-inner ${compact ? 'mt-2 px-3 py-2' : 'mt-4 px-4 py-3'}`}>
        <View className="flex-row items-center justify-between">
          <Text className="font-mono text-[10px] font-bold uppercase tracking-wide text-slate-500">Angle</Text>
          <View className="flex-row items-center gap-1.5">
            <View className={`rounded-full ${st.dot} ${compact ? 'h-2 w-2' : 'h-2 w-2'}`} />
            <Text className={`font-black uppercase tracking-wide ${st.text} ${compact ? 'text-[9px]' : 'text-[10px]'}`}>{st.label}</Text>
          </View>
        </View>
        <View className="mt-1 flex-row items-end justify-between">
          <Text className={`font-mono font-bold text-emerald-300 ${compact ? 'text-2xl' : 'text-4xl'}`}>{angleText}</Text>
          <Text className="mb-1 font-mono text-[10px] text-slate-400">
            OUT {out}
          </Text>
        </View>
      </View>

      {/* OFF settings row */}
      <View className={`mt-2 flex-row items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 ${compact ? '' : 'mt-3'}`}>
        <Text className="text-[10px] font-black uppercase tracking-wide text-navy">OFF</Text>
        <View className="flex-row items-center gap-1.5">
          <Pressable
            onPress={() => { const next = Math.round((off - 0.1) * 100) / 100; onPid('off', Math.max(-90, next)) }}
            disabled={!canControl}
            hitSlop={4}
            className="h-7 w-7 items-center justify-center rounded border border-white/10 bg-white/5 active:bg-white/15 disabled:opacity-30"
          >
            <Feather name="minus" size={12} color="#1e3a8a" />
          </Pressable>
          <Pressable
            onPress={() => setModalKey('off')}
            hitSlop={4}
            className="min-w-[60px] items-center justify-center rounded border border-white/10 bg-slate-800 px-2 py-1"
          >
            <Text className="font-mono text-[11px] font-bold text-emerald-300">
              {off >= 0 ? '+' : ''}{off.toFixed(2)}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => { const next = Math.round((off + 0.1) * 100) / 100; onPid('off', Math.min(90, next)) }}
            disabled={!canControl}
            hitSlop={4}
            className="h-7 w-7 items-center justify-center rounded border border-white/10 bg-white/5 active:bg-white/15 disabled:opacity-30"
          >
            <Feather name="plus" size={12} color="#1e3a8a" />
          </Pressable>
        </View>
      </View>

      {/* PID tuning — Kp, Ki, Kd only */}
      {compact ? (
        /* Compact: value fields with fine/coarse +/- buttons (no sliders) */
        <View className="mt-3 gap-2">
          {(['kp', 'ki', 'kd'] as PidKey[]).map((k) => (
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
      ) : (
        /* Full: 2-column card grid with sliders (unchanged) */
        <View className="mt-4 flex-row flex-wrap gap-3">
          <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
            <Slider value={kp} minimumValue={0} maximumValue={200} step={0.01} onValueChange={(v: number) => onPid('kp', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
            <Text className="mt-1 text-right font-mono text-xs text-navy">Kp {kp.toFixed(2)}</Text>
          </View>
          <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
            <Slider value={ki} minimumValue={0} maximumValue={50} step={0.001} onValueChange={(v: number) => onPid('ki', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
            <Text className="mt-1 text-right font-mono text-xs text-navy">Ki {ki.toFixed(3)}</Text>
          </View>
          <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
            <Slider value={kd} minimumValue={0} maximumValue={50} step={0.001} onValueChange={(v: number) => onPid('kd', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
            <Text className="mt-1 text-right font-mono text-xs text-navy">Kd {kd.toFixed(3)}</Text>
          </View>
          <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
            <Slider value={out} minimumValue={0} maximumValue={255} step={1} onValueChange={(v: number) => onPid('out', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
            <Text className="mt-1 text-right font-mono text-xs text-navy">OUT {out}</Text>
          </View>
          <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
            <Slider value={off} minimumValue={-90} maximumValue={90} step={0.01} onValueChange={(v: number) => onPid('off', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
            <Text className="mt-1 text-right font-mono text-xs text-navy">OFF {off >= 0 ? '+' : ''}{off.toFixed(2)}°</Text>
          </View>
        </View>
      )}

      {!compact && (
        <View className="mt-3 flex-row items-start gap-2">
          <Feather name="activity" size={13} color="#1e3a8a" />
          <Text className="flex-1 text-[11px] leading-4 text-muted">
            Changes send the same CFG;… line the ESP remote uses when calibration is
            saved — start with the car flat, then nudge Kp/OUT until it stands still.
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
