// =====================================================================
// RemoteControlScreen — the immersive "gaming remote" window opened from
// the Control Panel's header joystick icon.
//
// A single-screened game-style remote board (landscape) for robocars:
//
//   ONE top chrome row (R4-3):
//     [Exit]  REMOTE  [mode dropdown] [2:1 OLED] [speed slider] [joy↔pad] [⚙]
//   bottom deck  dual joystick / dual d-pad fills the window (two-thumb),
//                E-stop FAB floats bottom-right
//
// Round 4 (R4-1..R4-7): the Stop pill is gone (E-stop FAB + pad center
// cells stop everything), the speed slider is a small inline strip on the
// chrome row, the chrome row is the ONLY row (the deck gains the entire
// second row), chrome buttons are bigger with hitSlop + pressed states,
// and the whole board is re-keyed after the landscape lock resolves so
// touch coordinates can never drift from the rendered layout.
//
// Settings opens as a small anchored dropdown (steer limit + trim). The
// deck is flex-sized so nothing ever overflows the Remote window, whether
// a dropdown or panel is open or closed. The camera placeholder is gone
// and Simulation is only shown once (bottom bar).
//
// Fully usable WITHOUT a connected device: when nothing is linked a
// "Simulation" status is shown, knobs/buttons still move and update the
// HUD, and commands simply no-op (so the layout can be tested/debugged
// in a browser with no hardware). All real transport logic is shared with
// ToolsScreen via useControlHub / sppService.
//
// Per-category setup:
//   robocar              → game drive deck (dual stick / d-pad) + HUD.
//   home/smart-farm/city → themed relay + live-sensor tiles.
//   drones               → altitude stick + gimbal pan/tilt + flight buttons.
// =====================================================================
import React, { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, ScrollView, Text, Vibration, View, useWindowDimensions } from 'react-native'
import { useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import * as ScreenOrientation from 'expo-screen-orientation'
import { Feather } from '@expo/vector-icons'
import Slider from '@react-native-community/slider'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { RootStackParamList } from '../navigation/types'
import { useControlHub } from '../components/tools/useControlHub'
import { DriveControls } from '../components/tools/DriveControls'
import { ModeChooser } from '../components/tools/ModeChooser'
import { OledDisplay } from '../components/tools/OledDisplay'
import { SensorGrid } from '../components/tools/SensorGrid'
import { DroneControls } from '../components/tools/DroneControls'
import type { SafetyLimits } from '../components/tools/types'

type Props = NativeStackScreenProps<RootStackParamList, 'RemoteControl'>
type Route = RouteProp<RootStackParamList, 'RemoteControl'>

/** Default safety limits when the hub does not expose a custom set. */
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

/**
 * TouchSafePressable (R4-6) — Android touch-coordinate fix.
 *
 * Symptom: icon buttons rendered in one place but registered touches
 * elsewhere (slightly or badly shifted). Root cause: after the runtime
 * landscape lock Android re-insets the window (status bar removed), but
 * RN's native touch hit-testing can keep stale pre-rotation window
 * coordinates for hit-testing on already-mounted views.
 *
 * Fix: hit-test OURSELVES in JS. The wrapper is a plain View that
 * receives raw touches and maps them to a child rect measured in-window
 * at touch time; the visual child is a non-responder, so hits are judged
 * by fresh geometry on every touch — never by stale native hit rects.
 */
function TouchSafePressable({ onPress, onPressIn, onPressOut, hitSlop = 8, style, className, children, accessibilityLabel, accessibilityRole, disabled }: {
  onPress?: () => void
  onPressIn?: () => void
  onPressOut?: () => void
  hitSlop?: number
  style?: object | undefined
  className?: string
  children: React.ReactNode
  accessibilityLabel?: string
  accessibilityRole?: 'button'
  disabled?: boolean
}) {
  const wrapRef = useRef<View | null>(null)
  const pressedRef = useRef(false)
  const [pressed, setPressed] = useState(false)

  const isInside = (e: { nativeEvent: { pageX: number; pageY: number } }, cb: (ok: boolean) => void) => {
    wrapRef.current?.measureInWindow((x, y, w, h) => {
      const { pageX, pageY } = e.nativeEvent
      cb(pageX >= x - hitSlop && pageX <= x + w + hitSlop && pageY >= y - hitSlop && pageY <= y + h + hitSlop)
    })
  }

  const fire = (e: { nativeEvent: { pageX: number; pageY: number } }) => {
    if (disabled) return
    isInside(e, (ok) => {
      if (!ok) return
      pressedRef.current = false
      setPressed(false)
      onPress?.()
    })
  }

  return (
    <View
      ref={wrapRef}
      className={className}
      style={style}
      onTouchStart={(e) => isInside(e, (ok) => {
        if (!ok || disabled) return
        pressedRef.current = true
        setPressed(true)
        onPressIn?.()
      })}
      onTouchMove={(e) => isInside(e, (ok) => {
        if (!pressedRef.current) return
        if (!ok) {
          pressedRef.current = false
          setPressed(false)
          onPressOut?.()
        }
      })}
      onTouchEnd={(e) => fire(e)}
      onTouchCancel={() => {
        if (pressedRef.current) {
          pressedRef.current = false
          setPressed(false)
          onPressOut?.()
        }
      }}
    >
      <View pointerEvents="none" className={pressed ? 'opacity-70' : undefined}>
        {children}
      </View>
    </View>
  )
}

/** Small −/+ stepper pill for the settings dropdown (dark deck styling). */
function StepperPill({ onPress, disabled, icon }: {
  onPress: () => void
  disabled: boolean
  icon: 'minus' | 'plus'
}) {
  return (
    <TouchSafePressable onPress={onPress} disabled={disabled} accessibilityRole="button" hitSlop={6}>
      <View className="h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 disabled:opacity-40">
        <Feather name={icon} size={16} color="#fff" />
      </View>
    </TouchSafePressable>
  )
}

/** Compact inline speed strip for the chrome row (R4-2): a slim slider
    with its numeric value — small enough to share one row with the mode
    dropdown and the OLED. Values are clamped to the safe speed ceiling. */
function SpeedStrip({ speed, maxSpeed, canControl, onSpeed }: {
  speed: number
  maxSpeed: number
  canControl: boolean
  onSpeed: (v: number) => void
}) {
  return (
    <View className="h-9 min-w-[108px] max-w-[150px] flex-1 flex-row items-center justify-end gap-1 rounded-full border border-white/10 bg-white/5 px-2">
      <Text className="text-[9px] font-black uppercase tracking-widest text-slate-500">Spd</Text>
      <Slider
        value={clampSpeed(speed, { maxSpeed } as SafetyLimits)}
        minimumValue={0}
        maximumValue={maxSpeed}
        step={5}
        onValueChange={(v: number) => onSpeed(clampSpeed(v, { maxSpeed } as SafetyLimits))}
        disabled={!canControl}
        minimumTrackTintColor="#60a5fa"
        maximumTrackTintColor="rgba(255,255,255,0.15)"
        thumbTintColor="#3b82f6"
        style={{ width: 68, height: 28 }}
      />
      <Text className="w-7 text-right font-mono text-[11px] font-bold text-white">{clampSpeed(speed, { maxSpeed } as SafetyLimits)}</Text>
    </View>
  )
}

export function RemoteControlScreen({ navigation }: Props) {
  const route = useRoute<Route>()
  const routeCategory = route.params?.category
  const hub = useControlHub(routeCategory)
  const { width, height } = useWindowDimensions()
  const isLandscape = width > height
  const insets = useSafeAreaInsets()

  const {
    // connection
    connected, wifiConnected, sppStatus, deviceName,
    canControl, handleDisconnect, wifiUrl,
    // mode/category
    activeCategory, activeMode, carModes, selectMode, cycleMode,
    // drive
    speed, servo, steerLimit, trim, driveStatus, telemetry,
    handleDirection, handleSpeed, handleServo, applyPid, handleStickDrive,
    adjustSteerLimit, adjustTrim, handleEStop,
    // pid
    pidKp, pidKi, pidKd, pidOut, pidOff,
    // drone
    gimbalPan, gimbalTilt, targetAltitude, handleGimbalPan, handleGimbalTilt, handleAltitude,
    // sensors
    sensorData, relays, toggleRelay,
    // toggle
    useJoystick, setUseJoystick,
    // derived
    isDrone, isNonRobocar, is2wd1mActive,
  } = hub

  // Restore joystick layout choice per device, and keep the remote from
  // forcing its own orientation preference onto the rest of the app.
  useEffect(() => {
    if (!connected && !wifiConnected) return
    if (hub.savedPrefs?.joystickLayout) {
      hub.selectJoystickLayout(hub.savedPrefs.joystickLayout)
    }
  }, [connected, wifiConnected])

  const linked = connected || wifiConnected

  // Anchored settings dropdown state (robocar only).
  const [showSettings, setShowSettings] = useState(false)

  // Actual-size 2:1 OLED for the game remote (128×64 physical shape).
  // Restored to the approved round-3 size (cap 148, 22% landscape) — the
  // chrome row still fits since the speed strip is compact.
  const oledWidth = Math.min(width * (isLandscape ? 0.22 : 0.5), 148)

  // Robocar safety limits for the chrome speed strip.
  const limits: SafetyLimits = hub.safetyLimits ?? DEFAULT_SAFETY_LIMITS

  // Remote-window orientation: always lock landscape for the game-style
  // remote layout. Restore the phone's previous lock on back. Uses the SDK
  // 54 API (lockAsync takes an OrientationLock, not an options object); the
  // previous call silently no-op'd on device so the remote stayed portrait.
  const priorLockRef = useRef<ScreenOrientation.OrientationLock | null>(null)

  // R4-6: bump this key after the lock resolves + on dimension flips. The
  // drive deck re-mounts, so all pad/geometry measurements are taken fresh
  // in the FINAL orientation — touch zones can never be the stale
  // pre-rotation ones (the "buttons show here, react there" bug).
  const [boardKey, setBoardKey] = useState(0)

  useEffect(() => {
    if (Platform.OS === 'web') return
    ;(async () => {
      try {
        priorLockRef.current = await ScreenOrientation.getOrientationLockAsync()
      } catch { priorLockRef.current = null }
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
      } catch {
        // best-effort — some devices/emulators reject runtime locks
      }
      // Lock resolved: rebuild the board's touch layer in the final inset.
      setBoardKey((k) => k + 1)
    })()
    return () => {
      if (Platform.OS === 'web') return
      if (priorLockRef.current != null) {
        try { void ScreenOrientation.lockAsync(priorLockRef.current) } catch {}
      }
    }
  }, [])

  const oledCommonProps = {
    connected,
    wifiConnected,
    deviceName,
    activeMode,
    speed,
    servo,
    driveStatus,
    targetAltitude,
    gimbalPan,
    gimbalTilt,
    sensorData,
    telemetry,
    isDrone,
    isNonRobocar,
    linkKind: connected ? ('spp' as const) : wifiConnected ? ('wifi' as const) : undefined,
  }

  const isRobocar = !isDrone && !isNonRobocar

  return (
    <View className="flex-1 bg-slate-950">
      {/* Single compact remote board — no scroll. The board is flex-sized so
          Settings / dropdowns / the OLED never push anything off-window. */}
      <View className="flex-1 overflow-hidden px-3 pb-2" style={{ paddingTop: Math.max(insets.top, 8) + 4 }}>
        {/* ONE chrome row (R4-3): Exit · REMOTE · mode · OLED · speed · toggle · settings */}
        <View className="flex-shrink-0 flex-row items-center gap-2">
          <TouchSafePressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Exit remote"
            hitSlop={10}
          >
            <View className="rounded-full border border-white/10 bg-white/5 px-4 py-2.5">
              <Text className="text-sm font-bold text-white">Exit</Text>
            </View>
          </TouchSafePressable>
          <Text className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Remote</Text>

          {isRobocar && (
            <>
              <ModeChooser
                activeMode={activeMode}
                canControl={canControl}
                onSelect={selectMode}
                onCycle={cycleMode}
                modes={carModes}
              />
              {/* R4-2: small inline speed strip, same row as mode + OLED */}
              <SpeedStrip speed={speed} maxSpeed={limits.maxSpeed} canControl={canControl} onSpeed={handleSpeed} />
              <View style={{ width: oledWidth, aspectRatio: 2 }} className="flex-shrink overflow-hidden rounded-xl">
                <OledDisplay {...oledCommonProps} compact />
              </View>
            </>
          )}

          {isRobocar && (
            <View className="ml-auto flex-row items-center gap-2">
              <TouchSafePressable
                onPress={() => { Vibration.vibrate(10); setUseJoystick(!useJoystick) }}
                accessibilityRole="button"
                accessibilityLabel={useJoystick ? 'Switch to D-pad' : 'Switch to Joystick'}
                hitSlop={10}
              >
                <View className={`h-12 w-12 items-center justify-center rounded-full border ${useJoystick ? 'border-white/10 bg-navy' : 'border-white/15 bg-white/5'}`}>
                  <Feather name={useJoystick ? 'move' : 'grid'} size={20} color="#fff" />
                </View>
              </TouchSafePressable>
              <TouchSafePressable
                onPress={() => setShowSettings((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="Settings"
                hitSlop={10}
              >
                <View className={`h-12 w-12 items-center justify-center rounded-full border bg-white/5 ${showSettings ? 'border-navy bg-navy/50' : 'border-white/15'}`}>
                  <Feather name="settings" size={20} color="#fff" />
                </View>
              </TouchSafePressable>
            </View>
          )}
        </View>

        {isDrone || isNonRobocar ? (
          /* Drones / smart-farm / city: telephone-card on the left + themed
             control tiles on the right (scroll safe, never overflows). */
          <View className="flex-1 min-h-0 pt-2">
            <View className="flex-row items-start gap-3">
              <View className="min-w-0 flex-[0.3] max-h-[55%]">
                <OledDisplay {...oledCommonProps} />
              </View>
              <View className="min-w-0 flex-[0.7]">
                <View className="flex-1 min-h-0 rounded-2xl border border-white/10 bg-black/20 p-3">
                  <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 6 }}>
                    {isDrone ? (
                      <DroneControls
                        canControl={canControl}
                        targetAltitude={targetAltitude}
                        gimbalPan={gimbalPan}
                        gimbalTilt={gimbalTilt}
                        onAltitude={handleAltitude}
                        onGimbalPan={handleGimbalPan}
                        onGimbalTilt={handleGimbalTilt}
                        onCommand={(c) => hub.sendCommand(c)}
                        onSetAltitude={(v) => handleAltitude(v)}
                      />
                    ) : (
                      <SensorGrid
                        canControl={canControl}
                        isDrone={false}
                        isNonRobocar
                        activeCategory={activeCategory}
                        sensorData={sensorData}
                        relays={relays}
                        telemetry={telemetry}
                        onToggleRelay={toggleRelay}
                      />
                    )}
                  </ScrollView>
                </View>
              </View>
            </View>
          </View>
        ) : (
          /* Drive deck — fills everything below the single chrome row.
             Re-keyed after the orientation lock (R4-6) so every touch
             geometry is measured fresh in the final orientation. */
          <View key={boardKey} className="relative mt-2 min-h-0 flex-1">
            <DriveControls
              canControl={canControl}
              isDrone={isDrone}
              activeMode={activeMode}
              speed={speed}
              servo={servo}
              pidKp={pidKp}
              pidKi={pidKi}
              pidKd={pidKd}
              pidOut={pidOut}
              pidOff={pidOff}
              useJoystick={useJoystick}
              onDirection={handleDirection}
              onSpeed={handleSpeed}
              onServo={handleServo}
              onPid={applyPid}
              onSignedDrive={is2wd1mActive ? handleStickDrive : undefined}
              steerLimit={is2wd1mActive ? steerLimit : undefined}
              safetyLimits={hub.safetyLimits}
              compact
            />
            {/* Floating E-stop FAB — easy thumb reach in landscape */}
            <TouchSafePressable
              onPress={() => { Vibration.vibrate(50); handleEStop() }}
              accessibilityRole="button"
              accessibilityLabel="Emergency stop"
              hitSlop={10}
              style={{ position: 'absolute', bottom: 8, right: 8 }}
            >
              <View className="h-14 w-14 items-center justify-center rounded-full bg-red-600 shadow-lg">
                <Feather name="octagon" size={22} color="#fff" />
              </View>
            </TouchSafePressable>
          </View>
        )}

        {/* Settings — small anchored dropdown (steer limit + trim for 2WD1M),
            dimmed with a note for other modes. Backdrop closes on outside
            tap so the deck never lingers in a half-open state. */}
        {showSettings && (
          <>
            <Pressable
              className="absolute inset-0 z-30 bg-black/40"
              onPress={() => setShowSettings(false)}
              accessibilityLabel="Close settings"
            />
            <View
              className="absolute right-3 z-40 w-72 rounded-2xl border border-white/10 bg-slate-900 p-3 shadow-xl"
              style={{ top: 76, maxHeight: height - 96 }}
            >
              <Text className="mb-2 text-sm font-black uppercase tracking-wide text-slate-400">
                Settings · {is2wd1mActive ? '2WD1M' : activeMode.name.split('·')[0].trim()}
              </Text>
              <View className={is2wd1mActive ? '' : 'opacity-40'} pointerEvents={is2wd1mActive ? 'auto' : 'none'}>
                <View className="flex-row items-center justify-between">
                  <Text className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Max steering limit</Text>
                  <Text className="font-mono text-sm font-bold text-white">{steerLimit}°</Text>
                </View>
                <View className="mt-1.5 flex-row items-center justify-center gap-3">
                  <StepperPill onPress={() => adjustSteerLimit(-5)} disabled={!canControl} icon="minus" />
                  <Text className="w-12 text-center font-mono text-lg font-bold text-white">{steerLimit}°</Text>
                  <StepperPill onPress={() => adjustSteerLimit(5)} disabled={!canControl} icon="plus" />
                </View>
                <View className="mt-2.5 flex-row items-center justify-between border-t border-white/10 pt-2">
                  <Text className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Trim</Text>
                  <Text className="font-mono text-sm font-bold text-white">{trim > 0 ? `+${trim}` : trim}°</Text>
                </View>
                <View className="mt-1.5 flex-row items-center justify-center gap-3">
                  <StepperPill onPress={() => adjustTrim(-1)} disabled={!canControl} icon="minus" />
                  <Text className="w-12 text-center font-mono text-lg font-bold text-white">{trim > 0 ? `+${trim}` : trim}°</Text>
                  <StepperPill onPress={() => adjustTrim(1)} disabled={!canControl} icon="plus" />
                </View>
              </View>
              {!is2wd1mActive && (
                <Text className="mt-2 text-[11px] leading-4 text-slate-500">
                  Steering limit &amp; trim apply to 2WD1M. This mode's own settings will appear here when added.
                </Text>
              )}
            </View>
          </>
        )}
      </View>

      {/* Persistent bottom bar: disconnect + status line */}
      <View className="border-t border-white/10 bg-black/40 px-3 py-2">
        <View className="flex-row items-center gap-3">
          {linked && (
            <TouchSafePressable
              onPress={() => { Vibration.vibrate(10); handleDisconnect() }}
              accessibilityRole="button"
              accessibilityLabel="Disconnect"
              hitSlop={10}
            >
              <View className="rounded-full border border-white/15 bg-white/5 px-4 py-2.5">
                <Feather name="wifi-off" size={16} color="#fff" />
              </View>
            </TouchSafePressable>
          )}
        </View>
        <Text className="mt-0.5 text-center text-sm text-slate-500">
          {wifiConnected ? `WiFi · ${wifiUrl}` : sppStatus === 'connected' ? `SPP · ${deviceName}` : 'Simulation'}
        </Text>
      </View>
    </View>
  )
}
