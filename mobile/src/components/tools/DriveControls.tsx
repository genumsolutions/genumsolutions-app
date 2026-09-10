// =====================================================================
// DriveControls — the drive deck shared by the Remote window (compact)
// and legacy portrait callers (full mode).
//
// Rebuilt from scratch: clean touch handling, standard gamepad layout.
//
// Two input modes:
//   Joystick: two sticks on one PanResponder surface (locationX/Y local)
//   D-pad: two cross-pads on one PanResponder surface (locationX/Y local)
//
// Touch model: PanResponder reads locationX/locationY — coordinates in
// the SURFACE's own space. No window/page math, no measureInWindow.
// Both sticks/pads work together via touch identifiers.
//
// Compact mode (Remote window): fills flex parent, no speed slider/PID.
// Full mode (Control Panel): includes speed, PID, start/stop, E-stop.
// =====================================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PanResponder, Pressable, Text, View, Vibration } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import Slider from '@react-native-community/slider'
import type { DriveControlsProps, SafetyLimits } from './types'
import { DRIVE_CMD_MIN_INTERVAL_MS } from './controlConstants'

type IconName = ComponentProps<typeof Feather>['name']

const DEFAULT_LIMITS: SafetyLimits = {
  maxSpeed: 255, maxSignedDrive: 255,
  servoCenter: 90, maxSteerDeviation: 90, maxTrim: 90,
}

function clampSpeed(v: number, l: SafetyLimits) { return Math.max(100, Math.min(l.maxSpeed, Math.round(v))) }
function clampSigned(v: number, l: SafetyLimits) { return Math.max(-l.maxSignedDrive, Math.min(l.maxSignedDrive, Math.round(v))) }
function clampServo(v: number, l: SafetyLimits) {
  return Math.max(l.servoCenter - l.maxSteerDeviation, Math.min(180, l.servoCenter + l.maxSteerDeviation, Math.round(v)))
}

// ── D-pad helpers ──
type PadZone = 'F' | 'B' | 'L' | 'R' | 'C'
type PadId = 'L' | 'R'

const PAD_ICONS: Record<PadZone, IconName> = {
  F: 'chevron-up', B: 'chevron-down', L: 'chevron-left', R: 'chevron-right', C: 'stop-circle',
}

function enabledZones(is2wd1m: boolean): { L: PadZone[]; R: PadZone[] } {
  if (is2wd1m) return { L: ['F', 'B', 'C'], R: ['L', 'R', 'C'] }
  return { L: ['F', 'B', 'L', 'R', 'C'], R: [] }
}

// ── DpadCell ──
function DpadCell({ icon, active, enabled, position }: {
  icon: IconName; active: boolean; enabled: boolean
  position: 'top' | 'left' | 'center' | 'right' | 'bottom'
}) {
  const radius = position === 'top' ? 'rounded-t-2xl'
    : position === 'bottom' ? 'rounded-b-2xl'
      : position === 'left' ? 'rounded-l-2xl'
        : position === 'right' ? 'rounded-r-2xl'
          : 'rounded-2xl'
  return (
    <View
      pointerEvents="none"
      className={`h-full items-center justify-center ${radius} ${
        active ? 'bg-blue-600 border-2 border-blue-300'
          : enabled ? 'border-2 border-white/25 bg-white/8'
            : 'border border-white/10 bg-white/3 opacity-40'
      }`}
    >
      <Feather
        name={icon} size={24}
        color={active ? '#fff' : enabled ? '#93c5fd' : 'rgba(255,255,255,0.35)'}
      />
    </View>
  )
}

