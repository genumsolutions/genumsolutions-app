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
import { BalanceControls, PID_DEFS } from '../components/tools/BalanceControls'
import type { PidKey } from '../components/tools/BalanceControls'
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
      android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true, radius: 20 }}
      className="h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 disabled:opacity-40"
    >
      <Feather name={icon} size={14} color="#fff" />
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
  const [showJoystick, setShowJoystick] = useState(true)

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
    <View style={{ width: 160, height: 80 }} className="overflow-hidden rounded-lg">
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
        <View className="flex-shrink-0 flex-row items-center justify-between">
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
            <View className="flex-row items-center gap-1.5">
              <View className="h-2 w-2 shrink-0 rounded-full bg-green-400" />
              <Text numberOfLines={1} className="max-w-[80px] shrink-0 text-[10px] font-bold text-slate-400">
                {deviceName || 'Connected'}
              </Text>
              <Pressable
                onPress={() => { Vibration.vibrate(10); void handleDisconnect() }}
                accessibilityRole="button"
                accessibilityLabel="Disconnect"
                hitSlop={6}
                android_ripple={{ color: 'rgba(239,68,68,0.3)', borderless: true, radius: 24 }}
                className="ml-0.5"
              >
                <Feather name="power" size={14} color="#ef4444" />
              </Pressable>
            </View>
          )}

          {isRobocar && (
            <View className="flex-row items-center gap-2">
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
            </View>
          )}

          {isRobocar && (
            <View className="flex-row items-center gap-2">
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

        {/* ── Joystick / D-pad toggle — below top bar ── */}
        {isRobocar && !activeMode.controls.includes('pid-auto') && (
          <View className="flex-shrink-0 flex-row items-center justify-center gap-2 py-1">
            <Pressable
              onPress={() => { Vibration.vibrate(10); setUseJoystick(false) }}
              className={`rounded-full px-3 py-1 ${!useJoystick ? 'bg-navy' : 'border border-white/10 bg-white/5'}`}
            >
              <Text className={`text-[10px] font-bold ${!useJoystick ? 'text-white' : 'text-slate-400'}`}>D-pad</Text>
            </Pressable>
            <Pressable
              onPress={() => { Vibration.vibrate(10); setUseJoystick(true) }}
              className={`rounded-full px-3 py-1 ${useJoystick ? 'bg-navy' : 'border border-white/10 bg-white/5'}`}
            >
              <Text className={`text-[10px] font-bold ${useJoystick ? 'text-white' : 'text-slate-400'}`}>Joystick</Text>
            </Pressable>
          </View>
        )}

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
            {activeMode.controls.includes('pid-auto') ? (
              /* AUTO mode: replace useless joysticks with PID tuning */
              <BalanceControls
                canControl={canControl}
                angle={telemetry.angle ?? null}
                telemetry={telemetry}
                kp={pidKp}
                ki={pidKi}
                kd={pidKd}
                out={pidOut}
                off={pidOff}
                onPid={applyPid}
                onEnterMode={() => selectMode(activeMode)}
                compact
                oledSlot={oledSlot}
              />
            ) : showJoystick ? (
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
            ) : (
              <View className="flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-4">
                <Feather name="eye-off" size={20} color="#64748b" />
                <Text className="mt-2 text-center text-[11px] text-slate-400">
                  Joystick pad hidden.{'\n'}Open Settings to show.
                </Text>
              </View>
            )}
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
            className="absolute right-3 z-40 w-64 rounded-2xl border border-white/10 bg-slate-900 p-2.5 shadow-xl"
            style={{ top: Math.max(insets.top, 8) + 48, maxHeight: height - 96 }}
          >
            <Text className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
              Settings · {is2wd1mActive ? '2WD1M' : activeMode.name.split('·')[0].trim()}
            </Text>

            {/* Offset (OFF) */}
            {activeMode.controls.includes('pid-auto') && (
              <View className="flex-row items-center justify-between border-b border-white/10 pb-1.5">
                <Text className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Offset</Text>
                <View className="flex-row items-center gap-2">
                  <Text className="font-mono text-[11px] font-bold text-white">
                    {pidOff >= 0 ? '+' : ''}{pidOff.toFixed(2)}°
                  </Text>
                  <View className="flex-row gap-1">
                    <StepperPill onPress={() => applyPid('off', Math.max(-90, pidOff - 0.1))} disabled={!canControl} icon="minus" />
                    <StepperPill onPress={() => applyPid('off', Math.min(90, pidOff + 0.1))} disabled={!canControl} icon="plus" />
                  </View>
                </View>
              </View>
            )}

            {/* Hide joystick pad */}
            {!activeMode.controls.includes('pid-auto') && (
              <View className="flex-row items-center justify-between border-b border-white/10 pb-1.5">
                <Text className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Joystick pad</Text>
                <View className="flex-row gap-1">
                  <Pressable
                    onPress={() => { Vibration.vibrate(10); setShowJoystick(true) }}
                    className={`rounded-full px-2.5 py-1 ${showJoystick ? 'bg-navy' : 'border border-white/10 bg-white/5'}`}
                  >
                    <Text className={`text-[9px] font-bold ${showJoystick ? 'text-white' : 'text-slate-400'}`}>Show</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { Vibration.vibrate(10); setShowJoystick(false) }}
                    className={`rounded-full px-2.5 py-1 ${!showJoystick ? 'bg-navy' : 'border border-white/10 bg-white/5'}`}
                  >
                    <Text className={`text-[9px] font-bold ${!showJoystick ? 'text-white' : 'text-slate-400'}`}>Hide</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Steering limit + Trim (2WD1M only) */}
            <View className={`${is2wd1mActive ? '' : 'opacity-40'}`} pointerEvents={is2wd1mActive ? 'auto' : 'none'}>
              <View className="mt-1 flex-row items-center justify-between">
                <Text className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Steering</Text>
                <View className="flex-row items-center gap-2">
                  <Text className="font-mono text-[10px] font-bold text-white">{steerLimit}°</Text>
                  <View className="flex-row gap-1">
                    <StepperPill onPress={() => adjustSteerLimit(-5)} disabled={!canControl} icon="minus" />
                    <StepperPill onPress={() => adjustSteerLimit(5)} disabled={!canControl} icon="plus" />
                  </View>
                </View>
              </View>
              <View className="mt-1 flex-row items-center justify-between border-t border-white/10 pt-1">
                <Text className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Trim</Text>
                <View className="flex-row items-center gap-2">
                  <Text className="font-mono text-[10px] font-bold text-white">{trim > 0 ? `+${trim}` : trim}°</Text>
                  <View className="flex-row gap-1">
                    <StepperPill onPress={() => adjustTrim(-1)} disabled={!canControl} icon="minus" />
                    <StepperPill onPress={() => adjustTrim(1)} disabled={!canControl} icon="plus" />
                  </View>
                </View>
              </View>
            </View>
            {!is2wd1mActive && (
              <Text className="mt-1 text-[8px] leading-3 text-slate-500">
                Steering &amp; trim: 2WD1M only.
              </Text>
            )}
          </View>
        </>
      )}
    </View>
  )
}
