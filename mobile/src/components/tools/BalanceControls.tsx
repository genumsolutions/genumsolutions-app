// =====================================================================
// BalanceControls — self-balancing (AUTO) deck for the per-package Car
// Remote.
//
// Shows the live tilt angle from the car's TEL;…ANGLE telemetry next to
// full PID tuning (Kp/Ki/Kd/OUT/OFF), mirroring the ESP remote's AUTO
// dashboard (Genum_ESP32_Remote ui.md — Auto Dashboard). Each slider
// change goes through onPid -> the screen's applyPid, which sends the
// same `CFG;Kp:..;Ki:..;Kd:..;OUT:..;OFF:..` line the remote sends when
// calibration is saved.
// =====================================================================
import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import Slider from '@react-native-community/slider'
import type { BalanceControlsProps } from './types'

function pidStatus(angle: number | null): { label: string; dot: string; text: string } {
  if (angle == null) return { label: 'NO TELEMETRY', dot: 'bg-border', text: 'text-slate-500' }
  const a = Math.abs(angle)
  if (a < 2.5) return { label: 'BALANCING', dot: 'bg-emerald-500', text: 'text-emerald-600' }
  if (a < 10) return { label: 'CORRECTING', dot: 'bg-amber-500', text: 'text-amber-600' }
  return { label: 'TILT!', dot: 'bg-red-500', text: 'text-red-600' }
}

export function BalanceControls({
  canControl, angle, kp, ki, kd, out, off, onPid, onEnterMode,
}: BalanceControlsProps) {
  const st = pidStatus(angle)
  const angleText = angle == null ? '—' : `${angle >= 0 ? '+' : ''}${angle.toFixed(1)}°`

  return (
    <View className="mt-4 rounded-2xl border border-line bg-card p-5 shadow-card">
      {/* Header + AUTO mode entry */}
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-black uppercase tracking-widest text-navy">
            Self-balancing · PID
          </Text>
          <Text className="mt-1 text-[11px] leading-4 text-muted">
            MPU6050 + PID keeps the bot upright. Angle streams from the car's
            TEL;… telemetry; tuning below mirrors the ESP remote's AUTO dashboard.
          </Text>
        </View>
        <Pressable
          onPress={onEnterMode}
          disabled={!canControl}
          className="shrink-0 items-center rounded-full bg-navy px-4 py-2 disabled:opacity-60"
        >
          <Text className="text-xs font-black text-white">Enter AUTO</Text>
        </Pressable>
      </View>

      {/* Live tilt readout */}
      <View className="mt-4 rounded-xl bg-slate-900 px-4 py-3 shadow-inner">
        <View className="flex-row items-center justify-between">
          <Text className="font-mono text-xs font-bold uppercase tracking-wide text-slate-500">Angle</Text>
          <View className="flex-row items-center gap-1.5">
            <View className={`h-2 w-2 rounded-full ${st.dot}`} />
            <Text className={`text-[10px] font-black uppercase tracking-wide ${st.text}`}>{st.label}</Text>
          </View>
        </View>
        <View className="mt-1 flex-row items-end justify-between">
          <Text className="font-mono text-4xl font-bold text-emerald-300">{angleText}</Text>
          <Text className="mb-1 font-mono text-xs text-slate-400">
            OUT {out} · OFF {off >= 0 ? '+' : ''}{off.toFixed(2)}°
          </Text>
        </View>
      </View>

      {/* PID tuning sliders (full set — Kp/Ki/Kd/OUT/OFF, like the remote) */}
      <View className="mt-4 flex-row flex-wrap gap-3">
        <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
          <Slider value={kp} minimumValue={0} maximumValue={50} step={0.1} onValueChange={(v: number) => onPid('kp', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
          <Text className="mt-1 text-right font-mono text-xs text-navy">Kp {kp.toFixed(1)}</Text>
        </View>
        <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
          <Slider value={ki} minimumValue={0} maximumValue={20} step={0.1} onValueChange={(v: number) => onPid('ki', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
          <Text className="mt-1 text-right font-mono text-xs text-navy">Ki {ki.toFixed(1)}</Text>
        </View>
        <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
          <Slider value={kd} minimumValue={0} maximumValue={20} step={0.1} onValueChange={(v: number) => onPid('kd', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
          <Text className="mt-1 text-right font-mono text-xs text-navy">Kd {kd.toFixed(1)}</Text>
        </View>
        <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
          <Slider value={out} minimumValue={0} maximumValue={255} step={1} onValueChange={(v: number) => onPid('out', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
          <Text className="mt-1 text-right font-mono text-xs text-navy">OUT {out}</Text>
        </View>
        <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
          <Slider value={off} minimumValue={-5} maximumValue={5} step={0.05} onValueChange={(v: number) => onPid('off', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
          <Text className="mt-1 text-right font-mono text-xs text-navy">OFF {off >= 0 ? '+' : ''}{off.toFixed(2)}°</Text>
        </View>
      </View>

      <View className="mt-3 flex-row items-start gap-2">
        <Feather name="activity" size={13} color="#1e3a8a" />
        <Text className="flex-1 text-[11px] leading-4 text-muted">
          Changes send the same CFG;… line the ESP remote uses when calibration is
          saved — start with the car flat, then nudge Kp/OUT until it stands still.
        </Text>
      </View>
    </View>
  )
}
