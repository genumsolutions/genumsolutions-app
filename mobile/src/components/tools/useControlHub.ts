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
import { bleService } from '../../services/bleService'
import { DEFAULT_SAFETY_LIMITS, type DevicePrefs } from './types'
import { LOCAL_CAR_MODES, type CarMode } from '../../config/roboCarCatalog'
import { getCarModes } from '../../services/carModeService'
import { PROJECT_CATEGORIES } from '../../config/project-catalog'
import { DRIVE_CMD_MIN_INTERVAL_MS, SPP_RECONNECT_DELAYS_MS } from './controlConstants'
import { isAllowedDriveStatus, statusToDirection, quantizeSpeedToStep, parseTelemetryLine, SPEED_MIN, SPEED_MAX, SPEED_STEP } from '../../services/carProtocol'
import { MODE_NAMES as ESP_MODE_NAMES } from '../../config/roboCarCatalog'

/** Token → short display name for "Mode:<name>" statuses (MODE_NAMES[]). */
const MODE_NAME_FOR_TOKEN: Record<string, string> = ESP_MODE_NAMES
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
  // speed starts at the ESP remote's default speedValue = 170.
  const [activeCategory, setActiveCategory] = useState('robocar')
  const [activeMode, setActiveMode] = useState<CarMode>(LOCAL_CAR_MODES[0])
  const [speed, setSpeed] = useState(170)
  const [servo, setServo] = useState(90)
  const [steerLimit, setSteerLimit] = useState(90)
  const [trim, setTrim] = useState(0)
  // driveStatus = the remote's bottom-bar status line (ESP statusMessage):
  // local action messages ("Speed:170", "Steer limit:90", "Mode:2WD1M")
  // merged with whitelisted car statuses ("Forward", "EMERGENCY STOP").
  const [driveStatus, setDriveStatus] = useState('Stop')
  // driveDir = the dashboard BODY direction (ESP currentDir): mirrored from
  // the car's own status (so driving the car by its own buttons updates the
  // app) and from local input. The OLED body + HUD read this.
  const [driveDir, setDriveDir] = useState<'F' | 'B' | 'L' | 'R' | 'S'>('S')
  const [telemetry, setTelemetry] = useState<CarTelemetry>({})

  // NAV state (ESP INPUT_NAV parity): while true the pads/joysticks navigate
  // the top-bar fields and NOTHING drives; the hub also stops mirroring the
  // car's speed echo so an in-progress edit never snaps back (state.cpp:
  // "Skip the mirror during NAV editing").
  const [navActive, setNavState] = useState(false)
  const navActiveRef = useRef(false)
  const setNavActive = useCallback((v: boolean) => {
    navActiveRef.current = v
    setNavState(v)
  }, [])
  // Which top-bar field NAV is editing right now.
  const [navField, setNavField] = useState<'mode' | 'speed' | 'steer' | 'none'>('none')
  // NAV mode preview (ESP previewModeIndex): the browsed-to mode shown
  // before Select confirms.
  const [previewMode, setPreviewMode] = useState<CarMode | null>(null)

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
  const carModeIdRef = useRef<string | null>(null)

  // Joystick layout style id persisted per device.
  const [joystickLayoutId, setJoystickLayoutId] = useState<string>('dual')

  // Remote settings drawer (in-window, non-overflowing).
  const [showSettings, setShowSettings] = useState(false)

  const mountedRef = useRef(true)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const manualCloseRef = useRef(false)
  const lastDriveCmdAtRef = useRef<Record<string, number>>({})
  const connectionMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---- SPP auto-reconnect (ESP remote parity: 4 silent tries → prompt) ----
  const sppReconnectAttemptsRef = useRef(0)
  const sppReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sppLastAddressRef = useRef<string | null>(null)

  // Car-mode catalogue: DB-first with bundled fallback
  const [carModes, setCarModes] = useState<CarMode[]>(LOCAL_CAR_MODES)

  // Always-fresh mirrors for the telemetry pipeline (no stale closures).
  const carModesRef = useRef(carModes)
  carModesRef.current = carModes
  const activeModeRef = useRef(activeMode)
  activeModeRef.current = activeMode

  useEffect(() => {
    let active = true
    getCarModes()
      .then((modes) => {
        if (!active || modes.length === 0) return
        setCarModes(modes)
        // Only set a default mode if the car hasn't already reported one via
        // telemetry (carModeIdRef is set in applyTelemetry).  The car's
        // STATE;MODE=... is the authoritative source — don't overwrite it.
        if (!carModeIdRef.current) {
          const target = modes.find((m) => m.id === '2wd1m') || modes[0]
          setActiveMode(target)
        }
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
        joystickLayout: joystickLayoutId,
        ...patch,
      } as DevicePrefs
      void deviceMemory.write(addressForMemory, next)
      setSavedPrefs(next)
    },
    [addressForMemory, deviceName, activeMode.id, speed, servo, steerLimit, trim, useJoystick, joystickLayoutId],
  )

  // Ref mirror so NAV commit callbacks can persist without re-creating
  // (and without stale captures) when called from deep in the input chain.
  const persistPrefsRef = useRef(persistPrefs)
  persistPrefsRef.current = persistPrefs

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

  // Cleanup on unmount — do NOT disconnect the singleton services; the
  // BLE/SPP connection must survive navigation between screens. Only
  // explicit user action (handleDisconnect) should tear down the transport.
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
    }
  }, [])

  // Telemetry + status wiring (SPP service)
  // Parity with the ESP remote's parseTelemetryLine() + applyRemoteState()
  // (state.cpp / comms.cpp):
  //   • MODE: ALWAYS mirror the car's authoritative mode (the car's own mode
  //     button must switch the app too).
  //   • SPD: mirror the magnitude quantized to the 5-step grid inside
  //     SPEED_MIN..SPEED_MAX; skipped while NAV is editing; SPD0 = stop echo
  //     keeps the displayed speed.
  //   • STATUS: only whitelisted short statuses are displayed.
  //   • TRIM: mirrored.
  useEffect(() => {
    const applyTelemetry = (t: CarTelemetry) => {
      if (!mountedRef.current) return
      setTelemetry((prev) => ({ ...prev, ...t }))
      // Mode: always mirror (applyRemoteState parity).
      if (t.mode) {
        setCarModeId(t.mode)
        carModeIdRef.current = t.mode
        const modeUp = t.mode.toUpperCase()
        const matched = carModesRef.current.find((m) => m.id === t.mode || m.token.toUpperCase() === modeUp)
        if (matched) setActiveMode(matched)
      }
      // Speed: quantized mirror, NAV-edit-aware (see above).
      if (!navActiveRef.current && t.speed != null) {
        const mag = Math.abs(t.speed)
        if (mag > 0 && mag <= 255) setSpeed(quantizeSpeedToStep(mag))
      }
      if (t.trim != null) setTrim(t.trim)
      // PID telemetry from TEL; frames (self-balancing live values).
      if (t.kp != null) setPidKp(t.kp)
      if (t.ki != null) setPidKi(t.ki)
      if (t.kd != null) setPidKd(t.kd)
      if (t.out != null) setPidOut(t.out)
      if (t.off != null) setPidOff(t.off)
      // Status: whitelist only — verbose/unknown statuses never shown.
      if (t.status && isAllowedDriveStatus(t.status)) {
        setDriveStatus(t.status)
        const d = statusToDirection(t.status)
        if (d) setDriveDir(d)
      }
    }
    const offSpp = sppService.onTelemetry(applyTelemetry)
    const offBle = bleService.onTelemetry(applyTelemetry)
    const offStatus = sppService.onStatus((kind, message) => {
      if (!mountedRef.current) return
      switch (kind) {
        case 'connecting':
          setSppStatus('connecting')
          setSppStatusMsg('')
          setShowSppsRetry(false)
          break
        case 'connected':
          setSppStatus('connected')
          setSppStatusMsg(message ?? 'Connected')
          setShowSppsRetry(false)
          sppReconnectAttemptsRef.current = 0
          // Force the car to broadcast its current STATE so the app
          // immediately picks up the active mode, speed, trim, etc.
          // without waiting for the car's next自发 telemetry cycle.
          setTimeout(() => {
            sppService.requestState().catch(() => {})
          }, 200)
          break
        case 'disconnected':
          setSppStatus('disconnected')
          setSppStatusMsg('')
          // Auto-reconnect on unexpected disconnect (ESP remote parity):
          // 4 silent attempts at 800ms, then prompt.
          if (!manualCloseRef.current && sppLastAddressRef.current) {
            startSppReconnect()
          } else {
            setShowSppsRetry(true)
          }
          break
        case 'error':
          setSppStatus('error')
          setSppStatusMsg(message ?? 'Connection error')
          if (!manualCloseRef.current && sppLastAddressRef.current) {
            startSppReconnect()
          } else {
            setShowSppsRetry(true)
          }
          break
        default:
          break
      }
    })
    // BLE status — mirrors SPP connected/disconnected handling so BLE-only
    // links trigger REQ_STATE and set connected=true.
    const offBleStatus = bleService.onStatus((kind, message) => {
      if (!mountedRef.current) return
      if (kind === 'connected') {
        setConnected(true)
        setDeviceName(bleService.deviceName ?? 'Car')
        setTimeout(() => {
          bleService.requestState().catch(() => {})
        }, 200)
      } else if (kind === 'disconnected') {
        // Only clear connected if SPP is also not linked.
        if (!sppService.isConnected) {
          setConnected(false)
          setDeviceName('')
        }
      }
    })
    return () => { offSpp(); offBle(); offStatus(); offBleStatus() }
    // NOTE: deps are intentionally empty — activeMode is read via
    // carModesRef (fresh on every telemetry frame) and setActiveMode is a
    // stable setState.  The old [activeMode] dependency tore down and
    // re-created the subscription on every mode change, which caused the
    // app to miss STATE;MODE=… frames from the car during the gap.
  }, [])

  // Check if SPP is supported on this device
  const sppSupported = sppService.supported

  // Periodic REQ_STATE — keeps the app synced with the car's current mode,
  // speed, and trim. The ESP32 firmware may not auto-broadcast STATE when
  // the physical mode button is pressed, so we poll every 2 s.
  // Works for SPP, BLE, and WiFi transports.
  useEffect(() => {
    if (!connected) return
    const id = setInterval(() => {
      if (sppService.isConnected) {
        sppService.requestState().catch(() => {})
      }
      if (bleService.isConnected) {
        bleService.requestState().catch(() => {})
      }
      if (wifiConnected && wsRef.current) {
        try { wsRef.current.send('REQ_STATE\n') } catch { /* ignore */ }
      }
    }, 2000)
    return () => clearInterval(id)
  }, [connected, wifiConnected])

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
    manualCloseRef.current = false
    try {
      await sppService.connect(device.address)
      sppLastAddressRef.current = device.address
      sppReconnectAttemptsRef.current = 0
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
    manualCloseRef.current = false
    sppReconnectAttemptsRef.current = 0
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
        // Try JSON first (WiFi car e.g. WebServerComm broadcasts a JSON object).
        const json = JSON.parse(event.data)
        // Build telemetry directly from the JSON fields — parseTelemetryLine
        // expects STATE;key=val lines and would fail on a JSON string.
        const t: CarTelemetry = {}
        if (typeof json.mode === 'string') t.mode = json.mode
        if (typeof json.speed === 'number') t.speed = json.speed
        if (typeof json.trim === 'number') t.trim = json.trim
        if (typeof json.status === 'string') t.status = json.status
        if (typeof json.kp === 'number') t.kp = json.kp
        if (typeof json.ki === 'number') t.ki = json.ki
        if (typeof json.kd === 'number') t.kd = json.kd
        if (typeof json.out === 'number') t.out = json.out
        if (typeof json.off === 'number') t.off = json.off
        if (typeof json.angle === 'number') t.angle = json.angle
        if (Object.keys(t).length > 0) {
          setTelemetry((prev) => ({ ...prev, ...t }))
          if (t.mode) {
            setCarModeId(t.mode)
            const modeUp = t.mode.toUpperCase()
            const matched = carModesRef.current.find((m) => m.id === t.mode || m.token.toUpperCase() === modeUp)
            if (matched) setActiveMode(matched)
          }
          if (!navActiveRef.current && t.speed != null) {
            const mag = Math.abs(t.speed)
            if (mag > 0 && mag <= 255) setSpeed(quantizeSpeedToStep(mag))
          }
          if (t.trim != null) setTrim(t.trim)
          if (t.status && isAllowedDriveStatus(t.status)) {
            setDriveStatus(t.status)
            const d = statusToDirection(t.status)
            if (d) setDriveDir(d)
          }
        }
        if (json.sensors) setSensorData(prev => ({ ...prev, ...json.sensors }))
      } catch {
        // Non-JSON: try STATE/SPD lines (same parser as SPP).
        try {
          const t = parseTelemetryLine(event.data)
          if (Object.keys(t).length > 0) {
            setTelemetry((prev) => ({ ...prev, ...t }))
            if (t.mode) {
              setCarModeId(t.mode)
              const modeUp = t.mode.toUpperCase()
              const matched = carModesRef.current.find((m) => m.id === t.mode || m.token.toUpperCase() === modeUp)
              if (matched) setActiveMode(matched)
            }
            if (!navActiveRef.current && t.speed != null) {
              const mag = Math.abs(t.speed)
              if (mag > 0 && mag <= 255) setSpeed(quantizeSpeedToStep(mag))
            }
            if (t.trim != null) setTrim(t.trim)
            if (t.status && isAllowedDriveStatus(t.status)) {
              setDriveStatus(t.status)
              const d = statusToDirection(t.status)
              if (d) setDriveDir(d)
            }
          }
        } catch { /* ignore */ }
      }
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

  // Safe stop on link loss (comms.cpp safeStopAndClearQueue parity): the
  // neutral commands are sent by the transport layer on disconnect; here we
  // reset the on-screen drive state so the app never shows a stale
  // "Forward" after the car already stopped.
  useFocusEffect(
    React.useCallback(() => {
      return sppService.onStatus((kind) => {
        if (!mountedRef.current) return
        if (kind === 'disconnected' || kind === 'error') {
          setDriveDir('S')
        }
      })
    }, []),
  )

  const handleDisconnect = useCallback(async () => {
    manualCloseRef.current = true
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    try { await sppService.sendLine('SPD0') } catch { /* ignore */ }
    try { await sppService.sendLine('SERVO90') } catch { /* ignore */ }
    await sppService.disconnect()
    if (bleService.isConnected) {
      try { await bleService.sendLine('SPD0') } catch { /* ignore */ }
      try { await bleService.sendLine('SERVO90') } catch { /* ignore */ }
      await bleService.disconnect()
    }
    wsRef.current?.close()
    setConnected(false)
    setWifiConnected(false)
    setDeviceName('')
    setSppDevices([])
    setDriveStatus('Stop')
    setDriveDir('S')
    setNavActive(false)
    setNavField('none')
    setPreviewMode(null)
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

  // Send command via SPP (primary), BLE, or WiFi; no-ops when nothing is linked
  const sendCommand = useCallback((cmd: string) => {
    if (connected && sppService.isConnected) {
      void sppService.sendLine(cmd).catch(() => {})
    }
    if (connected && bleService.isConnected) {
      void bleService.sendLine(cmd).catch(() => {})
    }
    if (wifiConnected && wsRef.current) {
      try { wsRef.current.send(cmd + '\n') } catch { /* ignore */ }
    }
  }, [connected, wifiConnected])

  const handleDirection = useCallback((d: 'F' | 'B' | 'L' | 'R' | 'S') => {
    setDriveDir(d)
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

  // ESP-remote parity: speed is NEVER sent live while driving. handleSpeed
  // only edits the PREVIEW (NAV highlight field); commitSpeed — called on
  // Select — sends SPD<n> once, sets the local "Speed:<n>" status and
  // persists (the .ino TOP_SPEED branch).
  const handleSpeed = useCallback((value: number) => {
    // Slider input is 0..255; snap into the ESP grid for display.
    const q = quantizeSpeedToStep(Math.max(SPEED_MIN, Math.min(SPEED_MAX, Math.round(value))))
    setSpeed(q)
  }, [])

  const commitSpeed = useCallback(() => {
    setSpeed((s) => {
      sendThrottled('spd', `SPD${Math.round(s)}`)
      setDriveStatus(`Speed:${Math.round(s)}`)
      persistPrefsRef.current?.({ speed: s })
      return s
    })
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
    setDriveDir(signed > 0 ? 'F' : signed < 0 ? 'B' : 'S')
    setDriveStatus(signed > 0 ? 'Forward' : signed < 0 ? 'Backward' : 'Stop')
    sendThrottled('spd', `SPD${Math.round(signed)}`)
  }, [sendThrottled])

  // Steer limit edits mirror the ESP NAV behaviour: up/down steps 5°, and
  // NOTHING is sent to the car — the limit is applied app-side when driving
  // (clamp) and only "recorded" on Select (commitSteerLimit).
  const adjustSteerLimit = useCallback((delta: number) => {
    setSteerLimit((prev) => {
      const next = Math.max(0, Math.min(180, prev + delta))
      return next
    })
  }, [])

  // Select on the Steer field: record the limit (status + persist), never
  // send a servo command (the .ino TOP_STEER branch: "Just record the
  // maximum allowable steering limit - never move the servo here").
  const commitSteerLimit = useCallback(() => {
    setSteerLimit((s) => {
      setDriveStatus(`Steer limit:${s}`)
      persistPrefsRef.current?.({ steerLimit: s })
      return s
    })
  }, [])

  const adjustTrim = useCallback((delta: number) => {
    setTrim((prev) => {
      const next = Math.max(-safetyLimits.maxTrim, Math.min(safetyLimits.maxTrim, prev + delta))
      sendCommand(`TRIM${next}`)
      persistPrefs({ trim: next })
      return next
    })
  }, [safetyLimits.maxTrim, sendCommand, persistPrefs])

  const handleEStop = useCallback(() => {
    setDriveDir('S')
    setDriveStatus('EMERGENCY STOP')
    sendCommand('ESTOP')
    sendCommand('SPD0')
    sendCommand('SERVO90')
  }, [sendCommand])

  // Mode select = the ESP confirm path: clear the queue, send the token
  // immediately, mirror the mode, status "Mode:<name>", stop driving.
  const selectMode = useCallback((m: CarMode) => {
    setActiveMode(m)
    setDriveDir('S')
    setDriveStatus(`Mode:${MODE_NAME_FOR_TOKEN[m.token] ?? m.token}`)
    sendCommand('S')
    sendCommand(m.token)
  }, [sendCommand])

  const cycleMode = useCallback(() => {
    // Car firmware Mode enum order (ModeManager.h):
    // BT(0) → ESP_SER(1) → ESP_CLI(2) → PATH(3) → OBS_US(4) →
    // OBS_IR(5) → MAN(6) → 2WD1M(7) → AUTO(8)
    const CAR_CYCLE_ORDER = ['BT', 'ESP_SER', 'ESP_CLI', 'PATH', 'OBS_US', 'OBS_IR', 'MAN', '2WD1M', 'AUTO']
    const list = (carModes.length > 0 ? carModes : LOCAL_CAR_MODES)
      .slice()
      .sort((a, b) => CAR_CYCLE_ORDER.indexOf(a.token) - CAR_CYCLE_ORDER.indexOf(b.token))
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

  // ---- SPP auto-reconnect — silent exponential backoff ----
  // Delays: 1s → 2s → 4s → 8s → give up silently (no prompt).
  const startSppReconnect = useCallback(() => {
    if (sppReconnectTimerRef.current) {
      clearTimeout(sppReconnectTimerRef.current)
      sppReconnectTimerRef.current = null
    }
    const attempt = () => {
      if (!mountedRef.current || manualCloseRef.current || !sppLastAddressRef.current) return
      const n = sppReconnectAttemptsRef.current
      if (n >= SPP_RECONNECT_DELAYS_MS.length) {
        // All attempts exhausted — give up silently.
        sppReconnectAttemptsRef.current = 0
        return
      }
      sppReconnectAttemptsRef.current += 1
      sppService.retryConnect().catch(() => {
        if (mountedRef.current) {
          const delay = SPP_RECONNECT_DELAYS_MS[sppReconnectAttemptsRef.current] ?? SPP_RECONNECT_DELAYS_MS[SPP_RECONNECT_DELAYS_MS.length - 1]
          sppReconnectTimerRef.current = setTimeout(attempt, delay)
        }
      })
    }
    sppReconnectTimerRef.current = setTimeout(attempt, SPP_RECONNECT_DELAYS_MS[0])
  }, [])

  const handleReconnectPromptCancel = useCallback(() => {
    manualCloseRef.current = true
    void handleDisconnect()
  }, [handleDisconnect])

  // Cleanup reconnect timer on unmount.
  useEffect(() => {
    return () => {
      if (sppReconnectTimerRef.current) clearTimeout(sppReconnectTimerRef.current)
    }
  }, [])

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
    // SPP auto-reconnect
    handleReconnectPromptCancel,
    // mode + category
    activeCategory, setActiveCategory, activeMode, carModes, carModeId,
    selectMode, cycleMode, handleCategoryPress,
    // drive state
    speed, setSpeed, servo, steerLimit, trim, driveStatus, driveDir, telemetry, safetyLimits,
    handleDirection, handleSpeed, handleServo, applyPid, handleStickDrive,
    adjustSteerLimit, commitSpeed, commitSteerLimit, adjustTrim, handleEStop, sendCommand,
    // NAV (ESP INPUT_NAV parity)
    navActive, setNavActive, navActiveRef, navField, setNavField, previewMode, setPreviewMode,
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