// =====================================================================
// DualDpad — two complete d-pads on ONE raw multi-touch surface.
// One PanResponder, locationX/Y surface-local. Left pad x < split,
// right pad x >= split. Each maps to a 3×3 zone: C=center(stop),
// F/B/L/R=directions.
// =====================================================================
function DualDpad({
  canControl, speed, steerLimit, is2wd1m, onSignedDrive, sendDir, onServo, limits,
  onHaptic, compact, navActiveRef, onNavInput, oledSlot,
}: {
  canControl: boolean; speed: number; steerLimit: number; is2wd1m: boolean
  onSignedDrive?: (s: number) => void; sendDir: (d: 'F' | 'B' | 'L' | 'R' | 'S') => void
  onServo: (v: number) => void; limits: SafetyLimits
  onHaptic?: () => void; compact?: boolean
  navActiveRef?: { current: boolean }; onNavInput?: (a: 'x' | 'y', v: -1 | 0 | 1) => void
  oledSlot?: React.ReactNode
}) {
  const [surf, setSurf] = useState<{ w: number; h: number } | null>(null)
  const [activeCells, setActiveCells] = useState<Partial<Record<'L1' | 'L2' | 'R1' | 'R2', PadZone>>>({})

  const stRef = useRef({ canControl, speed, steerLimit, is2wd1m })
  stRef.current = { canControl, speed, steerLimit, is2wd1m }
  const onSignedDriveRef = useRef(onSignedDrive); onSignedDriveRef.current = onSignedDrive
  const sendDirRef = useRef(sendDir); sendDirRef.current = sendDir
  const onServoRef = useRef(onServo); onServoRef.current = onServo
  const limitsRef = useRef(limits); limitsRef.current = limits
  const onNavInputRef = useRef(onNavInput); onNavInputRef.current = onNavInput
  const onHapticRef = useRef(onHaptic); onHapticRef.current = onHaptic

  // Cache for hold-resend: preserve the other pad's last command.
  const lastDriveRef = useRef(0)
  const lastServoRef = useRef(limits.servoCenter)

  const touchesRef = useRef(new Map<string, { pad: PadId; zone: PadZone }>())
  const firedHapticRef = useRef(false)

  const resolvePoint = useCallback((x: number, y: number): { pad: PadId; zone: PadZone } | null => {
    if (!surf || surf.w <= 0) return null
    const pad: PadId = x < surf.w / 2 ? 'L' : 'R'
    const lx = pad === 'L' ? x : x - surf.w / 2
    const pw = surf.w / 2
    const dx = lx - pw / 2
    const dy = y - surf.h / 2
    const threshold = Math.min(pw, surf.h) * 0.20
    const zone: PadZone =
      Math.abs(dx) < threshold && Math.abs(dy) < threshold ? 'C'
        : Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? 'F' : 'B')
          : (dx < 0 ? 'L' : 'R')
    return { pad, zone }
  }, [surf])

  const emit = useCallback((touches: Map<string, { pad: PadId; zone: PadZone }>) => {
    const s = stRef.current
    if (!s.canControl) return
    const en = enabledZones(s.is2wd1m)
    const lZones: PadZone[] = []
    const rZones: PadZone[] = []
    for (const [, cell] of touches) {
      if (cell.pad === 'L' && en.L.includes(cell.zone)) lZones.push(cell.zone)
      else if (cell.pad === 'R' && en.R.includes(cell.zone)) rZones.push(cell.zone)
    }
    const has = (arr: PadZone[], z: PadZone) => arr.includes(z)

    // NAV routing
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
      const fwd = has(lZones, 'F'), back = has(lZones, 'B')
      const spd = lZones.length === 0 ? lastDriveRef.current
        : has(lZones, 'C') ? 0 : fwd && back ? 0 : fwd ? s.speed : back ? -s.speed : 0
      const l = has(rZones, 'L'), r = has(rZones, 'R')
      const servo = rZones.length === 0 ? lastServoRef.current
        : l === r ? limitsRef.current.servoCenter
          : l ? limitsRef.current.servoCenter + s.steerLimit
            : limitsRef.current.servoCenter - s.steerLimit
      const sd = clampSigned(spd, limitsRef.current)
      lastDriveRef.current = sd
      lastServoRef.current = clampServo(servo, limitsRef.current)
      if (onSignedDriveRef.current) onSignedDriveRef.current(sd)
      else sendDirRef.current(sd > 0 ? 'F' : sd < 0 ? 'B' : 'S')
      onServoRef.current(lastServoRef.current)
    } else {
      const d: PadZone | 'S' = has(lZones, 'C') ? 'C' : has(lZones, 'F') ? 'F'
        : has(lZones, 'B') ? 'B' : has(lZones, 'L') ? 'L' : has(lZones, 'R') ? 'R' : 'S'
      sendDirRef.current(d === 'C' ? 'S' : d)
    }
  }, [navActiveRef])

  const publishState = useCallback(() => {
    const next: Partial<Record<'L1' | 'L2' | 'R1' | 'R2', PadZone>> = {}
    const seen = new Set<string>()
    for (const [, cell] of touchesRef.current) {
      const sig = cell.pad + cell.zone
      if (seen.has(sig)) continue
      seen.add(sig)
      const key = (cell.pad + (next[cell.pad + '1' as 'L1' | 'R1'] ? '2' : '1')) as 'L1' | 'L2' | 'R1' | 'R2'
      next[key] = cell.zone
    }
    const sig = Object.keys(next).sort().map((k) => `${k}:${next[k as keyof typeof next]}`).join(',')
    setActiveCells((prev) => {
      const prevSig = Object.keys(prev).sort().map((k) => `${k}:${prev[k as keyof typeof prev]}`).join(',')
      return sig === prevSig ? prev : next
    })
  }, [])

  const syncTouches = useCallback((nativeTouches: readonly { identifier: number | string; locationX: number; locationY: number }[], isGrant: boolean) => {
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
    if (hapticNeeded && isGrant && !firedHapticRef.current) {
      firedHapticRef.current = true
      onHapticRef.current?.()
      setTimeout(() => { firedHapticRef.current = false }, 60)
    }
    publishState()
    emit(touchesRef.current)
  }, [resolvePoint, publishState, emit])

  const dropTouches = useCallback((changed: readonly { identifier: number | string }[]) => {
    for (const t of changed) touchesRef.current.delete(String(t.identifier))
    publishState()
    emit(touchesRef.current)
  }, [publishState, emit])

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => { syncTouches(evt.nativeEvent.touches, true) },
    onPanResponderMove: (evt) => { syncTouches(evt.nativeEvent.touches, false) },
    onPanResponderRelease: (evt) => { dropTouches(evt.nativeEvent.changedTouches) },
    onPanResponderTerminate: (evt) => { dropTouches(evt.nativeEvent.changedTouches) },
  }), [syncTouches, dropTouches])

  // Hold-resend at 30ms
  const anyActive = Object.keys(activeCells).length > 0
  useEffect(() => {
    if (!canControl || !anyActive) return
    const id = setInterval(() => {
      if (stRef.current.is2wd1m) {
        let hasL = false, hasR = false
        for (const [, cell] of touchesRef.current) {
          if (cell.pad === 'L') hasL = true
          if (cell.pad === 'R') hasR = true
        }
        if (hasL) {
          if (onSignedDriveRef.current) onSignedDriveRef.current(lastDriveRef.current)
          else sendDirRef.current(lastDriveRef.current > 0 ? 'F' : lastDriveRef.current < 0 ? 'B' : 'S')
        }
        if (hasR) onServoRef.current(lastServoRef.current)
      } else {
        emit(touchesRef.current)
      }
    }, DRIVE_CMD_MIN_INTERVAL_MS)
    return () => clearInterval(id)
  }, [canControl, anyActive, emit])

  useEffect(() => {
    if (canControl) return
    touchesRef.current.clear()
    publishState()
  }, [canControl, publishState])

  const cellActive = (pad: PadId, zone: PadZone) =>
    Object.entries(activeCells).some(([k, z]) => k.startsWith(pad) && z === zone)

  const en = enabledZones(is2wd1m)

  const padView = (pad: PadId) => (
    <View className="min-h-0 flex-1 items-center justify-center">
      <View className="h-full w-full max-w-[180px] items-center justify-center gap-1">
        <View className="w-1/3">
          <DpadCell icon={PAD_ICONS.F} active={cellActive(pad, 'F')} enabled={en[pad].includes('F')} position="top" />
        </View>
        <View className="flex w-full flex-1 flex-row gap-1">
          <View className="flex-1">
            <DpadCell icon={PAD_ICONS.L} active={cellActive(pad, 'L')} enabled={en[pad].includes('L')} position="left" />
          </View>
          <View className="flex-1">
            <DpadCell icon={pad === 'L' ? 'stop-circle' : 'circle'} active={cellActive(pad, 'C')} enabled={en[pad].includes('C')} position="center" />
          </View>
          <View className="flex-1">
            <DpadCell icon={PAD_ICONS.R} active={cellActive(pad, 'R')} enabled={en[pad].includes('R')} position="right" />
          </View>
        </View>
        <View className="w-1/3">
          <DpadCell icon={PAD_ICONS.B} active={cellActive(pad, 'B')} enabled={en[pad].includes('B')} position="bottom" />
        </View>
      </View>
    </View>
  )

  return (
    <View className="min-h-0 flex-1">
      <View
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout
          setSurf((s) => (s && s.w === width && s.h === height ? s : { w: width || 1, h: height || 1 }))
        }}
        {...panResponder.panHandlers}
        className="relative min-h-0 flex-1 flex-row items-stretch gap-1"
      >
        {padView('L')}
        {oledSlot && (
          <View pointerEvents="none" className="absolute items-center justify-center"
            style={{ left: '50%', top: '50%', transform: [{ translateX: -64 }, { translateY: -32 }], width: 128, height: 64 }}>
            {oledSlot}
          </View>
        )}
        {padView('R')}
      </View>
    </View>
  )
}

