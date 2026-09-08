// =====================================================================
// useControlHub — shared connection/control/telemetry state + command
// logic for the IoT Control Panel.
//
// Both the lean Control Panel page (ToolsScreen) and the immersive
// game-style remote window (RemoteControlScreen) share this ONE hook so
// they drive the same car state and never drift: same SPP/WiFi connect,
// same mode / speed / servo / steer / trim / PID / gimbal / sensors /
// relays, same ESP-remote safety clamps and instant-stop-on-release,
// same per-device memory persistence.
//
// Every sender is safe when no device is linked (linkKind === 'none'):
// commands no-op, but UI state (knobs, sliders) still updates so the
// remote can be tested/debugged in a browser without hardware.
// =====================================================================
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { useRoute, type RouteProp } from '@react-navigation/native'
import type { RootStackParamList } from '../../navigation/types'
import { APP_VERSION } from '../../config/site'
import { sppService, type SppDevice } from '../../services/sppService'
import { DEFAULT_SAFETY_LIMITS, type DevicePrefs } from './types'
import { LOCAL_CAR_MODES, type CarMode } from '../../config/roboCarCatalog'
import { getCarModes } from '../../services/carModeService'
import { PROJECT_CATEGORIES } from '../../config/project-catalog'
import { DRIVE_CMD_MIN_INTERVAL_MS } from './controlConstants'
import { deviceMemory } from './types'
import type { CarTelemetry } from '../../services/carProtocol'
import type { SensorData } from './types'

type Route = RouteProp<RootStackParamList, 'Tools'>

