// =====================================================================
// RemoteControlScreen — the immersive "gaming remote" window opened from
// the Control Panel's header joystick icon.
//
// A full-screen, landscape-by-default controller that looks/feels like a
// gamepad (PUBG-style): big dual analog sticks / d-pads, action buttons,
// and a MINIMAL HUD (mode · speed · steer · link) — no debug cards.
// It shows the sections from mode chooser → about the device, but the
// informational ones (OLED mirror, 2WD1M extras, "about this mode") live
// behind a collapsible Details dock so the live game view stays clean.
//
// Fully usable WITHOUT a connected device: when nothing is linked a
// "Simulation" banner is shown, knobs/buttons still move and update the
// HUD, and commands simply no-op (so the layout can be tested/debugged in
// a browser with no hardware). All real transport logic is shared with
// ToolsScreen via useControlHub / sppService.
//
// Per-category setup:
//   robocar              → game drive deck (dual stick / d-pad) + HUD.
//   home/smart-farm/city → themed relay + live-sensor tiles.
//   drones               → altitude stick + gimbal pan/tilt + flight buttons.
// =====================================================================
import React, { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Feather } from '@expo/vector-icons'
import type { RootStackParamList } from '../navigation/types'
import { useControlHub } from '../components/tools/useControlHub'
import { DriveControls } from '../components/tools/DriveControls'
import { ModeChooser } from '../components/tools/ModeChooser'
import { OledDisplay } from '../components/tools/OledDisplay'
import { TwoWd1mExtras } from '../components/tools/TwoWd1mExtras'
import { SensorGrid } from '../components/tools/SensorGrid'
import { DroneControls } from '../components/tools/DroneControls'
import { ModeInfo } from '../components/tools/ModeInfo'

type Props = NativeStackScreenProps<RootStackParamList, 'RemoteControl'>
type Route = RouteProp<RootStackParamList, 'RemoteControl'>

