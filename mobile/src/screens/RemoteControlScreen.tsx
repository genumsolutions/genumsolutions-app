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
import React, { useCallback, useEffect, useRef, useState } from 'react'
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
import { LOCAL_CAR_MODES, type CarMode } from '../config/roboCarCatalog'
import { SPEED_MIN, SPEED_MAX, SPEED_STEP } from '../services/carProtocol'
import type { SafetyLimits } from '../components/tools/types'

type Props = NativeStackScreenProps<RootStackParamList, 'RemoteControl'>
type Route = RouteProp<RootStackParamList, 'RemoteControl'>

/** NAV repeat gate — mirrors the .ino's NAV_DEBOUNCE (120 ms). */
const NAV_DEBOUNCE_MS = 120

/** Firmware modes the physical remote treats as available (isModeAvailable). */
const REMOTE_AVAILABLE_TOKENS = ['BT', 'AUTO', '2WD1M']

/** Default safety limits when the hub does not expose a custom set. */
const DEFAULT_SAFETY_LIMITS: SafetyLimits = {
  maxSpeed: 255,
  maxSignedDrive: 255,
  servoCenter: 90,
  maxSteerDeviation: 90,
  maxTrim: 90,
}

/** Snap a value to `step` grid and clamp to [min,max] (speed/steer fields). */
function clampStep(value: number, min: number, max: number, step: number): number {
  const v = Math.round(value / step) * step
  return Math.max(min, Math.min(max, v))
}

/**
 * Round 6: TouchSafePressable is GONE. It was a JS hit-testing layer built
 * to work around a coordinate-space mismatch — but the mismatch was in OUR
 * touch code (pageX/pageY vs measureInWindow), not in React Native. Native
 * Pressable hit-testing is always correct and instant (no JS geometry, no
 * async measuring, no bridge round-trips per touch). Every button on this
 * screen is now a plain Pressable with hitSlop + Android_ripple pressed
 * feedback: bigger, faster, and accurate by construction.
 */

/** Small −/+ stepper pill for the settings dropdown (dark deck styling). */
function StepperPill({ onPress, disabled, icon }: {
  onPress: () => void
  disabled: boolean
  icon: 'minus' | 'plus'
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true, radius: 22 }}
      className="h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 disabled:opacity-40"
    >
      <Feather name={icon} size={16} color="#fff" />
    </Pressable>
  )
}

/** Inline value strip for the chrome row (R4-2, widened R6). ESP-remote
    parity: shows Speed (100..255, step 5) in most modes — and the STEER
    LIMIT (0..180, step 5) in 2WD1M, where the physical remote's top bar
    shows the steering limit instead of speed. While NAV owns the field
    (`locked`) the slider is display-only (the pads/joystick step it), and
    the strip draws the ESP-style inverted highlight when selected. */