export function useControlHub(routeCategory?: string) {
  const route = useRoute<Route>()
  const resolvedCategory = routeCategory ?? route.params?.category

  // ---- Connection state (SPP primary, WiFi secondary).
  // Initialised from the current sppService snapshot so a second consumer
  // (e.g. the RemoteControl window opened while ToolsScreen is already
  // connected) starts out showing an existing live link instead of "no
  // device", and keeps working when nothing is linked (simulation). ----
  const [sppDevices, setSppDevices] = useState<SppDevice[]>([])
  const [connected, setConnected] = useState(sppService.isConnected)
  const [deviceName, setDeviceName] = useState(sppService.deviceName ?? '')
  const [scanning, setScanning] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connectingAddress, setConnectingAddress] = useState<string | null>(null)
  const [wifiConnected, setWifiConnected] = useState(false)
  const [wifiUrl, setWifiUrl] = useState('ws://192.168.4.1:81')
  const [error, setError] = useState<string | null>(null)
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null)
  const [connectionMsgType, setConnectionMsgType] = useState<'success' | 'error' | null>(null)
  const [sppStatus, setSppStatus] = useState<'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'>(sppService.getConnectionInfo().status === 'connected' ? 'connected' : 'idle')
  const [sppStatusMsg, setSppStatusMsg] = useState<string | null>(sppService.getConnectionInfo().status === 'connected' ? 'Connected' : null)
  const [showSppsRetry, setShowSppsRetry] = useState(false)

  // ---- Active mode + state (mirrors ESP remote) ----
  const [activeCategory, setActiveCategory] = useState('robocar')
  const [activeMode, setActiveMode] = useState<CarMode>(LOCAL_CAR_MODES[0])
  const [speed, setSpeed] = useState(170)
  const [servo, setServo] = useState(90)
  const [steerLimit, setSteerLimit] = useState(90)
  const [trim, setTrim] = useState(0)
  const [driveStatus, setDriveStatus] = useState('Stop')
  const [telemetry, setTelemetry] = useState<CarTelemetry>({})

  // ---- PID state (self-balancing) ----
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

  // ---- ESP32-remote safety limits ----
  const safetyLimits = DEFAULT_SAFETY_LIMITS

  // ---- Relays for non-robocar categories ----
  const [relays, setRelays] = useState<Record<number, boolean>>({})

  // Mode from car (mode sync)
  const [carModeId, setCarModeId] = useState<string | null>(null)

  // Fullscreen (legacy overlay flag kept for persistence compatibility)
  const [fullscreen, setFullscreen] = useState(false)

  // Joystick layout style id ('dual' | 'dpad') persisted per device.
  const [joystickLayoutId, setJoystickLayoutId] = useState<string>('dual')

  const mountedRef = useRef(true)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const manualCloseRef = useRef(false)
  const lastDriveCmdAtRef = useRef<Record<string, number>>({})
  const connectionMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Car-mode catalogue: DB-first with bundled fallback
  const [carModes, setCarModes] = useState<CarMode[]>(LOCAL_CAR_MODES)

  useEffect(() => {
    let active = true
    getCarModes()
      .then((modes) => {
        if (!active || modes.length === 0) return
        setCarModes(modes)
        const target = modes.find((m) => m.id === '2wd1m') || modes[0]
        setActiveMode(target)
      })
      .catch(() => { /* keep bundled fallback */ })
    return () => { active = false }
  }, [])

  // Restore remembered device prefs when a device address becomes available.
  const addressForMemory = sppService.currentAddress ?? sppService.getConnectionInfo().address ?? null
  const [savedPrefs, setSavedPrefs] = useState<DevicePrefs | null>(null)
  useFocusEffect(
    React.useCallback(
      () => {
        if (!addressForMemory) {
          setSavedPrefs(null)
          return
        }
        let active = true
        void deviceMemory.read(addressForMemory).then((prefs) => {
          if (!active) return
          setSavedPrefs(prefs)
          if (prefs) {
            if (prefs.modeId && carModes.some((m) => m.id === prefs.modeId)) {
              setActiveMode(carModes.find((m) => m.id === prefs.modeId)!)
            }
            if (prefs.speed != null) setSpeed(prefs.speed)
            if (prefs.servo != null) setServo(prefs.servo)
            if (prefs.steerLimit != null) setSteerLimit(prefs.steerLimit)
            if (prefs.trim != null) setTrim(prefs.trim)
            if (prefs.useJoystick != null) setUseJoystick(prefs.useJoystick)
            if (prefs.fullscreen != null) setFullscreen(prefs.fullscreen)
          }
        })
        return () => { active = false }
      },
      [addressForMemory, carModes],
    ),
  )

  // Persist device prefs whenever the user changes a remembered value.
  const persistPrefs = React.useCallback(
    (patch: Partial<DevicePrefs>) => {
      if (!addressForMemory) return
      const next: DevicePrefs = {
        address: addressForMemory,
        name: sppService.deviceName ?? deviceName,
        modeId: activeMode.id,
        speed,
        servo,
        steerLimit,
        trim,
        useJoystick,
        fullscreen,
        joystickLayout: joystickLayoutId,
        ...patch,
      }
      void deviceMemory.write(addressForMemory, next)
      setSavedPrefs(next)
    },
    [addressForMemory, deviceName, activeMode.id, speed, servo, steerLimit, trim, useJoystick, fullscreen, joystickLayoutId],
  )

  // Set category from route params
  useEffect(() => {
    if (resolvedCategory && PROJECT_CATEGORIES.some(c => c.slug === resolvedCategory)) {
      setActiveCategory(resolvedCategory)
    }
  }, [resolvedCategory])

  // Show connection message for a few seconds, then clear
  const showConnectionMessage = useCallback((msg: string, type: 'success' | 'error') => {
    setConnectionMessage(msg)
    setConnectionMsgType(type)
    if (connectionMsgTimerRef.current) clearTimeout(connectionMsgTimerRef.current)
    connectionMsgTimerRef.current = setTimeout(() => {
      setConnectionMessage(null)
      setConnectionMsgType(null)
      connectionMsgTimerRef.current = null
    }, 4000)
  }, [])

  const handleCategoryPress = useCallback((slug: string) => {
    setActiveCategory(slug)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
      manualCloseRef.current = true
      if (connectionMsgTimerRef.current) {
        clearTimeout(connectionMsgTimerRef.current)
        connectionMsgTimerRef.current = null
      }
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

  // Telemetry + status wiring (SPP service)
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
    const offStatus = sppService.onStatus((kind, message) => {
      if (!mountedRef.current) return
      switch (kind) {
        case 'connecting':
          setSppStatus('connecting')
          setSppStatusMsg(message ?? 'Connecting…')
          setShowSppsRetry(false)
          break
        case 'connected':
          setSppStatus('connected')
          setSppStatusMsg(message ?? 'Connected')
          setShowSppsRetry(false)
          break
        case 'disconnected':
          setSppStatus('disconnected')
          setSppStatusMsg('Disconnected')
          setShowSppsRetry(true)
          break
        case 'error':
          setSppStatus('error')
          setSppStatusMsg(message ?? 'Connection error')
          setShowSppsRetry(true)
          break
        default:
          break
      }
    })
    return () => { offSpp(); offStatus() }
  }, [activeMode])

  // Check if SPP is supported on this device
  const sppSupported = sppService.supported

  // Mode changed on the car: keep the app in sync with live telemetry.
  useFocusEffect(
    React.useCallback(
      () => {
        return sppService.onTelemetry((t) => {
          if (!mountedRef.current) return
          if (t.mode) {
            setCarModeId(t.mode)
            const matched = carModes.find((m) => m.id === t.mode || m.token === t.mode)
            if (matched && matched.id !== activeMode.id) {
              setActiveMode(matched)
            }
          }
        })
      },
      [carModes],
    ),
  )

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
    if (!device.address) {
      setError('This car has no Bluetooth address. Rescan and try again.')
      return
    }
    setConnectingAddress(device.address)
    setError(null)
    try {
      await sppService.connect(device.address)
      setConnected(true)
      setDeviceName(device.name)
      setConnecting(false)
      setConnectingAddress(null)
      setWifiConnected(false)
      showConnectionMessage(`Connected to ${device.name}`, 'success')
      void sppService.requestState().catch(() => {})
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'Connection failed')
        setConnecting(false)
        setConnectingAddress(null)
        showConnectionMessage(e instanceof Error ? e.message : 'Connection failed', 'error')
      }
    }
  }, [showConnectionMessage])

  // Immediate SPP retry (uses last known address from service)
  const handleSppsRetry = useCallback(async () => {
    setShowSppsRetry(false)
    setError(null)
    try {
      await sppService.retryConnect()
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'Retry failed')
      }
    }
  }, [])

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
      if (reconnectAttemptsRef.current >= 5) {
        setError('WiFi connection lost — reconnection failed.')
        return
      }
      reconnectAttemptsRef.current += 1
      reconnectTimerRef.current = setTimeout(() => openSocket(url), 3000)
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
    wsRef.current?.close()
    setWifiConnected(false)
    setError(null)
  }, [])

  const handleDisconnect = useCallback(async () => {
    manualCloseRef.current = true
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    try { await sppService.sendLine('SPD0') } catch { /* ignore */ }
    try { await sppService.sendLine('SERVO90') } catch { /* ignore */ }
    await sppService.disconnect()
    wsRef.current?.close()
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

  // Send command via SPP (primary) or WiFi; no-ops when nothing is linked
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
    if (cmd === 'S' || cmd === 'SPD0' || cmd === 'SERVO90') {
      sendCommand(cmd)
      lastDriveCmdAtRef.current[kind] = now
      return
    }
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

  const handleStickDrive = useCallback((signed: number) => {
    setDriveStatus(signed > 0 ? 'Forward' : signed < 0 ? 'Backward' : 'Stop')
    sendThrottled('spd', `SPD${Math.round(signed)}`)
  }, [sendThrottled])

  const adjustSteerLimit = useCallback((delta: number) => {
    setSteerLimit((prev) => {
      const next = Math.max(0, Math.min(safetyLimits.maxSteerDeviation, prev + delta))
      persistPrefs({ steerLimit: next })
      return next
    })
  }, [safetyLimits.maxSteerDeviation, persistPrefs])

  const adjustTrim = useCallback((delta: number) => {
    setTrim((prev) => {
      const next = Math.max(-safetyLimits.maxTrim, Math.min(safetyLimits.maxTrim, prev + delta))
      sendCommand(`TRIM${next}`)
      persistPrefs({ trim: next })
      return next
    })
  }, [safetyLimits.maxTrim, sendCommand, persistPrefs])

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
  }, [sendCommand])

  const handleGimbalPan = useCallback((value: number) => { setGimbalPan(value); sendCommand(`GIMBAL_PAN:${Math.round(value)}`) }, [sendCommand])
  const handleGimbalTilt = useCallback((value: number) => { setGimbalTilt(value); sendCommand(`GIMBAL_TILT:${Math.round(value)}`) }, [sendCommand])
  const handleAltitude = useCallback((value: number) => { setTargetAltitude(value); sendCommand(`ALT:${Math.round(value)}`) }, [sendCommand])

  const selectJoystickLayout = useCallback((id: string) => {
    setJoystickLayoutId(id)
    setUseJoystick(id === 'dual')
    persistPrefs({ joystickLayout: id, useJoystick: id === 'dual' })
  }, [persistPrefs])

  // Derived helpers
  const usesBtComm = activeMode.transport.includes('classic-bt') || activeMode.transport.includes('ble')
  const usesWifi = activeMode.transport.includes('wifi')
  const canControl = connected || wifiConnected
  const isDrone = activeCategory === 'drones'
  const isNonRobocar = activeCategory !== 'robocar'
  const is2wd1mActive = activeMode.controls.includes('drive-2wd1m')

  return {
    // connection
    sppDevices, connected, deviceName, scanning, connecting, connectingAddress, wifiConnected, wifiUrl,
    error, connectionMessage, connectionMsgType, sppStatus, sppStatusMsg, showSppsRetry,
    sppSupported, canControl,
    setWifiUrl, handleScan, handleConnect, handleSppsRetry, handleWifiConnect,
    handleWifiDisconnect, handleDisconnect, showConnectionMessage,
    // mode + category
    activeCategory, setActiveCategory, activeMode, carModes, carModeId,
    selectMode, cycleMode, handleCategoryPress,
    // drive state
    speed, setSpeed, servo, steerLimit, trim, driveStatus, telemetry, safetyLimits,
    handleDirection, handleSpeed, handleServo, applyPid, handleStickDrive,
    adjustSteerLimit, adjustTrim, handleEStop, sendCommand,
    // pid
    pidKp, pidKi, pidKd, pidOut, pidOff,
    // drone
    gimbalPan, gimbalTilt, targetAltitude, handleGimbalPan, handleGimbalTilt, handleAltitude,
    // sensors + relays
    sensorData, relays, toggleRelay,
    // toggles
    useJoystick, setUseJoystick, joystickLayoutId, selectJoystickLayout,
    // persistence
    savedPrefs, persistPrefs, addressForMemory,
    // derived
    isDrone, isNonRobocar, is2wd1mActive, usesBtComm, usesWifi,
  }
}
