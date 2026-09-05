// =====================================================================
// ToolsScreen - native IoT & Remote Controller.
// Real Bluetooth SPP + WiFi WebSocket control for GENUM ESP32 cars.
// Mirrors the hand-held ESP remote (Genum_ESP32_Remote_v1.0.0) OLED display.
// Full control deck for all 9 car modes and 5 project categories.
// =====================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useRoute, type RouteProp } from '@react-navigation/native'
import { Feather } from '@expo/vector-icons'
import { APP_VERSION } from '../config/site'
import { sppService, type SppDevice } from '../services/sppService'
import { LOCAL_CAR_MODES, type CarMode } from '../config/roboCarCatalog'
import { getCarModes } from '../services/carModeService'
import { PROJECT_CATEGORIES } from '../config/project-catalog'
import type { RootStackParamList } from '../navigation/types'
import { CategoryOverview } from '../components/tools/CategoryOverview'
import { ModeChooser } from '../components/tools/ModeChooser'
import { OledDisplay } from '../components/tools/OledDisplay'
import { DriveControls } from '../components/tools/DriveControls'
import { TwoWd1mExtras } from '../components/tools/TwoWd1mExtras'
import { DroneControls } from '../components/tools/DroneControls'
import { SensorGrid } from '../components/tools/SensorGrid'
import { ModeInfo } from '../components/tools/ModeInfo'
import type { SensorData } from '../components/tools/types'
import type { CarTelemetry } from '../services/carProtocol'

type Route = RouteProp<RootStackParamList, 'Tools'>

// Classic BT SPP is the primary transport for ESP32 robot cars (matches the
// physical ESP remote and MIT apps). WiFi WebSocket is for wireless-car modes.
// Continuous drive sends mirror the physical remote's ~30ms resend cadence.
const DRIVE_CMD_MIN_INTERVAL_MS = 50
const WIFI_RECONNECT_DELAY_MS = 3000
const WIFI_MAX_RECONNECT_ATTEMPTS = 5

