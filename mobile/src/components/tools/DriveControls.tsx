// =====================================================================
// DriveControls — the drive deck shared by the Remote window (compact)
// and legacy portrait callers (full mode).
//
// Round 6 REBUILD (touch root cause):
// The old pads compared ROOT-VIEW touch coordinates (pageX/pageY) against
// WINDOW-space rects (measureInWindow). On Android those two spaces differ
// by the status-bar / display-cutout insets — so every hit zone sat
// shifted from the drawn cells, no matter how often it was re-measured.
// The correct model needs NO window math at all:
//
//   • D-pad: the pad surface captures RAW multi-touch through PanResponder
//     and reads evt.locationX/locationY — coordinates relative to the
//     touch surface itself, i.e. the exact space the cells are laid out in.
//     The surface's own size comes from onLayout (also container-local).
//     Touch offset is impossible by construction; nothing is re-measured
//     per touch (no bridge round-trips → no lag).
//   • Joysticks: same — one PanResponder surface, locationX/Y against the
//     onLayout size, both sticks working together via touch identifiers.
//
// Buttons (Stop pill, steppers, E-stop) are plain native Pressables —
// native hit-testing, instant, no JS hit-testing layer.
//
// Compact mode (Remote window): board fills its flex parent, no Stop pill,
// no deck speed slider (the chrome row has its own strip).
// =====================================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PanResponder, Pressable, Text, View, Vibration } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import Slider from '@react-native-community/slider'
import type { DriveControlsProps, SafetyLimits } from './types'
import { DRIVE_CMD_MIN_INTERVAL_MS } from './controlConstants'

type IconName = ComponentProps<typeof Feather>['name']

const DEFAULT_SAFETY_LIMITS: SafetyLimits = {
  maxSpeed: 255,
  maxSignedDrive: 255,
  servoCenter: 90,
  maxSteerDeviation: 90,
  maxTrim: 90,
}

function clampSpeed(value: number, limits: SafetyLimits): number {
  const v = Math.round(value)
  return Math.max(0, Math.min(limits.maxSpeed, v))
}

function clampSignedDrive(value: number, limits: SafetyLimits): number {
  const v = Math.round(value)
  return Math.max(-limits.maxSignedDrive, Math.min(limits.maxSignedDrive, v))
}

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

