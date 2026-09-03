// =====================================================================
// DriveControls — directional pad OR dual joysticks, speed/servo
// sliders, PID tuning, start/stop.
//
// Toggle between d-pad (classic buttons) and joystick (website-style
// dual-virtual-joystick) via the `useJoystick` prop.
// =====================================================================
import React, { useCallback, useRef } from 'react'
import { Pressable, Text, View, Vibration } from 'react-native'
import { Feather } from '@expo/vector-icons'
import Slider from '@react-native-community/slider'
import type { DriveControlsProps } from './types'
import { Joystick } from './Joystick'

// Map normalized joystick position to a direction letter, mirroring the
// physical remote's 4-way stick → F/B/L/R mapping.
function joyToDirection(x: number, y: number): 'F' | 'B' | 'L' | 'R' | 'S' {
  const ax = Math.abs(x)
  const ay = Math.abs(y)
  if (ax < 0.25 && ay < 0.25) return 'S'
  if (ay >= ax) return y < 0 ? 'F' : 'B'
  return x < 0 ? 'L' : 'R'
}

export function DriveControls({
  canControl, isDrone, activeMode, speed, servo,
  pidKp, pidKi, pidKd, pidOut, useJoystick,
  onDirection, onSpeed, onServo, onPid, onRun, onStop,
}: DriveControlsProps) {
  if (isDrone) return null

  const showSpeed = activeMode.controls.includes('drive-tank') || activeMode.controls.includes('drive-2wd1m')
  const showServo = activeMode.controls.includes('drive-2wd1m')
  const showPid = activeMode.controls.includes('pid-auto')
  const showStartStop = activeMode.controls.includes('start-stop') || activeMode.controls.includes('tuning')
  const is2wd1m = activeMode.controls.includes('drive-2wd1m')

  // Debounce direction commands to avoid flooding the BLE/WiFi link
  const lastDirRef = useRef<string>('S')
  const sendDir = useCallback((d: 'F' | 'B' | 'L' | 'R' | 'S') => {
    if (lastDirRef.current === d) return
    lastDirRef.current = d
    onDirection(d)
  }, [onDirection])

  // Light haptic tick on button presses (drive feedback, no extra deps)
  const hapticTap = useCallback(() => {
    Vibration.vibrate(10)
  }, [])

  // Reset debounce on stop
  const handleStop = useCallback(() => {
    lastDirRef.current = 'S'
    onDirection('S')
  }, [onDirection])

  // Left joystick: drives direction
  const handleLeftJoy = useCallback((x: number, y: number) => {
    if (!canControl) return
    // In 2WD1M the left stick only drives motor forward/backward
    const d = is2wd1m
      ? (y < -0.25 ? 'F' : y > 0.25 ? 'B' : 'S')
      : joyToDirection(x, y)
    sendDir(d)
  }, [canControl, is2wd1m, sendDir])

  // Right joystick X axis: steers servo in 2WD1M
  const handleRightJoy = useCallback((x: number) => {
    if (!canControl || !is2wd1m) return
    const angle = Math.round(90 - x * 90)
    onServo(Math.max(0, Math.min(180, angle)))
  }, [canControl, is2wd1m, onServo])

  return (
    <View className={canControl ? '' : 'opacity-40'}>
      {/* ── Input mode: Joystick or D-pad ── */}
      {useJoystick ? (
        /* Dual joysticks (website-style) */
        <View>
          <View className="flex-row items-center justify-center gap-6">
            <View className="items-center">
              <Text className="mb-2 text-xs font-bold uppercase tracking-wide text-border">
                Drive {is2wd1m ? '(Motor)' : '(Left)'}
              </Text>
              <Joystick onMove={handleLeftJoy} disabled={!canControl} size={144} />
            </View>
            <View className="items-center">
              <Text className="mb-2 text-xs font-bold uppercase tracking-wide text-border">
                Steer {is2wd1m ? '(Servo)' : '(Unused)'}
              </Text>
              <Joystick
                onMove={(x) => handleRightJoy(x)}
                disabled={!canControl || !is2wd1m}
                size={144}
              />
            </View>
          </View>
          <Text className="mt-3 text-center text-[11px] text-muted">
            Left drives · Right steers (2WD1M)
          </Text>
        </View>
      ) : (
        /* D-pad (classic buttons) */
        <View>
          <View className="flex-row items-center justify-center">
            <View style={{ width: 72 }} />
            <Pressable onPress={() => { hapticTap(); onDirection('F') }} disabled={!canControl} className="mx-1 items-center rounded-xl bg-navy px-6 py-4">
              <Feather name="chevron-up" size={32} color="#fff" />
            </Pressable>
            <View style={{ width: 72 }} />
          </View>
          <View className="mt-2 flex-row items-center justify-center">
            <Pressable onPress={() => { hapticTap(); onDirection('L') }} disabled={!canControl} className="mx-1 items-center rounded-xl border border-navy px-6 py-4">
              <Feather name="chevron-left" size={32} color="#1e3a8a" />
            </Pressable>
            <Pressable onPress={() => { hapticTap(); handleStop() }} disabled={!canControl} className="mx-1 items-center rounded-xl bg-slate-200 px-6 py-4">
              <Feather name="stop-circle" size={28} color="#1e3a8a" />
            </Pressable>
            <Pressable onPress={() => { hapticTap(); onDirection('R') }} disabled={!canControl} className="mx-1 items-center rounded-xl border border-navy px-6 py-4">
              <Feather name="chevron-right" size={32} color="#1e3a8a" />
            </Pressable>
          </View>
          <View className="mt-2 flex-row items-center justify-center">
            <View style={{ width: 72 }} />
            <Pressable onPress={() => { hapticTap(); onDirection('B') }} disabled={!canControl} className="mx-1 items-center rounded-xl border border-navy px-6 py-4">
              <Feather name="chevron-down" size={32} color="#1e3a8a" />
            </Pressable>
            <View style={{ width: 72 }} />
          </View>
        </View>
      )}

      {/* Speed */}
      {showSpeed && (
        <View className="mt-4 rounded-xl border border-line bg-surface p-4">
          <Text className="text-xs font-bold uppercase tracking-wide text-border">Speed</Text>
          <Slider value={speed} minimumValue={0} maximumValue={255} step={5} onValueChange={onSpeed} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
          <Text className="mt-1 text-right font-mono text-sm font-bold text-navy">{speed}</Text>
        </View>
      )}

      {/* Servo (only shown when not using joystick, since joystick controls it directly) */}
      {showServo && !useJoystick && (
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
          <Pressable onPress={() => { hapticTap(); onRun() }} disabled={!canControl} className="rounded-full bg-navy px-6 py-3">
            <Text className="text-sm font-black text-white">Run</Text>
          </Pressable>
          <Pressable onPress={() => { hapticTap(); onStop() }} disabled={!canControl} className="rounded-full border border-line bg-card px-6 py-3">
            <Text className="text-sm font-black text-ink">Stop</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}
