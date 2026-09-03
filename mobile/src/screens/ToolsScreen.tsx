// =====================================================================
// ToolsScreen - native IoT & Remote Controller.
// Real BLE scanning/control via react-native-ble-plx + WiFi WebSocket.
// Full control deck for all 9 car modes and 5 project categories.
// =====================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import { APP_VERSION } from '../config/site'
import { bleService, type CarTelemetry } from '../services/bleService'
import { LOCAL_CAR_MODES, nextMode, type CarMode } from '../config/roboCarCatalog'
import { PROJECT_CATEGORIES } from '../config/project-catalog'
import type { RootStackParamList } from '../navigation/types'
import { ConnectionPanel } from '../components/tools/ConnectionPanel'
import { CategoryOverview } from '../components/tools/CategoryOverview'
import { ModeChooser } from '../components/tools/ModeChooser'
import { OledDisplay } from '../components/tools/OledDisplay'
import { DriveControls } from '../components/tools/DriveControls'
import { DroneControls } from '../components/tools/DroneControls'
import { SensorGrid } from '../components/tools/SensorGrid'
import { ModeInfo } from '../components/tools/ModeInfo'
import type { SensorData } from '../components/tools/types'

type Route = RouteProp<RootStackParamList, 'Tools'>

// WiFi WebSocket resilience: reconnect after an unexpected drop, but give up
// after a few attempts so we don't retry forever against a dead device.
const WIFI_RECONNECT_DELAY_MS = 3000
const WIFI_MAX_RECONNECT_ATTEMPTS = 5

// Continuous controls (speed/servo sliders, joystick steering) must not flood
// the BLE/WiFi link — mirror the physical remote's ~30ms resend cadence.
const DRIVE_CMD_MIN_INTERVAL_MS = 50