type PadZone = 'F' | 'B' | 'L' | 'R' | 'C'
type PadId = 'L' | 'R'

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
// DualDpad — TWO complete d-pads on ONE raw multi-touch surface.
//
// Touch model (round 6 rebuild): the whole pad area is a single
// PanResponder that reads locationX/locationY — coordinates in the
// SURFACE's own space. Left pad owns x < splitX, right pad owns the rest,
// where splitX comes from the surface's onLayout width (same space the
// two pad columns are flexed into). Each pad maps its local point to a
// 3×3 zone: center = C (stop), dominant axis = F/B/L/R.
//
// Perf: cells only re-render when the pressed-zone set changes
// (signature-gated state), and nothing measures anything per touch.
// =====================================================================
function DualDpad({
  canControl, speed, steerLimit, is2wd1m, onSignedDrive, sendDir, onServo, limits, onHaptic, compact = false,
  navActiveRef, onNavInput,
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
  compact?: boolean
  navActiveRef?: { current: boolean }
  onNavInput?: (axis: 'x' | 'y', value: -1 | 0 | 1) => void
}) {
  // Surface size in ITS OWN space (onLayout) — the same space locationX/Y
  // are reported in. No window/page coordinates anywhere.
  const [surf, setSurf] = useState<{ w: number; h: number } | null>(null)
  const [activeCells, setActiveCells] = useState<ActiveCellSet>({})
  const [firedHaptic, setFiredHaptic] = useState(false)

  // Always-fresh values for the pan handlers (no stale closures).
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
  const onNavInputRef = useRef(onNavInput)
  onNavInputRef.current = onNavInput

  // Track touches by identifier; the pad+zone each finger is currently in.
  const touchesRef = useRef(new Map<string, { pad: PadId; zone: PadZone }>())

  type ActiveCellSet = Partial<Record<'L1' | 'L2' | 'R1' | 'R2', PadZone>>
  const keyFor = (pad: PadId, idx: 1 | 2) => `${pad}${idx}` as 'L1' | 'L2' | 'R1' | 'R2'

  // Map a surface-local point to a pad and zone.
  const resolvePoint = useCallback((x: number, y: number): { pad: PadId; zone: PadZone } | null => {
    if (!surf || surf.w <= 0) return null
    const pad: PadId = x < surf.w / 2 ? 'L' : 'R'
    // Each pad column spans [0, w/2) or [w/2, w); local point within it:
    const lx = pad === 'L' ? x : x - surf.w / 2
    const pw = surf.w / 2
    // 3×3 grid with the middle row full-width F/B on top/bottom; center
    // zone is a middle rect. Dominant axis decides L/R vs F/B.
    const dx = lx - pw / 2
    const dy = y - surf.h / 2
    const zone: PadZone =
      Math.abs(dx) < pw * 0.18 && Math.abs(dy) < surf.h * 0.18 ? 'C'
        : Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? 'F' : 'B')
          : (dx < 0 ? 'L' : 'R')
    return { pad, zone }
  }, [surf])

  // Emit commands from the current multi-touch state.
  const emit = useCallback((touches: Map<string, { pad: PadId; zone: PadZone }>) => {
    const s = stRef.current
    if (!s.canControl) return
    const en = enabledZones(s.is2wd1m)
    const lZones: PadZone[] = []
    const rZones: PadZone[] = []
    for (const [, cell] of touches) {
      if (cell.pad === 'L') {
        if (en.L.includes(cell.zone)) lZones.push(cell.zone)
      } else if (en.R.includes(cell.zone)) rZones.push(cell.zone)
    }
    const has = (arr: PadZone[], z: PadZone) => arr.includes(z)

    // NAV routing (ESP-remote parity): while NAV is active the pads drive
    // the top-bar cursor / values and NOTHING is sent to the car — the
    // physical remote forbids driving and editing at the same time. Both
    // pads emit nav directions (F=up B=down L=left R=right); the NAV state
    // machine debounces (NAV_DEBOUNCE 120ms) and repeats while held.
    if (navActiveRef?.current && onNavInputRef.current) {
      const nav = (z: PadZone) => {
        if (z === 'F') onNavInputRef.current!('y', -1)
        else if (z === 'B') onNavInputRef.current!('y', 1)
        else if (z === 'L') onNavInputRef.current!('x', -1)
        else if (z === 'R') onNavInputRef.current!('x', 1)
      }
      if (lZones.length) nav(lZones[lZones.length - 1]!)
      if (rZones.length) nav(rZones[rZones.length - 1]!)
      return
    }

    if (s.is2wd1m) {
      // Left pad → motor (signed SPD), right pad → servo steer.
      // Steering parity with the physical remote: LEFT → servo angle
      // INCREASES around center 90 (turn left = larger angle), right stick
      // inverted mapping from comms.cpp processDriveForCurrentMode().
      const fwd = has(lZones, 'F')
      const back = has(lZones, 'B')
      const spd = has(lZones, 'C') ? 0 : fwd && back ? 0 : fwd ? s.speed : back ? -s.speed : 0
      const l = has(rZones, 'L')
      const r = has(rZones, 'R')
      const servo = l === r ? limitsRef.current.servoCenter
        : l ? limitsRef.current.servoCenter + s.steerLimit
          : limitsRef.current.servoCenter - s.steerLimit
      // Stream through the same clamped path the joysticks use.
      const sd = clampSignedDrive(spd, limitsRef.current)
      if (onSignedDriveRef.current) onSignedDriveRef.current(sd)
      else sendDirRef.current(sd > 0 ? 'F' : sd < 0 ? 'B' : 'S')
      onServoRef.current(clampServo(servo, limitsRef.current))
    } else {
      const d: 'F' | 'B' | 'L' | 'R' | 'S' =
        has(lZones, 'C') ? 'S'
          : has(lZones, 'F') ? 'F'
            : has(lZones, 'B') ? 'B'
              : has(lZones, 'L') ? 'L'
                : has(lZones, 'R') ? 'R'
                  : 'S'
      sendDirRef.current(d)
    }
  }, [navActiveRef])

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => { syncTouches(evt.nativeEvent.touches, true) },
    onPanResponderMove: (evt) => { syncTouches(evt.nativeEvent.touches, false) },
    onPanResponderRelease: (evt) => { dropTouches(evt.nativeEvent.changedTouches) },
    onPanResponderTerminate: (evt) => { dropTouches(evt.nativeEvent.changedTouches) },
  }), [])

  // Sync the tracked touches from the current native touch list. On grant
  // (first contact) functional-entry fires a haptic tick.
  const syncTouches = (nativeTouches: readonly { identifier: number | string; locationX: number; locationY: number }[], isGrant: boolean) => {
    let hapticNeeded = false
    for (const t of nativeTouches) {
      const hit = resolvePoint(t.locationX, t.locationY)
      if (!hit) continue
      const id = String(t.identifier)
      const prev = touchesRef.current.get(id)
      if (prev && prev.pad === hit.pad && prev.zone === hit.zone) continue
      touchesRef.current.set(id, hit)
      const en = enabledZones(stRef.current.is2wd1m)
      const functional = hit.pad === 'L' ? en.L.includes(hit.zone) : en.R.includes(hit.zone)
      if (functional) hapticNeeded = true
    }
    if (hapticNeeded && isGrant && !firedHaptic) {
      setFiredHaptic(true)
      onHapticRef.current?.()
      setTimeout(() => setFiredHaptic(false), 60)
    }
    publishState()
    emit(touchesRef.current)
  }

  const dropTouches = (changed: readonly { identifier: number | string }[]) => {
    for (const t of changed) touchesRef.current.delete(String(t.identifier))
    publishState()
    emit(touchesRef.current)
  }

  // Render state: which keys are active. Signature-gated to avoid
  // re-rendering the whole pad tree on every move event.
  const publishState = () => {
    const next: ActiveCellSet = {}
    const seen = new Set<string>()
    for (const [id, cell] of touchesRef.current) {
      // One finger per pad zone slot; extra fingers in the same zone are
      // still tracked for the emit path but only the first lights a key.
      const sig = cell.pad + cell.zone
      if (seen.has(sig)) continue
      seen.add(sig)
      // Assign to slot 1 or 2 per pad for rendering (up to 2 shown).
      const key = keyFor(cell.pad, next[keyFor(cell.pad, 1)] ? 2 : 1)
      next[key] = cell.zone
    }
    const sig = Object.keys(next).sort().map((k) => `${k}:${next[k as keyof ActiveCellSet]}`).join(',')
    setActiveCells((prev) => {
      const prevSig = Object.keys(prev).sort().map((k) => `${k}:${prev[k as keyof ActiveCellSet]}`).join(',')
      return sig === prevSig ? prev : next
    })
  }

  const onHapticRef = useRef(onHaptic)
  onHapticRef.current = onHaptic

  // Hold-resend cadence (ESP-remote parity, DRIVE_RESEND_MS = 30): while any
  // functional cell is held, keep re-emitting the CURRENT command so a dropped
  // BT/WiFi line self-heals — exactly like the physical remote's loop.
  const anyActive = Object.keys(activeCells).length > 0
  useEffect(() => {
    if (!canControl || !anyActive) return
    const id = setInterval(() => emit(touchesRef.current), DRIVE_CMD_MIN_INTERVAL_MS)
    return () => clearInterval(id)
  }, [canControl, anyActive, emit])

  // Release everything when control is lost.
  useEffect(() => {
    if (canControl) return
    touchesRef.current.clear()
    publishState()
  }, [canControl])

  const cellActive = (pad: PadId, zone: PadZone) =>
    Object.values(activeCells).some((z, i) => z === zone && Object.keys(activeCells)[i]?.startsWith(pad))

  const en = enabledZones(is2wd1m)

  const padView = (pad: PadId) => (
    <View className="min-h-0 flex-1 items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-2 py-2">
      <View className="flex h-full w-full max-w-[240px] flex-col gap-1.5">
        <DpadCell icon={PAD_ICONS.F} active={cellActive(pad, 'F')} enabled={en[pad].includes('F')} compact={compact} />
        <View className="min-h-0 flex-1 flex-row gap-1.5">
          <DpadCell icon={PAD_ICONS.L} active={cellActive(pad, 'L')} enabled={en[pad].includes('L')} compact={compact} />
          <DpadCell
            icon={pad === 'L' ? 'stop-circle' : 'circle'}
            active={cellActive(pad, 'C')}
            enabled={en[pad].includes('C')}
            compact={compact}
          />
          <DpadCell icon={PAD_ICONS.R} active={cellActive(pad, 'R')} enabled={en[pad].includes('R')} compact={compact} />
        </View>
        <DpadCell icon={PAD_ICONS.B} active={cellActive(pad, 'B')} enabled={en[pad].includes('B')} compact={compact} />
      </View>
    </View>
  )

  return (
    <View className="min-h-0 flex-1">
      {/* The whole pad area is ONE PanResponder surface. locationX/Y are
          surface-local, so hit zones sit exactly on the drawn cells by
          construction — no measuring, no coordinate-space mismatch. */}
      <View
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout
          setSurf((s) => (s && s.w === width && s.h === height ? s : { w: width || 1, h: height || 1 }))
        }}
        {...panResponder.panHandlers}
        className="min-h-0 flex-1 flex-row items-stretch gap-2"
      >
        {padView('L')}
        {padView('R')}
      </View>
    </View>
  )
}

