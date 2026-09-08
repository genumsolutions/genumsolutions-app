// =====================================================================
// DriveControls — TWO complete dashboards in every robocar mode:
//
//   D-pad layout:  TWO complete 4-way+center d-pads (up/down/left/right
//                  + center stop). Both pads are one RAW multi-touch
//                  surface, so drive + steer actions happen at the same
//                  time, exactly like the ESP remote streams SPD + SERVO
//                  together each loop. Buttons that a mode does not use
//                  stay visible but non-functional (dimmed).
//   Joystick layout: TWO sticks sharing one multi-touch surface — both
//                  operate together and releasing a stick returns it to
//                  center and stops that stick's function immediately.
//
// Functional mapping per mode:
//   * 2WD1M        left pad/stick = motor (FWD/BACK → signed SPD),
//                  right pad/stick = servo steer to ±steerLimit;
//                  remaining buttons shown but inactive.
//   * other modes  left pad/stick = F/B/L/R direction letters (+ center
//                  stop), right pad/stick shown but inactive.
//
// Also carries speed −/+ steppers PLUS a speed slider, PID tuning,
// start/stop and emergency stop. Drive values are clamped to the
// ESP-remote safety limits before they leave the app, so the phone
// cannot command unsafe speed/steering/PWM values.
// =====================================================================
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, Text, View, Vibration } from 'react-native'
import type { GestureResponderEvent } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import Slider from '@react-native-community/slider'
import type { DriveControlsProps, SafetyLimits } from './types'

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

/** Compact minus/plus stepper used by the speed slider row. */
function MiniStepperBtn({ onPress, disabled, icon }: {
  onPress: () => void
  disabled: boolean
  icon: 'minus' | 'plus'
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className="h-9 w-9 items-center justify-center rounded-full border border-line bg-card shadow-sm disabled:opacity-40"
    >
      <Feather name={icon} size={16} color="#1e3a8a" />
    </Pressable>
  )
}

// Map normalized joystick position to a direction letter, mirroring the
// physical remote's 4-way stick → F/B/L/R mapping.
// Convention: UP (y<0) = Forward, DOWN (y>0) = Backward, LEFT (x<0) = Left, RIGHT (x>0) = Right.
function joyToDirection(x: number, y: number): 'F' | 'B' | 'L' | 'R' | 'S' {
  const ax = Math.abs(x)
  const ay = Math.abs(y)
  if (ax < 0.25 && ay < 0.25) return 'S'
  if (ay >= ax) return y < 0 ? 'F' : 'B'
  return x < 0 ? 'L' : 'R'
}

type IconName = ComponentProps<typeof Feather>['name']

type PadId = 'L' | 'R'
type PadZone = 'F' | 'B' | 'L' | 'R' | 'C'
type ActiveCell = { pad: PadId; zone: PadZone }
type TouchPoint = { identifier: string; pageX: number; pageY: number }

const PAD_ICONS: Record<PadZone, IconName> = {
  F: 'chevron-up',
  B: 'chevron-down',
  L: 'chevron-left',
  R: 'chevron-right',
  C: 'stop-circle',
}

// Which zones are functional per pad for the current mode. Non-functional
// zones stay visible as a COMPLETE dashboard but do not emit commands.
function enabledZones(is2wd1m: boolean): { L: PadZone[]; R: PadZone[] } {
  if (is2wd1m) return { L: ['F', 'B', 'C'], R: ['L', 'R', 'C'] }
  return { L: ['F', 'B', 'L', 'R', 'C'], R: [] }
}

