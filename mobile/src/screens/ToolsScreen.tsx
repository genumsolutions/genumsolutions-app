// =====================================================================
// ToolsScreen - native IoT & Remote Controller.
// Real BLE scanning/control via react-native-ble-plx + WiFi WebSocket.
// Full control deck for all 9 car modes and 5 project categories.
// =====================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
  TouchableOpacity,
  Alert,
  Platform,
  DeviceEventEmitter,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import Slider from '@react-native-community/slider'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import { APP_VERSION } from '../config/site'
import { bleService, type CarTelemetry } from '../services/bleService'
import { LOCAL_CAR_MODES, nextMode, type CarMode } from '../config/roboCarCatalog'
import { PROJECT_CATEGORIES } from '../config/project-catalog'
import type { RootStackParamList } from '../navigation/types'

type Category = typeof PROJECT_CATEGORIES[number]
type Nav = NativeStackNavigationProp<RootStackParamList, 'Tools'>
type Route = RouteProp<RootStackParamList, 'Tools'>

export function ToolsScreen() {
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()
  const routeCategory = route.params?.category
  const [scanning, setScanning] = useState(false)
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
  const [wifiUrlValid, setWifiUrlValid] = useState(false)
  const [scanningBle, setScanningBle] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pidKp, setPidKp] = useState(12.0)
  const [pidKi, setPidKi] = useState(3.0)
  const [pidKd, setPidKd] = useState(1.0)
  const [pidOut, setPidOut] = useState(0)
  const [pidOff, setPidOff] = useState(0)
  const [relays, setRelays] = useState<Record<number, boolean>>({})
  const [hasBeenConnected, setHasBeenConnected] = useState(false)
  const [projectPackage, setProjectPackage] = useState(null)
  const [loadingProject, setLoadingProject] = useState(false)

  // Drone controls
  const [gimbalPan, setGimbalPan] = useState(90)
  const [gimbalTilt, setGimbalTilt] = useState(90)
  const [altitude, setAltitude] = useState(0)
  const [targetAltitude, setTargetAltitude] = useState(0)

  // Sensor data for non-robocar categories
  const [sensorData, setSensorData] = useState<Record<string, number>>({
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
      setHasBeenConnected(true)
      // Start listening for telemetry after connect
      bleService.onTelemetry((telemetry) => {
        if (telemetry.speed != null) setTelemetry(prev => ({ ...prev, speed: telemetry.speed }))
        if (telemetry.mode) setTelemetry(prev => ({ ...prev, mode: telemetry.mode }))
        if (telemetry.status) setTelemetry(prev => ({ ...prev, status: telemetry.status }))
        if (telemetry.angle != null) setTelemetry(prev => ({ ...prev, angle: telemetry.angle }))
        if (telemetry.kp != null) setTelemetry(prev => ({ ...prev, kp: telemetry.kp }))
        if (telemetry.ki != null) setTelemetry(prev => ({ ...prev, ki: telemetry.ki }))
        if (telemetry.kd != null) setTelemetry(prev => ({ ...prev, kd: telemetry.kd }))
        if (telemetry.out != null) setTelemetry(prev => ({ ...prev, out: telemetry.out }))
        if (telemetry.off != null) setTelemetry(prev => ({ ...prev, off: telemetry.off }))
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
      const ws = new WebSocket(wsUrl)
      setWs(ws)
      ws.onopen = () => {
        setWifiConnected(true)
        setConnecting(false)
        setHasBeenConnected(true)
      }
      ws.onmessage = (event) => {
        const data = event.data
        // Try to parse as telemetry
        try {
          const json = JSON.parse(data)
          if (json.telemetry) {
            setTelemetry(json.telemetry)
          }
          if (json.sensors) {
            setSensorData(prev => ({ ...prev, ...json.sensors }))
          }
        } catch {
          // Ignore non-JSON messages
        }
      }
      ws.onerror = () => {
        setError('WiFi connection error')
        setWifiConnected(false)
        setConnecting(false)
      }
      ws.onclose = () => {
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
    if (ws) {
      ws.close()
      setWs(null)
    }
    setWifiConnected(false)
    setError(null)
  }, [ws])

  const handleDisconnect = useCallback(async () => {
    await bleService.disconnect()
    if (ws) {
      ws.close()
      setWs(null)
    }
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
    setAltitude(0)
    setTargetAltitude(0)
  }, [ws])

  const sendCommand = useCallback((cmd: string) => {
    if (connected) {
      void bleService.sendLine(cmd)
    }
    if (wifiConnected && ws) {
      ws.send(cmd)
    }
  }, [connected, wifiConnected, ws])

  const handleApplySpeed = useCallback((value: number) => {
    setSpeed(value)
    sendCommand(`SPD${Math.round(value)}`)
  }, [sendCommand])

  const handleApplyServo = useCallback((value: number) => {
    setServo(value)
    sendCommand(`SERVO${Math.round(value)}`)
  }, [sendCommand])

  const applyPid = useCallback(
    (key: 'kp' | 'ki' | 'kd' | 'out' | 'off', value: number) => {
      const next = { kp: pidKp, ki: pidKi, kd: pidKd, out: pidOut, off: pidOff }
      next[key] = value
      if (key === 'kp') setPidKp(value)
      if (key === 'ki') setPidKi(value)
      if (key === 'kd') setPidKd(value)
      if (key === 'out') setPidOut(value)
      if (key === 'off') setPidOff(value)
      void bleService.calibratePid(next)
      sendCommand(`CFG;Kp:${next.kp.toFixed(2)};Ki:${next.ki.toFixed(3)};Kd:${next.kd.toFixed(3)};OUT:${next.out.toFixed(0)};OFF:${next.off.toFixed(2)}`)
    },
    [pidKp, pidKi, pidKd, pidOut, pidOff, sendCommand]
  )

  const selectMode = useCallback(
    (m: CarMode) => {
      setActiveMode(m)
      setDriveStatus('Stop')
      sendCommand(m.token)
      sendCommand('S')
    },
    [sendCommand]
  )

  const cycleMode = useCallback(() => {
    const next = nextMode(activeMode)
    selectMode(next)
  }, [activeMode, selectMode])

  const handleDirection = useCallback(
    (d: 'F' | 'B' | 'L' | 'R' | 'S') => {
      if (d === 'S') {
        setDriveStatus('Stop')
        sendCommand('S')
        return
      }
      setDriveStatus(
        d === 'F' ? 'Forward' : d === 'B' ? 'Backward' : d === 'L' ? 'Left' : 'Right'
      )
      sendCommand(d)
    },
    [sendCommand]
  )

  const toggleRelay = useCallback((i: number) => {
    setRelays((prev) => {
      const next = !prev[i]
      sendCommand(`OUT${i}:${next ? 1 : 0}`)
      return { ...prev, [i]: next }
    })
  }, [sendCommand])

  // Drone control helpers
  const handleGimbalPan = useCallback((value: number) => {
    setGimbalPan(value)
    sendCommand(`GIMBAL_PAN:${Math.round(value)}`)
  }, [sendCommand])

  const handleGimbalTilt = useCallback((value: number) => {
    setGimbalTilt(value)
    sendCommand(`GIMBAL_TILT:${Math.round(value)}`)
  }, [sendCommand])

  const handleAltitude = useCallback((value: number) => {
    setTargetAltitude(value)
    sendCommand(`ALT:${Math.round(value)}`)
  }, [sendCommand])

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
      <View className="mt-6 rounded-2xl border border-line bg-card p-5 shadow-card">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <View className={`h-2.5 w-2.5 rounded-full ${(connected || wifiConnected) ? 'bg-accent' : 'bg-border'}`} />
            <Text className="text-sm font-bold text-ink">
              {connected ? `BLE · ${deviceName}` : wifiConnected ? 'WiFi · Connected' : 'Not connected'}
            </Text>
          </View>
          {(connected || wifiConnected) && (
            <Pressable onPress={handleDisconnect}>
              <Text className="text-sm font-bold text-gold underline">Disconnect</Text>
            </Pressable>
          )}
        </View>

        <View className="mt-5 flex-row gap-4">
          {/* BLE connect */}
          <View className="flex-1 rounded-xl border border-line bg-surface p-4">
            <View className="flex-row items-center gap-2">
              <Feather name="bluetooth" size={16} color="#1e3a8a" />
              <Text className="text-sm font-bold text-ink">BLE</Text>
            </View>
            <Text className="mt-1 text-xs leading-5 text-muted">
              Scan and connect to an ESP32 car over Bluetooth.
            </Text>
            <Pressable
              onPress={handleScan}
              disabled={scanningBle || connecting || connected}
              className="mt-3 flex-row items-center gap-2 rounded-full bg-navy px-5 py-2.5 disabled:opacity-60"
            >
              {scanningBle ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="search" size={14} color="#fff" />
              )}
              <Text className="text-xs font-black text-white">
                {scanningBle ? 'Scanning…' : 'Scan BLE'}
              </Text>
            </Pressable>
            {devices.length > 0 && (
              <FlatList
                data={devices}
                keyExtractor={(d) => d.id}
                className="mt-2 max-h-32"
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => handleConnectBle(item.id)}
                    disabled={connecting}
                    className="flex-row items-center justify-between rounded-lg border border-line px-3 py-2 mt-1"
                  >
                    <Text className="text-xs font-semibold text-ink">{item.name}</Text>
                    <Text className="text-xs text-navy font-bold">Connect</Text>
                  </Pressable>
                )}
              />
            )}
          </View>

          {/* WiFi connect */}
          <View className="flex-1 rounded-xl border border-line bg-surface p-4">
            <View className="flex-row items-center gap-2">
              <Feather name="wifi" size={16} color="#1e3a8a" />
              <Text className="text-sm font-bold text-ink">WiFi</Text>
            </View>
            <TextInput
              value={wifiUrl}
              onChangeText={setWifiUrl}
              editable={!connected && !wifiConnected}
              placeholder="ws://192.168.4.1:81"
              autoCapitalize="none"
              className="mt-2 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink"
            />
            <Pressable
              onPress={wifiConnected ? handleWifiDisconnect : handleWifiConnect}
              disabled={connecting || connected}
              className="mt-3 flex-row items-center gap-2 rounded-full bg-navy px-5 py-2.5 disabled:opacity-60"
            >
              <Feather name={wifiConnected ? 'wifi-off' : 'wifi'} size={14} color="#fff" />
              <Text className="text-xs font-black text-white">
                {wifiConnected ? 'Disconnect' : connecting ? 'Connecting…' : 'Connect WiFi'}
              </Text>
            </Pressable>
          </View>
        </View>

        {error && (
          <View className="mt-3 flex-row items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <Text className="flex-1 text-xs leading-5 text-red-600">{error}</Text>
            <Pressable onPress={() => setError(null)}>
              <Feather name="x" size={14} color="#dc2626" />
            </Pressable>
          </View>
        )}
      </View>

      {/* Mode chooser */}
      <View className="mt-6 rounded-2xl border border-line bg-card p-5 shadow-card">
        <Text className="text-xs font-bold uppercase tracking-wide text-muted">Mode</Text>
        <View className="mt-2 flex-row flex-wrap gap-2">
          {LOCAL_CAR_MODES.map((m) => {
            const isActive = activeMode.id === m.id
            return (
              <Pressable
                key={m.id}
                onPress={() => selectMode(m)}
                disabled={!canControl}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                  isActive ? 'bg-navy text-white' : 'border border-line bg-surface text-muted'
                } ${!canControl ? 'opacity-40' : ''}`}
              >
                {m.name.split('·')[0].trim()}
              </Pressable>
            )
          })}
          <Pressable
            onPress={cycleMode}
            disabled={!connected}
            className="flex-row items-center gap-1 rounded-full bg-navy px-4 py-1.5 disabled:opacity-40"
          >
            <Feather name="rotate-ccw" size={12} color="#fff" />
            <Text className="text-xs font-black text-white">Mode</Text>
          </Pressable>
        </View>
      </View>

      {/* OLED display */}
      <View className="mt-4 rounded-xl bg-slate-900 p-3 shadow-inner">
        <View className="flex-row items-center justify-between border-b border-slate-700 px-2 pb-2">
          <Text className="font-mono text-xs font-bold text-emerald-400">
            {connected ? deviceName : wifiConnected ? 'WiFi' : '---'}
          </Text>
          <Text className="font-mono text-xs text-slate-500">
            {connected ? 'BLE LINK' : wifiConnected ? 'WiFi WS' : 'NO LINK'}
          </Text>
        </View>
        <View className="mt-2 px-2">
          <Text className="font-mono text-sm text-emerald-300">
            {activeMode.name.split('·')[0].trim()} {activeMode.controls.includes('drive-2wd1m') ? `STEER ${servo}` : `SPD ${speed}`}
          </Text>
          <Text className="font-mono text-sm text-emerald-300">
            {connected ? driveStatus : wifiConnected ? 'CONNECTED' : 'NO LINK'}
          </Text>
          {isDrone && (
            <Text className="font-mono text-sm text-emerald-400">
              ALT {targetAltitude}m · GIMBAL P:{gimbalPan}° T:{gimbalTilt}°
            </Text>
          )}
          {isNonRobocar && !isDrone && (
            <Text className="font-mono text-sm text-emerald-400">
              T:{sensorData.temperature}°C H:{sensorData.humidity}%
            </Text>
          )}
          {telemetry.angle != null && (
            <Text className="font-mono text-sm text-emerald-400">ANGLE {telemetry.angle.toFixed(1)}</Text>
          )}
          {telemetry.mode && <Text className="font-mono text-sm text-emerald-300">M:{telemetry.mode}</Text>}
        </View>
      </View>

      {/* Controls */}
      <View className={`mt-4 ${!canControl ? 'opacity-40' : ''}`}>
        {/* Directional pad */}
        {!isDrone && (
          <View>
            <View className="flex-row items-center justify-center">
              <View style={{ width: 72 }} />
              <Pressable
                onPress={() => handleDirection('F')}
                disabled={!canControl}
                className="mx-1 items-center rounded-xl bg-navy px-6 py-4"
              >
                <Feather name="chevron-up" size={32} color="#fff" />
              </Pressable>
              <View style={{ width: 72 }} />
            </View>
            <View className="mt-2 flex-row items-center justify-center">
              <Pressable
                onPress={() => handleDirection('L')}
                disabled={!canControl}
                className="mx-1 items-center rounded-xl border border-navy px-6 py-4"
              >
                <Feather name="chevron-left" size={32} color="#1e3a8a" />
              </Pressable>
              <Pressable
                onPress={() => handleDirection('S')}
                disabled={!canControl}
                className="mx-1 items-center rounded-xl bg-slate-200 px-6 py-4"
              >
                <Feather name="stop-circle" size={28} color="#1e3a8a" />
              </Pressable>
              <Pressable
                onPress={() => handleDirection('R')}
                disabled={!canControl}
                className="mx-1 items-center rounded-xl border border-navy px-6 py-4"
              >
                <Feather name="chevron-right" size={32} color="#1e3a8a" />
              </Pressable>
            </View>
            <View className="mt-2 flex-row items-center justify-center">
              <View style={{ width: 72 }} />
              <Pressable
                onPress={() => handleDirection('B')}
                disabled={!canControl}
                className="mx-1 items-center rounded-xl border border-navy px-6 py-4"
              >
                <Feather name="chevron-down" size={32} color="#1e3a8a" />
              </Pressable>
              <View style={{ width: 72 }} />
            </View>
          </View>
        )}

        {/* Speed slider */}
        {!isDrone && (activeMode.controls.includes('drive-tank') || activeMode.controls.includes('drive-2wd1m')) ? (
          <View className="mt-4 rounded-xl border border-line bg-surface p-4">
            <Text className="text-xs font-bold uppercase tracking-wide text-border">Speed</Text>
            <Slider
              value={speed}
              minimumValue={0}
              maximumValue={255}
              step={5}
              onValueChange={handleApplySpeed}
              disabled={!canControl}
              minimumTrackTintColor="#1e3a8a"
              maximumTrackTintColor="#cbd5e1"
              thumbTintColor="#1e3a8a"
            />
            <Text className="mt-1 text-right font-mono text-sm font-bold text-navy">{speed}</Text>
          </View>
        ) : null}

        {/* 2WD1M servo slider */}
        {!isDrone && activeMode.controls.includes('drive-2wd1m') ? (
          <View className="mt-4 rounded-xl border border-line bg-surface p-4">
            <Text className="text-xs font-bold uppercase tracking-wide text-border">Steering (servo)</Text>
            <Slider
              value={servo}
              minimumValue={0}
              maximumValue={180}
              step={5}
              onValueChange={handleApplyServo}
              disabled={!canControl}
              minimumTrackTintColor="#1e3a8a"
              maximumTrackTintColor="#cbd5e1"
              thumbTintColor="#1e3a8a"
            />
            <Text className="mt-1 text-right font-mono text-sm font-bold text-navy">{servo}°</Text>
          </View>
        ) : null}

        {/* PID sliders for self-balancing */}
        {!isDrone && activeMode.controls.includes('pid-auto') ? (
          <View className="mt-4 flex-row flex-wrap gap-3">
            <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
              <Text className="text-xs font-bold uppercase tracking-wide text-border">PID Tuning</Text>
              <Slider value={pidKp} minimumValue={0} maximumValue={50} step={0.1} onValueChange={(v: number) => applyPid('kp', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
              <Text className="mt-1 text-right font-mono text-xs text-navy">Kp {pidKp.toFixed(1)}</Text>
            </View>
            <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
              <Slider value={pidKi} minimumValue={0} maximumValue={20} step={0.1} onValueChange={(v: number) => applyPid('ki', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
              <Text className="mt-1 text-right font-mono text-xs text-navy">Ki {pidKi.toFixed(1)}</Text>
            </View>
            <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
              <Slider value={pidKd} minimumValue={0} maximumValue={20} step={0.1} onValueChange={(v: number) => applyPid('kd', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
              <Text className="mt-1 text-right font-mono text-xs text-navy">Kd {pidKd.toFixed(1)}</Text>
            </View>
            <View className="w-[48%] rounded-xl border border-line bg-surface p-4">
              <Slider value={pidOut} minimumValue={0} maximumValue={255} step={1} onValueChange={(v: number) => applyPid('out', v)} disabled={!canControl} minimumTrackTintColor="#1e3a8a" maximumTrackTintColor="#cbd5e1" thumbTintColor="#1e3a8a" />
              <Text className="mt-1 text-right font-mono text-xs text-navy">OUT {pidOut}</Text>
            </View>
          </View>
        ) : null}

        {/* === DRONE CONTROLS === */}
        {isDrone && (
          <View className="mt-2">
            {/* Altitude control */}
            <View className="rounded-xl border border-line bg-surface p-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-1">
                  <Feather name="arrow-up" size={12} color="#94a3b8" />
                  <Text className="text-xs font-bold uppercase tracking-wide text-border">Altitude (m)</Text>
                </View>
                <Text className="font-mono text-sm font-bold text-navy">{targetAltitude}m</Text>
              </View>
              <Slider
                value={targetAltitude}
                minimumValue={0}
                maximumValue={50}
                step={0.5}
                onValueChange={handleAltitude}
                disabled={!canControl}
                minimumTrackTintColor="#1e3a8a"
                maximumTrackTintColor="#cbd5e1"
                thumbTintColor="#1e3a8a"
              />
              <View className="mt-2 flex-row gap-2">
                <Pressable
                  onPress={() => sendCommand('TAKEOFF')}
                  disabled={!canControl}
                  className="flex-1 items-center rounded-full bg-emerald-600 py-2.5"
                >
                  <Text className="text-xs font-black text-white">Take Off</Text>
                </Pressable>
                <Pressable
                  onPress={() => sendCommand('LAND')}
                  disabled={!canControl}
                  className="flex-1 items-center rounded-full bg-amber-600 py-2.5"
                >
                  <Text className="text-xs font-black text-white">Land</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setTargetAltitude(0); sendCommand('EMERGENCY') }}
                  disabled={!canControl}
                  className="flex-1 items-center rounded-full bg-red-600 py-2.5"
                >
                  <Text className="text-xs font-black text-white">Emergency Stop</Text>
                </Pressable>
              </View>
            </View>

            {/* Gimbal control */}
            <View className="mt-4 rounded-xl border border-line bg-surface p-4">
              <View className="flex-row items-center gap-1">
                <Feather name="video" size={12} color="#94a3b8" />
                <Text className="text-xs font-bold uppercase tracking-wide text-border">Camera Gimbal</Text>
              </View>
              <View className="mt-3 flex-row gap-4">
                <View className="flex-1">
                  <Text className="text-xs font-bold text-muted">Pan: {gimbalPan}°</Text>
                  <Slider
                    value={gimbalPan}
                    minimumValue={0}
                    maximumValue={180}
                    step={1}
                    onValueChange={handleGimbalPan}
                    disabled={!canControl}
                    minimumTrackTintColor="#1e3a8a"
                    maximumTrackTintColor="#cbd5e1"
                    thumbTintColor="#1e3a8a"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-bold text-muted">Tilt: {gimbalTilt}°</Text>
                  <Slider
                    value={gimbalTilt}
                    minimumValue={0}
                    maximumValue={180}
                    step={1}
                    onValueChange={handleGimbalTilt}
                    disabled={!canControl}
                    minimumTrackTintColor="#1e3a8a"
                    maximumTrackTintColor="#cbd5e1"
                    thumbTintColor="#1e3a8a"
                  />
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Start/Stop for autonomous modes */}
        {!isDrone && (activeMode.controls.includes('start-stop') || activeMode.controls.includes('tuning')) && (
          <View className="mt-4 flex-row flex-wrap gap-3">
            <Pressable
              onPress={() => { sendCommand('F'); setDriveStatus(`${activeMode.name} running`) }}
              disabled={!canControl}
              className="rounded-full bg-navy px-6 py-3"
            >
              <Text className="text-sm font-black text-white">Run</Text>
            </Pressable>
            <Pressable
              onPress={() => { sendCommand('S'); setDriveStatus(`${activeMode.name} stopped`) }}
              disabled={!canControl}
              className="rounded-full border border-line bg-card px-6 py-3"
            >
              <Text className="text-sm font-black text-ink">Stop</Text>
            </Pressable>
          </View>
        )}

        {/* Relay toggles for home-automation / smart-farm / smart-city */}
        {isNonRobocar && !isDrone && (
          <View className="mt-4 rounded-xl border border-line bg-surface p-4">
            <Text className="text-xs font-bold uppercase tracking-wide text-border">
              {activeCategory === 'smart-farm' ? 'Pumps / solenoids' : 'Outputs'}
            </Text>
            <View className="mt-3 flex-row flex-wrap gap-3">
              {[1, 2, 3, 4].map((i) => (
                <View key={i} className="flex-row items-center gap-2">
                  <Switch
                    value={relays[i]}
                    onValueChange={() => toggleRelay(i)}
                    disabled={!canControl}
                    trackColor={{ true: '#1e3a8a', false: '#e2e8f0' }}
                  />
                  <Text className="text-xs font-semibold text-ink">Relay {i}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* === SENSOR GRID for non-robocar categories === */}
        {isNonRobocar && (
          <View className="mt-4 rounded-xl border border-line bg-surface p-4">
            <View className="flex-row items-center gap-1">
              <Feather name="activity" size={12} color="#94a3b8" />
              <Text className="text-xs font-bold uppercase tracking-wide text-border">Live Sensors</Text>
            </View>
            <View className="mt-3 flex-row flex-wrap gap-2">
              <SensorCard
                icon="thermometer"
                label="Temperature"
                value={`${sensorData.temperature}°C`}
                color="#ef4444"
              />
              <SensorCard
                icon="droplet"
                label="Humidity"
                value={`${sensorData.humidity}%`}
                color="#3b82f6"
              />
              {activeCategory === 'smart-farm' && (
                <SensorCard
                  icon="layers"
                  label="Soil Moisture"
                  value={`${sensorData.soilMoisture}%`}
                  color="#22c55e"
                />
              )}
              {activeCategory === 'smart-city' && (
                <>
                  <SensorCard
                    icon="sun"
                    label="Light Level"
                    value={`${sensorData.lightLevel}%`}
                    color="#f59e0b"
                  />
                  <SensorCard
                    icon="wind"
                    label="Air Quality"
                    value={`${sensorData.airQuality}ppm`}
                    color="#8b5cf6"
                  />
                </>
              )}
              {(activeCategory === 'home-automation' || activeCategory === 'smart-city') && (
                <SensorCard
                  icon="maximize-2"
                  label="Distance"
                  value={`${sensorData.distance}cm`}
                  color="#06b6d4"
                />
              )}
            </View>
          </View>
        )}

        {/* Live telemetry (BLE-specific) */}
        {(telemetry.speed != null || telemetry.mode) && (
          <View className="mt-4 rounded-xl border border-line bg-surface p-4">
            <Text className="text-xs font-bold uppercase tracking-wide text-border">Live telemetry</Text>
            <View className="mt-2 flex-row flex-wrap gap-4">
              {telemetry.speed != null && (
                <Text className="text-xs text-muted">Speed: <Text className="font-mono font-bold text-navy">{telemetry.speed}</Text></Text>
              )}
              {telemetry.mode && (
                <Text className="text-xs text-muted">Mode: <Text className="font-mono font-bold text-navy">{telemetry.mode}</Text></Text>
              )}
              {telemetry.status && (
                <Text className="text-xs text-muted">Status: <Text className="font-mono font-bold text-navy">{telemetry.status}</Text></Text>
              )}
              {telemetry.angle != null && (
                <Text className="text-xs text-muted">Angle: <Text className="font-mono font-bold text-navy">{telemetry.angle.toFixed(1)}°</Text></Text>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Footer */}
      <View className="mt-6 rounded-lg border border-line bg-card p-4">
        <Text className="text-sm font-semibold text-navy">GENUM Solutions</Text>
        <Text className="mt-0.5 text-xs text-muted">App v{APP_VERSION} · IoT & Remote Controller</Text>
      </View>
    </ScrollView>
  )
}

// Sensor card component for the sensor grid
function SensorCard({ icon, label, value, color }: {
  icon: string
  label: string
  value: string
  color: string
}) {
  return (
    <View className="w-[30%] rounded-xl bg-card border border-line p-3">
      <Feather name={icon as any} size={16} color={color} />
      <Text className="mt-1 text-xs font-bold uppercase text-muted">{label}</Text>
      <Text className="mt-0.5 font-mono text-sm font-bold" style={{ color }}>{value}</Text>
    </View>
  )
}
