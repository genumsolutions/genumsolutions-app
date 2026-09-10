// =====================================================================
// RemoteControlScreen — the immersive "gaming remote" window opened from
// the Control Panel's header joystick icon.
//
// Standard gamepad layout (landscape):
//   [Back] [Select]  REMOTE  ●CarName  Mode▸  Spd═══  [🎮] [⚙]
//   ┌─────┐                     ┌─────┐
//   │  ↑  │     ┌─────────┐    │  ↑  │
//   │← ● →│     │  OLED   │    │← ● →│
//   │  ↓  │     │ 128×64  │    │  ↓  │
//   └─────┘     └─────────┘    └─────┘
//   L joystick                R joystick        [E-STOP]
//
// Phase 1 rebuild: clean chrome row (no ScrollView), standard gamepad
// layout, E-stop FAB, disconnect dialog, settings dropdown.
// Drive controls (joystick/d-pad) are delegated to DriveControls.
// =====================================================================
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, Pressable, Text, Vibration, View, useWindowDimensions } from 'react-native'
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
import { LOCAL_CAR_MODES, type CarMode } from '../config/roboCarCatalog'
import { SPEED_MIN, SPEED_MAX, SPEED_STEP } from '../services/carProtocol'
import type { SafetyLimits } from '../components/tools/types'

type Props = NativeStackScreenProps<RootStackParamList, 'RemoteControl'>
type Route = RouteProp<RootStackParamList, 'RemoteControl'>

const NAV_DEBOUNCE_MS = 120
const REMOTE_AVAILABLE_TOKENS = ['BT', 'AUTO', '2WD1M']

const DEFAULT_SAFETY_LIMITS: SafetyLimits = {
  maxSpeed: 255,
  maxSignedDrive: 255,
  servoCenter: 90,
  maxSteerDeviation: 90,
  maxTrim: 90,
}

function clampStep(value: number, min: number, max: number, step: number): number {
  const v = Math.round(value / step) * step
  return Math.max(min, Math.min(max, v))
}

/** Small −/+ stepper pill for the settings dropdown. */
function StepperPill({ onPress, disabled, icon }: {
  onPress: () => void; disabled: boolean; icon: 'minus' | 'plus'
}) {
  return (
    <Pressable
      onPress={onPress} disabled={disabled} hitSlop={6}
      accessibilityRole="button"
      android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true, radius: 22 }}
      className="h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 disabled:opacity-40"
    >
      <Feather name={icon} size={16} color="#fff" />
    </Pressable>
  )
}