export function ToolsScreen() {
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

  const scrollViewRef = useRef<ScrollView | null>(null)
  const mountedRef = useRef(true)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  // When true, the socket was closed on purpose (user disconnect / unmount)
  // and must NOT be reconnected automatically.
  const manualCloseRef = useRef(false)
  // Timestamp of the last wire send per command kind ('spd' | 'servo'), used
  // to throttle continuous slider/joystick streams.
  const lastDriveCmdAtRef = useRef<Record<string, number>>({})

  // Set category from route params if provided (e.g. from ProjectsScreen)
  useEffect(() => {
    if (routeCategory && PROJECT_CATEGORIES.some(c => c.slug === routeCategory)) {
      setActiveCategory(routeCategory)
    }
  }, [routeCategory])

  // Category chips reconfigure the remote window in place and reveal the
  // selected category's overview at the bottom of the screen — they never
  // navigate to a separate page (per product decision).
  const handleCategoryPress = useCallback((slug: string) => {
    setActiveCategory(slug)
    // Let the panel render, then bring it into view under the remote window.
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true })
    }, 80)
  }, [])

  // Cleanup on unmount: stop reconnect timers, close the socket, and mark
  // the close as intentional so onclose never schedules a reconnect.
  useEffect(() => {
    return () => {
      mountedRef.current = false
      manualCloseRef.current = true
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (wsRef.current) {
        try { wsRef.current.close() } catch { /* ignore */ }
        wsRef.current = null
      }
    }
  }, [])

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

  // Open a WiFi WebSocket and wire up telemetry. On an unexpected close,
  // auto-reconnect up to WIFI_MAX_RECONNECT_ATTEMPTS times; user-initiated
  // disconnects (manualCloseRef) skip reconnection entirely.
  const openSocket = useCallback((url: string) => {
    setConnecting(true)
    let socket: WebSocket
    try {
      socket = new WebSocket(url)
    } catch (e) {
      setConnecting(false)
      setError(e instanceof Error ? e.message : 'WiFi connect failed')
      return
    }
    wsRef.current = socket
    setWs(socket)
    socket.onopen = () => {
      // Connected — reset the counter so a later drop gets a full budget
      reconnectAttemptsRef.current = 0
      setWifiConnected(true)
      setConnecting(false)
      setError(null)
    }
    socket.onmessage = (event) => {
      try {
        const json = JSON.parse(event.data)
        if (json.telemetry) setTelemetry(json.telemetry)
        if (json.sensors) setSensorData(prev => ({ ...prev, ...json.sensors }))
      } catch { /* Ignore non-JSON messages */ }
    }
    socket.onerror = () => {
      // onclose always follows onerror — the close handler owns cleanup
    }
    socket.onclose = () => {
      setWifiConnected(false)
      setConnecting(false)
      // Only clear state if this socket is still the active one
      if (wsRef.current === socket) {
        wsRef.current = null
        setWs(null)
      }
      if (manualCloseRef.current) return
      if (reconnectAttemptsRef.current >= WIFI_MAX_RECONNECT_ATTEMPTS) {
        setError('WiFi connection lost — reconnection failed. Tap Connect WiFi to retry.')
        return
      }
      reconnectAttemptsRef.current += 1
      setError(`WiFi connection lost — reconnecting (attempt ${reconnectAttemptsRef.current}/${WIFI_MAX_RECONNECT_ATTEMPTS})…`)
      reconnectTimerRef.current = setTimeout(() => openSocket(url), WIFI_RECONNECT_DELAY_MS)
    }
  }, [])

  const handleWifiConnect = useCallback(() => {
    setError(null)
    if (!wifiUrl || wifiUrl === 'ws://192.168.4.1:81') {
      setError('Please enter a valid WiFi URL')
      return
    }
    // Cancel any pending auto-reconnect so it can't open a second socket
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    const wsUrl = wifiUrl.startsWith('ws://') || wifiUrl.startsWith('wss://') ? wifiUrl : `ws://${wifiUrl}`
    manualCloseRef.current = false
    reconnectAttemptsRef.current = 0
    openSocket(wsUrl)
  }, [wifiUrl, openSocket])

  const handleWifiDisconnect = useCallback(() => {
    manualCloseRef.current = true
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (ws) { ws.close(); setWs(null) }
    setWifiConnected(false)
    setError(null)
  }, [ws])

  const handleDisconnect = useCallback(async () => {
    manualCloseRef.current = true
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    reconnectAttemptsRef.current = 0
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

  // Send at most one command of a kind every DRIVE_CMD_MIN_INTERVAL_MS while
  // still updating UI state on every change (slider value, servo angle).
  const sendThrottled = useCallback((kind: string, cmd: string) => {
    const now = Date.now()
    const last = lastDriveCmdAtRef.current[kind] ?? 0
    if (now - last < DRIVE_CMD_MIN_INTERVAL_MS) return
    lastDriveCmdAtRef.current[kind] = now
    sendCommand(cmd)
  }, [sendCommand])

  const handleSpeed = useCallback((value: number) => {
    setSpeed(value)
    sendThrottled('spd', `SPD${Math.round(value)}`)
  }, [sendThrottled])

  const handleServo = useCallback((value: number) => {
    setServo(value)
    sendThrottled('servo', `SERVO${Math.round(value)}`)
  }, [sendThrottled])

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
    <ScrollView
      ref={scrollViewRef}
      className="flex-1 bg-mist"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
    >
      {/* Header */}
      <Text className="text-xs font-black uppercase tracking-widest text-navy">
        IoT & Remote Controller
      </Text>
      <Text className="mt-2 font-display text-2xl font-bold text-ink">
        {isDrone ? 'Drone & Aerial Controller' : 'Drive like the handheld remote'}
      </Text>

      {/* Category hubs — choosing one reconfigures the remote below and shows
          the category overview at the bottom of this screen (no navigation). */}
      <View className="mt-4 flex-row flex-wrap gap-2">
        {PROJECT_CATEGORIES.map((c) => (
          <Pressable
            key={c.slug}
            onPress={() => handleCategoryPress(c.slug)}
            accessibilityRole="button"
            accessibilityState={{ selected: activeCategory === c.slug }}
            className={`rounded-full px-4 py-2 ${activeCategory === c.slug ? 'bg-navy' : 'border border-line bg-card'}`}
          >
            <Text className={`text-xs font-bold ${activeCategory === c.slug ? 'text-white' : 'text-navy'}`}>
              {c.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text className="mt-2 text-xs leading-5 text-muted">
        Pick a category to set the remote window for its hardware. Its overview and typical
        hardware are listed below the controls.
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
          onSelect={selectMode}
          onCycle={cycleMode}
        />
      </View>

      {/* Mode info (mobile adaptation of the website's legend side panel) */}
      <View className="mt-4">
        <ModeInfo mode={activeMode} />
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

      {/* Category overview — inline, below the whole remote window */}
      <View className="mt-6">
        <CategoryOverview category={PROJECT_CATEGORIES.find((c) => c.slug === activeCategory)} />
      </View>

      {/* Footer */}
      <View className="mt-6 rounded-lg border border-line bg-card p-4">
        <Text className="text-sm font-semibold text-navy">GENUM Solutions</Text>
        <Text className="mt-0.5 text-xs text-muted">App v{APP_VERSION} · IoT & Remote Controller</Text>
      </View>
    </ScrollView>
  )
}
