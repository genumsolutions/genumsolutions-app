// =====================================================================
// ToolsScreen - native IoT & Remote Controller.
// Real BLE scanning/control via react-native-ble-plx + WiFi WebSocket.
// Full control deck for all 9 car modes and 5 project categories.
// =====================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import { APP_VERSION } from '../config/site'
import { bleService, type CarTelemetry } from '../services/bleService'
import { LOCAL_CAR_MODES, nextMode, type CarMode } from '../config/roboCarCatalog'
import { PROJECT_CATEGORIES } from '../config/project-catalog'
import type { RootStackParamList } from '../navigation/types'
import { ConnectionPanel } from '../components/tools/ConnectionPanel'
import { ModeChooser } from '../components/tools/ModeChooser'
import { OledDisplay } from '../components/tools/OledDisplay'
import { DriveControls } from '../components/tools/DriveControls'
import { DroneControls } from '../components/tools/DroneControls'
import { SensorGrid } from '../components/tools/SensorGrid'
import type { SensorData } from '../components/tools/types'

type Nav = NativeStackNavigationProp<RootStackParamList, 'Tools'>
type Route = RouteProp<RootStackParamList, 'Tools'>

export function ToolsScreen() {
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()
  const routeCategory = route.params?.category
  const [devices, setDevices] = useState<{ id: string; name: string }[]>([])
  const [connected, setConnected] = useState(false)
  const [deviceName, setDeviceName] = useState('')
  const [activeCategory, setActiveCategory] = useState('robocar')
  const [activeMode, setActiveMode] = useState<CarMode>(LOCAL_CAR_MODES[0])
  const [speed, setSpeed] = useState(170)
  const [servo, setServo] = useState(90)
  const [telemetry, setTelemetry] = useState<CarTelemetry>({})
  const [driveStatus, setDriveStatus] = useState('Stop')
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [wifiConnected, setWifiConnected] = useState(false)
  const [wifiUrl, setWifiUrl] = useState('ws://192.168.4.1:81')
  const [scanningBle, setScanningBle] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pidKp, setPidKp] = useState(12.0)
  const [pidKi, setPidKi] = useState(3.0)
  const [pidKd, setPidKd] = useState(1.0)
  const [pidOut, setPidOut] = useState(0)
  const [pidOff, setPidOff] = useState(0)
  const [relays, setRelays] = useState<Record<number, boolean>>({})
  const [useJoystick, setUseJoystick] = useState(false)

  // Drone controls
  const [gimbalPan, setGimbalPan] = useState(90)
  const [gimbalTilt, setGimbalTilt] = useState(90)
  const [targetAltitude, setTargetAltitude] = useState(0)

  // Sensor data for non-robocar categories
  const [sensorData, setSensorData] = useState<SensorData>({
    temperature: 0,
    humidity: 0,
    soilMoisture: 0,
    lightLevel: 0,
    airQuality: 0,
    distance: 0,
  })

  const mountedRef = useRef(true)

  // Set category from route params if provided (e.g. from ProjectsScreen)
  useEffect(() => {
    if (routeCategory && PROJECT_CATEGORIES.some(c => c.slug === routeCategory)) {
      setActiveCategory(routeCategory)
    }
  }, [routeCategory])

  // BLE telemetry/status listeners removed from mount to prevent crashes on
  // devices without BLE support. Control actions are gated by `connected`
  // state and will only transmit when a car is actively connected.

  const handleScan = useCallback(async () => {
    setScanningBle(true)
    setError(null)
    try {
      const found = await bleService.scan(8)
      if (found.length > 0) {
        setDevices(found)
        setScanningBle(false)
      } else {
        setError('No BLE devices found. Is BLE enabled on your ESP32?')
        setScanningBle(false)
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'Scan failed')
        setScanningBle(false)
      }
    }
  }, [])

  const handleConnectBle = useCallback(async (deviceId: string) => {
    setConnecting(true)
    setError(null)
    try {
      await bleService.connect(deviceId)
      setConnected(true)
      setDeviceName(bleService.deviceName ?? 'Device')
      setConnecting(false)
      // Start listening for telemetry after connect
      bleService.onTelemetry((t) => {
        if (t.speed != null) setTelemetry(prev => ({ ...prev, speed: t.speed }))
        if (t.mode) setTelemetry(prev => ({ ...prev, mode: t.mode }))
        if (t.status) setTelemetry(prev => ({ ...prev, status: t.status }))
        if (t.angle != null) setTelemetry(prev => ({ ...prev, angle: t.angle }))
        if (t.kp != null) setTelemetry(prev => ({ ...prev, kp: t.kp }))
        if (t.ki != null) setTelemetry(prev => ({ ...prev, ki: t.ki }))
        if (t.kd != null) setTelemetry(prev => ({ ...prev, kd: t.kd }))
        if (t.out != null) setTelemetry(prev => ({ ...prev, out: t.out }))
        if (t.off != null) setTelemetry(prev => ({ ...prev, off: t.off }))
      })
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'Connect failed')
        setConnecting(false)
      }
    }
  }, [])

  const handleWifiConnect = useCallback(async () => {
    setError(null)
    if (!wifiUrl || wifiUrl === 'ws://192.168.4.1:81') {
      setError('Please enter a valid WiFi URL')
      return
    }
    setConnecting(true)
    try {
      const wsUrl = wifiUrl.startsWith('ws://') || wifiUrl.startsWith('wss://') ? wifiUrl : `ws://${wifiUrl}`
      const socket = new WebSocket(wsUrl)
      setWs(socket)
      socket.onopen = () => {
        setWifiConnected(true)
        setConnecting(false)
      }
      socket.onmessage = (event) => {
        try {
          const json = JSON.parse(event.data)
          if (json.telemetry) setTelemetry(json.telemetry)
          if (json.sensors) setSensorData(prev => ({ ...prev, ...json.sensors }))
        } catch { /* Ignore non-JSON messages */ }
      }
      socket.onerror = () => {
        setError('WiFi connection error')
        setWifiConnected(false)
        setConnecting(false)
      }
      socket.onclose = () => {
        setWifiConnected(false)
        setError('WiFi connection closed')
        setConnecting(false)
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'WiFi connect failed')
        setConnecting(false)
      }
    }
  }, [wifiUrl, connecting])

  const handleWifiDisconnect = useCallback(() => {
    if (ws) { ws.close(); setWs(null) }
    setWifiConnected(false)
    setError(null)
  }, [ws])

  const handleDisconnect = useCallback(async () => {
    await bleService.disconnect()
    if (ws) { ws.close(); setWs(null) }
    setConnected(false)
    setWifiConnected(false)
    setDeviceName('')
    setRelays({})
    setTelemetry({})
    setSensorData({ temperature: 0, humidity: 0, soilMoisture: 0, lightLevel: 0, airQuality: 0, distance: 0 })
    setDriveStatus('Stop')
    setSpeed(170)
    setServo(90)
    setPidKp(12.0)
    setPidKi(3.0)
    setPidKd(1.0)
    setPidOut(0)
    setPidOff(0)
    setGimbalPan(90)
    setGimbalTilt(90)
    setTargetAltitude(0)
  }, [ws])

  const sendCommand = useCallback((cmd: string) => {
    if (connected) void bleService.sendLine(cmd)
    if (wifiConnected && ws) ws.send(cmd)
  }, [connected, wifiConnected, ws])

  const handleDirection = useCallback((d: 'F' | 'B' | 'L' | 'R' | 'S') => {
    if (d === 'S') { setDriveStatus('Stop'); sendCommand('S'); return }
    setDriveStatus(d === 'F' ? 'Forward' : d === 'B' ? 'Backward' : d === 'L' ? 'Left' : 'Right')
    sendCommand(d)
  }, [sendCommand])

  const handleSpeed = useCallback((value: number) => {
    setSpeed(value)
    sendCommand(`SPD${Math.round(value)}`)
  }, [sendCommand])

  const handleServo = useCallback((value: number) => {
    setServo(value)
    sendCommand(`SERVO${Math.round(value)}`)
  }, [sendCommand])

  const applyPid = useCallback((key: 'kp' | 'ki' | 'kd' | 'out' | 'off', value: number) => {
    const next = { kp: pidKp, ki: pidKi, kd: pidKd, out: pidOut, off: pidOff }
    next[key] = value
    if (key === 'kp') setPidKp(value)
    if (key === 'ki') setPidKi(value)
    if (key === 'kd') setPidKd(value)
    if (key === 'out') setPidOut(value)
    if (key === 'off') setPidOff(value)
    void bleService.calibratePid(next)
    sendCommand(`CFG;Kp:${next.kp.toFixed(2)};Ki:${next.ki.toFixed(3)};Kd:${next.kd.toFixed(3)};OUT:${next.out.toFixed(0)};OFF:${next.off.toFixed(2)}`)
  }, [pidKp, pidKi, pidKd, pidOut, pidOff, sendCommand])

  const selectMode = useCallback((m: CarMode) => {
    setActiveMode(m)
    setDriveStatus('Stop')
    sendCommand(m.token)
    sendCommand('S')
  }, [sendCommand])

  const cycleMode = useCallback(() => {
    selectMode(nextMode(activeMode))
  }, [activeMode, selectMode])

  const toggleRelay = useCallback((i: number) => {
    setRelays(prev => {
      const next = !prev[i]
      sendCommand(`OUT${i}:${next ? 1 : 0}`)
      return { ...prev, [i]: next }
    })
  }, [sendCommand])

  // Drone control helpers
  const handleGimbalPan = useCallback((value: number) => { setGimbalPan(value); sendCommand(`GIMBAL_PAN:${Math.round(value)}`) }, [sendCommand])
  const handleGimbalTilt = useCallback((value: number) => { setGimbalTilt(value); sendCommand(`GIMBAL_TILT:${Math.round(value)}`) }, [sendCommand])
  const handleAltitude = useCallback((value: number) => { setTargetAltitude(value); sendCommand(`ALT:${Math.round(value)}`) }, [sendCommand])

  const canControl =
    (connected && (activeMode.transport.includes('ble') || activeMode.transport.includes('wifi'))) ||
    (wifiConnected && activeMode.transport.includes('wifi'))

  const isDrone = activeCategory === 'drones'
  const isNonRobocar = activeCategory !== 'robocar'

  return (
    <ScrollView className="flex-1 bg-mist" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      {/* Header */}
      <Text className="text-xs font-black uppercase tracking-widest text-navy">
        IoT & Remote Controller
      </Text>
      <Text className="mt-2 font-display text-2xl font-bold text-ink">
        {isDrone ? 'Drone & Aerial Controller' : 'Drive like the handheld remote'}
      </Text>

      {/* Category hubs */}
      <View className="mt-4 flex-row flex-wrap gap-2">
        {PROJECT_CATEGORIES.map((c) => (
          <Pressable
            key={c.slug}
            onPress={() => { setActiveCategory(c.slug); navigation.navigate('Category', { slug: c.slug }) }}
            className={`rounded-full px-4 py-2 ${activeCategory === c.slug ? 'bg-navy' : 'border border-line bg-card'}`}
          >
            <Text className={`text-xs font-bold ${activeCategory === c.slug ? 'text-white' : 'text-navy'}`}>
              {c.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text className="mt-2 text-xs leading-5 text-muted">
        Explore a category for an overview, or set it below to control its hardware live.
      </Text>

      {/* Connection panel */}
      <View className="mt-6">
        <ConnectionPanel
          connected={connected}
          wifiConnected={wifiConnected}
          deviceName={deviceName}
          scanningBle={scanningBle}
          connecting={connecting}
          devices={devices}
          wifiUrl={wifiUrl}
          error={error}
          onScan={handleScan}
          onConnectBle={handleConnectBle}
          onWifiConnect={handleWifiConnect}
          onWifiDisconnect={handleWifiDisconnect}
          onDisconnect={handleDisconnect}
          onSetWifiUrl={setWifiUrl}
          onClearError={() => setError(null)}
        />
      </View>

      {/* Mode chooser */}
      <View className="mt-6">
        <ModeChooser
          activeMode={activeMode}
          canControl={canControl}
          connected={connected}
          onSelect={selectMode}
          onCycle={cycleMode}
        />
      </View>

      {/* OLED display */}
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
        />
      </View>

      {/* Controls */}
      <View className={`mt-4 ${!canControl ? 'opacity-40' : ''}`}>
        {/* Input mode toggle (only for robocar categories with drive controls) */}
        {!isDrone && activeCategory === 'robocar' && (
          <View className="mb-3 flex-row items-center justify-between rounded-xl border border-line bg-card px-4 py-3">
            <Text className="text-xs font-bold text-muted">Control mode</Text>
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => setUseJoystick(false)}
                className={`rounded-full px-3 py-1.5 ${!useJoystick ? 'bg-navy' : 'border border-line bg-surface'}`}
              >
                <Text className={`text-xs font-bold ${!useJoystick ? 'text-white' : 'text-muted'}`}>D-pad</Text>
              </Pressable>
              <Pressable
                onPress={() => setUseJoystick(true)}
                className={`rounded-full px-3 py-1.5 ${useJoystick ? 'bg-navy' : 'border border-line bg-surface'}`}
              >
                <Text className={`text-xs font-bold ${useJoystick ? 'text-white' : 'text-muted'}`}>Joystick</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Drive controls (d-pad or joysticks, speed, servo, PID, start/stop) */}
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
          useJoystick={useJoystick}
          onDirection={handleDirection}
          onSpeed={handleSpeed}
          onServo={handleServo}
          onPid={applyPid}
          onRun={() => { sendCommand('F'); setDriveStatus(`${activeMode.name} running`) }}
          onStop={() => { sendCommand('S'); setDriveStatus(`${activeMode.name} stopped`) }}
        />

        {/* Drone controls */}
        {isDrone && (
          <DroneControls
            canControl={canControl}
            targetAltitude={targetAltitude}
            gimbalPan={gimbalPan}
            gimbalTilt={gimbalTilt}
            onAltitude={handleAltitude}
            onGimbalPan={handleGimbalPan}
            onGimbalTilt={handleGimbalTilt}
            onCommand={sendCommand}
            onSetAltitude={setTargetAltitude}
          />
        )}

        {/* Sensor grid + relay toggles */}
        <SensorGrid
          canControl={canControl}
          isDrone={isDrone}
          isNonRobocar={isNonRobocar}
          activeCategory={activeCategory}
          sensorData={sensorData}
          relays={relays}
          telemetry={telemetry}
          onToggleRelay={toggleRelay}
        />
      </View>

      {/* Footer */}
      <View className="mt-6 rounded-lg border border-line bg-card p-4">
        <Text className="text-sm font-semibold text-navy">GENUM Solutions</Text>
        <Text className="mt-0.5 text-xs text-muted">App v{APP_VERSION} · IoT & Remote Controller</Text>
      </View>
    </ScrollView>
  )
}