/** The compact top HUD: link chip + mode + speed + steer. Only what a real
    joystick remote shows — no telemetry cards. */
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
    <View className="flex-row items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
      <View className="flex-row items-center gap-1.5">
        {/* Status dot — colour only. NOTE: never add an animate-* class here
            (react-native-css-interop conditional useAnimatedStyle → "rendered
            more hooks" crash). */}
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
    canControl, sppSupported, handleScan, handleConnect,
    sppDevices, scanning, connecting, handleDisconnect, wifiUrl,
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

  // Orientation layout state (landscape default; rotate flips the layout).
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape')
  // Details dock (OLED + extras + about) toggled from the game view.
  const [showDetails, setShowDetails] = useState(false)

  const linked = connected || wifiConnected
  const linkLabel = connected ? 'SPP LINK' : wifiConnected ? 'WIFI LINK' : 'NO LINK'
  const landscape = orientation === 'landscape'

  const deck = (
    <>
      {/* Drive deck — game sticks or d-pads with action buttons */}
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
        onRun={() => selectMode(activeMode)}
        onStop={() => { handleDirection('S'); handleServo(90) }}
        onEStop={is2wd1mActive ? handleEStop : undefined}
      />
    </>
  )

  return (
    <View className="flex-1 bg-slate-950">
      {/* ── Top chrome ── */}
      <View className="flex-row items-center justify-between px-4 pt-12">
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
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => setOrientation((o) => (o === 'landscape' ? 'portrait' : 'landscape'))}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5"
            accessibilityRole="button"
          >
            <Text className="text-xs font-bold text-white">{landscape ? 'Portrait' : 'Rotate'}</Text>
          </Pressable>
          <Pressable
            onPress={() => setShowDetails((v) => !v)}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5"
            accessibilityRole="button"
          >
            <Text className="text-xs font-bold text-white">{showDetails ? 'Hide details' : 'Details'}</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Simulation banner — shown when nothing is linked, so the remote
           stays fully usable for browser test/debug (commands no-op). ── */}
      {!linked && (
        <View className="mx-4 mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2">
          <Text className="text-[11px] font-bold text-amber-300">
            Simulation — no device linked. Controls move but nothing is sent. Connect from the Control Panel to drive a real car.
          </Text>
        </View>
      )}

      {/* ── Quick pair (when SPP available + not connected) ── */}
      {!linked && sppSupported && (
        <View className="mx-4 mt-3">
          <Pressable
            onPress={handleScan}
            disabled={scanning}
            className="flex-row items-center justify-center gap-2 rounded-full bg-navy px-4 py-2.5 disabled:opacity-60"
            accessibilityRole="button"
          >
            <Feather name="search" size={13} color="#fff" />
            <Text className="text-xs font-black text-white">
              {scanning ? 'Scanning…' : 'Scan cars (SPP)'}
            </Text>
          </Pressable>
          {sppDevices.length > 0 && (
            <View className="mt-2 rounded-xl border border-white/10 bg-white/5 p-2">
              {sppDevices.map((d) => (
                <Pressable
                  key={d.address}
                  onPress={() => handleConnect(d)}
                  disabled={connecting}
                  className="mt-1 flex-row items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                >
                  <Text className="flex-1 text-xs font-semibold text-white" numberOfLines={1}>{d.name}</Text>
                  <Text className="ml-2 text-xs font-bold text-emerald-300">
                    {connecting ? 'Connecting…' : 'Connect'}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ── Body: mode-driven / category-driven layout ── */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* HUD row (always present so the game board always looks live) */}
        <GameHud
          linked={linked}
          linkLabel={linkLabel}
          activeModeName={isDrone ? 'DRONE' : isNonRobocar ? activeCategory.toUpperCase() : activeMode.name}
          speed={speed}
          servo={servo}
          is2wd1m={is2wd1mActive}
        />

        {isDrone && (
          <View className="mt-4">
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
          </View>
        )}

        {!isDrone && isNonRobocar && (
          <View className="mt-4">
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
          </View>
        )}

        {!isNonRobocar && (
          <>
            {/* Mode changer + cycle (only for robocar) */}
            <View className="mt-4">
              <ModeChooser
                activeMode={activeMode}
                canControl={canControl}
                onSelect={selectMode}
                onCycle={cycleMode}
                modes={carModes}
              />
            </View>

            {/* Stick / D-pad toggle */}
            <View className="mt-3 flex-row items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
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

            {/* The game board */}
            <View className="mt-4">{deck}</View>
          </>
        )}

        {/* ── Details dock: OLED mirror + 2WD1M extras + about the mode.
             Kept behind a toggle so the live game view stays clean. ── */}
        {showDetails && (
          <View className="mt-4">
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

            {!isNonRobocar && is2wd1mActive && (
              <TwoWd1mExtras
                canControl={canControl}
                steerLimit={steerLimit}
                trim={trim}
                onAdjustSteerLimit={adjustSteerLimit}
                onAdjustTrim={adjustTrim}
              />
            )}

            {!isDrone && !isNonRobocar && <ModeInfo mode={activeMode} />}
          </View>
        )}
      </ScrollView>

      {/* ── Persistent game bar: E-stop (always on the board) ── */}
      <View className="border-t border-white/10 bg-black/40 px-4 py-3">
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={handleEStop}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-full bg-red-600 py-3"
            accessibilityRole="button"
          >
            <Feather name="octagon" size={14} color="#fff" />
            <Text className="text-sm font-black text-white">Emergency stop</Text>
          </Pressable>
          {linked && (
            <Pressable
              onPress={handleDisconnect}
              className="rounded-full border border-white/15 bg-white/5 px-4 py-3"
              accessibilityRole="button"
            >
              <Feather name="wifi-off" size={14} color="#fff" />
            </Pressable>
          )}
        </View>
        <Text className="mt-1 text-center text-[10px] text-slate-500">
          {wifiConnected ? `WiFi connected · ${wifiUrl}` : sppStatus === 'connected' ? `SPP connected · ${deviceName}` : 'Simulation — connect to drive'}
        </Text>
      </View>
    </View>
  )
}