// =====================================================================
// DriveControls — directional pad (single OR dual for 2WD1M) or dual
// joysticks, speed −/+ steppers, PID tuning, start/stop and emergency
// stop. Toggle d-pad vs joystick via the `useJoystick` prop.
//
// 2WD1M gets TWO d-pads mirroring the dual joysticks: the left pad holds
// motor forward/back at the current speed level, the right pad holds
// steering to ±steerLimit. Releasing any pad sends SPD0 / SERVO90
// immediately (stop lines bypass the parent's command throttle, so the
// car stops the moment a finger lifts — "pronto").
//
// Drive values are clamped to the ESP-remote safety limits before they
// leave the app, so the phone cannot command unsafe speed/steering/PWM
// values even if the controls are driven hard.
// =====================================================================
import React, { useCallback, useRef } from 'react'
import { Pressable, Text, View, Vibration } from 'react-native'
import { Feather } from '@expo/vector-icons'
import Slider from '@react-native-community/slider'
import type { DriveControlsProps, SafetyLimits } from './types'
import { Joystick } from './Joystick'

/** Default safety limits when the parent does not pass a custom set. */
const DEFAULT_SAFETY_LIMITS: SafetyLimits = {
  maxSpeed: 255,
  maxSignedDrive: 255,
  servoCenter: 90,
  maxSteerDeviation: 90,
  maxTrim: 90,
}

/** Clamp a motor/speed value to the remote's safe PWM/speed ceiling. */
function clampSpeed(value: number, limits: SafetyLimits): number {
  const v = Math.round(value)
  return Math.max(0, Math.min(limits.maxSpeed, v))
}

/** Clamp a signed joystick drive value to the remote's safe joystick range. */
function clampSignedDrive(value: number, limits: SafetyLimits): number {
  const v = Math.round(value)
  return Math.max(-limits.maxSignedDrive, Math.min(limits.maxSignedDrive, v))
}

/** Clamp a SERVO value around the remote's center and steer deviation limit. */
function clampServo(value: number, limits: SafetyLimits): number {
  const v = Math.round(value)
  return Math.max(
    Math.max(0, limits.servoCenter - limits.maxSteerDeviation),
    Math.min(180, limits.servoCenter + limits.maxSteerDeviation, v),
  )
}