/** One cell of a complete d-pad. All cells share the SAME styling and the
    SAME flex growth (uniform size); the center is stop-ish and
    non-functional buttons stay visible but dimmed. Cells are VISUAL ONLY —
    touches are zone-mapped by the parent surface. */
function DpadCell({ icon, active, enabled, compact }: {
  icon: IconName
  active: boolean
  enabled: boolean
  compact?: boolean
}) {
  return (
    <View
      pointerEvents="none"
      className={`min-h-0 flex-1 items-center justify-center rounded-xl ${
        active ? 'bg-navy'
          : enabled ? (compact ? 'border border-emerald-400/60' : 'border border-navy')
            : 'border border-white/10 opacity-50'
      }`}
    >
      <Feather
        name={icon}
        size={compact ? 24 : 28}
        color={active ? '#fff' : enabled ? (compact ? '#34d399' : '#1e3a8a') : 'rgba(255,255,255,0.5)'}
      />
    </View>
  )
}

// =====================================================================
// DualJoystick — TWO sticks sharing ONE PanResponder surface.
//
// Round 6: locationX/locationY (surface-local) replace pageX/pageY +
// window math. A touch belongs to whichever stick CENTER is closer; its
// origin is the stick center itself (re-grab anywhere re-centers the
// knob), matching physical game controllers. Both sticks work together
// via touch identifiers; lifting a finger snaps that stick back to
// center and reports (0, 0) — SPD0 / SERVO90 immediately.
// =====================================================================
function DualJoystick({
  canControl, rightEnabled, onLeft, onRight, height = 220, fill = false,
  navActiveRef, onNavInput,
}: {
  canControl: boolean
  rightEnabled: boolean
  onLeft: (x: number, y: number) => void
  onRight: (x: number) => void
  height?: number
  /** When true the surface fills its flex parent instead of a fixed height. */
  fill?: boolean
  navActiveRef?: { current: boolean }
  onNavInput?: (axis: 'x' | 'y', value: -1 | 0 | 1) => void
}) {
  const [geo, setGeo] = useState<{ w: number; h: number } | null>(null)
  const touchesRef = useRef(new Map<string, { stick: 'L' | 'R' }>())
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
  const onNavInputRef = useRef(onNavInput)
  onNavInputRef.current = onNavInput

  // Last reported normalized positions — re-sent by the hold-resend interval
  // so a held stick keeps streaming (DRIVE_RESEND_MS parity, self-heals).
  const lastLRef = useRef({ x: 0, y: 0 })
  const lastRRef = useRef(0)

  const radius = geo ? Math.min(geo.w * 0.28, geo.h * 0.42, 124) : 0
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
      if (report) {
        const nX = nx / cap
        const nY = ny / cap
        lastLRef.current = { x: nX, y: nY }
        // NAV routing (ESP-remote parity): the stick navigates the top-bar
        // fields (up/down = value adjust, left/right = field switch) and
        // never drives while NAV is active.
        if (navActiveRef?.current && onNavInputRef.current) {
          if (Math.abs(nX) >= Math.abs(nY)) {
            if (Math.abs(nX) > 0.35) onNavInputRef.current('x', nX < 0 ? -1 : 1)
          } else if (Math.abs(nY) > 0.35) {
            onNavInputRef.current('y', nY < 0 ? -1 : 1)
          }
          return
        }
        onLeftRef.current(nX, nY)
      }
    } else {
      setKnobR({ x: nx, y: ny })
      if (report) {
        const nX = nx / cap
        lastRRef.current = nX
        if (navActiveRef?.current && onNavInputRef.current) {
          if (Math.abs(nX) >= 0.35) onNavInputRef.current('x', nX < 0 ? -1 : 1)
          return
        }
        onRightRef.current(nX)
      }
    }
  }

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      for (const t of evt.nativeEvent.touches) grab(String(t.identifier), t.locationX, t.locationY)
    },
    onPanResponderMove: (evt) => {
      const c = evt.nativeEvent.touches
      for (const t of c) {
        const ent = touchesRef.current.get(String(t.identifier))
        if (!ent) continue
        const center = centerOf(ent.stick)
        applyKnob(ent.stick, t.locationX - center.cx, t.locationY - center.cy)
      }
    },
    onPanResponderRelease: (evt) => release(evt.nativeEvent.changedTouches),
    onPanResponderTerminate: (evt) => release(evt.nativeEvent.changedTouches),
  }), [geo, radius])

  const grab = (id: string, x: number, y: number) => {
    if (!canControlRef.current) return
    if (touchesRef.current.has(id)) return
    const stick = resolveStick(x, y)
    if (stick === 'R' && !rightEnabledRef.current) return
    touchesRef.current.set(id, { stick })
  }

  const release = (changed: readonly { identifier: number | string }[]) => {
    const dropped = new Set<'L' | 'R'>()
    for (const t of changed) {
      const ent = touchesRef.current.get(String(t.identifier))
      if (!ent) continue
      touchesRef.current.delete(String(t.identifier))
      dropped.add(ent.stick)
    }
    // If another finger still holds the same stick, keep it; else snap back.
    for (const stick of dropped) {
      let still = false
      for (const [, v] of touchesRef.current) if (v.stick === stick) { still = true; break }
      if (!still) applyKnob(stick, 0, 0)
    }
  }

  // Hold-resend (DRIVE_RESEND_MS parity): while any stick is grabbed, keep
  // re-reporting the last position every 30ms so a dropped line self-heals
  // and the car's safe-stop never fires on a held stick.
  useEffect(() => {
    if (!canControl) return
    const id = setInterval(() => {
      if (touchesRef.current.size === 0) return
      if (navActiveRef?.current) return
      onLeftRef.current(lastLRef.current.x, lastLRef.current.y)
      if (rightEnabledRef.current) onRightRef.current(lastRRef.current)
    }, DRIVE_CMD_MIN_INTERVAL_MS)
    return () => clearInterval(id)
  }, [canControl, navActiveRef])

  const base = radius + 24
  const knobSize = 56

  return (
    <View
      onLayout={(e) => {
        const { width, height: h } = e.nativeEvent.layout
        setGeo((g) => (g && g.w === width && g.h === h ? g : { w: width || 1, h: h || 1 }))
      }}
      {...panResponder.panHandlers}
      style={fill ? { flex: 1 } : { height }}
      className="relative overflow-hidden rounded-2xl border border-line bg-surface"
    >
      {geo && radius > 0 && (
        <>
          {(['L', 'R'] as const).map((stick) => {
            const c = centerOf(stick)
            const enabled = stick === 'L' || rightEnabled
            const dim = !enabled
            const knob = stick === 'L' ? knobL : knobR
            const tag = stick === 'L' ? 'DRIVE' : rightEnabled ? 'STEER' : 'UNUSED'
            const guide = radius * 0.46
            return (
              <View key={stick}>
                {/* Pad tag — floats above each stick zone */}
                <View
                  pointerEvents="none"
                  className={dim ? 'opacity-50' : 'opacity-80'}
                  style={{ position: 'absolute', left: c.cx - 30, width: 60, alignItems: 'center', top: Math.max(4, c.cy - radius - 26) }}
                >
                  <Text className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">{tag}</Text>
                </View>
                {/* Outer base ring */}
                <View
                  pointerEvents="none"
                  className="absolute items-center justify-center rounded-full border-2"
                  style={{
                    left: c.cx - base,
                    top: c.cy - base,
                    width: base * 2,
                    height: base * 2,
                    borderColor: dim ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.15)',
                    backgroundColor: dim ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)',
                    opacity: dim ? 0.45 : 1,
                  }}
                >
                  {/* Travel guide ring */}
                  <View
                    className="absolute rounded-full border"
                    style={{
                      width: radius * 0.92,
                      height: radius * 0.92,
                      borderRadius: radius * 0.46,
                      top: base - guide,
                      left: base - guide,
                      borderColor: 'rgba(255,255,255,0.14)',
                    }}
                  />
                  {/* Crosshair */}
                  <View
                    style={{
                      position: 'absolute',
                      left: base * 0.15,
                      top: base - 1,
                      width: base * 1.7,
                      height: 1,
                      backgroundColor: 'rgba(255,255,255,0.12)',
                    }}
                  />
                  <View
                    style={{
                      position: 'absolute',
                      left: base - 1,
                      top: base * 0.15,
                      width: 1,
                      height: base * 1.7,
                      backgroundColor: 'rgba(255,255,255,0.12)',
                    }}
                  />
                  {/* Center reticule */}
                  <View
                    style={{
                      position: 'absolute',
                      left: base - 7,
                      top: base - 7,
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      borderWidth: 1,
                      borderColor: 'rgba(30,58,138,0.85)',
                      backgroundColor: 'rgba(30,58,138,0.22)',
                    }}
                  />
                </View>
                {/* Knob */}
                <View
                  pointerEvents="none"
                  className="absolute rounded-full bg-white"
                  style={{
                    left: c.cx + knob.x - knobSize / 2,
                    top: c.cy + knob.y - knobSize / 2,
                    width: knobSize,
                    height: knobSize,
                    borderWidth: 2,
                    borderColor: enabled ? '#1e3a8a' : 'rgba(100,116,139,0.9)',
                    opacity: dim ? 0.55 : 1,
                    shadowColor: '#0f172a',
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.35,
                    shadowRadius: 6,
                    elevation: 6,
                  }}
                >
                  <View className="absolute left-1/2 top-1/2 h-3 w-3 -ml-1.5 -mt-1.5 rounded-full bg-navy shadow-sm" />
                </View>
              </View>
            )
          })}
        </>
      )}
    </View>
  )
}