/** Inline value strip for the chrome row — Speed or Steer LIMIT. */
function ValueStrip({ label, value, min, max, canControl, locked, highlight, onChange, onCommit }: {
  label: string; value: number; min: number; max: number
  canControl: boolean; locked: boolean; highlight: boolean
  onChange: (v: number) => void; onCommit: () => void
}) {
  return (
    <View
      className={`h-9 min-w-[110px] max-w-[220px] flex-1 flex-row items-center gap-1.5 rounded-full px-2.5 ${
        highlight ? 'bg-slate-200' : 'border border-white/10 bg-white/5'
      }`}
    >
      <Text className={`text-[9px] font-black uppercase tracking-widest ${highlight ? 'text-slate-600' : 'text-slate-500'}`}>
        {label}
      </Text>
      <Slider
        value={value} minimumValue={min} maximumValue={max} step={5}
        onValueChange={onChange} onSlidingComplete={onCommit}
        disabled={!canControl || locked}
        minimumTrackTintColor={highlight ? '#1e3a8a' : '#60a5fa'}
        maximumTrackTintColor={highlight ? 'rgba(30,58,138,0.3)' : 'rgba(255,255,255,0.15)'}
        thumbTintColor={highlight ? '#1e3a8a' : '#3b82f6'}
        style={{ flex: 1, height: 28 }}
      />
      <Text className={`w-7 shrink-0 text-right font-mono text-[11px] font-bold ${highlight ? 'text-slate-900' : 'text-white'}`}>
        {Math.round(value)}
      </Text>
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
    connected, wifiConnected, sppStatus, deviceName,
    canControl, handleDisconnect, wifiUrl,
    activeCategory, activeMode, carModes, selectMode, cycleMode,
    speed, servo, steerLimit, trim, driveStatus, driveDir, telemetry,
    handleDirection, handleSpeed, handleServo, applyPid, handleStickDrive,
    adjustSteerLimit, commitSpeed, commitSteerLimit, adjustTrim, handleEStop,
    navActive, setNavActive, navActiveRef, navField, setNavField, previewMode, setPreviewMode,
    pidKp, pidKi, pidKd, pidOut, pidOff,
    gimbalPan, gimbalTilt, targetAltitude, handleGimbalPan, handleGimbalTilt, handleAltitude,
    sensorData, relays, toggleRelay,
    useJoystick, setUseJoystick,
    isDrone, isNonRobocar, is2wd1mActive,
  } = hub

  const linked = connected || wifiConnected
  const isRobocar = !isDrone && !isNonRobocar

  // Restore joystick layout choice per device.
  useEffect(() => {
    if (!connected && !wifiConnected) return
    if (hub.savedPrefs?.joystickLayout) {
      hub.selectJoystickLayout(hub.savedPrefs.joystickLayout)
    }
  }, [connected, wifiConnected])

  // ── NAV state machine ──
  const modeList = carModes.length > 0 ? carModes : LOCAL_CAR_MODES
  const lastNavAtRef = useRef(0)

  const navInput = useCallback((axis: 'x' | 'y', value: -1 | 0 | 1) => {
    if (value === 0) return
    const now = Date.now()
    if (now - lastNavAtRef.current < NAV_DEBOUNCE_MS) return
    lastNavAtRef.current = now

    if (navField === 'mode') {
      if (axis === 'y') {
        const current = previewMode ?? activeMode
        const idx = modeList.findIndex((m) => m.id === current.id)
        const next = modeList[(((idx === -1 ? 0 : idx) + (value === -1 ? -1 : 1)) % modeList.length + modeList.length) % modeList.length]
        if (next) setPreviewMode(next)
      }
      return
    }
    if (navField === 'speed') {
      if (axis === 'y') {
        const next = clampStep(speed + (value === -1 ? -SPEED_STEP : SPEED_STEP), SPEED_MIN, SPEED_MAX, SPEED_STEP)
        handleSpeed(next)
      } else if (value === -1) {
        setNavField('mode')
      }
      return
    }
    if (navField === 'steer') {
      if (axis === 'y') {
        adjustSteerLimit(value === -1 ? -5 : 5)
      } else if (value === -1) {
        setNavField('mode')
      }
      return
    }
    if (axis === 'x' && value === -1) setNavField('mode')
  }, [navField, previewMode, activeMode, modeList, speed, handleSpeed, adjustSteerLimit, setPreviewMode, setNavField])

  const handleSelect = useCallback(() => {
    Vibration.vibrate(10)
    if (!navActive) {
      setNavActive(true)
      setPreviewMode(activeMode)
      setNavField('mode')
      return
    }
    if (navField === 'mode') {
      const target = previewMode ?? activeMode
      setPreviewMode(null)
      setNavActive(false)
      setNavField('none')
      if (target.id !== activeMode.id) selectMode(target)
      return
    }
    if (navField === 'speed') {
      commitSpeed()
      setNavActive(false)
      setNavField('none')
      return
    }
    if (navField === 'steer') {
      commitSteerLimit()
      setNavActive(false)
      setNavField('none')
      return
    }
    setNavActive(false)
    setNavField('none')
  }, [navActive, navField, previewMode, activeMode, selectMode, commitSpeed, commitSteerLimit, setNavActive, setNavField, setPreviewMode])

  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const handleBack = useCallback(() => {
    Vibration.vibrate(10)
    if (navActive) {
      setPreviewMode(null)
      setNavActive(false)
      setNavField('none')
      return
    }
    if (linked) setShowExitConfirm(true)
    else navigation.goBack()
  }, [navActive, linked, navigation, setNavActive, setNavField, setPreviewMode])

  const backLabel = navActive ? 'Cancel' : linked ? 'Exit' : 'Back'

  // ── Settings ──
  const [showSettings, setShowSettings] = useState(false)

  // ── Orientation lock ──
  const priorLockRef = useRef<ScreenOrientation.OrientationLock | null>(null)
  const [boardKey, setBoardKey] = useState(0)

  useEffect(() => {
    if (Platform.OS === 'web') return
    ;(async () => {
      try { priorLockRef.current = await ScreenOrientation.getOrientationLockAsync() } catch { priorLockRef.current = null }
      try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE) } catch {}
      setBoardKey((k) => k + 1)
    })()
    return () => {
      if (Platform.OS === 'web') return
      if (priorLockRef.current != null) {
        try { void ScreenOrientation.lockAsync(priorLockRef.current) } catch {}
      }
    }
  }, [])

  // ── Derived values ──
  const limits: SafetyLimits = hub.safetyLimits ?? DEFAULT_SAFETY_LIMITS
  const navActiveBool = navActive && isRobocar
  const shownMode = previewMode ?? activeMode
  const isShown2wd1m = shownMode.controls.includes('drive-2wd1m')
  const topField = !navActiveBool ? 'none' as const
    : navField === 'speed' ? 'speed' as const
      : navField === 'steer' ? 'steer' as const
        : 'mode' as const

  // ── OLED props ──
  const oledCommonProps = {
    connected, wifiConnected, deviceName, activeMode, speed, servo,
    driveStatus, driveDir, targetAltitude, gimbalPan, gimbalTilt,
    sensorData, telemetry, isDrone, isNonRobocar,
    linkKind: connected ? ('spp' as const) : wifiConnected ? ('wifi' as const) : undefined,
  }

  const oledSlot = isRobocar ? (
    <View style={{ width: 128, height: 64 }} className="overflow-hidden rounded-lg">
      <OledDisplay
        {...oledCommonProps}
        compact
        topField={topField}
        previewMode={previewMode}
        previewComingSoon={!REMOTE_AVAILABLE_TOKENS.includes(previewMode?.token ?? '')}
        steerLimit={steerLimit}
      />
    </View>
  ) : null

  return (
    <View className="flex-1 bg-slate-950">
      <View className="flex-1 overflow-hidden px-3 pb-2" style={{ paddingTop: Math.max(insets.top, 8) + 4 }}>

        {/* ── Chrome row ── */}
        <View className="flex-shrink-0 flex-row items-center gap-2">
          <Pressable
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel={`${backLabel}`}
            hitSlop={10}
            android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: true, radius: 40 }}
          >
            <View className="rounded-full border border-white/10 bg-white/5 px-4 py-2.5">
              <Text className="text-sm font-bold text-white">{backLabel}</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={handleSelect}
            disabled={!isRobocar}
            accessibilityRole="button"
            accessibilityLabel="Select"
            hitSlop={10}
            android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true, radius: 40 }}
            className={isRobocar ? '' : 'opacity-40'}
          >
            <View className={`rounded-full px-4 py-2.5 ${navActive ? 'bg-slate-200' : 'border border-white/10 bg-white/5'}`}>
              <Text className={`text-sm font-bold ${navActive ? 'text-slate-900' : 'text-white'}`}>Select</Text>
            </View>
          </Pressable>

          <Text className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Remote</Text>

          {linked && (
            <>
              <View className="h-2 w-2 shrink-0 rounded-full bg-green-400" />
              <Text numberOfLines={1} className="max-w-[80px] shrink-0 text-[10px] font-bold text-slate-400">
                {deviceName || 'Connected'}
              </Text>
            </>
          )}

          {isRobocar && (
            <>
              <ModeChooser
                activeMode={activeMode}
                canControl={canControl}
                onSelect={selectMode}
                onCycle={cycleMode}
                modes={carModes}
                highlighted={topField === 'mode'}
                previewMode={previewMode}
                locked={navActiveBool}
              />
              <ValueStrip
                label={isShown2wd1m ? 'Steer' : 'Spd'}
                value={isShown2wd1m ? steerLimit : clampStep(speed, SPEED_MIN, SPEED_MAX, SPEED_STEP)}
                min={isShown2wd1m ? 0 : SPEED_MIN}
                max={isShown2wd1m ? 180 : SPEED_MAX}
                canControl={canControl}
                locked={navActiveBool}
                highlight={isShown2wd1m ? topField === 'steer' : topField === 'speed'}
                onChange={(v) => { if (isShown2wd1m) { adjustSteerLimit(v - steerLimit) } else handleSpeed(v) }}
                onCommit={() => { if (!isShown2wd1m) commitSpeed() }}
              />
            </>
          )}

          {isRobocar && (
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => { Vibration.vibrate(10); setUseJoystick(!useJoystick) }}
                accessibilityRole="button"
                accessibilityLabel={useJoystick ? 'Switch to D-pad' : 'Switch to Joystick'}
                hitSlop={10}
                android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true, radius: 28 }}
              >
                <View className={`h-12 w-12 items-center justify-center rounded-full border ${useJoystick ? 'border-white/10 bg-navy' : 'border-white/15 bg-white/5'}`}>
                  <Feather name={useJoystick ? 'move' : 'grid'} size={20} color="#fff" />
                </View>
              </Pressable>
              <Pressable
                onPress={() => setShowSettings((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="Settings"
                hitSlop={10}
                android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true, radius: 28 }}
              >
                <View className={`h-12 w-12 items-center justify-center rounded-full border bg-white/5 ${showSettings ? 'border-navy bg-navy/50' : 'border-white/15'}`}>
                  <Feather name="settings" size={20} color="#fff" />
                </View>
              </Pressable>
            </View>
          )}
        </View>

        {/* ── Content area ── */}
        {isDrone || isNonRobocar ? (
          <View className="flex-1 min-h-0 pt-2">
            <View className="flex-row items-start gap-3">
              <View className="min-w-0 flex-[0.3] max-h-[55%]">
                <OledDisplay {...oledCommonProps} />
              </View>
              <View className="min-w-0 flex-[0.7]">
                <View className="flex-1 min-h-0 rounded-2xl border border-white/10 bg-black/20 p-3">
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
                </View>
              </View>
            </View>
          </View>
        ) : (
          /* ── Robocar drive deck ── */
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
              navActiveRef={navActiveRef}
              onNavInput={navInput}
              oledSlot={oledSlot}
            />
            {/* E-stop FAB */}
            <Pressable
              onPress={() => { Vibration.vibrate(50); handleEStop() }}
              accessibilityRole="button"
              accessibilityLabel="Emergency stop"
              hitSlop={10}
              android_ripple={{ color: 'rgba(255,255,255,0.3)', borderless: true, radius: 34 }}
              style={{ position: 'absolute', bottom: 16, right: 8, zIndex: 10 }}
            >
              <View className="h-14 w-14 items-center justify-center rounded-full bg-red-600 shadow-lg">
                <Feather name="octagon" size={22} color="#fff" />
              </View>
            </Pressable>
          </View>
        )}
      </View>

      {/* ── Disconnect confirmation ── */}
      {showExitConfirm && (
        <>
          <Pressable
            className="absolute inset-0 z-30 bg-black/50"
            onPress={() => setShowExitConfirm(false)}
            accessibilityLabel="Cancel disconnect"
          />
          <View className="absolute inset-0 z-40 items-center justify-center px-8">
            <View className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-xl">
              <Text className="text-center text-base font-black text-white">Disconnect and exit?</Text>
              <Text className="mt-1 text-center text-xs leading-4 text-slate-400">
                The car receives a safe stop (SPD0 · SERVO90) before the link closes.
              </Text>
              <View className="mt-4 flex-row justify-center gap-3">
                <Pressable
                  onPress={() => setShowExitConfirm(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Keep connection"
                  hitSlop={8}
                  android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
                >
                  <View className="rounded-full border border-white/15 bg-white/5 px-6 py-2.5">
                    <Text className="text-sm font-bold text-white">Cancel</Text>
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setShowExitConfirm(false)
                    void (async () => {
                      await handleDisconnect()
                      navigation.goBack()
                    })()
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Disconnect and exit"
                  hitSlop={8}
                  android_ripple={{ color: 'rgba(255,255,255,0.3)' }}
                >
                  <View className="rounded-full bg-red-600 px-6 py-2.5">
                    <Text className="text-sm font-black text-white">Disconnect</Text>
                  </View>
                </Pressable>
              </View>
            </View>
          </View>
        </>
      )}

      {/* ── Settings dropdown ── */}
      {showSettings && (
        <>
          <Pressable
            className="absolute inset-0 z-30 bg-black/40"
            onPress={() => setShowSettings(false)}
            accessibilityLabel="Close settings"
          />
          <View
            className="absolute right-3 z-40 w-72 rounded-2xl border border-white/10 bg-slate-900 p-3 shadow-xl"
            style={{ top: Math.max(insets.top, 8) + 48, maxHeight: height - 96 }}
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
                Steering limit &amp; trim apply to 2WD1M.
              </Text>
            )}
          </View>
        </>
      )}
    </View>
  )
}