// =====================================================================
// DualJoystick — two sticks on ONE PanResponder surface.
// locationX/Y surface-local. Each touch assigned to nearest stick
// center. Both sticks work together via touch identifiers.
// =====================================================================
function DualJoystick({
  canControl, rightEnabled, onLeft, onRight, fill = false,
  navActiveRef, onNavInput, oledSlot,
}: {
  canControl: boolean; rightEnabled: boolean
  onLeft: (x: number, y: number) => void; onRight: (x: number) => void
  fill?: boolean
  navActiveRef?: { current: boolean }; onNavInput?: (a: 'x' | 'y', v: -1 | 0 | 1) => void
  oledSlot?: React.ReactNode
}) {
  const [geo, setGeo] = useState<{ w: number; h: number } | null>(null)
  const touchesRef = useRef(new Map<string, { stick: 'L' | 'R' }>())
  const [knobL, setKnobL] = useState({ x: 0, y: 0 })
  const [knobR, setKnobR] = useState({ x: 0, y: 0 })

  const canControlRef = useRef(canControl); canControlRef.current = canControl
  const rightEnabledRef = useRef(rightEnabled); rightEnabledRef.current = rightEnabled
  const onLeftRef = useRef(onLeft); onLeftRef.current = onLeft
  const onRightRef = useRef(onRight); onRightRef.current = onRight
  const onNavInputRef = useRef(onNavInput); onNavInputRef.current = onNavInput

  const lastLRef = useRef({ x: 0, y: 0 })
  const lastRRef = useRef(0)

  const radius = geo ? Math.min(geo.w * 0.18, geo.h * 0.30, 85) : 0
  const centerOf = (stick: 'L' | 'R') =>
    geo ? { cx: geo.w * (stick === 'L' ? 0.25 : 0.75), cy: geo.h * 0.5 } : { cx: 0, cy: 0 }

  const resolveStick = (x: number, y: number): 'L' | 'R' => {
    if (!geo) return 'L'
    const l = centerOf('L'), r = centerOf('R')
    return Math.hypot(x - l.cx, y - l.cy) <= Math.hypot(x - r.cx, y - r.cy) ? 'L' : 'R'
  }

  const applyKnob = useCallback((stick: 'L' | 'R', dx: number, dy: number, report = true) => {
    const cap = radius || 1
    let nx = dx, ny = dy
    const dist = Math.hypot(nx, ny)
    if (dist > cap) { nx = (nx / dist) * cap; ny = (ny / dist) * cap }
    if (stick === 'L') {
      setKnobL({ x: nx, y: ny })
      if (report) {
        const nX = nx / cap, nY = ny / cap
        lastLRef.current = { x: nX, y: nY }
        if (navActiveRef?.current && onNavInputRef.current) {
          if (Math.abs(nX) >= Math.abs(nY)) { if (Math.abs(nX) > 0.35) onNavInputRef.current('x', nX < 0 ? -1 : 1) }
          else if (Math.abs(nY) > 0.35) onNavInputRef.current('y', nY < 0 ? -1 : 1)
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
          if (Math.abs(nX) > 0.35) onNavInputRef.current('x', nX < 0 ? -1 : 1)
          return
        }
        onRightRef.current(nX)
      }
    }
  }, [radius, navActiveRef])

  const grab = useCallback((id: string, x: number, y: number) => {
    if (!canControlRef.current) return
    if (touchesRef.current.has(id)) return
    const stick = resolveStick(x, y)
    if (stick === 'R' && !rightEnabledRef.current) return
    touchesRef.current.set(id, { stick })
  }, [resolveStick])

  const release = useCallback((changed: readonly { identifier: number | string }[]) => {
    const dropped = new Set<'L' | 'R'>()
    for (const t of changed) {
      const ent = touchesRef.current.get(String(t.identifier))
      if (!ent) continue
      touchesRef.current.delete(String(t.identifier))
      dropped.add(ent.stick)
    }
    for (const stick of dropped) {
      let still = false
      for (const [, v] of touchesRef.current) if (v.stick === stick) { still = true; break }
      if (!still) applyKnob(stick, 0, 0)
    }
  }, [applyKnob])

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      for (const t of evt.nativeEvent.touches) grab(String(t.identifier), t.locationX, t.locationY)
    },
    onPanResponderMove: (evt) => {
      for (const t of evt.nativeEvent.touches) {
        const ent = touchesRef.current.get(String(t.identifier))
        if (!ent) continue
        const center = centerOf(ent.stick)
        applyKnob(ent.stick, t.locationX - center.cx, t.locationY - center.cy)
      }
    },
    onPanResponderRelease: (evt) => release(evt.nativeEvent.changedTouches),
    onPanResponderTerminate: (evt) => release(evt.nativeEvent.changedTouches),
  }), [geo, radius, grab, applyKnob, release])

  // Hold-resend at 30ms
  useEffect(() => {
    if (!canControl) return
    const id = setInterval(() => {
      if (touchesRef.current.size === 0) return
      if (navActiveRef?.current) return
      let hasL = false, hasR = false
      for (const [, v] of touchesRef.current) {
        if (v.stick === 'L') hasL = true
        if (v.stick === 'R') hasR = true
      }
      if (hasL) onLeftRef.current(lastLRef.current.x, lastLRef.current.y)
      if (hasR && rightEnabledRef.current) onRightRef.current(lastRRef.current)
    }, DRIVE_CMD_MIN_INTERVAL_MS)
    return () => clearInterval(id)
  }, [canControl, navActiveRef])

  const base = radius + 8
  const knobSize = 40

  return (
    <View
      onLayout={(e) => {
        const { width, height: h } = e.nativeEvent.layout
        setGeo((g) => (g && g.w === width && g.h === h ? g : { w: width || 1, h: h || 1 }))
      }}
      {...panResponder.panHandlers}
      style={fill ? { flex: 1 } : { height: 220 }}
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
                <View pointerEvents="none" className={dim ? 'opacity-50' : 'opacity-90'}
                  style={{ position: 'absolute', left: c.cx - 30, width: 60, alignItems: 'center', top: Math.max(4, c.cy - radius - 26) }}>
                  <Text className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-300">{tag}</Text>
                </View>
                <View pointerEvents="none" className="absolute items-center justify-center rounded-full border-2"
                  style={{
                    left: c.cx - base, top: c.cy - base, width: base * 2, height: base * 2,
                    borderColor: dim ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.28)',
                    backgroundColor: dim ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)',
                    opacity: dim ? 0.45 : 1,
                  }}>
                  <View className="absolute rounded-full border"
                    style={{ width: radius * 0.92, height: radius * 0.92, borderRadius: radius * 0.46, top: base - guide, left: base - guide, borderColor: 'rgba(255,255,255,0.22)' }} />
                  <View style={{ position: 'absolute', left: base * 0.15, top: base - 1, width: base * 1.7, height: 1, backgroundColor: 'rgba(255,255,255,0.18)' }} />
                  <View style={{ position: 'absolute', left: base - 1, top: base * 0.15, width: 1, height: base * 1.7, backgroundColor: 'rgba(255,255,255,0.18)' }} />
                  <View style={{ position: 'absolute', left: base - 6, top: base - 6, width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(147,197,253,0.9)', backgroundColor: 'rgba(30,58,138,0.35)' }} />
                </View>
                <View pointerEvents="none" className="absolute rounded-full bg-white"
                  style={{
                    left: c.cx + knob.x - knobSize / 2, top: c.cy + knob.y - knobSize / 2,
                    width: knobSize, height: knobSize, borderWidth: 2,
                    borderColor: enabled ? '#3b82f6' : 'rgba(100,116,139,0.9)',
                    opacity: dim ? 0.55 : 1,
                    shadowColor: '#0f172a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
                  }}>
                  <View className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -ml-1.25 -mt-1.25 rounded-full bg-navy shadow-sm" />
                </View>
              </View>
            )
          })}
          {oledSlot && geo && (
            <View pointerEvents="none" style={{ position: 'absolute', left: geo.w * 0.5 - 64, top: geo.h * 0.5 - 32, width: 128, height: 64 }}>
              {oledSlot}
            </View>
          )}
        </>
      )}
    </View>
  )
}