// =====================================================================
// DriveControls — public component (unchanged contract).
// =====================================================================
export function DriveControls({
  canControl, isDrone, activeMode, speed, servo,
  pidKp, pidKi, pidKd, pidOut, pidOff, useJoystick,
  onDirection, onSpeed, onServo, onPid, onRun, onStop,
  onSignedDrive, steerLimit, onEStop,
  safetyLimits, compact = false, navActiveRef, onNavInput,
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

  // Stop everything (2WD1M center button — full mode only; the compact
  // remote uses the pads' center cells + the E-stop FAB instead).
  const stopAll2wd1m = useCallback(() => {
    hapticTap()
    if (onSignedDrive) onSignedDrive(0)
    onServo(limits.servoCenter)
  }, [hapticTap, onSignedDrive, onServo, limits])

  // Left joystick: drives direction. With ESP-remote parity (onSignedDrive)
  // the 2WD1M stick streams signed SPD like the physical remote: forward is
  // +SPD, backward is -SPD, magnitude proportional to deflection, quantized
  // to 5-unit steps, and center (release) sends SPD0 = transient stop.
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
    const d = is2wd1m
      ? (y < -0.25 ? 'F' : y > 0.25 ? 'B' : 'S')
      : joyToDirection(x, y)
    sendDir(d)
  }, [canControl, is2wd1m, onSignedDrive, sendDir, limits])

  // Right joystick X axis: steers servo in 2WD1M, clamped to ±steerLimit.
  // Parity with the physical remote (comms.cpp): LEFT → servo angle INCREASES
  // (turn left = larger angle), right → decreases.
  const handleRightJoy = useCallback((x: number) => {
    if (!canControl || !is2wd1m) return
    let dev = Math.round(x * 90)
    if (onSignedDrive && steerLimit != null) {
      dev = Math.max(-steerLimit, Math.min(steerLimit, dev))
    }
    const rawServo = limits.servoCenter - dev
    const safeServo = clampServo(rawServo, limits)
    onServo(safeServo)
  }, [canControl, is2wd1m, onSignedDrive, steerLimit, onServo, limits])

  if (isDrone) return null

  return (
    <View className={canControl ? (compact ? 'min-h-0 flex-1' : '') : (compact ? 'min-h-0 flex-1 opacity-40' : 'opacity-40')}>
      {/* ── Input mode: Joystick or D-pad ── */}
      {useJoystick ? (
        <View className={compact ? 'min-h-0 flex-1' : ''}>
          {!compact && (
            <View className="mb-2 flex-row items-center justify-center gap-12">
              <Text className="text-sm font-bold uppercase tracking-wide text-border">
                Drive {is2wd1m ? '(Motor)' : '(Left)'}
              </Text>
              <Text className="text-sm font-bold uppercase tracking-wide text-border">
                Steer {is2wd1m ? '(Servo)' : '(Unused)'}
              </Text>
            </View>
          )}
          <DualJoystick
            canControl={canControl}
            rightEnabled={is2wd1m}
            onLeft={handleLeftJoy}
            onRight={handleRightJoy}
            fill={compact}
            navActiveRef={navActiveRef}
            onNavInput={onNavInput}
          />
          {!compact && (
            <Text className="mt-3 text-center text-sm text-muted">
              {is2wd1m && onSignedDrive
                ? 'Both sticks work together · release a stick to stop it'
                : is2wd1m
                  ? 'Left drives · Right steers (2WD1M)'
                  : 'Left drives · Right is unused in this mode'}
            </Text>
          )}
        </View>
      ) : (
        <View className={compact ? 'min-h-0 flex-1' : ''}>
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
            compact={compact}
            navActiveRef={navActiveRef}
            onNavInput={onNavInput}
          />

          {!compact && (
            <View className="mt-3 flex-row items-center justify-center">
              <Pressable onPress={stopAll2wd1m} disabled={!canControl} className="flex-row items-center gap-2 rounded-full bg-slate-200 px-6 py-3 disabled:opacity-40">
                <Feather name="stop-circle" size={16} color="#1e3a8a" />
                <Text className="text-sm font-black text-navy">Stop</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* Speed (clamped to the ESP-remote safe PWM/speed ceiling) with a
          slider AND −/+ steppers. Compact renders its own chrome-row strip
          instead — the deck-bottom strip is gone in compact. */}
      {showSpeed && !compact && (
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
      {showPid && !compact && (
        <View className="mt-4 flex-row flex-wrap gap-3">
          <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
            <Text className="text-sm font-bold uppercase tracking-wide text-border">PID Tuning</Text>
            <Slider value={pidKp} minimumValue={0} maximumValue={50} step={0.1} onValueChange={(v: number) => onPid('kp', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
            <Text className="mt-1 text-right font-mono text-sm text-navy">Kp {pidKp.toFixed(1)}</Text>
          </View>
          <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
            <Text className="text-sm font-bold uppercase tracking-wide text-border">PID Tuning</Text>
            <Slider value={pidKi} minimumValue={0} maximumValue={20} step={0.1} onValueChange={(v: number) => onPid('ki', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
            <Text className="mt-1 text-right font-mono text-sm text-navy">Ki {pidKi.toFixed(1)}</Text>
          </View>
          <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
            <Text className="text-sm font-bold uppercase tracking-wide text-border">PID Tuning</Text>
            <Slider value={pidKd} minimumValue={0} maximumValue={20} step={0.1} onValueChange={(v: number) => onPid('kd', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
            <Text className="mt-1 text-right font-mono text-sm text-navy">Kd {pidKd.toFixed(1)}</Text>
          </View>
          <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
            <Text className="text-sm font-bold uppercase tracking-wide text-border">PID Tuning</Text>
            <Slider value={pidOut} minimumValue={0} maximumValue={255} step={1} onValueChange={(v: number) => onPid('out', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
            <Text className="mt-1 text-right font-mono text-sm text-navy">OUT {pidOut}</Text>
          </View>
          <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
            <Text className="text-sm font-bold uppercase tracking-wide text-border">PID Tuning</Text>
            <Slider value={pidOff} minimumValue={-5} maximumValue={5} step={0.05} onValueChange={(v: number) => onPid('off', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
            <Text className="mt-1 text-right font-mono text-sm text-navy">OFF {pidOff >= 0 ? '+' : ''}{pidOff.toFixed(2)}°</Text>
          </View>
        </View>
      )}

      {/* Start/Stop */}
      {showStartStop && !compact && (
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
      {onEStop && !compact && (
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
