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
import { Platform, Pressable, ScrollView, Text, View } from 'react-native'
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

/** The compact top HUD: link chip + mode + speed + steer. */
function GameHud({
  linked, linkLabel, activeModeName, speed, servo, is2wd1m,
}: {
  linked: boolean
  linkLabel: string
  activeModeName: string
  speed: number
  servo: number
  is2wd1m: boolean
}) {
  return (
    <View className="flex-row items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-1.5">
      <View className="flex-row items-center gap-1.5">
        <View className={`h-2 w-2 rounded-full ${linked ? 'bg-emerald-400' : 'bg-slate-500'}`} />
        <Text className="text-[10px] font-black uppercase tracking-wider text-slate-300">{linkLabel}</Text>
      </View>
      <Text className="text-[11px] font-bold text-white">{activeModeName}</Text>
      <Text className="font-mono text-xs font-bold text-emerald-300">SPD {Math.round(speed)}</Text>
      {is2wd1m && <Text className="font-mono text-xs font-bold text-amber-300">STR {Math.round(servo)}°</Text>}
    </View>
  )
}

export function RemoteControlScreen({ navigation }: Props) {
  const route = useRoute<Route>()
  const routeCategory = route.params?.category
  const hub = useControlHub(routeCategory)

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
  const linkLabel = connected ? 'SPP LINK' : wifiConnected ? 'WIFI LINK' : 'NO LINK'

  // Compact in-window settings panel state for the Remote screen's own
  // Settings toggle. This keeps Settings inside the same remote board
  // instead of pushing everything around.
  const [showSettings, setShowSettings] = useState(false)

  // Remote-window orientation: only touch orientation for this screen, and
  // restore the phone's previous orientation on back (so the rest of the app
  // never gets stuck in landscape after leaving Remote).
  //
  // Behavior: open in landscape only when the phone is already landscape;
  // otherwise keep portrait. That matches the owner's request that the whole
  // app should not flip to landscape after leaving the remote view, and it
  // still gives the game-style remote its best layout when the device is
  // already held in landscape.
  const [priorOrientation, setPriorOrientation] = useState<ScreenOrientation.Orientation | null>(null)
  const remoteOrientationRef = useRef<ScreenOrientation.Orientation | null>(null)
  const [desiredOrientation, setDesiredOrientation] = useState<ScreenOrientation.Orientation | null>(null)

  // Fetch orientation async on mount and derive desired lock state.
  useEffect(() => {
    ;(async () => {
      const orientation = Platform.OS === 'web' ? null : await ScreenOrientation.getOrientationAsync()
      if (orientation && Platform.OS !== 'web') {
        setPriorOrientation(orientation as ScreenOrientation.Orientation)
        // Only force landscape if already landscape; never force from portrait.
        if (
          orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
          orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
        ) {
          setDesiredOrientation(
            orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
              ? ScreenOrientation.Orientation.LANDSCAPE_LEFT
              : orientation
          )
        }
      }
    })()
  }, [])

  // Apply orientation lock and restore on unmount.
  useEffect(() => {
    let active = true
    let restored = false
    let lockCleanup: (() => void) | undefined

    // Lock to desired orientation on mount (if applicable).
    if (desiredOrientation && Platform.OS !== 'web') {
      ;(ScreenOrientation.lockAsync as any)({ orientation: desiredOrientation, errorHandler: () => {} })
        .then((cleanup: any) => { lockCleanup = cleanup })
        .catch(() => {; lockCleanup = undefined})
    }

    return () => {
      active = false
      // Restore the prior orientation when leaving Remote.
      if (!restored && priorOrientation && Platform.OS !== 'web' && remoteOrientationRef.current !== priorOrientation) {
        restored = true
        try {
          ;(ScreenOrientation.lockAsync as any)({ orientation: priorOrientation, errorHandler: () => {} })
            .then((cleanup: any) => { if (lockCleanup) lockCleanup() })
            .catch(() => {; lockCleanup = undefined})
        } catch { /* best-effort restore */ }
      }
      if (lockCleanup) lockCleanup()
    }
  }, [desiredOrientation, priorOrientation])

  return (
    <View className="flex-1 bg-slate-950">
      {/* Single compact remote board — no scroll. Everything stays on one
          organized game-style screen so the joystick area never slips away.
          The board is bounded so Settings and controls never overflow the
          remote window or fall below the visible area. */}
      <View className="flex-1 overflow-hidden px-3 pt-8 pb-2">
        {/* Top chrome */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => navigation.goBack()}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5"
              accessibilityRole="button"
            >
              <Text className="text-xs font-bold text-white">‹ Back</Text>
            </Pressable>
            <Text className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Remote</Text>
          </View>
          <Pressable
            onPress={() => setShowSettings((v) => !v)}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5"
            accessibilityRole="button"
          >
            <Text className="text-xs font-bold text-white">{showSettings ? 'Hide settings' : 'Settings'}</Text>
          </Pressable>
        </View>

        {/* Simulation banner — kept small so it does not dominate the board */}
        {!linked && (
          <View className="mb-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-1.5">
            <Text className="text-[10px] font-bold text-amber-300">
              Simulation — connect from the Control Panel to drive a real car.
            </Text>
          </View>
        )}

        {/* Compact single-screen remote layout */}
        <View className="flex-1">
          {/* Left column: compact device/telemetry card */}
          <View className="flex-row items-start gap-3 flex-shrink-0">
            <View className="flex-1 min-w-0">
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
            <View className="flex-1 min-w-0 flex flex-col">
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
                        className={`rounded-full px-3 py-1.5 ${!useJoystick ? 'bg-navy' : 'border border-white/15 bg-black/20'}`}
                      >
                        <Text className={`text-xs font-bold ${!useJoystick ? 'text-white' : 'text-slate-400'}`}>D-pad</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setUseJoystick(true)}
                        className={`rounded-full px-3 py-1.5 ${useJoystick ? 'bg-navy' : 'border border-white/15 bg-black/20'}`}
                      >
                        <Text className={`text-xs font-bold ${useJoystick ? 'text-white' : 'text-slate-400'}`}>Joystick</Text>
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
                  </View>

                  {/* In-window settings panel for 2WD1M extras — compact,
                      fits inside the same Remote board, never overflows. */}
                  {showSettings && (
                    <View className="mt-2 rounded-2xl border border-white/10 bg-black/40 p-3">
                      <Text className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-400">Settings</Text>
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
                        <Text className="text-[11px] text-slate-500">
                          Settings are only available for 2WD1M.
                        </Text>
                      )}
                    </View>
                  )}
                </>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* Persistent bottom bar: E-stop + disconnect + status line */}
      <View className="border-t border-white/10 bg-black/40 px-3 py-2">
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={handleEStop}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-full bg-red-600 py-2.5"
            accessibilityRole="button"
          >
            <Feather name="octagon" size={14} color="#fff" />
            <Text className="text-sm font-black text-white">Emergency stop</Text>
          </Pressable>
          {linked && (
            <Pressable
              onPress={handleDisconnect}
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2.5"
              accessibilityRole="button"
            >
              <Feather name="wifi-off" size={14} color="#fff" />
            </Pressable>
          )}
        </View>
        <Text className="mt-0.5 text-center text-[10px] text-slate-500">
          {wifiConnected ? `WiFi · ${wifiUrl}` : sppStatus === 'connected' ? `SPP · ${deviceName}` : 'Simulation'}
        </Text>
      </View>
    </View>
  )
}