export function ToolsScreen() {
  const route = useRoute<Route>()
  const routeCategory = route.params?.category

  // ---- Connection state (SPP primary, WiFi secondary) ----
  const [sppDevices, setSppDevices] = useState<SppDevice[]>([])
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [deviceName, setDeviceName] = useState('')
  const [scanning, setScanning] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [wifiConnected, setWifiConnected] = useState(false)
  const [wifiUrl, setWifiUrl] = useState('ws://192.168.4.1:81')
  const [error, setError] = useState<string | null>(null)
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null)
  const [connectionMsgType, setConnectionMsgType] = useState<'success' | 'error' | null>(null)

  // ---- Active mode + state (mirrors ESP remote) ----
  const [activeCategory, setActiveCategory] = useState('robocar')
  const [activeMode, setActiveMode] = useState<CarMode>(LOCAL_CAR_MODES[0]) // 2WD1M as default primary
  const [speed, setSpeed] = useState(170)
  const [servo, setServo] = useState(90)
  const [steerLimit, setSteerLimit] = useState(90) // 2WD1M max servo deflection (like ESP remote)
  const [trim, setTrim] = useState(0) // 2WD1M steering trim
  const [driveStatus, setDriveStatus] = useState('Stop')
  const [telemetry, setTelemetry] = useState<CarTelemetry>({})

  // ---- PID state (for self-balancing mode) ----
  const [pidKp, setPidKp] = useState(12.0)
  const [pidKi, setPidKi] = useState(3.0)
  const [pidKd, setPidKd] = useState(1.0)
  const [pidOut, setPidOut] = useState(0)
  const [pidOff, setPidOff] = useState(0)

  // ---- Drone controls ----
  const [gimbalPan, setGimbalPan] = useState(90)
  const [gimbalTilt, setGimbalTilt] = useState(90)
  const [targetAltitude, setTargetAltitude] = useState(0)

  // ---- Sensor data for non-robocar categories ----
  const [sensorData, setSensorData] = useState<SensorData>({
    temperature: 0,
    humidity: 0,
    soilMoisture: 0,
    lightLevel: 0,
    airQuality: 0,
    distance: 0,
  })

  // ---- Control mode toggle ----
  const [useJoystick, setUseJoystick] = useState(false)

  // ---- Relays for non-robocar categories ----
  const [relays, setRelays] = useState<Record<number, boolean>>({})

  const scrollViewRef = useRef<ScrollView | null>(null)
  const mountedRef = useRef(true)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const manualCloseRef = useRef(false)
  const lastDriveCmdAtRef = useRef<Record<string, number>>({})

  // Car-mode catalogue: DB-first with bundled fallback
  const [carModes, setCarModes] = useState<CarMode[]>(LOCAL_CAR_MODES)

  // Load car modes from Supabase (or fallback to bundled)
  useEffect(() => {
    let active = true
    getCarModes()
      .then((modes) => {
        if (!active || modes.length === 0) return
        setCarModes(modes)
        // Default to 2WD1M if available, otherwise first mode
        const target = modes.find((m) => m.id === '2wd1m') || modes[0]
        setActiveMode(target)
      })
      .catch(() => { /* keep bundled fallback */ })
    return () => { active = false }
  }, [])

  // Set category from route params
  useEffect(() => {
    if (routeCategory && PROJECT_CATEGORIES.some(c => c.slug === routeCategory)) {
      setActiveCategory(routeCategory)
    }
  }, [routeCategory])

  // Show connection message for a few seconds, then clear
  const showConnectionMessage = useCallback((msg: string, type: 'success' | 'error') => {
    setConnectionMessage(msg)
    setConnectionMsgType(type)
    setTimeout(() => {
      if (connectionMessage === msg) {
        setConnectionMessage(null)
        setConnectionMsgType(null)
      }
    }, 4000)
  }, [])

  const handleCategoryPress = useCallback((slug: string) => {
    setActiveCategory(slug)
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true })
    }, 80)
  }, [])

  // Cleanup on unmount
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
      void sppService.disconnect().catch(() => {})
    }
  }, [])

  // Telemetry wiring (SPP service)
  useEffect(() => {
    if (!activeMode) return
    const applyTelemetry = (t: CarTelemetry) => {
      if (!mountedRef.current) return
      setTelemetry((prev) => ({ ...prev, ...t }))
      if (t.status) setDriveStatus(t.status)
      if (t.speed != null) setSpeed(t.speed)
      if (t.trim != null) setTrim(t.trim)
    }
    const offSpp = sppService.onTelemetry(applyTelemetry)
    return () => { offSpp() }
  }, [activeMode])

  // Check if SPP is supported on this device
  const sppSupported = sppService.supported

  // Scan for SPP devices (Classic Bluetooth)
  const handleScan = useCallback(async () => {
    if (!sppSupported) {
      setError('Classic Bluetooth (SPP) is not available on this device')
      return
    }
    setScanning(true)
    setError(null)
    setSppDevices([])
    try {
      const devices = await sppService.scan()
      if (devices.length > 0) {
        setSppDevices(devices)
        if (connectionMsgType) {
          setConnectionMessage(null)
          setConnectionMsgType(null)
        }
      } else {
        setError('No Bluetooth cars found. Make sure your ESP32 car is powered on.')
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'Scan failed')
      }
    } finally {
      if (mountedRef.current) setScanning(false)
    }
  }, [sppSupported, connectionMsgType])

  // Connect to SPP device
  const handleConnect = useCallback(async (device: SppDevice) => {
    setConnecting(true)
    setError(null)
    try {
      await sppService.connect(device.address)
      setConnected(true)
      setDeviceName(device.name)
      setConnecting(false)
      setWifiConnected(false)
      showConnectionMessage(`Connected to ${device.name}`, 'success')
      // Request state from car after connect (like ESP remote does)
      void sppService.requestState().catch(() => {})
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'Connection failed')
        setConnecting(false)
        showConnectionMessage(e instanceof Error ? e.message : 'Connection failed', 'error')
      }
    }
  }, [showConnectionMessage])

  // WiFi WebSocket
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
    socket.onopen = () => {
      reconnectAttemptsRef.current = 0
      setWifiConnected(true)
      setConnected(true)
      setConnecting(false)
      setError(null)
      showConnectionMessage('WiFi connected', 'success')
    }
    socket.onmessage = (event) => {
      try {
        const json = JSON.parse(event.data)
        if (json.telemetry) setTelemetry(json.telemetry)
        if (json.sensors) setSensorData(prev => ({ ...prev, ...json.sensors }))
      } catch { /* Ignore non-JSON */ }
    }
    socket.onclose = () => {
      setWifiConnected(false)
      setConnecting(false)
      if (wsRef.current === socket) {
        wsRef.current = null
      }
      if (manualCloseRef.current) return
      if (reconnectAttemptsRef.current >= WIFI_MAX_RECONNECT_ATTEMPTS) {
        setError('WiFi connection lost — reconnection failed.')
        return
      }
      reconnectAttemptsRef.current += 1
      reconnectTimerRef.current = setTimeout(() => openSocket(url), WIFI_RECONNECT_DELAY_MS)
    }
    socket.onerror = () => { /* onclose owns cleanup */ }
  }, [showConnectionMessage])

  const handleWifiConnect = useCallback(() => {
    setError(null)
    if (!wifiUrl || wifiUrl === 'ws://192.168.4.1:81') {
      setError('Enter the car WiFi address (e.g. ws://192.168.4.1:81)')
      return
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    const wsUrl = wifiUrl.startsWith('ws://') || wifiUrl.startsWith('wss://') ? wifiUrl : `ws://${wifiUrl}`
    manualCloseRef.current = false
    reconnectAttemptsRef.current = 0
    openSocket(wsUrl)
  }, [wifiUrl, openSocket, showConnectionMessage])

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
    // Safe stop: send SPD0 and SERVO90 (like ESP remote on disconnect)
    try { await sppService.sendLine('SPD0') } catch { /* ignore */ }
    try { await sppService.sendLine('SERVO90') } catch { /* ignore */ }
    await sppService.disconnect()
    if (ws) { ws.close(); setWs(null) }
    setConnected(false)
    setWifiConnected(false)
    setDeviceName('')
    setSppDevices([])
    setDriveStatus('Stop')
    setSpeed(170)
    setServo(90)
    setSteerLimit(90)
    setTrim(0)
    setPidKp(12.0)
    setPidKi(3.0)
    setPidKd(1.0)
    setPidOut(0)
    setPidOff(0)
    setGimbalPan(90)
    setGimbalTilt(90)
    setTargetAltitude(0)
    setTelemetry({})
    setSensorData({ temperature: 0, humidity: 0, soilMoisture: 0, lightLevel: 0, airQuality: 0, distance: 0 })
  }, [])

  // Send command via SPP (primary) or WiFi
  const sendCommand = useCallback((cmd: string) => {
    if (connected && sppService.isConnected) {
      void sppService.sendLine(cmd).catch(() => {})
    }
    if (wifiConnected && wsRef.current) {
      try { wsRef.current.send(cmd + '\n') } catch { /* ignore */ }
    }
  }, [connected, wifiConnected])

  const handleDirection = useCallback((d: 'F' | 'B' | 'L' | 'R' | 'S') => {
    if (d === 'S') { setDriveStatus('Stop'); sendCommand('S'); return }
    setDriveStatus(d === 'F' ? 'Forward' : d === 'B' ? 'Backward' : d === 'L' ? 'Left' : 'Right')
    sendCommand(d)
  }, [sendCommand])

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
    sendCommand(`CFG;Kp:${next.kp.toFixed(2)};Ki:${next.ki.toFixed(3)};Kd:${next.kd.toFixed(3)};OUT:${next.out.toFixed(0)};OFF:${next.off.toFixed(2)}`)
  }, [pidKp, pidKi, pidKd, pidOut, pidOff, sendCommand])

  // ESP-remote 2WD1M parity: left stick streams signed SPD
  const handleStickDrive = useCallback((signed: number) => {
    setDriveStatus(signed > 0 ? 'Forward' : signed < 0 ? 'Backward' : 'Stop')
    sendThrottled('spd', `SPD${Math.round(signed)}`)
  }, [sendThrottled])

  const adjustSteerLimit = useCallback((delta: number) => {
    setSteerLimit((prev) => Math.max(0, Math.min(180, prev + delta)))
  }, [])

  const adjustTrim = useCallback((delta: number) => {
    setTrim((prev) => {
      const next = Math.max(-90, Math.min(90, prev + delta))
      sendCommand(`TRIM${next}`)
      return next
    })
  }, [sendCommand])

  const handleEStop = useCallback(() => {
    setDriveStatus('EMERGENCY STOP')
    sendCommand('ESTOP')
    sendCommand('SPD0')
    sendCommand('SERVO90')
  }, [sendCommand])

  const selectMode = useCallback((m: CarMode) => {
    setActiveMode(m)
    setDriveStatus('Stop')
    sendCommand(m.token)
    sendCommand('S')
  }, [sendCommand])

  const cycleMode = useCallback(() => {
    const list = carModes.length > 0 ? carModes : LOCAL_CAR_MODES
    const idx = list.findIndex((m) => m.id === activeMode.id)
    selectMode(idx === -1 ? list[0] : list[(idx + 1) % list.length])
  }, [activeMode, selectMode, carModes])

  const toggleRelay = useCallback((i: number) => {
    setRelays(prev => {
      const next = !prev[i]
      sendCommand(`OUT${i}:${next ? 1 : 0}`)
      return { ...prev, [i]: next }
    })
  }, [sendCommand]) // eslint-disable-line @typescript-eslint/no-explicit-any

  const handleGimbalPan = useCallback((value: number) => { setGimbalPan(value); sendCommand(`GIMBAL_PAN:${Math.round(value)}`) }, [sendCommand])
  const handleGimbalTilt = useCallback((value: number) => { setGimbalTilt(value); sendCommand(`GIMBAL_TILT:${Math.round(value)}`) }, [sendCommand])
  const handleAltitude = useCallback((value: number) => { setTargetAltitude(value); sendCommand(`ALT:${Math.round(value)}`) }, [sendCommand])

  // Determine transport based on mode
  const useSpp = activeMode.transport.includes('classic-bt') && sppSupported
  const useWifi = activeMode.transport.includes('wifi')
  const canControl = connected || wifiConnected

  const isDrone = activeCategory === 'drones'
  const isNonRobocar = activeCategory !== 'robocar'
  const is2wd1mActive = activeMode.controls.includes('drive-2wd1m')

  return (
    <ScrollView
      ref={scrollViewRef}
      className="flex-1 bg-mist"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
    >
      {/* Header */}
      <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
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

      {/* Connection panel with SPP device selection */}
      <View className="mt-6">
        {/* Connection status bar */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <View className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-accent' : 'bg-border'}`} />
            <Text className="text-sm font-bold text-ink">
              {connected ? `Connected · ${deviceName}` : wifiConnected ? 'WiFi Connected' : 'Not connected'}
            </Text>
          </View>
          {connected && (
            <Pressable onPress={handleDisconnect}>
              <Text className="text-sm font-bold text-gold underline">Disconnect</Text>
            </Pressable>
          )}
        </View>

        {/* Connection message */}
        {connectionMessage && (
          <View className={`mt-3 rounded-xl px-4 py-3 ${connectionMsgType === 'success' ? 'bg-accent/10 border border-accent/20' : 'bg-red-50 border border-red-200'}`}>
            <Text className={`text-sm font-bold ${connectionMsgType === 'success' ? 'text-accent' : 'text-red-600'}`}>
              {connectionMessage}
            </Text>
          </View>
        )}

        {/* SPP Scan + Connect */}
        {useSpp && (
          <View className="mt-4 rounded-2xl border border-line bg-card p-5 shadow-card">
            <View className="flex-row items-center gap-2">
              <Feather name="bluetooth" size={16} color="#1e3a8a" />
              <Text className="text-sm font-bold text-ink">Classic Bluetooth (SPP)</Text>
            </View>
            <Text className="mt-1 text-xs leading-5 text-muted">
              Scan and connect to ESP32 cars. Pairs like the ESP remote. PIN: 1234.
            </Text>

            {!connected && (
              <>
                <Pressable
                  onPress={handleScan}
                  disabled={scanning}
                  className="mt-4 flex-row items-center justify-center gap-2 rounded-full bg-navy px-5 py-2.5 disabled:opacity-60"
                >
                  {scanning ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Feather name="search" size={14} color="#fff" />
                  )}
                  <Text className="text-xs font-black text-white">
                    {scanning ? 'Scanning…' : 'Scan cars (SPP)'}
                  </Text>
                </Pressable>

                {sppDevices.length > 0 && (
                  <FlatList
                    data={sppDevices}
                    keyExtractor={(d) => d.address}
                    className="mt-3 max-h-48"
                    renderItem={({ item }) => (
                      <Pressable
                        onPress={() => handleConnect(item)}
                        disabled={connecting}
                        className="flex-row items-center justify-between rounded-lg border border-line px-3 py-2.5 mt-1"
                      >
                        <View className="min-w-0 flex-1 flex-row items-center gap-2">
                          <Feather name="smartphone" size={13} color="#1e3a8a" />
                          <Text className="flex-1 text-xs font-semibold text-ink" numberOfLines={1}>{item.name}</Text>
                          {item.bonded && (
                            <Text className="text-[10px] font-bold uppercase tracking-wide text-green-600">Paired</Text>
                          )}
                        </View>
                        <Text className="ml-2 text-xs font-bold text-navy">
                          {connecting ? 'Connecting…' : 'Connect'}
                        </Text>
                      </Pressable>
                    )}
                  />
                )}
              </>
            )}

            {connected && (
              <View className="mt-3 rounded-xl bg-accent/10 px-4 py-3">
                <Text className="text-sm font-bold text-accent">
                  Connected to {deviceName}
                </Text>
                <Text className="mt-1 text-xs text-muted">
                  Use the controls below to drive. Tap Disconnect to stop.
                </Text>
              </View>
            )}

            {error && !connected && (
              <View className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <Text className="text-xs leading-5 text-red-600">{error}</Text>
              </View>
            )}
          </View>
        )}

        {/* WiFi panel for wireless car modes */}
        {useWifi && !useSpp && (
          <View className="mt-4 rounded-2xl border border-line bg-card p-5 shadow-card">
            <View className="flex-row items-center gap-2">
              <Feather name="wifi" size={16} color="#1e3a8a" />
              <Text className="text-sm font-bold text-ink">WiFi WebSocket</Text>
            </View>
            <TextInput
              value={wifiUrl}
              onChangeText={setWifiUrl}
              editable={!connected && !wifiConnected}
              placeholder="ws://192.168.4.1:81"
              autoCapitalize="none"
              className="mt-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            />
            <Pressable
              onPress={wifiConnected ? handleWifiDisconnect : handleWifiConnect}
              disabled={connecting || connected}
              className="mt-3 flex-row items-center justify-center gap-2 rounded-full bg-navy px-5 py-2.5 disabled:opacity-60"
            >
              {connecting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name={wifiConnected ? 'wifi-off' : 'wifi'} size={14} color="#fff" />
              )}
              <Text className="text-xs font-black text-white">
                {wifiConnected ? 'Disconnect' : connecting ? 'Connecting…' : 'Connect WiFi'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Error display */}
        {error && !connected && !connectionMessage && (
          <View className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <Text className="text-xs leading-5 text-red-600">{error}</Text>
          </View>
        )}
      </View>

      {/* Mode chooser */}
      <View className="mt-6">
        <ModeChooser
          activeMode={activeMode}
          canControl={canControl}
          onSelect={selectMode}
          onCycle={cycleMode}
          modes={carModes}
        />
      </View>

      {/* Mode info */}
      <View className="mt-4">
        <ModeInfo mode={activeMode} />
      </View>

      {/* OLED Display - mirrors the car's 1.3" OLED */}
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
      </View>

      {/* 2WD1M extras (steer limit, trim, e-stop) */}
      {activeCategory === 'robocar' && is2wd1mActive && canControl && (
        <TwoWd1mExtras
          canControl={canControl}
          steerLimit={steerLimit}
          trim={trim}
          onAdjustSteerLimit={adjustSteerLimit}
          onAdjustTrim={adjustTrim}
          onEStop={handleEStop}
        />
      )}

      {/* Controls */}
      <View className={`mt-4 ${!canControl ? 'opacity-40' : ''}`}>
        {/* Control mode toggle */}
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

        {/* Drive controls */}
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
          onRun={() => { sendCommand(activeMode.token); setDriveStatus(`${activeMode.token} running`) }}
          onStop={() => { sendCommand('BT'); setDriveStatus('BT manual · stopped') }}
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

        {/* Sensor grid + relays */}
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
      </View>          {/* Category overview */}
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