/** Minus/plus stepper button used for the speed and steering controls. */
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
      className="h-12 w-12 items-center justify-center rounded-full border border-line bg-card shadow-sm disabled:opacity-40"
    >
      <Feather name={icon} size={20} color="#1e3a8a" />
    </Pressable>
  )
}

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
  pidKp, pidKi, pidKd, pidOut, pidOff, useJoystick,
  onDirection, onSpeed, onServo, onPid, onRun, onStop,
  onSignedDrive, steerLimit, onEStop,
  safetyLimits,
}: DriveControlsProps & { safetyLimits?: SafetyLimits }) {
  const limits = safetyLimits ?? DEFAULT_SAFETY_LIMITS
  const showSpeed = activeMode.controls.includes('drive-tank') || activeMode.controls.includes('drive-2wd1m')
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

  // 2WD1M dual d-pad: left pad holds motor at the current speed level.
  // Forward sends SPD+speed, backward SPD−speed; RELEASE sends SPD0 so the
  // car stops the instant the finger lifts.
  const pressFwd = useCallback(() => {
    hapticTap()
    if (onSignedDrive) onSignedDrive(clampSignedDrive(speed, limits))
    else onDirection('F')
  }, [hapticTap, onSignedDrive, speed, limits, onDirection])

  const pressBack = useCallback(() => {
    hapticTap()
    if (onSignedDrive) onSignedDrive(clampSignedDrive(-speed, limits))
    else onDirection('B')
  }, [hapticTap, onSignedDrive, speed, limits, onDirection])

  const releaseDrive = useCallback(() => {
    if (onSignedDrive) onSignedDrive(0)
    else onDirection('S')
  }, [onSignedDrive, onDirection])

  // 2WD1M right pad: holds steering to ±steerLimit; release straightens.
  const maxSteer = steerLimit != null ? steerLimit : limits.maxSteerDeviation
  const pressLeft = useCallback(() => {
    hapticTap()
    onServo(clampServo(limits.servoCenter - maxSteer, limits))
  }, [hapticTap, onServo, maxSteer, limits])

  const pressRight = useCallback(() => {
    hapticTap()
    onServo(clampServo(limits.servoCenter + maxSteer, limits))
  }, [hapticTap, onServo, maxSteer, limits])

  const releaseSteer = useCallback(() => {
    onServo(limits.servoCenter)
  }, [onServo, limits])

  // Stop everything (2WD1M center button)
  const stopAll2wd1m = useCallback(() => {
    hapticTap()
    if (onSignedDrive) onSignedDrive(0)
    onServo(limits.servoCenter)
  }, [hapticTap, onSignedDrive, onServo, limits])

  // Left joystick: drives direction. With ESP-remote parity (onSignedDrive)
  // the 2WD1M stick streams signed SPD like the physical remote: forward is
  // +SPD, backward is -SPD, magnitude proportional to deflection, quantized
  // to 5-unit steps, and center (release) sends SPD0 = transient stop.
  // The value is clamped to the remote's SAFE joystick range before sending.
  const handleLeftJoy = useCallback((x: number, y: number) => {
    if (!canControl) return
    if (is2wd1m && onSignedDrive) {
      if (Math.abs(y) <= 0.05) {
        onSignedDrive(0)
        return
      }
      const raw = Math.round((Math.min(1, Math.abs(y)) * 255) / 5) * 5
      const mag = clampSignedDrive(raw, limits)
      onSignedDrive(y < 0 ? -mag : mag)
      return
    }
    // In 2WD1M the left stick only drives motor forward/backward
    const d = is2wd1m
      ? (y < -0.25 ? 'F' : y > 0.25 ? 'B' : 'S')
      : joyToDirection(x, y)
    sendDir(d)
  }, [canControl, is2wd1m, onSignedDrive, sendDir, limits])

  // Right joystick X axis: steers servo in 2WD1M. With ESP-remote parity the
  // deviation from center is clamped to ±steerLimit, so the servo never
  // exceeds the limit the user set (mirrors the remote's Steer field).
  // The resulting servo angle is also clamped to the remote's safe servo range.
  const handleRightJoy = useCallback((x: number) => {
    if (!canControl || !is2wd1m) return
    let dev = Math.round(-x * 90)
    if (onSignedDrive && steerLimit != null) {
      dev = Math.max(-steerLimit, Math.min(steerLimit, dev))
    }
    const rawServo = limits.servoCenter + dev
    const safeServo = clampServo(rawServo, limits)
    onServo(safeServo)
  }, [canControl, is2wd1m, onSignedDrive, steerLimit, onServo, limits])

  if (isDrone) return null

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
            {is2wd1m && onSignedDrive
              ? 'Left stick = signed speed (SPD) · Right stick steers, clamped to the steer limit'
              : is2wd1m
                ? 'Left drives · Right steers (2WD1M)'
                : 'Left drives · Right steers'}
          </Text>
        </View>
      ) : is2wd1m ? (
        /* 2WD1M dual d-pads (mirror the dual joysticks) */
        <View>
          <View className="flex-row items-stretch justify-center gap-3">
            {/* Left D-pad: motor */}
            <View className="flex-1 items-center rounded-2xl border border-line bg-surface px-2 py-4">
              <Text className="mb-3 text-xs font-bold uppercase tracking-wide text-border">Drive (motor)</Text>
              <View className="gap-2">
                <Pressable onPressIn={pressFwd} onPressOut={releaseDrive} disabled={!canControl} className="items-center rounded-xl bg-navy px-6 py-4 disabled:opacity-40">
                  <Feather name="chevron-up" size={30} color="#fff" />
                </Pressable>
                <Pressable onPressIn={pressBack} onPressOut={releaseDrive} disabled={!canControl} className="items-center rounded-xl border border-navy px-6 py-4 disabled:opacity-40">
                  <Feather name="chevron-down" size={30} color="#1e3a8a" />
                </Pressable>
              </View>
              <Text className="mt-3 text-center text-[11px] leading-4 text-muted">
                Hold to drive{'\n'}Release stops instantly
              </Text>
            </View>

            {/* Right D-pad: steering */}
            <View className="flex-1 items-center rounded-2xl border border-line bg-surface px-2 py-4">
              <Text className="mb-3 text-xs font-bold uppercase tracking-wide text-border">Steer (servo)</Text>
              <View className="flex-row gap-2">
                <Pressable onPressIn={pressLeft} onPressOut={releaseSteer} disabled={!canControl} className="items-center rounded-xl border border-navy px-6 py-4 disabled:opacity-40">
                  <Feather name="chevron-left" size={30} color="#1e3a8a" />
                </Pressable>
                <Pressable onPressIn={pressRight} onPressOut={releaseSteer} disabled={!canControl} className="items-center rounded-xl border border-navy px-6 py-4 disabled:opacity-40">
                  <Feather name="chevron-right" size={30} color="#1e3a8a" />
                </Pressable>
              </View>
              <Text className="mt-3 text-center text-[11px] leading-4 text-muted">
                Hold to steer{'\n'}Release straightens
              </Text>
            </View>
          </View>

          <View className="mt-3 flex-row items-center justify-center">
            <Pressable onPress={stopAll2wd1m} disabled={!canControl} className="flex-row items-center gap-2 rounded-full bg-slate-200 px-6 py-3 disabled:opacity-40">
              <Feather name="stop-circle" size={16} color="#1e3a8a" />
              <Text className="text-xs font-black text-navy">Stop</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        /* Single D-pad (classic buttons, non-2WD1M modes) */
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

      {/* Speed (clamped to the ESP-remote safe PWM/speed ceiling) */}
      {showSpeed && (
        <View className="mt-4 rounded-xl border border-line bg-surface p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-bold uppercase tracking-wide text-border">Speed</Text>
            <Text className="font-mono text-sm font-bold text-navy">{clampSpeed(speed, limits)}</Text>
          </View>
          <View className="mt-3 flex-row items-center justify-center gap-5">
            <StepperBtn onPress={() => onSpeed(clampSpeed(speed - 5, limits))} disabled={!canControl} icon="minus" />
            <Text className="w-20 text-center font-mono text-3xl font-bold text-navy">{clampSpeed(speed, limits)}</Text>
            <StepperBtn onPress={() => onSpeed(clampSpeed(speed + 5, limits))} disabled={!canControl} icon="plus" />
          </View>
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
          <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
            <Slider value={pidOff} minimumValue={-5} maximumValue={5} step={0.05} onValueChange={(v: number) => onPid('off', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
            <Text className="mt-1 text-right font-mono text-xs text-navy">OFF {pidOff >= 0 ? '+' : ''}{pidOff.toFixed(2)}°</Text>
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

      {/* Emergency stop (relocated from TwoWd1mExtras) */}
      {onEStop && (
        <View className="mt-4">
          <Pressable onPress={() => { hapticTap(); onEStop() }} disabled={!canControl} className="flex-row items-center justify-center gap-2 rounded-full bg-red-600 px-6 py-3 disabled:opacity-60">
            <Feather name="octagon" size={14} color="#fff" />
            <Text className="text-sm font-black text-white">Emergency stop</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

export type JoystickLayout = {
  id: string
  label: string
  /** Brief hint shown above the joysticks for this layout. */
  hint: string
}

export const JOYSTICK_LAYOUTS: JoystickLayout[] = [
  {
    id: 'dual',
    label: 'Dual stick',
    hint: 'Left drives · Right steers (2WD1M-style separated hands)',
  },
  {
    id: 'dpad',
    label: 'D-pad',
    hint: 'Directional buttons for forward/back/left/right/stop',
  },
]