// =====================================================================
// RemoteControlScreen — the immersive "gaming remote" window opened from
// the Control Panel's header joystick icon.
//
// A compact single-screen remote that keeps the whole game-style control
// board on one organized screen: top HUD + link status, compact OLED-style
// telemetry card, mode + joystick/d-pad controls, and the drive board.
// Settings opens as an in-window panel so nothing overflows beyond the
// Remote window.
//
// Fully usable WITHOUT a connected device: when nothing is linked a
// "Simulation" banner is shown, knobs/buttons still move and update the
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
import { Platform, Pressable, ScrollView, Text, Vibration, View } from 'react-native'
import { useWindowDimensions } from 'react-native'
import { useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import * as ScreenOrientation from 'expo-screen-orientation'
import { Feather } from '@expo/vector-icons'
import type { RootStackParamList } from '../navigation/types'
import { useControlHub } from '../components/tools/useControlHub'
import { DriveControls } from '../components/tools/DriveControls'
import { ModeChooser } from '../components/tools/ModeChooser'
import { OledDisplay } from '../components/tools/OledDisplay'
import { TwoWd1mExtras } from '../components/tools/TwoWd1mExtras'
import { SensorGrid } from '../components/tools/SensorGrid'
import { DroneControls } from '../components/tools/DroneControls'

type Props = NativeStackScreenProps<RootStackParamList, 'RemoteControl'>
type Route = RouteProp<RootStackParamList, 'RemoteControl'>

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

  // Compact in-window settings panel state for the Remote screen's own
  // Settings toggle. This keeps Settings inside the same remote board
  // instead of pushing everything around.
  const [showSettings, setShowSettings] = useState(false)

  // Back button pressed state for visual feedback
  const [backPressed, setBackPressed] = useState(false)

  // Remote-window orientation: always lock landscape for the game-style
  // remote layout. Restore the phone's previous orientation on back.
  const priorOrientationRef = useRef<ScreenOrientation.Orientation | null>(null)
  const [desiredOrientation, setDesiredOrientation] = useState<ScreenOrientation.Orientation | null>(null)

  useEffect(() => {
    let lockCleanup: (() => void) | undefined
    ;(async () => {
      if (Platform.OS === 'web') return
      const orientation = await ScreenOrientation.getOrientationAsync()
      priorOrientationRef.current = orientation as ScreenOrientation.Orientation
      const landscape = ScreenOrientation.Orientation.LANDSCAPE_LEFT
      setDesiredOrientation(landscape)
      try {
        const cleanup = await (ScreenOrientation.lockAsync as any)({ orientation: landscape, errorHandler: () => {} })
        lockCleanup = cleanup
      } catch { lockCleanup = undefined }
    })()
    return () => { if (lockCleanup) lockCleanup() }
  }, [])

  // Restore prior orientation on unmount.
  useEffect(() => {
    return () => {
      if (priorOrientationRef.current && Platform.OS !== 'web') {
        try {
          ;(ScreenOrientation.lockAsync as any)({ orientation: priorOrientationRef.current, errorHandler: () => {} })
            .catch(() => {})
        } catch {}
      }
    }
  }, [])

  return (
    <View className="flex-1 bg-slate-950">
      {/* Single compact remote board — no scroll. Everything stays on one
          organized game-style screen so the joystick area never slips away.
          The board is bounded so Settings and controls never overflow the
          remote window or fall below the visible area. */}
      <View className="flex-1 overflow-hidden px-3 pt-8 pb-2">
        {/* Camera placeholder — reserved for future modes */}
        <View className="mb-1.5 self-start rounded-lg border border-dashed border-slate-600 bg-slate-900/50 px-3 py-2">
          <Text className="text-sm font-bold uppercase tracking-wide text-slate-500">📷 Camera — Future Mode</Text>
        </View>

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
              <Text className="text-sm font-bold text-white">‹ Back</Text>
            </Pressable>
            <Text className="text-sm font-black uppercase tracking-[0.22em] text-slate-400">Remote</Text>
          </View>
          {is2wd1mActive && (
            <Pressable
              onPress={() => setShowSettings((v) => !v)}
              className="flex-row items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5"
              accessibilityRole="button"
            >
              <Feather name="settings" size={14} color="#fff" />
              <Text className="text-sm font-bold text-white">Settings</Text>
            </Pressable>
          )}
        </View>

        {/* Simulation banner — compact inline chip */}
        {!linked && (
          <View className="mb-1.5 self-start rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1">
            <Text className="text-sm font-bold uppercase tracking-wide text-amber-300">
              Simulation
            </Text>
          </View>
        )}

        {/* Compact single-screen remote layout */}
        <View className="flex-1">
          {/* Left column: compact device/telemetry card */}
          <View className="flex-row items-start gap-3 flex-shrink-0">
            <View className={`min-w-0 ${isLandscape ? 'flex-[0.3]' : 'flex-1'} ${isLandscape ? 'max-h-[55%]' : 'max-h-[40%]'}`}>
              <OledDisplay
                connected={connected}
                wifiConnected={wifiConnected}
                deviceName={deviceName}
                activeMode={activeMode}
                speed={speed}
                servo={servo}
                driveStatus={driveStatus}
                targetAltitude={targetAltitude}
                gimbalPan={gimbalPan}
                gimbalTilt={gimbalTilt}
                sensorData={sensorData}
                telemetry={telemetry}
                isDrone={isDrone}
                isNonRobocar={isNonRobocar}
                linkKind={connected ? 'spp' : wifiConnected ? 'wifi' : undefined}
              />
            </View>

            {/* Right column: mode + controls — gets more space so the control
                board stays reachable in landscape without scrolling. */}
            <View className={`min-w-0 flex flex-col ${isLandscape ? 'flex-[0.7]' : 'flex-1'}`}>
              {isDrone ? (
                <View className="flex-1 min-h-0 bg-black/20 rounded-2xl border border-white/10 p-3">
                  <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 6 }}>
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
                  </ScrollView>
                </View>
              ) : isNonRobocar ? (
                <View className="flex-1 min-h-0 bg-black/20 rounded-2xl border border-white/10 p-3">
                  <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 6 }}>
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
                  </ScrollView>
                </View>
              ) : (
                <>
                  {/* Mode + control-style toggle — compact so the drive board
                      stays on the same screen. */}
                  <View className="flex-row items-center justify-between gap-2 flex-shrink-0">
                    <View className="min-w-0 flex-1">
                      <ModeChooser
                        activeMode={activeMode}
                        canControl={canControl}
                        onSelect={selectMode}
                        onCycle={cycleMode}
                        modes={carModes}
                      />
                    </View>
                    <View className="flex-row items-center gap-2 flex-shrink-0">
                      <Pressable
                        onPress={() => setUseJoystick(false)}
                        onPressIn={() => Vibration.vibrate(10)}
                        className={`rounded-full px-4 py-2 ${!useJoystick ? 'bg-navy' : 'border border-white/15 bg-black/20'}`}
                      >
                        <Text className={`text-sm font-bold ${!useJoystick ? 'text-white' : 'text-slate-400'}`}>D-pad</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setUseJoystick(true)}
                        onPressIn={() => Vibration.vibrate(10)}
                        className={`rounded-full px-4 py-2 ${useJoystick ? 'bg-navy' : 'border border-white/15 bg-black/20'}`}
                      >
                        <Text className={`text-sm font-bold ${useJoystick ? 'text-white' : 'text-slate-400'}`}>Joystick</Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* Drive board — compact so it stays on the same screen
                      as the OLED card and mode chooser. */}
                  <View className="mt-2 flex-shrink-0">
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
                    />
                    {/* Floating E-stop FAB — easy thumb reach in landscape */}
                    <Pressable
                      onPress={() => { Vibration.vibrate(50); handleEStop() }}
                      className="absolute bottom-3 right-3 h-14 w-14 items-center justify-center rounded-full bg-red-600 shadow-lg active:scale-95 active:bg-red-700"
                      accessibilityRole="button"
                    >
                      <Feather name="octagon" size={22} color="#fff" />
                    </Pressable>
                  </View>

                  {/* In-window settings panel for 2WD1M extras — compact,
                      fits inside the same Remote board, never overflows. */}
                  {showSettings && (
                    <View className="mt-2 rounded-2xl border border-white/10 bg-black/40 p-3">
                      <Text className="mb-2 text-sm font-black uppercase tracking-wide text-slate-400">Settings</Text>
                      {is2wd1mActive ? (
                        <View className="gap-3">
                          <TwoWd1mExtras
                            canControl={canControl}
                            steerLimit={steerLimit}
                            trim={trim}
                            onAdjustSteerLimit={adjustSteerLimit}
                            onAdjustTrim={adjustTrim}
                          />
                        </View>
                      ) : (
                        <View className="opacity-40">
                          <Text className="text-sm text-slate-500">
                            Settings are only available for 2WD1M.
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </>
              )}
            </View>
          </View>
        </View>
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
