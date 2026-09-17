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
import { Linking, Platform, Pressable, ScrollView, Switch, Text, Vibration, View, useWindowDimensions } from 'react-native'
import { useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import * as ScreenOrientation from 'expo-screen-orientation'
import { Feather } from '@expo/vector-icons'
import Slider from '@react-native-community/slider'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { RootStackParamList } from '../navigation/types'
import { useApp } from '../context/AppContext'
import { useControlHub } from '../components/tools/useControlHub'
import { DriveControls } from '../components/tools/DriveControls'
import { BalanceControls, PID_DEFS } from '../components/tools/BalanceControls'
import type { PidKey } from '../components/tools/BalanceControls'
import { ModeChooser } from '../components/tools/ModeChooser'
import { OledDisplay } from '../components/tools/OledDisplay'
import { SensorGrid } from '../components/tools/SensorGrid'
import { DroneControls } from '../components/tools/DroneControls'
import { RouterPanel } from '../components/tools/RouterPanel'
import { LOCAL_CAR_MODES, type CarMode, sortRemoteModes } from '../config/roboCarCatalog'
import { SPEED_MIN, SPEED_MAX, SPEED_STEP, canonicalCarToken, modeAvailStatus } from '../services/carProtocol'
import type { SafetyLimits } from '../components/tools/types'

type Props = NativeStackScreenProps<RootStackParamList, 'RemoteControl'>
type Route = RouteProp<RootStackParamList, 'RemoteControl'>

const NAV_DEBOUNCE_MS = 120

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

/**
 * A-25 (device-round-5): the BT device name shown in the header must be
 * FRIENDLY — never a raw hex address. SPP scans can resolve to the MAC
 * fallback (sppService `device.name ?? device.address`); here a MAC-shaped
 * string becomes a neutral label and underscores are prettified into spaces
 * (`WIRELESS_CAR` → `WIRELESS CAR`).
 */
function friendlyBtName(name: string): string {
  const n = (name || '').trim()
  if (!n) return ''
  const hexMac = /^([0-9A-Fa-f]{2}([:-])){5}[0-9A-Fa-f]{2}$/.test(n)
  if (hexMac || n.length <= 2) return 'ESP32 Car'
  return n.replace(/_/g, ' ')
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
      className="h-8 w-8 items-center justify-center rounded-full border border-line bg-card disabled:opacity-40"
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
        highlight ? 'bg-navy-light' : 'border border-line bg-card'
      }`}
    >
      <Text className={`text-[9px] font-black uppercase tracking-widest ${highlight ? 'text-navy-dark' : 'text-muted'}`}>
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
      <Text className={`w-7 shrink-0 text-right font-mono text-[11px] font-bold ${highlight ? 'text-navy-dark' : 'text-ink dark:text-white'}`}>
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
  const { themeMode, setThemeMode } = useApp()

  const {
    connected, wifiConnected, sppStatus, deviceName,
    canControl, wifiUrl,
    activeCategory, activeMode, carModes, carStubMap, carAvailMap, selectMode, cycleMode,
    speed, servo, steerLimit, trim, driveStatus, driveDir, telemetry,
    handleDirection, handleSpeed, handleServo, applyPid, handleStickDrive,
    adjustSteerLimit, commitSpeed, commitSteerLimit, adjustTrim, handleEStop,
    navActive, setNavActive, navActiveRef, navField, setNavField, previewMode, setPreviewMode,
    pidKp, pidKi, pidKd, pidOut, pidOff,
    gimbalPan, gimbalTilt, targetAltitude, handleGimbalPan, handleGimbalTilt, handleAltitude,
    sensorData, relays, toggleRelay,
    useJoystick, setUseJoystick,
    isDrone, isNonRobocar, is2wd1mActive,
    showSppsRetry, handleSppsRetry, handleReconnectPromptCancel,
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
        // Browse by CANONICAL TOKEN over the fleet order (never by local
        // array index — a DB row set missing the active mode used to jump
        // to pool[0], the 4WD4M "stuck" symptom).
        const pool = modeList.length > 0 ? sortRemoteModes(modeList) : [...LOCAL_CAR_MODES]
        if (pool.length === 0) return
        const current = previewMode ?? activeMode
        const curToken = canonicalCarToken(current.token)
        let idx = pool.findIndex((m) => canonicalCarToken(m.token) === curToken || m.id === current.id)
        if (idx === -1) idx = 0
        const next = pool[(((idx + (value === -1 ? -1 : 1)) % pool.length) + pool.length) % pool.length]
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

  const handleBack = useCallback(() => {
    Vibration.vibrate(10)
    if (navActive) {
      setPreviewMode(null)
      setNavActive(false)
      setNavField('none')
      return
    }
    // Navigate back WITHOUT disconnecting — connection survives navigation
    navigation.goBack()
  }, [navActive, navigation, setNavActive, setNavField, setPreviewMode])

  const backLabel = navActive ? 'Cancel' : 'Back'

  // ── Weblink handlers ──
  // A-36: the IP chip is ALWAYS tappable — with a reachable STA IP we open the
  // car's web page directly; offline/AP-fallback we open http://192.168.4.1
  // (the car's own AP page), so "nothing happens" is gone even unconnected.
  const handleOpenWebPage = useCallback(() => {
    const url = telemetry.ip ? `http://${telemetry.ip}` : 'http://192.168.4.1'
    void Linking.openURL(url).catch(() => undefined)
  }, [telemetry.ip])

  // ── Settings ──
  const [showSettings, setShowSettings] = useState(false)
  // Pads are the primary drive surface — show them by default for every mode;
  // users can still hide via Settings (choice lives for the session only).
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
        previewModeAvail={previewMode ? modeAvailStatus(previewMode.token, carStubMap, carAvailMap) : undefined}
        steerLimit={steerLimit}
      />
    </View>
  ) : null

  return (
    <View className="flex-1 bg-surface">
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
            <View className="rounded-full border border-line bg-card px-4 py-2.5">
              <Text className="text-sm font-bold text-ink dark:text-white">{backLabel}</Text>
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
            <View className={`rounded-full px-4 py-2.5 ${navActive ? 'bg-navy-light' : 'border border-line bg-card'}`}>
              <Text className={`text-sm font-bold ${navActive ? 'text-navy-dark' : 'text-ink dark:text-white'}`}>Select</Text>
            </View>
          </Pressable>

          <Text className="text-sm font-black uppercase tracking-[0.2em] text-muted">Remote</Text>

          {/* A-25: friendly BT name right of "Remote" — NEVER a raw hex
              address (sppService falls back to the MAC when a scan reports
              no name). Underscores prettify to spaces: WIRELESS_CAR →
              WIRELESS CAR. */}
          <Text numberOfLines={1} className="max-w-[120px] shrink-0 text-[11px] font-bold text-navy dark:text-sky-300">
            {linked ? (friendlyBtName(deviceName) || 'Connected') : 'No link'}
          </Text>

          {isRobocar && (
            <View className="flex-row items-center gap-2">
              <ModeChooser
                activeMode={activeMode}
                canControl={canControl}
                onSelect={selectMode}
                onCycle={cycleMode}
                modes={carModes}
                carStubMap={carStubMap}
                carAvailMap={carAvailMap}
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
                <View className={`h-12 w-12 items-center justify-center rounded-full bg-navy ${showSettings ? 'bg-navy-dark' : ''}`}>
                  <Feather name="settings" size={20} color="#fff" />
                </View>
              </Pressable>
            </View>
          )}
        </View>

        {/* ── A-25 sub-header: friendly name above the tappable broadcasting
            IP. Round-6: rendered for EVERY robocar mode at a CONSTANT height
            (h-7) so the drive deck never shifts when the ESP_SER-only IP chip
            mounts/unmounts — the old conditional band pushed the joystick
            down as soon as the website-server mode appeared. ── */}
        {isRobocar && (
          <View className="mt-1 flex h-7 flex-shrink-0 flex-row items-center justify-between px-1">
            <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
              <View className={`h-1.5 w-1.5 shrink-0 rounded-full ${linked ? 'bg-green-400' : 'bg-slate-600'}`} />
              <Text numberOfLines={1} ellipsizeMode="middle" className="min-w-0 flex-1 text-[10px] font-bold text-muted dark:text-slate-300">
                {linked ? (friendlyBtName(deviceName) || 'Connected') : 'No link'}
              </Text>
            </View>
            {activeMode.id === 'website-server' ? (
              <Pressable
                onPress={handleOpenWebPage}
                accessibilityRole="link"
                accessibilityLabel={`Open car web page at ${telemetry.ip || '192.168.4.1'}`}
                hitSlop={6}
                className="ml-2 shrink-0 flex-row items-center gap-1 rounded-full border border-line bg-card px-2 py-0.5"
              >
                <Feather name={wifiConnected ? 'external-link' : 'wifi'} size={10} color={wifiConnected ? '#0284c7' : '#64748b'} />
                <Text className={`font-mono text-[9px] ${wifiConnected ? 'text-sky-700 dark:text-sky-300' : 'text-muted'}`} numberOfLines={1}>
                  {telemetry.ip || '192.168.4.1'}
                  {!telemetry.ip ? ' (AP)' : ''}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {/* ── D-pad / Joystick / Hide toggle — below top bar (A-19) ── */}
        {isRobocar && (
          <View className="flex-shrink-0 flex-row items-center justify-center gap-2 py-1">
            <Pressable
              onPress={() => { Vibration.vibrate(10); setShowJoystick(true); setUseJoystick(false) }}
              className={`rounded-full px-3 py-1 ${showJoystick && !useJoystick ? 'bg-navy' : 'border border-line bg-card'}`}
            >
              <Text className={`text-[10px] font-bold ${showJoystick && !useJoystick ? 'text-white' : 'text-muted'}`}>D-pad</Text>
            </Pressable>
            <Pressable
              onPress={() => { Vibration.vibrate(10); setShowJoystick(true); setUseJoystick(true) }}
              className={`rounded-full px-3 py-1 ${showJoystick && useJoystick ? 'bg-navy' : 'border border-line bg-card'}`}
            >
              <Text className={`text-[10px] font-bold ${showJoystick && useJoystick ? 'text-white' : 'text-muted'}`}>Joystick</Text>
            </Pressable>
            <Pressable
              onPress={() => { Vibration.vibrate(10); setShowJoystick(false) }}
              className={`rounded-full px-3 py-1 ${!showJoystick ? 'bg-navy' : 'border border-line bg-card'}`}
            >
              <Text className={`text-[10px] font-bold ${!showJoystick ? 'text-white' : 'text-muted'}`}>Hide</Text>
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
                <View className="flex-1 min-h-0 rounded-2xl border border-line bg-card p-3 shadow-card dark:bg-black/20">
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
            {showJoystick ? (
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
            ) : activeMode.controls.includes('pid-auto') ? (
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
                compact
                oledSlot={oledSlot}
              />
            ) : activeMode.id === 'website-server' ? (
              /* The ONE organized WiFi & Router panel — round-6: ONLY shown in
                 the web-server mode (that's the mode whose page this manages).
                 Hidden non-web modes get a tidy placeholder below instead of a
                 Router panel that leaked into every mode. */
              <RouterPanel
                canControl={canControl}
                linked={linked}
                carSsid={hub.carSsid}
                carApName={hub.carApName}
                ip={telemetry.ip ?? null}
                networks={hub.carNetworks}
                onUse={hub.routerUse}
                onAdd={hub.routerAdd}
                onDelete={hub.routerDelete}
                onOpenWebPage={handleOpenWebPage}
              />
            ) : (
              /* Round-6: non-web hidden modes — no router page to manage. */
              <View className="mt-2 flex-1 items-center justify-center rounded-2xl border border-line bg-card px-6 py-6 shadow-card">
                <Feather name="smartphone" size={26} color="#64748b" />
                <Text className="mt-2 text-sm font-bold text-ink dark:text-white">Pad hidden</Text>
                <Text className="mt-1 text-center text-xs leading-4 text-muted">
                  This mode has no WiFi page. Switch the car to ESP32 (Webserver)
                  to manage its saved networks here.
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

      {/* ── Settings dropdown ── */}
      {showSettings && (
        <>
          <Pressable
            className="absolute inset-0 z-30 bg-black/40"
            onPress={() => setShowSettings(false)}
            accessibilityLabel="Close settings"
          />
          <ScrollView
            className="absolute right-3 z-40 w-64 rounded-2xl border border-line bg-card p-2.5 shadow-xl"
            style={{ top: Math.max(insets.top, 8) + 48, maxHeight: height - 96 }}
            showsVerticalScrollIndicator={false}
          >
            <Text className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-muted">
              Settings · {is2wd1mActive ? '2WD1M' : activeMode.name.split('·')[0].trim()}
            </Text>

            {/* Round-6: dark-theme toggle mirrors the Account/Menu Appearance
                switch — drives AppContext.setThemeMode, which flips the
                semantic tokens (this screen + RouterPanel skin along with it). */}
            <View className="mt-1 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Feather name={themeMode === 'dark' ? 'moon' : 'sun'} size={14} color="#64748b" />
                <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">Dark theme</Text>
              </View>
              <Switch
                value={themeMode === 'dark'}
                onValueChange={(on) => setThemeMode(on ? 'dark' : 'light')}
                trackColor={{ false: '#cbd5e1', true: '#1e3a8a' }}
                thumbColor="#ffffff"
                accessibilityLabel="Toggle dark theme"
              />
            </View>

            {/* Steering limit + Trim (2WD1M only) */}
            <View className={`${is2wd1mActive ? '' : 'opacity-40'}`} pointerEvents={is2wd1mActive ? 'auto' : 'none'}>
              <View className="mt-1.5 flex-row items-center justify-between">
                <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">Steering</Text>
                <View className="flex-row items-center gap-2">
                  <Text className="font-mono text-[10px] font-bold text-ink dark:text-white">{steerLimit}°</Text>
                  <View className="flex-row gap-1">
                    <StepperPill onPress={() => adjustSteerLimit(-5)} disabled={!canControl} icon="minus" />
                    <StepperPill onPress={() => adjustSteerLimit(5)} disabled={!canControl} icon="plus" />
                  </View>
                </View>
              </View>
              <View className="mt-1 flex-row items-center justify-between border-t border-line pt-1">
                <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">Trim</Text>
                <View className="flex-row items-center gap-2">
                  <Text className="font-mono text-[10px] font-bold text-ink dark:text-white">{trim > 0 ? `+${trim}` : trim}°</Text>
                  <View className="flex-row gap-1">
                    <StepperPill onPress={() => adjustTrim(-1)} disabled={!canControl} icon="minus" />
                    <StepperPill onPress={() => adjustTrim(1)} disabled={!canControl} icon="plus" />
                  </View>
                </View>
              </View>
            </View>
            {!is2wd1mActive && (
              <Text className="mt-1 text-[9px] leading-3 text-muted">
                Steering &amp; trim: 2WD1M only.
              </Text>
            )}
          </ScrollView>
        </>
      )}

      {/* Reconnect banner — anchored to the bottom so it never collides with
          the phone status bar/notch in landscape. Shows when connection
          drops and auto-reconnect is exhausted. */}
      {showSppsRetry && (
        <View
          className="mx-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5"
          style={{ marginBottom: Math.max(insets.bottom, 8) }}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-xs font-bold text-amber-800">Connection lost</Text>
              <Text className="text-[10px] text-amber-600">Reconnect to your car?</Text>
            </View>
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => { Vibration.vibrate(10); void handleSppsRetry() }}
                className="rounded-full bg-gold px-3 py-1"
                hitSlop={6}
              >
                <Text className="text-[10px] font-bold text-white">Reconnect</Text>
              </Pressable>
              <Pressable
                onPress={() => { Vibration.vibrate(10); handleReconnectPromptCancel() }}
                className="rounded-full border border-slate-300 bg-white px-3 py-1"
                hitSlop={6}
              >
                <Text className="text-[10px] font-bold text-slate-500">Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Disconnect removed — owner rule: disconnect only via Control Panel. */}

    </View>
  )
}
