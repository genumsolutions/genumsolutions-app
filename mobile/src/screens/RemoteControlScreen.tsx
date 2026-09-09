// =====================================================================
// RemoteControlScreen — the immersive "gaming remote" window opened from
// the Control Panel's header joystick icon.
//
// A single-screened game-style remote board (landscape) for robocars:
//
//   top chrome   Exit · REMOTE          [joystick↔d-pad] [⚙]
//   middle top   compact Mode dropdown + cycle · actual-size 2:1 OLED
//   bottom deck  dual joystick / dual d-pad fills the window (two-thumb),
//                slim speed strip at the bottom edge, E-stop FAB
//
// Settings opens as a small anchored dropdown (steer limit + trim). The
// whole deck is measured / flex-sized so nothing ever overflows the Remote
// window, whether a dropdown or panel is open or closed. The camera
// placeholder is gone and Simulation is only shown once (bottom bar).
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
import type { RootStackParamList } from '../navigation/types'
import { useControlHub } from '../components/tools/useControlHub'
import { DriveControls } from '../components/tools/DriveControls'
import { ModeChooser } from '../components/tools/ModeChooser'
import { OledDisplay } from '../components/tools/OledDisplay'
import { SensorGrid } from '../components/tools/SensorGrid'
import { DroneControls } from '../components/tools/DroneControls'

type Props = NativeStackScreenProps<RootStackParamList, 'RemoteControl'>
type Route = RouteProp<RootStackParamList, 'RemoteControl'>

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
      accessibilityRole="button"
      className="h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 disabled:opacity-40"
    >
      <Feather name={icon} size={16} color="#fff" />
    </Pressable>
  )
}

export function RemoteControlScreen({ navigation }: Props) {
  const route = useRoute<Route>()
  const routeCategory = route.params?.category
  const hub = useControlHub(routeCategory)
  const { width, height } = useWindowDimensions()
  const isLandscape = width > height

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

  // Back button pressed state for visual feedback
  const [backPressed, setBackPressed] = useState(false)

  // Actual-size 2:1 OLED for the game remote (128×64 physical shape).
  const oledWidth = Math.min(width * (isLandscape ? 0.22 : 0.68), 148)

  // Remote-window orientation: always lock landscape for the game-style
  // remote layout. Restore the phone's previous lock on back. Uses the SDK
  // 54 API (lockAsync takes an OrientationLock, not an options object); the
  // previous call silently no-op'd on device so the remote stayed portrait.
  const priorLockRef = useRef<ScreenOrientation.OrientationLock | null>(null)

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

  return (
    <View className="flex-1 bg-slate-950">
      {/* Single compact remote board — no scroll. The board is flex-sized so
          Settings / dropdowns / the OLED never push anything off-window. */}
      <View className="flex-1 overflow-hidden px-3 pt-8 pb-2">
        {/* Top chrome */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => navigation.goBack()}
              onPressIn={() => { setBackPressed(true); Vibration.vibrate(10) }}
              onPressOut={() => setBackPressed(false)}
              className={`rounded-full border border-white/10 px-3 py-1.5 ${backPressed ? 'bg-white/15 opacity-70' : 'bg-white/5'}`}
              accessibilityRole="button"
            >
              <Text className="text-sm font-bold text-white">Exit</Text>
            </Pressable>
            <Text className="text-sm font-black uppercase tracking-[0.22em] text-slate-400">Remote</Text>
          </View>
          <View className="flex-row items-center gap-2">
            {!isDrone && !isNonRobocar && (
              <Pressable
                onPress={() => { Vibration.vibrate(10); setUseJoystick(!useJoystick) }}
                accessibilityRole="button"
                accessibilityLabel={useJoystick ? 'Switch to D-pad' : 'Switch to Joystick'}
                className={`h-10 w-10 items-center justify-center rounded-full border ${useJoystick ? 'border-white/10 bg-navy' : 'border-white/15 bg-white/5'}`}
              >
                <Feather name={useJoystick ? 'move' : 'grid'} size={16} color="#fff" />
              </Pressable>
            )}
            {!isDrone && !isNonRobocar && (
              <Pressable
                onPress={() => setShowSettings((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="Settings"
                className={`h-10 w-10 items-center justify-center rounded-full border bg-white/5 ${showSettings ? 'border-navy bg-navy/50' : 'border-white/15'}`}
              >
                <Feather name="settings" size={16} color="#fff" />
              </Pressable>
            )}
          </View>
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
          <>
            {/* Middle-top: compact mode dropdown + cycle SIDE BY SIDE with the
                2:1 OLED in one compact row so the deck gets maximum room. The
                row is only as tall as the taller of the two (~74) and the
                joystick deck below claims every extra pixel. */}
            <View className="flex-shrink-0 flex-row items-center justify-center gap-3 pt-1.5">
              <ModeChooser
                activeMode={activeMode}
                canControl={canControl}
                onSelect={selectMode}
                onCycle={cycleMode}
                modes={carModes}
              />
              <View style={{ width: oledWidth, aspectRatio: 2 }} className="overflow-hidden rounded-2xl">
                <OledDisplay {...oledCommonProps} compact />
              </View>
            </View>

            {/* Drive deck — fills whatever room is left. Two-thumb reach:
                left stick/d-pad bottom-left, right stick/d-pad bottom-right,
                slim speed strip at the bottom edge. */}
            <View className="relative mt-1.5 min-h-0 flex-1">
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
              <Pressable
                onPress={() => { Vibration.vibrate(50); handleEStop() }}
                className="absolute bottom-2 right-2 h-14 w-14 items-center justify-center rounded-full bg-red-600 shadow-lg active:scale-95 active:bg-red-700"
                accessibilityRole="button"
                accessibilityLabel="Emergency stop"
              >
                <Feather name="octagon" size={22} color="#fff" />
              </Pressable>
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
              style={{ top: 70, maxHeight: height - 90 }}
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
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2.5"
              accessibilityRole="button"
            >
              <Feather name="wifi-off" size={16} color="#fff" />
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