function ValueStrip({ label, value, min, max, canControl, locked, highlight, onChange, onCommit }: {
  label: string
  value: number
  min: number
  max: number
  canControl: boolean
  locked: boolean
  highlight: boolean
  onChange: (v: number) => void
  onCommit: () => void
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
        value={value}
        minimumValue={min}
        maximumValue={max}
        step={5}
        onValueChange={onChange}
        onSlidingComplete={onCommit}
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
    // connection
    connected, wifiConnected, sppStatus, deviceName,
    canControl, handleDisconnect, wifiUrl,
    // mode/category
    activeCategory, activeMode, carModes, selectMode, cycleMode,
    // drive
    speed, servo, steerLimit, trim, driveStatus, driveDir, telemetry,
    handleDirection, handleSpeed, handleServo, applyPid, handleStickDrive,
    adjustSteerLimit, commitSpeed, commitSteerLimit, adjustTrim, handleEStop,
    // NAV (ESP INPUT_NAV parity)
    navActive, setNavActive, navActiveRef, navField, setNavField, previewMode, setPreviewMode,
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

  // ── NAV state machine (exact port of the .ino dashboard Select/Back
  // handling) ────────────────────────────────────────────────────────
  // DRIVE: sticks/pads drive. Select → INPUT_NAV (Mode field highlighted,
  // nothing drives). NAV: pads/sticks move the cursor + edit values;
  // Select confirms (mode switch / SPD<n> / steer-limit record); Back
  // cancels back to DRIVE. Back in DRIVE → disconnect confirmation.
  const modeList = carModes.length > 0 ? carModes : LOCAL_CAR_MODES

  // NAV repeat gate (NAV_DEBOUNCE 120ms) — the same debounce the .ino uses
  // so a held joystick doesn't fly through modes/values.
  const lastNavAtRef = useRef(0)
  const navInput = useCallback((axis: 'x' | 'y', value: -1 | 0 | 1) => {
    if (value === 0) return
    const now = Date.now()
    if (now - lastNavAtRef.current < NAV_DEBOUNCE_MS) return
    lastNavAtRef.current = now

    if (navField === 'mode') {
      if (axis === 'y') {
        // Up/Down on Mode: cycle the PREVIEW (previewModeIndex parity).
        const current = previewMode ?? activeMode
        const idx = modeList.findIndex((m) => m.id === current.id)
        const next = modeList[(((idx === -1 ? 0 : idx) + (value === -1 ? -1 : 1)) % modeList.length + modeList.length) % modeList.length]
        if (next) setPreviewMode(next)
      }
      // Left/Right on Mode: nothing (single-field wrap like the remote).
      return
    }
    if (navField === 'speed') {
      if (axis === 'y') {
        const next = clampStep(speed + (value === -1 ? -SPEED_STEP : SPEED_STEP), SPEED_MIN, SPEED_MAX, SPEED_STEP)
        handleSpeed(next)
      } else if (value === -1) {
        setNavField('mode') // Left: back to Mode field
      }
      return
    }
    if (navField === 'steer') {
      if (axis === 'y') {
        // Up/Down on Steer: adjust the limit in 5° steps (STEER_STEP).
        // NEVER sends a servo command (ui.md 6b).
        adjustSteerLimit(value === -1 ? -5 : 5)
      } else if (value === -1) {
        setNavField('mode')
      }
      return
    }
    // navField === 'none' (just entered NAV): Left returns to Mode field.
    if (axis === 'x' && value === -1) setNavField('mode')
  }, [navField, previewMode, activeMode, modeList, speed, handleSpeed, adjustSteerLimit, setPreviewMode, setNavField])

  // Select button: DRIVE → NAV; NAV → confirm the highlighted field.
  const handleSelect = useCallback(() => {
    Vibration.vibrate(10)
    if (!navActive) {
      // Enter NAV: Mode field highlighted, preview starts at current mode.
      setNavActive(true)
      setPreviewMode(activeMode)
      setNavField('mode')
      return
    }
    // Confirm the highlighted field (the .ino TOP_* branches).
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

  // Back button: NAV → cancel to DRIVE; DRIVE → disconnect confirmation.
  const handleBack = useCallback(() => {
    Vibration.vibrate(10)
    if (navActive) {
      // Cancel: drop the preview, nothing is sent (uiHandleBackPressed).
      setPreviewMode(null)
      setNavActive(false)
      setNavField('none')
      return
    }
    if (linked) setShowExitConfirm(true)
    else navigation.goBack()
  }, [navActive, linked, navigation, setNavActive, setNavField, setPreviewMode])

  // Disconnect confirmation (the .ino's Return-Confirmation dialog).
  const [showExitConfirm, setShowExitConfirm] = useState(false)

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

  const isRobocar = !isDrone && !isNonRobocar

  const oledCommonProps = {
    connected,
    wifiConnected,
    deviceName,
    activeMode,
    speed,
    servo,
    driveStatus,
    driveDir,
    targetAltitude,
    gimbalPan,
    gimbalTilt,
    sensorData,
    telemetry,
    isDrone,
    isNonRobocar,
    linkKind: connected ? ('spp' as const) : wifiConnected ? ('wifi' as const) : undefined,
  }

  // ESP-remote parity pieces for the chrome row + deck:
  const navActiveBool = navActive && isRobocar
  const shownMode = previewMode ?? activeMode
  const isShown2wd1m = shownMode.controls.includes('drive-2wd1m')
  // Which field NAV owns right now (drives the OLED + strip highlights).
  const topField = !navActiveBool ? 'none' as const
    : navField === 'speed' ? 'speed' as const
      : navField === 'steer' ? 'steer' as const
        : 'mode' as const

  return (
    <View className="flex-1 bg-slate-950">
      {/* Single compact remote board — no scroll. The board is flex-sized so
          Settings / dropdowns / the OLED never push anything off-window. */}
      <View className="flex-1 overflow-hidden px-3 pb-2" style={{ paddingTop: Math.max(insets.top, 8) + 4 }}>
        {/* ONE chrome row (R4-3): Exit · REMOTE · mode · OLED · speed · toggle · settings */}
        <View className="flex-shrink-0 flex-row items-center gap-2">
          {/* Back button (ESP BTN_BACK parity): NAV cancel / disconnect
              confirm — same two-tier semantics as the physical remote. */}
          <Pressable
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Back — cancel NAV or exit remote"
            hitSlop={10}
            android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: true, radius: 40 }}
          >
            <View className="rounded-full border border-white/10 bg-white/5 px-4 py-2.5">
              <Text className="text-sm font-bold text-white">Back</Text>
            </View>
          </Pressable>
          {/* Select button (ESP BTN_SELECT parity): enter/confirm NAV. */}
          <Pressable
            onPress={handleSelect}
            disabled={!isRobocar}
            accessibilityRole="button"
            accessibilityLabel="Select — enter or confirm mode/speed edit"
            hitSlop={10}
            android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true, radius: 40 }}
            className={isRobocar ? '' : 'opacity-40'}
          >
            <View className={`rounded-full px-4 py-2.5 ${navActive ? 'bg-slate-200' : 'border border-white/10 bg-white/5'}`}>
              <Text className={`text-sm font-bold ${navActive ? 'text-slate-900' : 'text-white'}`}>Select</Text>
            </View>
          </Pressable>
          <Text className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Remote</Text>

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
              {/* R4-2 + ESP parity: inline value strip — Speed in most modes,
                  Steer LIMIT in 2WD1M (the physical remote swaps the top-bar
                  right field exactly like this). NAV-locked while the pads
                  step the value. */}
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
              <View style={{ width: oledWidth, aspectRatio: 2 }} className="flex-shrink overflow-hidden rounded-xl">
                <OledDisplay
                  {...oledCommonProps}
                  compact
                  topField={topField}
                  previewMode={previewMode}
                  previewComingSoon={!REMOTE_AVAILABLE_TOKENS.includes(previewMode?.token ?? '')}
                  steerLimit={steerLimit}
                />
              </View>
            </>
          )}

          {isRobocar && (
            <View className="ml-auto flex-row items-center gap-2">
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
              navActiveRef={navActiveRef}
              onNavInput={navInput}
            />
            {/* Floating E-stop FAB — easy thumb reach in landscape */}
            <Pressable
              onPress={() => { Vibration.vibrate(50); handleEStop() }}
              accessibilityRole="button"
              accessibilityLabel="Emergency stop"
              hitSlop={10}
              android_ripple={{ color: 'rgba(255,255,255,0.3)', borderless: true, radius: 34 }}
              style={{ position: 'absolute', bottom: 8, right: 8 }}
            >
              <View className="h-14 w-14 items-center justify-center rounded-full bg-red-600 shadow-lg">
                <Feather name="octagon" size={22} color="#fff" />
              </View>
            </Pressable>
          </View>
        )}

        {/* Disconnect confirmation — the ESP remote's Return-Confirmation
            dialog: [Cancel] [Disconnect]. Cancel keeps driving; Disconnect
            safe-stops, closes the link and leaves the remote. */}
        {showExitConfirm && (
          <>
            <Pressable
              className="absolute inset-0 z-30 bg-black/50"
              onPress={() => setShowExitConfirm(false)}
              accessibilityLabel="Cancel disconnect"
            />
            <View className="absolute inset-0 z-40 items-center justify-center px-8">
              <View className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-xl">
                <Text className="text-center text-base font-black text-white">Disconnected. Exit remote?</Text>
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
            <Pressable
              onPress={() => { Vibration.vibrate(10); handleDisconnect() }}
              accessibilityRole="button"
              accessibilityLabel="Disconnect"
              hitSlop={10}
              android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: true, radius: 40 }}
            >
              <View className="rounded-full border border-white/15 bg-white/5 px-4 py-2.5">
                <Feather name="wifi-off" size={16} color="#fff" />
              </View>
            </Pressable>
          )}
        </View>
        <Text className="mt-0.5 text-center text-sm text-slate-500">
          {wifiConnected ? `WiFi · ${wifiUrl}` : sppStatus === 'connected' ? `SPP · ${deviceName}` : 'Simulation'}
        </Text>
      </View>
    </View>
  )
}