// =====================================================================
// DriveControls — public component.
// =====================================================================
export function DriveControls({
  canControl, isDrone, activeMode, speed, servo,
  pidKp, pidKi, pidKd, pidOut, pidOff, useJoystick,
  onDirection, onSpeed, onServo, onPid, onRun, onStop,
  onSignedDrive, steerLimit, onEStop,
  safetyLimits, compact = false, navActiveRef, onNavInput, oledSlot,
}: DriveControlsProps & { safetyLimits?: SafetyLimits }) {
  const limits = safetyLimits ?? DEFAULT_LIMITS
  const showSpeed = activeMode.controls.includes('drive-tank') || activeMode.controls.includes('drive-2wd1m')
  const showPid = activeMode.controls.includes('pid-auto')
  const showStartStop = activeMode.controls.includes('start-stop') || activeMode.controls.includes('tuning')
  const is2wd1m = activeMode.controls.includes('drive-2wd1m')

  const lastDirRef = useRef<string>('S')
  const lastDirTimeRef = useRef(0)
  const sendDir = useCallback((d: 'F' | 'B' | 'L' | 'R' | 'S') => {
    const now = Date.now()
    if (lastDirRef.current === d && now - lastDirTimeRef.current < 100) return
    lastDirRef.current = d
    lastDirTimeRef.current = now
    onDirection(d)
  }, [onDirection])

  const hapticTap = useCallback(() => { Vibration.vibrate(10) }, [])

  const maxSteer = steerLimit != null ? steerLimit : limits.maxSteerDeviation

  const stopAll2wd1m = useCallback(() => {
    hapticTap()
    if (onSignedDrive) onSignedDrive(0)
    onServo(limits.servoCenter)
  }, [hapticTap, onSignedDrive, onServo, limits])

  const handleLeftJoy = useCallback((x: number, y: number) => {
    if (!canControl) return
    if (is2wd1m && onSignedDrive) {
      if (Math.abs(y) <= 0.05) { onSignedDrive(0); return }
      const raw = Math.round((Math.min(1, Math.abs(y)) * 255) / 5) * 5
      const mag = clampSigned(raw, limits)
      onSignedDrive(y < 0 ? mag : -mag)
      return
    }
    const d = is2wd1m ? (y < -0.25 ? 'F' : y > 0.25 ? 'B' : 'S')
      : (Math.abs(x) < 0.25 && Math.abs(y) < 0.25 ? 'S'
        : Math.abs(y) >= Math.abs(x) ? (y < 0 ? 'F' : 'B') : (x < 0 ? 'L' : 'R'))
    sendDir(d)
  }, [canControl, is2wd1m, onSignedDrive, sendDir, limits])

  const handleRightJoy = useCallback((x: number) => {
    if (!canControl || !is2wd1m) return
    let dev = Math.round(x * 90)
    if (onSignedDrive && steerLimit != null) {
      dev = Math.max(-steerLimit, Math.min(steerLimit, dev))
    }
    const rawServo = limits.servoCenter + dev
    onServo(clampServo(rawServo, limits))
  }, [canControl, is2wd1m, onSignedDrive, steerLimit, onServo, limits])

  if (isDrone) return null

  return (
    <View className={canControl ? (compact ? 'min-h-0 flex-1' : '') : (compact ? 'min-h-0 flex-1 opacity-40' : 'opacity-40')}>
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
            canControl={canControl} rightEnabled={is2wd1m}
            onLeft={handleLeftJoy} onRight={handleRightJoy}
            fill={compact} navActiveRef={navActiveRef} onNavInput={onNavInput}
            oledSlot={oledSlot}
          />
          {!compact && (
            <Text className="mt-3 text-center text-sm text-muted">
              {is2wd1m && onSignedDrive
                ? 'Both sticks work together · release a stick to stop it'
                : is2wd1m ? 'Left drives · Right steers (2WD1M)'
                  : 'Left drives · Right is unused in this mode'}
            </Text>
          )}
        </View>
      ) : (
        <View className={compact ? 'min-h-0 flex-1' : ''}>
          <DualDpad
            canControl={canControl} speed={clampSpeed(speed, limits)} steerLimit={maxSteer}
            is2wd1m={is2wd1m} onSignedDrive={onSignedDrive} sendDir={sendDir}
            onServo={onServo} limits={limits} onHaptic={hapticTap}
            compact={compact} navActiveRef={navActiveRef} onNavInput={onNavInput}
            oledSlot={oledSlot}
          />
          {!compact && (
            <View className="mt-3 flex-row items-center justify-center">
              <Pressable onPress={stopAll2wd1m} disabled={!canControl}
                className="flex-row items-center gap-2 rounded-full bg-slate-200 px-6 py-3 disabled:opacity-40">
                <Feather name="stop-circle" size={16} color="#1e3a8a" />
                <Text className="text-sm font-black text-navy">Stop</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* Speed slider (full mode only) */}
      {showSpeed && !compact && (
        <View className="mt-4 rounded-xl border border-line bg-surface p-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-bold uppercase tracking-wide text-border">Speed</Text>
            <Text className="font-mono text-sm font-bold text-navy">{clampSpeed(speed, limits)}</Text>
          </View>
          <Slider
            value={speed} minimumValue={100} maximumValue={255} step={5}
            onValueChange={(v: number) => onSpeed(clampSpeed(v, limits))}
            disabled={!canControl}
            minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a"
          />
          <View className="mt-1 flex-row items-center justify-center gap-3">
            <MiniStepperBtn onPress={() => onSpeed(clampSpeed(speed - 5, limits))} disabled={!canControl} icon="minus" />
            <MiniStepperBtn onPress={() => onSpeed(clampSpeed(speed + 5, limits))} disabled={!canControl} icon="plus" />
          </View>
        </View>
      )}

      {/* PID (full mode only) */}
      {showPid && !compact && (
        <View className="mt-4 flex-row flex-wrap gap-3">
          {[
            { label: 'Kp', val: pidKp, max: 50, step: 0.1, key: 'kp' as const },
            { label: 'Ki', val: pidKi, max: 20, step: 0.1, key: 'ki' as const },
            { label: 'Kd', val: pidKd, max: 20, step: 0.1, key: 'kd' as const },
            { label: 'OUT', val: pidOut, max: 255, step: 1, key: 'out' as const },
            { label: 'OFF', val: pidOff, max: 5, step: 0.05, key: 'off' as const },
          ].map((p) => (
            <View key={p.key} className="w-[48%] rounded-xl border border-line bg-surface p-4">
              <Text className="text-sm font-bold uppercase tracking-wide text-border">{p.label}</Text>
              <Slider
                value={p.val} minimumValue={p.key === 'off' ? -5 : 0} maximumValue={p.max} step={p.step}
                onValueChange={(v: number) => onPid(p.key, v)} disabled={!canControl}
                minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a"
              />
              <Text className="mt-1 text-right font-mono text-sm text-navy">
                {p.key === 'off' ? `${p.val >= 0 ? '+' : ''}${p.val.toFixed(2)}°` : p.key === 'out' ? p.val : p.val.toFixed(1)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Start/Stop (full mode only) */}
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

      {/* E-stop (full mode only) */}
      {onEStop && !compact && (
        <View className="mt-4">
          <Pressable onPress={() => { hapticTap(); onEStop() }} disabled={!canControl}
            className="flex-row items-center justify-center gap-2 rounded-full bg-red-600 px-6 py-3 disabled:opacity-60">
            <Feather name="octagon" size={14} color="#fff" />
            <Text className="text-sm font-black text-white">Emergency stop</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

/** Compact minus/plus stepper for the speed slider row. */
function MiniStepperBtn({ onPress, disabled, icon }: {
  onPress: () => void; disabled: boolean; icon: 'minus' | 'plus'
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      className="h-9 w-9 items-center justify-center rounded-full border border-line bg-card shadow-sm disabled:opacity-40">
      <Feather name={icon} size={16} color="#1e3a8a" />
    </Pressable>
  )
}
