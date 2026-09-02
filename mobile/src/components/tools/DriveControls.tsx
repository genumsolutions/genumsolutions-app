// DriveControls — directional pad, speed/servo sliders, PID tuning.
import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import Slider from '@react-native-community/slider'
import type { DriveControlsProps } from './types'

export function DriveControls({
  canControl, isDrone, activeMode, speed, servo,
  pidKp, pidKi, pidKd, pidOut,
  onDirection, onSpeed, onServo, onPid, onRun, onStop,
}: DriveControlsProps) {
  if (isDrone) return null

  const showSpeed = activeMode.controls.includes('drive-tank') || activeMode.controls.includes('drive-2wd1m')
  const showServo = activeMode.controls.includes('drive-2wd1m')
  const showPid = activeMode.controls.includes('pid-auto')
  const showStartStop = activeMode.controls.includes('start-stop') || activeMode.controls.includes('tuning')

  return (
    <View className={canControl ? '' : 'opacity-40'}>
      {/* D-pad */}
      <View>
        <View className="flex-row items-center justify-center">
          <View style={{ width: 72 }} />
          <Pressable onPress={() => onDirection('F')} disabled={!canControl} className="mx-1 items-center rounded-xl bg-navy px-6 py-4">
            <Feather name="chevron-up" size={32} color="#fff" />
          </Pressable>
          <View style={{ width: 72 }} />
        </View>
        <View className="mt-2 flex-row items-center justify-center">
          <Pressable onPress={() => onDirection('L')} disabled={!canControl} className="mx-1 items-center rounded-xl border border-navy px-6 py-4">
            <Feather name="chevron-left" size={32} color="#1e3a8a" />
          </Pressable>
          <Pressable onPress={() => onDirection('S')} disabled={!canControl} className="mx-1 items-center rounded-xl bg-slate-200 px-6 py-4">
            <Feather name="stop-circle" size={28} color="#1e3a8a" />
          </Pressable>
          <Pressable onPress={() => onDirection('R')} disabled={!canControl} className="mx-1 items-center rounded-xl border border-navy px-6 py-4">
            <Feather name="chevron-right" size={32} color="#1e3a8a" />
          </Pressable>
        </View>
        <View className="mt-2 flex-row items-center justify-center">
          <View style={{ width: 72 }} />
          <Pressable onPress={() => onDirection('B')} disabled={!canControl} className="mx-1 items-center rounded-xl border border-navy px-6 py-4">
            <Feather name="chevron-down" size={32} color="#1e3a8a" />
          </Pressable>
          <View style={{ width: 72 }} />
        </View>
      </View>

      {/* Speed */}
      {showSpeed && (
        <View className="mt-4 rounded-xl border border-line bg-surface p-4">
          <Text className="text-xs font-bold uppercase tracking-wide text-border">Speed</Text>
          <Slider value={speed} minimumValue={0} maximumValue={255} step={5} onValueChange={onSpeed} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
          <Text className="mt-1 text-right font-mono text-sm font-bold text-navy">{speed}</Text>
        </View>
      )}

      {/* Servo */}
      {showServo && (
        <View className="mt-4 rounded-xl border border-line bg-surface p-4">
          <Text className="text-xs font-bold uppercase tracking-wide text-border">Steering (servo)</Text>
          <Slider value={servo} minimumValue={0} maximumValue={180} step={5} onValueChange={onServo} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
          <Text className="mt-1 text-right font-mono text-sm font-bold text-navy">{servo}°</Text>
        </View>
      )}

      {/* PID */}
      {showPid && (
        <View className="mt-4 flex-row flex-wrap gap-3">
          <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
            <Text className="text-xs font-bold uppercase tracking-wide text-border">PID Tuning</Text>
            <Slider value={pidKp} minimumValue={0} maximumValue={50} step={0.1} onValueChange={(v: number) => onPid('kp', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
            <Text className="mt-1 text-right font-mono text-xs text-navy">Kp {pidKp.toFixed(1)}</Text>
          </View>
          <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
            <Slider value={pidKi} minimumValue={0} maximumValue={20} step={0.1} onValueChange={(v: number) => onPid('ki', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
            <Text className="mt-1 text-right font-mono text-xs text-navy">Ki {pidKi.toFixed(1)}</Text>
          </View>
          <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
            <Slider value={pidKd} minimumValue={0} maximumValue={20} step={0.1} onValueChange={(v: number) => onPid('kd', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
            <Text className="mt-1 text-right font-mono text-xs text-navy">Kd {pidKd.toFixed(1)}</Text>
          </View>
          <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
            <Slider value={pidOut} minimumValue={0} maximumValue={255} step={1} onValueChange={(v: number) => onPid('out', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
            <Text className="mt-1 text-right font-mono text-xs text-navy">OUT {pidOut}</Text>
          </View>
        </View>
      )}

      {/* Start/Stop */}
      {showStartStop && (
        <View className="mt-4 flex-row flex-wrap gap-3">
          <Pressable onPress={onRun} disabled={!canControl} className="rounded-full bg-navy px-6 py-3">
            <Text className="text-sm font-black text-white">Run</Text>
          </Pressable>
          <Pressable onPress={onStop} disabled={!canControl} className="rounded-full border border-line bg-card px-6 py-3">
            <Text className="text-sm font-black text-ink">Stop</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}
