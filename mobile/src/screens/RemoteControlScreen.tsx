// =====================================================================
// RemoteControlScreen — the immersive "gaming remote" window opened from
// the Control Panel's header joystick icon.
//
// A full-screen controller that looks/feels like a gamepad: big dual
// analog sticks / d-pads, action buttons, and a MINIMAL HUD (mode ·
// speed · steer · link). The OLED mirror is always visible above the
// drive deck. "Settings" toggles 2WD1M extras (steer limit + trim).
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
import React, { useEffect, useState } from 'react'
import { AppState, AppStateStatus, Pressable, Text, View } from 'react-native'
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
    // persistence
    savedPrefs, selectJoystickLayout,
    // derived
    isDrone, isNonRobocar, is2wd1mActive,
  } = hub

  // Remote window: professional gaming-style landscape controller.
  // We force landscape for this immersive window and keep the game UX self-contained.
  useEffect(() => {
    let cancelled = false
    const asyncLock = async () => {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_LEFT)
      } catch {
        /* orientation API may be unavailable on some web/emu setups */
      }
    }
    asyncLock()
    return () => { cancelled = true }
  }, [])

  // Persist joystick layout choice per device.
  useEffect(() => {
    if (!connected && !wifiConnected) return
    if (hub.savedPrefs?.joystickLayout) {
      hub.selectJoystickLayout(hub.savedPrefs.joystickLayout)
    }
  }, [connected, wifiConnected])

  // Settings dock (2WD1M extras) toggled from the game view.
  const [showSettings, setShowSettings] = useState(false)

  const linked = connected || wifiConnected
  const linkLabel = connected ? 'SPP LINK' : wifiConnected ? 'WIFI LINK' : 'NO LINK'

  return (
    <View className="flex-1 bg-slate-950">
      {/* ── Top chrome ── */}
      <View className="flex-row items-center justify-between px-3 pt-10 pb-1">
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

      {/* ── Simulation banner ── */}
      {!linked && (
        <View className="mx-3 mb-1 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-1.5">
          <Text className="text-[10px] font-bold text-amber-300">
            Simulation — connect from Control Panel to drive a real car.
          </Text>
        </View>
      )}

      {/* ── HUD ── */}
      <View className="px-3">
        <GameHud
          linked={linked}
          linkLabel={linkLabel}
          activeModeName={isDrone ? 'DRONE' : isNonRobocar ? activeCategory.toUpperCase() : activeMode.name}
          speed={speed}
          servo={servo}
          is2wd1m={is2wd1mActive}
        />
      </View>

      {/* ── OLED display — always visible ── */}
      <View className="px-3 mt-1">
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

      {/* ── Body: fills remaining space, no scroll ── */}
      <View className="flex-1 px-3 mt-1">

        {isDrone && (
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
        )}

        {!isDrone && isNonRobocar && (
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

        {!isNonRobocar && (
          <>
            {/* Mode changer + cycle (only for robocar) */}
            <ModeChooser
              activeMode={activeMode}
              canControl={canControl}
              onSelect={selectMode}
              onCycle={cycleMode}
              modes={carModes}
            />

            {/* Stick / D-pad toggle */}
            <View className="mt-1 flex-row items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-2">
              <Text className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Controls</Text>
              <View className="flex-row gap-2">
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

            {/* The game board — no onRun/onStop/onEStop (E-stop is in the bottom bar) */}
            <View className="mt-1">
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
              />
            </View>

            {/* Settings dock: 2WD1M extras (steer limit + trim) */}
            {showSettings && is2wd1mActive && (
              <View className="mt-1">
                <TwoWd1mExtras
                  canControl={canControl}
                  steerLimit={steerLimit}
                  trim={trim}
                  onAdjustSteerLimit={adjustSteerLimit}
                  onAdjustTrim={adjustTrim}
                />
              </View>
            )}
          </>
        )}
      </View>

      {/* ── Persistent bottom bar: E-stop + disconnect ── */}
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