// =====================================================================
// DualDpad — TWO complete 4-way d-pads as ONE raw multi-touch surface.
//
// Two separate React-Native `Pressable`s cannot drive both pads at once:
// RN has a single touch responder, so the 2nd press terminates the 1st
// (holding drive then touching the steer pad fires onPressOut on drive →
// SPD0). Instead the whole area takes raw multi-touch events, maps every
// active touch to a cell on the left/right pad by position, and streams
// the matching commands together — with a small hold-resend (like the ESP
// remote's ~30ms cadence) so a dropped line self-heals while held.
// =====================================================================
function DualDpad({
  canControl, speed, steerLimit, is2wd1m, onSignedDrive, sendDir, onServo, limits, onHaptic,
}: {
  canControl: boolean
  speed: number
  steerLimit: number
  is2wd1m: boolean
  onSignedDrive?: (signed: number) => void
  sendDir: (d: 'F' | 'B' | 'L' | 'R' | 'S') => void
  onServo: (v: number) => void
  limits: SafetyLimits
  onHaptic?: () => void
}) {
  // Per-pad rects measured via onLayout — touch mapping uses these
  // instead of a single container rect, so padding/gaps don't offset
  // the hit areas from the visual cells.
  const leftPadRef = useRef<View | null>(null)
  const rightPadRef = useRef<View | null>(null)
  const leftRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const rightRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const [activeCells, setActiveCells] = useState<ActiveCell[]>([])

  // Always-fresh values so the raw touch handlers never see stale closures.
  const stRef = useRef({ canControl, speed, steerLimit, is2wd1m })
  stRef.current = { canControl, speed, steerLimit, is2wd1m }
  const onSignedDriveRef = useRef(onSignedDrive)
  onSignedDriveRef.current = onSignedDrive
  const sendDirRef = useRef(sendDir)
  sendDirRef.current = sendDir
  const onServoRef = useRef(onServo)
  onServoRef.current = onServo
  const limitsRef = useRef(limits)
  limitsRef.current = limits
  const onHapticRef = useRef(onHaptic)
  onHapticRef.current = onHaptic

  // Last emitted values + current targets (only emit on actual transitions).
  const lastSpdRef = useRef(0)
  const lastServoRef = useRef(limits.servoCenter)
  const targetsRef = useRef({ spd: 0, servo: limits.servoCenter })
  const prevFuncCountRef = useRef(0)

  const emitTargets = useCallback((spd: number, servo: number) => {
    const l = limitsRef.current
    const sd = clampSignedDrive(spd, l)
    const sv = clampServo(servo, l)
    targetsRef.current = { spd: sd, servo: sv }
    if (sd !== lastSpdRef.current) {
      lastSpdRef.current = sd
      if (onSignedDriveRef.current) onSignedDriveRef.current(sd)
      else sendDirRef.current(sd > 0 ? 'F' : sd < 0 ? 'B' : 'S')
    }
    if (sv !== lastServoRef.current) {
      lastServoRef.current = sv
      onServoRef.current(sv)
    }
  }, [])

  // Resend the current targets unconditionally (parent throttle paces it).
  const forceSendTargets = useCallback(() => {
    const l = limitsRef.current
    const t = targetsRef.current
    if (onSignedDriveRef.current) onSignedDriveRef.current(clampSignedDrive(t.spd, l))
    else sendDirRef.current(t.spd > 0 ? 'F' : t.spd < 0 ? 'B' : 'S')
    onServoRef.current(clampServo(t.servo, l))
  }, [])

  // Mirror the ESP remote cadence: while any cell is held keep re-sending
  // the current drive/steer so a dropped Bluetooth/WiFi line self-heals.
  const activeCount = activeCells.length
  useEffect(() => {
    if (!canControl || activeCount === 0 || !stRef.current.is2wd1m) return
    const id = setInterval(forceSendTargets, 80)
    return () => clearInterval(id)
  }, [canControl, activeCount, forceSendTargets])

  // Measure each pad's window rect via onLayout (called once per layout).
  const measureLeft = useCallback((e: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => {
    const { x, y, width, height } = e.nativeEvent.layout
    // pageX/Y ≈ layout x/y + scroll offset; use measureInWindow for accuracy
    leftPadRef.current?.measureInWindow((px, py, w, h) => {
      leftRectRef.current = { x: px, y: py, w, h }
    })
  }, [])
  const measureRight = useCallback((e: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => {
    rightPadRef.current?.measureInWindow((px, py, w, h) => {
      rightRectRef.current = { x: px, y: py, w, h }
    })
  }, [])

  // Map a touch point to a zone within a single pad rect.
  // Each pad is a 3×3 grid: center = C (stop), dominant axis = F/B/L/R.
  const zoneFromTouch = (wx: number, wy: number, rect: { x: number; y: number; w: number; h: number }): PadZone => {
    const lx = wx - rect.x  // local X within pad
    const ly = wy - rect.y  // local Y within pad
    const cx = rect.w / 2
    const cy = rect.h / 2
    const dx = lx - cx
    const dy = ly - cy
    const cw = rect.w * 0.18  // center hit zone (slightly generous)
    const ch = rect.h * 0.18
    if (Math.abs(dx) < cw && Math.abs(dy) < ch) return 'C'
    if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? 'F' : 'B'
    return dx < 0 ? 'L' : 'R'
  }

  // Map every active touch to a cell by checking which pad rect it falls in.
  const cellsFromTouches = useCallback((touches: readonly TouchPoint[]): ActiveCell[] => {
    const lr = leftRectRef.current
    const rr = rightRectRef.current
    if (!lr || !rr) return []
    const cells: ActiveCell[] = []
    for (const t of touches) {
      // Check which pad the touch is inside (or nearest to)
      const inL = t.pageX >= lr.x && t.pageX <= lr.x + lr.w && t.pageY >= lr.y && t.pageY <= lr.y + lr.h
      const inR = t.pageX >= rr.x && t.pageX <= rr.x + rr.w && t.pageY >= rr.y && t.pageY <= rr.y + rr.h
      if (!inL && !inR) continue
      const pad: PadId = inL ? 'L' : inR ? 'R' : t.pageX < (lr.x + lr.w / 2 + rr.x + rr.w / 2) / 2 ? 'L' : 'R'
      const rect = pad === 'L' ? lr : rr
      const zone = zoneFromTouch(t.pageX, t.pageY, rect)
      cells.push({ pad, zone })
    }
    return cells
  }, [])

  // Apply a freshly computed set of active cells and stream commands.
  const handleCells = useCallback((cells: ActiveCell[]) => {
    if (!stRef.current.canControl) return
    const s = stRef.current
    const z = enabledZones(s.is2wd1m)
    const functional = cells.filter((c) =>
      (c.pad === 'L' ? z.L : z.R).includes(c.zone),
    )
    if (functional.length > prevFuncCountRef.current) onHapticRef.current?.()
    prevFuncCountRef.current = functional.length
    setActiveCells(cells)

    if (s.is2wd1m) {
      // Left pad → motor (signed SPD), right pad → servo steer. Both
      // stream together, mirroring the ESP remote's simultaneous SPD+SERVO.
      const lz = cells.filter((c) => c.pad === 'L' && z.L.includes(c.zone)).map((c) => c.zone)
      const rz = cells.filter((c) => c.pad === 'R' && z.R.includes(c.zone)).map((c) => c.zone)
      const fwd = lz.includes('F')
      const back = lz.includes('B')
      const spd = lz.includes('C') ? 0 : fwd ? (back ? 0 : s.speed) : back ? -s.speed : 0
      const lsteer = rz.includes('L')
      const rsteer = rz.includes('R')
      const servo = lsteer === rsteer
        ? limitsRef.current.servoCenter
        : lsteer
          ? limitsRef.current.servoCenter - s.steerLimit
          : limitsRef.current.servoCenter + s.steerLimit
      emitTargets(spd, servo)
    } else {
      // Left pad → direction letters (F/B/L/R), center → S, release → S.
      const lz = cells.filter((c) => c.pad === 'L' && z.L.includes(c.zone)).map((c) => c.zone)
      const d: 'F' | 'B' | 'L' | 'R' | 'S' = lz.includes('C')
        ? 'S'
        : lz.includes('F') ? 'F'
          : lz.includes('B') ? 'B'
            : lz.includes('L') ? 'L'
              : lz.includes('R') ? 'R'
                : 'S'
      sendDirRef.current(d)
    }
  }, [emitTargets])

  const onTouch = useCallback((e: GestureResponderEvent) => {
    const map = (list: { identifier: string; pageX: number; pageY: number }[]): TouchPoint[] =>
      list.map((t) => ({ identifier: t.identifier, pageX: t.pageX, pageY: t.pageY }))
    handleCells(cellsFromTouches(map(e.nativeEvent.touches)))
  }, [handleCells, cellsFromTouches])

  const cellActive = (pad: PadId, zone: PadZone) =>
    activeCells.some((c) => c.pad === pad && c.zone === zone)
  const enabled = enabledZones(is2wd1m)

  return (
    <View>
      {/* The whole pad area is ONE multi-touch surface. */}
      <View
        onTouchStart={onTouch}
        onTouchMove={onTouch}
        onTouchEnd={onTouch}
        onTouchCancel={onTouch}
      >
        <View className="flex-row items-stretch gap-3">
          {/* Left pad: motor / full 4-way depending on the mode */}
          <View ref={leftPadRef} onLayout={measureLeft} className="flex-1 items-center rounded-2xl border border-line bg-surface px-3 py-4">
<Text className="mb-3 text-sm font-bold uppercase tracking-wide text-border">
               {is2wd1m ? 'Drive (motor)' : 'Drive (4-way)'}
             </Text>
            <View className="w-full gap-1.5">
              <DpadCell icon={PAD_ICONS.F} active={cellActive('L', 'F')} enabled={enabled.L.includes('F')} />
              <View className="flex-row gap-1.5">
                <DpadCell icon={PAD_ICONS.L} active={cellActive('L', 'L')} enabled={enabled.L.includes('L')} />
                <DpadCell icon="stop-circle" active={cellActive('L', 'C')} enabled={enabled.L.includes('C')} />
                <DpadCell icon={PAD_ICONS.R} active={cellActive('L', 'R')} enabled={enabled.L.includes('R')} />
              </View>
              <DpadCell icon={PAD_ICONS.B} active={cellActive('L', 'B')} enabled={enabled.L.includes('B')} />
            </View>
<Text className="mt-3 text-center text-sm leading-4 text-muted">
               {is2wd1m ? 'Hold to drive · Release stops instantly' : 'Hold any direction · Release stops'}
             </Text>
          </View>

          {/* Right pad: servo steer (2WD1M) or shown-but-unused */}
          <View ref={rightPadRef} onLayout={measureRight} className="flex-1 items-center rounded-2xl border border-line bg-surface px-3 py-4">
<Text className="mb-3 text-sm font-bold uppercase tracking-wide text-border">
               {is2wd1m ? 'Steer (servo)' : 'Not used here'}
             </Text>
            <View className="w-full gap-1.5">
              <DpadCell icon={PAD_ICONS.F} active={cellActive('R', 'F')} enabled={enabled.R.includes('F')} />
              <View className="flex-row gap-1.5">
                <DpadCell icon={PAD_ICONS.L} active={cellActive('R', 'L')} enabled={enabled.R.includes('L')} />
                <DpadCell icon="circle" active={cellActive('R', 'C')} enabled={enabled.R.includes('C')} />
                <DpadCell icon={PAD_ICONS.R} active={cellActive('R', 'R')} enabled={enabled.R.includes('R')} />
              </View>
              <DpadCell icon={PAD_ICONS.B} active={cellActive('R', 'B')} enabled={enabled.R.includes('B')} />
            </View>
<Text className="mt-3 text-center text-sm leading-4 text-muted">
               {is2wd1m ? 'Hold to steer · Release straightens' : 'Unused in this mode'}
             </Text>
          </View>
        </View>
      </View>
    </View>
  )
}

/** One cell of a complete d-pad. All four arrows share the SAME styling
    (parity: no arrow looks different from the others), the center is
    stop-ish, and non-functional buttons stay visible but dimmed. */
function DpadCell({ icon, active, enabled }: {
  icon: IconName
  active: boolean
  enabled: boolean
}) {
  return (
    <View
      className={`flex-1 items-center rounded-xl px-3 py-3 ${active ? 'bg-navy' : enabled ? 'border border-navy' : 'border border-white/10 opacity-50'}`}
    >
      <Feather name={icon} size={24} color={active ? '#fff' : enabled ? '#1e3a8a' : 'rgba(255,255,255,0.5)'} />
    </View>
  )
}

// =====================================================================
// DualJoystick — TWO sticks sharing ONE raw multi-touch surface.
//
// Like the d-pads, two PanResponder joysticks cannot be used together:
// touching the 2nd stick steals the responder from the 1st. Here every
// touch is assigned to the stick it lands on and tracked independently,
// so BOTH sticks operate simultaneously (drive + steer). Lifting a finger
// releases just that stick: it snaps back to center and reports (0, 0),
// which stops that stick's function (SPD0 / SERVO90) immediately.
// =====================================================================
function DualJoystick({
  canControl, rightEnabled, onLeft, onRight, height = 200,
}: {
  canControl: boolean
  rightEnabled: boolean
  onLeft: (x: number, y: number) => void
  onRight: (x: number) => void
  height?: number
}) {
  const [geo, setGeo] = useState<{ w: number; h: number } | null>(null)
  const touchesRef = useRef(new Map<string, { stick: 'L' | 'R'; ox: number; oy: number }>())
  const [knobL, setKnobL] = useState({ x: 0, y: 0 })
  const [knobR, setKnobR] = useState({ x: 0, y: 0 })

  const canControlRef = useRef(canControl)
  canControlRef.current = canControl
  const rightEnabledRef = useRef(rightEnabled)
  rightEnabledRef.current = rightEnabled
  const onLeftRef = useRef(onLeft)
  onLeftRef.current = onLeft
  const onRightRef = useRef(onRight)
  onRightRef.current = onRight

  const radius = geo ? Math.min(geo.w * 0.28, geo.h * 0.42, 100) : 0
  const centerOf = (stick: 'L' | 'R') =>
    geo ? { cx: geo.w * (stick === 'L' ? 0.25 : 0.75), cy: geo.h * 0.5 } : { cx: 0, cy: 0 }

  const resolveStick = (x: number, y: number): 'L' | 'R' => {
    if (!geo) return 'L'
    const l = centerOf('L')
    const r = centerOf('R')
    return Math.hypot(x - l.cx, y - l.cy) <= Math.hypot(x - r.cx, y - r.cy) ? 'L' : 'R'
  }

  const applyKnob = (stick: 'L' | 'R', dx: number, dy: number, report = true) => {
    const cap = radius || 1
    let nx = dx
    let ny = dy
    const dist = Math.hypot(nx, ny)
    if (dist > cap) {
      nx = (nx / dist) * cap
      ny = (ny / dist) * cap
    }
    if (stick === 'L') {
      setKnobL({ x: nx, y: ny })
      if (report) onLeftRef.current(nx / cap, ny / cap)
    } else {
      setKnobR({ x: nx, y: ny })
      if (report) onRightRef.current(nx / cap)
    }
  }

  const mapTouches = (list: { identifier: string; pageX: number; pageY: number }[]) =>
    list.map((t) => ({ identifier: t.identifier, pageX: t.pageX, pageY: t.pageY }))

  const handleStart = (touches: TouchPoint[]) => {
    if (!canControlRef.current) return
    for (const t of touches) {
      if (touchesRef.current.has(t.identifier)) continue
      const stick = resolveStick(t.pageX, t.pageY)
      if (stick === 'R' && !rightEnabledRef.current) continue
      touchesRef.current.set(t.identifier, { stick, ox: t.pageX, oy: t.pageY })
    }
  }

  const handleMove = (touches: TouchPoint[]) => {
    if (!canControlRef.current) return
    for (const t of touches) {
      const ent = touchesRef.current.get(t.identifier)
      if (!ent) continue
      applyKnob(ent.stick, t.pageX - ent.ox, t.pageY - ent.oy)
    }
  }

  const handleRelease = (changed: TouchPoint[]) => {
    for (const t of changed) {
      const ent = touchesRef.current.get(t.identifier)
      if (!ent) continue
      touchesRef.current.delete(t.identifier)
      let anyLeft = false
      for (const [, v] of touchesRef.current) {
        if (v.stick === ent.stick) {
          anyLeft = true
          break
        }
      }
      if (!anyLeft) applyKnob(ent.stick, 0, 0)
    }
  }

  const base = radius + 24
  const knobSize = 48

  return (
    <View
      onLayout={(e) => {
        const { width, height: h } = e.nativeEvent.layout
        setGeo((g) => (g && g.w === width && g.h === h ? g : { w: width || 1, h: h || 1 }))
      }}
      onTouchStart={(e) => handleStart(mapTouches(e.nativeEvent.touches))}
      onTouchMove={(e) => handleMove(mapTouches(e.nativeEvent.touches))}
      onTouchEnd={(e) => handleRelease(mapTouches(e.nativeEvent.changedTouches))}
      onTouchCancel={(e) => handleRelease(mapTouches(e.nativeEvent.changedTouches))}
      style={{ height }}
      className="relative overflow-hidden rounded-2xl border border-line bg-surface"
    >
      {geo && radius > 0 && (
        <>
          {(['L', 'R'] as const).map((stick) => {
            const c = centerOf(stick)
            const enabled = stick === 'L' || rightEnabled
            const knob = stick === 'L' ? knobL : knobR
            return (
              <View key={stick}>
                <View
                  className={`absolute rounded-full border-2 ${enabled ? 'border-white/10 bg-white/5' : 'border-white/10 bg-white/5 opacity-40'}`}
                  style={{
                    left: c.cx - base,
                    top: c.cy - base,
                    width: base * 2,
                    height: base * 2,
                  }}
                >
                  <View className="absolute left-1/2 top-1/2 h-1 w-1 -ml-0.5 -mt-0.5 rounded-full bg-white/20" />
                </View>
                <View
                  className={`absolute rounded-full border-2 bg-white shadow-sm ${enabled ? 'border-navy' : 'border-white/10'}`}
                  style={{
                    left: c.cx + knob.x - knobSize / 2,
                    top: c.cy + knob.y - knobSize / 2,
                    width: knobSize,
                    height: knobSize,
                  }}
                />
              </View>
            )
          })}
        </>
      )}
    </View>
  )
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

  const maxSteer = steerLimit != null ? steerLimit : limits.maxSteerDeviation

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
      // Convention: stick UP (y < 0) = forward (positive), stick DOWN = backward (negative)
      onSignedDrive(y < 0 ? mag : -mag)
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
    // Convention: stick LEFT (x < 0) = steer left (servo < 90), stick RIGHT = steer right (servo > 90)
    let dev = Math.round(x * 90)
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
        /* Dual joysticks — ONE multi-touch surface so both work together */
        <View>
          <View className="mb-2 flex-row items-center justify-center gap-12">
<Text className="text-sm font-bold uppercase tracking-wide text-border">
               Drive {is2wd1m ? '(Motor)' : '(Left)'}
             </Text>
             <Text className="text-sm font-bold uppercase tracking-wide text-border">
               Steer {is2wd1m ? '(Servo)' : '(Unused)'}
             </Text>
          </View>
          <DualJoystick
            canControl={canControl}
            rightEnabled={is2wd1m}
            onLeft={handleLeftJoy}
            onRight={handleRightJoy}
          />
<Text className="mt-3 text-center text-sm text-muted">
             {is2wd1m && onSignedDrive
               ? 'Both sticks work together · release a stick to stop it'
               : is2wd1m
                 ? 'Left drives · Right steers (2WD1M)'
                 : 'Left drives · Right is unused in this mode'}
           </Text>
        </View>
      ) : (
        /* Dual complete d-pads for EVERY robocar mode (one multi-touch
           surface — non-functional buttons stay visible but dimmed) */
        <View>
          <DualDpad
            canControl={canControl}
            speed={clampSpeed(speed, limits)}
            steerLimit={maxSteer}
            is2wd1m={is2wd1m}
            onSignedDrive={onSignedDrive}
            sendDir={sendDir}
            onServo={onServo}
            limits={limits}
            onHaptic={hapticTap}
          />

          <View className="mt-3 flex-row items-center justify-center">
            <Pressable onPress={stopAll2wd1m} disabled={!canControl} className="flex-row items-center gap-2 rounded-full bg-slate-200 px-6 py-3 disabled:opacity-40">
              <Feather name="stop-circle" size={16} color="#1e3a8a" />
              <Text className="text-sm font-black text-navy">Stop</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Speed (clamped to the ESP-remote safe PWM/speed ceiling) with a
          slider AND −/+ steppers, in a compact row */}
      {showSpeed && (
        <View className="mt-4 rounded-xl border border-line bg-surface p-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-bold uppercase tracking-wide text-border">Speed</Text>
            <Text className="font-mono text-sm font-bold text-navy">{clampSpeed(speed, limits)}</Text>
          </View>
          <Slider
            value={clampSpeed(speed, limits)}
            minimumValue={0}
            maximumValue={limits.maxSpeed}
            step={5}
            onValueChange={(v: number) => onSpeed(clampSpeed(v, limits))}
            disabled={!canControl}
            minimumTrackTintColor="#1e3a8a"
            maximumTrackTintColor="#cbd5e1"
            thumbTintColor="#1e3a8a"
            className="mt-1"
          />
          <View className="mt-1 flex-row items-center justify-center gap-4">
            <MiniStepperBtn onPress={() => onSpeed(clampSpeed(speed - 5, limits))} disabled={!canControl} icon="minus" />
            <MiniStepperBtn onPress={() => onSpeed(clampSpeed(speed + 5, limits))} disabled={!canControl} icon="plus" />
          </View>
        </View>
      )}

      {/* PID */}
      {showPid && (
        <View className="mt-4 flex-row flex-wrap gap-3">
          <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
<Text className="text-sm font-bold uppercase tracking-wide text-border">PID Tuning</Text>
                    <Slider value={pidKp} minimumValue={0} maximumValue={50} step={0.1} onValueChange={(v: number) => onPid('kp', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
                    <Text className="mt-1 text-right font-mono text-sm text-navy">Kp {pidKp.toFixed(1)}</Text>
          </View>
          <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
            <Slider value={pidKi} minimumValue={0} maximumValue={20} step={0.1} onValueChange={(v: number) => onPid('ki', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
            <Text className="mt-1 text-right font-mono text-sm text-navy">Ki {pidKi.toFixed(1)}</Text>
          </View>
          <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
            <Slider value={pidKd} minimumValue={0} maximumValue={20} step={0.1} onValueChange={(v: number) => onPid('kd', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
            <Text className="mt-1 text-right font-mono text-sm text-navy">Kd {pidKd.toFixed(1)}</Text>
          </View>
          <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
            <Slider value={pidOut} minimumValue={0} maximumValue={255} step={1} onValueChange={(v: number) => onPid('out', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
            <Text className="mt-1 text-right font-mono text-sm text-navy">OUT {pidOut}</Text>
          </View>
          <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
            <Slider value={pidOff} minimumValue={-5} maximumValue={5} step={0.05} onValueChange={(v: number) => onPid('off', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
            <Text className="mt-1 text-right font-mono text-sm text-navy">OFF {pidOff >= 0 ? '+' : ''}{pidOff.toFixed(2)}°</Text>
          </View>
        </View>
      )}

      {/* Start/Stop */}
      {showStartStop && (
        <View className="mt-4 flex-row flex-wrap gap-3">
          <Pressable onPress={() => { hapticTap(); onRun?.() }} disabled={!canControl} className="rounded-full bg-navy px-6 py-3">
            <Text className="text-sm font-black text-white">Run</Text>
          </Pressable>
          <Pressable onPress={() => { hapticTap(); onStop?.() }} disabled={!canControl} className="rounded-full border border-line bg-card px-6 py-3">
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
    hint: 'Both sticks work together · release a stick to stop it',
  },
  {
    id: 'dpad',
    label: 'D-pad',
    hint: 'Two complete d-pads · buttons unused by the mode stay dimmed',
  },
]
