// =====================================================================
// useControlHub â€” shared connection/control/telemetry state + command
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
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useFocusEffect, useIsFocused } from '@react-navigation/native'
import { useRoute, type RouteProp } from '@react-navigation/native'
import type { RootStackParamList } from '../../navigation/types'
import { APP_VERSION } from '../../config/site'
import { sppService, type SppDevice } from '../../services/sppService'
import { bleService } from '../../services/bleService'
import { wifiService } from '../../services/wifiService'
import { DEFAULT_SAFETY_LIMITS, type DevicePrefs } from './types'
import { LOCAL_CAR_MODES, type CarMode, nextRemoteModeToken, sortRemoteModes } from '../../config/roboCarCatalog'
import { getCarModes } from '../../services/carModeService'
import { PROJECT_CATEGORIES } from '../../config/project-catalog'
import { DRIVE_CMD_MIN_INTERVAL_MS, SPP_RECONNECT_DELAYS_MS } from './controlConstants'
import { isAllowedDriveStatus, statusToDirection, quantizeSpeedToStep, parseTelemetryLine, buildWifiConfigLine, buildRouterCommand, normalizeModeToken, canonicalCarToken, SPEED_MIN, SPEED_MAX, SPEED_STEP, STEER_LIMIT_MIN, STEER_LIMIT_MAX, buildSteer } from '../../services/carProtocol'
import { MODE_NAMES as ESP_MODE_NAMES } from '../../config/roboCarCatalog'

/** Token â†’ short display name for "Mode:<name>" statuses (MODE_NAMES[]). */
const MODE_NAME_FOR_TOKEN: Record<string, string> = ESP_MODE_NAMES

// Round-6 (app): the app-wide "last touched car" spill. A per-device memory
// entry is the primary store, but it is only REACHABLE once we know the
// device address (a live link). Saving a small spill keyed globally here lets
// a cold start with NO live link still show the last known saved-router names
// in the Router panel ("options to use saved networks even after power cycle").
// Names only — passwords never leave the car (W-14) and never touch the app.
const LAST_DEVICE_KEY = 'genum.lastDevice'

/**
 * Commands that must reach the car over EVERY live link, regardless of the
 * active mode's transport. Mode tokens (any live link can switch the car
 * into that mode â€” the car renders its own frame), plus the neutral /
 * emergency safety lines (ESTOP / SPD0 / SERVO90 / 'S' / REQ_STATE). Every
 * other command follows the ACTIVE mode's own transports (R-4 fleet parity:
 * WiFi modes drive over the WS, BT modes over SPP/BLE â€” never blast a
 * WiFi-mode drive letter at a Bluetooth car).
 */
const EVERY_LINK_COMMANDS = new Set([
  '4WD4M', 'BT', 'ESP_SER', 'PATH', 'OBS_US', 'OBS_IR', 'MAN', 'AUTO', 'ESP_CLI', '2WD1M',
  'ESTOP', 'SPD0', 'SERVO90', 'REQ_STATE', 'S',
  // A-27: router-registry commands are SYSTEM commands — they can switch the
  // car's network but never drive; reaching the car over WHATEVER link is
  // live (WS for wireless cars, BT for the hand-held remote path) rides the
  // car's single system-command hook (W-14/F-21).
  'ROUTERS',
])
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
  // v1.4.0 provisioning: the WiFi network the CAR should join (its own AP
  // broadcast id + IP ride the car's status JSON for display).
  const [wifiSsid, setWifiSsid] = useState('')
  const [wifiPassword, setWifiPassword] = useState('')
  const [wifiProvisioning, setWifiProvisioning] = useState(false)
  // A-27 (device-round-5): saved-router names mirror — from the wireless
  // car's `networks` JSON (every WS status broadcast), optimistic edits, and
  // the per-device savedRouters prefs (restored before the car is linked).
  // The car's NVS registry stays the source of truth; passwords never sync.
  const [carNetworks, setCarNetworks] = useState<string[]>([])
  // Broadcast id of the car's AP fallback + its configured SSID (car truth,
  // from the status JSON `ap` / `ssid` fields). Shown in the ESP_SER deck.
  const [carApName, setCarApName] = useState<string | null>(null)
  const [carSsid, setCarSsid] = useState<string | null>(null)
  // A-7 legacy car-truth map: token -> stub flag, fed by CAP=STUB on
  // the car's STATE lines and `stub` in its WS JSON (both describe the
  // car's CURRENT mode â€” the map fills as the car visits modes, and stays
  // for v1.4.0 cars that don't broadcast the full CAPS table). Tokens
  // absent from the map fall back to the fleet default (modeAvailStatus in
  // carProtocol.ts).
  const [carStubMap, setCarStubMap] = useState<Record<string, boolean>>({})
  // R-10: full per-token availability table from the car's CAPS broadcast
  // (`caps` on STATE-style lines / WS JSON). Authoritative 3-state truth
  // (LIVE / WIP / CS) for the mode badges; supersedes the per-current-mode
  // stub flag for cars that announce the whole table (v1.5.0 fleet).
  const [carAvailMap, setCarAvailMap] = useState<Record<string, string>>({})
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
  // R-20: steerLimit = the steering travel LIMIT (max |servo − 90|, 10..90).
  // Car truth rides STATE ;STEER=; edits send STEER<n> and the car echoes.
  const [steerLimit, setSteerLimit] = useState(90)
  const [trim, setTrim] = useState(0)
  // R-19 (FIN-45): car-truth trip mirrors (STATE TRIP=/MSTEER=; telemetry-only,
  // never persisted — the car owns them).
  const [tripAvg, setTripAvg] = useState(0)
  const [maxSteer, setMaxSteer] = useState(0)
  // driveStatus = the remote's bottom-bar status line (ESP statusMessage):
  // local action messages ("Speed:170", "Steer limit:90", "Mode:2WD1M")
  // merged with whitelisted car statuses ("Forward", "EMERGENCY STOP").
  const [driveStatus, setDriveStatus] = useState('Stop')
  // driveDir = the dashboard BODY direction (ESP currentDir): mirrored from
  // the car's own status (so driving the car by its own buttons updates the
  // app) and from local input. The OLED body + HUD read this.
  const [driveDir, setDriveDir] = useState<'F' | 'B' | 'L' | 'R' | 'S'>('S')
  // A-16 (device-round-2): guarded setters â€” the status/direction row only
  // repaints on an ACTUAL change. Every writer in this hook routes through
  // them, so steady drive (repeated "Forward"/"Stop" STATUS frames) no longer
  // floods the 4WD4M status card (pairs with remote R-21 setStatusLocked).
  const driveStatusRef = useRef(driveStatus)
  driveStatusRef.current = driveStatus
  const driveDirRef = useRef(driveDir)
  driveDirRef.current = driveDir
  const setDriveStatusOnce = useCallback((s: string) => {
    if (driveStatusRef.current === s) return
    driveStatusRef.current = s
    setDriveStatus(s)
  }, [])
  const setDriveDirOnce = useCallback((d: 'F' | 'B' | 'L' | 'R' | 'S') => {
    if (driveDirRef.current === d) return
    driveDirRef.current = d
    setDriveDir(d)
  }, [])
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
  // A-37: user mode-commit grace (ESP remote R-33 parity) — remember the token
  // the USER chose plus the car-truth mode at commit time so the stale in-flight
  // echo (still the pre-commit mode) cannot undo the optimistic pick (that was
  // the dropdown flicker). Any CHANGED echo is car truth and adopts + clears.
  const MODE_CHANGE_GRACE_MS = 2500
  const modeCommitRef = useRef<{ token: string; stale: string | null; at: number } | null>(null)

  // A-14/A-16: always-fresh mirrors for the connection/status setters so the
  // writers can dedupe without stale closures and without re-running drives.
  const connectedRef = useRef(connected)
  connectedRef.current = connected

  // Joystick layout style id persisted per device.
  const [joystickLayoutId, setJoystickLayoutId] = useState<string>('dual')

  // Remote settings drawer (in-window, non-overflowing).
  const [showSettings, setShowSettings] = useState(false)

  const mountedRef = useRef(true)
  const manualCloseRef = useRef(false)
  const lastDriveCmdAtRef = useRef<Record<string, number>>({})
  const connectionMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---- SPP auto-reconnect (ESP remote parity: 4 silent tries â†’ prompt) ----
  const sppReconnectAttemptsRef = useRef(0)
  // FIN-44: last status message seen by the dedupe gate (see onStatus below).
  const sppStatusMsgRef = useRef<string | null>(null)
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
        // STATE;MODE=... is the authoritative source â€” don't overwrite it.
        if (!carModeIdRef.current) {
          const target = modes.find((m) => m.id === '2wd1m') || modes[0]
          setActiveMode(target)
        }
      })
      .catch(() => { /* keep bundled fallback */ })
    return () => { active = false }
  }, [])

  // Restore remembered device prefs when a device address becomes available.
  // WiFi-only links have no BT MAC, so the remembered-key falls back to the
  // car's wifi identity (`wifi:<ssid|ap|url>`): a WiFi car keeps its mode /
  // speed / settings across sessions AND across power cycles (bug report
  // 2026-09-15: "remember state"). BT links keep using the MAC (primary).
  const wifiIdentity = wifiConnected && wifiUrl.trim()
    ? (carSsid || carApName || wifiUrl.trim())
    : null
  const addressForMemory = sppService.currentAddress
    ?? sppService.getConnectionInfo().address
    ?? (wifiIdentity ? `wifi:${wifiIdentity}` : null)
  const [savedPrefs, setSavedPrefs] = useState<DevicePrefs | null>(null)
  useFocusEffect(
    React.useCallback(
      () => {
        if (!addressForMemory) {
          setSavedPrefs(null)
          // Round-6: no live link — still recall the last device's saved
          // router names from the global spill so the Router panel isn't
          // empty after a power cycle (the car's `networks` echo re-syncs
          // to car truth the moment a link opens).
          let active = true
          void AsyncStorage.getItem(LAST_DEVICE_KEY).then((raw) => {
            if (!active || !raw) return
            try {
              const last = JSON.parse(raw) as { address?: string; name?: string; savedRouters?: string[] }
              if (last?.savedRouters?.length) {
                setCarNetworks((cur) => (cur.length > 0 ? cur : last.savedRouters!))
              }
              if (last?.name) setDeviceName((cur) => cur || last.name!)
            } catch { /* ignore corrupt spill */ }
          })
          return () => { active = false }
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
            // A-8: pre-fill the WiFi card with the last SSID sent to THIS car
            // (never the password â€” that lives only in flight + the car's NVS).
            if (prefs.lastWifiSsid) setWifiSsid((cur) => cur || prefs.lastWifiSsid!)
            // A-27: restore the per-device saved-router mirror so the WiFi &
            // Router panel renders before the car links (names only). The
            // car's next `networks` echo re-syncs it to car truth.
            if (prefs.savedRouters && prefs.savedRouters.length > 0) {
              setCarNetworks((cur) => (cur.length > 0 ? cur : (prefs.savedRouters ?? [])))
            }
          }
        })
        return () => { active = false }
      },
      [addressForMemory, carModes],
    ),
  )

  // Persist device prefs whenever the user changes a remembered value.
  // Round-6 (bug): read the CURRENT saved-router names from a live ref, not
  // from the `savedPrefs` closure — the old closure captured a stale copy of
  // `savedRouters: []` at hook-scope, so any later speed/steer persist wiped
  // the saved-router mirror back to empty (networks vanished after power
  // cycle). The ref tracks the live `carNetworks` (car echo + optimistic
  // adds/deletes), so every patch ships the latest names forward.
  const savedNetworksRef = useRef<string[]>([])
  useEffect(() => { savedNetworksRef.current = carNetworks }, [carNetworks])
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
        lastWifiSsid: savedPrefs?.lastWifiSsid ?? null,
        // A-27 / round-6: ship the LIVE saved-router mirror with every patch
        // (never a stale-captured base), so router additions survive later
        // speed/steer persists AND a device power cycle.
        savedRouters: savedNetworksRef.current.slice(),
        ...patch,
      } as DevicePrefs
      void deviceMemory.write(addressForMemory, next)
      setSavedPrefs(next)
      // Round-6: spill the last-touched device globally so a cold start with
      // no live link can still recall the saved-router names (see LAST_DEVICE_KEY).
      const lastDevice = {
        address: addressForMemory,
        name: sppService.deviceName ?? deviceName,
        savedRouters: next.savedRouters,
      }
      void AsyncStorage.setItem(LAST_DEVICE_KEY, JSON.stringify(lastDevice)).catch(() => {})
    },
    [addressForMemory, deviceName, activeMode.id, speed, servo, steerLimit, trim, useJoystick, joystickLayoutId, savedPrefs?.lastWifiSsid],
  )

  // Ref mirror so NAV commit callbacks can persist without re-creating
  // (and without stale captures) when called from deep in the input chain.
  const persistPrefsRef = useRef(persistPrefs)
  persistPrefsRef.current = persistPrefs

  // Provisioning-reply handler mirror (defined below with useState deps).
  const handleWifiProvisionReplyRef = useRef<((reply: string) => void) | null>(null)
  // R-4 NACK handler mirror (defined below; applyTelemetry has empty deps).
  const handleNackRef = useRef<((arg: string) => void) | null>(null)

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

  // Cleanup on unmount â€” do NOT disconnect the singleton services; the
  // BLE/SPP/WiFi connection must survive navigation between screens (and
  // between ToolsScreen and the Remote window). Only explicit user action
  // (handleDisconnect) should tear down a transport. wifiService owns its
  // socket + reconnect timer, so there is nothing to tear down here.
  useEffect(() => {
    return () => {
      mountedRef.current = false
      manualCloseRef.current = true
      if (connectionMsgTimerRef.current) {
        clearTimeout(connectionMsgTimerRef.current)
        connectionMsgTimerRef.current = null
      }
    }
  }, [])

  // Telemetry + status wiring (SPP service)
  // Parity with the ESP remote's parseTelemetryLine() + applyRemoteState()
  // (state.cpp / comms.cpp):
  //   â€¢ MODE: ALWAYS mirror the car's authoritative mode (the car's own mode
  //     button must switch the app too).
  //   â€¢ SPD: mirror the magnitude quantized to the 5-step grid inside
  //     SPEED_MIN..SPEED_MAX; skipped while NAV is editing; SPD0 = stop echo
  //     keeps the displayed speed.
  //   â€¢ STATUS: only whitelisted short statuses are displayed.
  //   â€¢ TRIM: mirrored.
  useEffect(() => {
    const applyTelemetry = (t: CarTelemetry) => {
      if (!mountedRef.current) return
      setTelemetry((prev) => ({ ...prev, ...t }))
      // Mode: always mirror (applyRemoteState parity). X-8: incoming tokens
      // are canonicalized so old cars' MODE=BT still mirrors the 4WD4M row.
      // A-37: R-33 parity — within MODE_CHANGE_GRACE_MS of selectMode, an echo
      // still equal to the PRE-commit mode is the stale race line (skip, the
      // optimistic pick stands); a changed echo is car truth → adopt + clear.
      if (t.mode) {
        const canonical = canonicalCarToken(t.mode)
        const commit = modeCommitRef.current
        if (commit && Date.now() - commit.at > MODE_CHANGE_GRACE_MS) modeCommitRef.current = null
        const pending = modeCommitRef.current
        const staleRace = pending != null && canonical === pending.stale && canonical !== pending.token
        if (!staleRace) {
          if (pending != null) modeCommitRef.current = null
          setCarModeId(canonical)
          carModeIdRef.current = canonical
          const matched = carModesRef.current.find((m) => m.id === canonical.toLowerCase() || m.token === canonical)
          if (matched) setActiveMode(matched)
        }
      }
      // Speed: quantized mirror, NAV-edit-aware (see above).
      if (!navActiveRef.current && t.speed != null) {
        const mag = Math.abs(t.speed)
        if (mag > 0 && mag <= 255) setSpeed(quantizeSpeedToStep(mag))
      }
      if (t.trim != null) setTrim(t.trim)
      // R-19: car-truth trip metrics (2WD1M family STATE extras)
      if (t.trip != null) setTripAvg(t.trip)
      if (t.maxSteer != null) setMaxSteer(t.maxSteer)
      // R-20: car-truth steering travel limit (STATE ;STEER=). Clamped to the
      // car's persisted range; the local steppers send STEER<n> and the car
      // echoes the stored value, so remote + app converge on one truth.
      if (t.steerLimit != null) {
        const lim = Math.max(STEER_LIMIT_MIN, Math.min(STEER_LIMIT_MAX, Math.round(t.steerLimit)))
        setSteerLimit((prev) => (prev === lim ? prev : lim))
      }
      // PID telemetry from TEL; frames (self-balancing live values).
      if (t.kp != null) setPidKp(t.kp)
      if (t.ki != null) setPidKi(t.ki)
      if (t.kd != null) setPidKd(t.kd)
      if (t.out != null) setPidOut(t.out)
      if (t.off != null) setPidOff(t.off)
      // Status: whitelist only â€” verbose/unknown statuses never shown.
      if (t.status && isAllowedDriveStatus(t.status)) {
        setDriveStatusOnce(t.status)
        const d = statusToDirection(t.status)
        if (d) setDriveDirOnce(d)
      }
      // v1.4.0: provisioning replies ride STATE as REPLY=â€¦ (car â†’ app).
      if (t.reply) handleWifiProvisionReplyRef.current?.(t.reply)
      if (t.ap !== undefined) setCarApName(t.ap || null)
      if (t.ssid !== undefined) setCarSsid(t.ssid || null)
      // A-27: sync the saved-router mirror from the car's `networks` JSON
      // (broadcast on every WS status frame + REQ_STATE). Change-guarded to
      // skip identical arrays (steady 1 s broadcasts don't thrash the panel).
      if (t.networks && Array.isArray(t.networks)) {
        const incoming: string[] = t.networks
        setCarNetworks((prev) => (
          prev.length === incoming.length && prev.every((n, i) => n === incoming[i])
            ? prev
            : incoming.slice()
        ))
      }
      // A-7: car truth â€” CAP=STUB (STATE lines) / `stub` (WS JSON) describe
      // the car's CURRENT mode; record it per token so the mode chooser and
      // selectMode() gate on car reality, not a hardcoded app list
      // (X-8: keys canonical â€” legacy BT â†’ 4WD4M).
      if (t.stub !== undefined && t.mode) {
        const tok = canonicalCarToken(t.mode)
        if (tok) setCarStubMap((prev) => (prev[tok] === t.stub ? prev : { ...prev, [tok]: t.stub! }))
      }
      // R-10: full availability table (CAPS;â€¦ broadcast) â€” authoritative
      // per-token 3-state truth. Canonical keys (legacy BT â†’ 4WD4M).
      if (t.caps && Object.keys(t.caps).length > 0) {
        setCarAvailMap((prev) => {
          let next = prev
          for (const [tok, val] of Object.entries(t.caps!)) {
            if (!tok) continue
            next = next[tok] === val ? next : { ...next, [tok]: val }
          }
          return next
        })
      }
      // R-4 (app half): the car rejected a sent mode token â€” park it as
      // car-truth stub and surface "Not supported by car" (remote
      // comms.cpp:505-508 parity).
      if (t.nackError === 'UNKNOWN_MODE' && t.nackArg) handleNackRef.current?.(t.nackArg)
    }
    const offSpp = sppService.onTelemetry(applyTelemetry)
    const offBle = bleService.onTelemetry(applyTelemetry)
    const offWifi = wifiService.onTelemetry(applyTelemetry)
    const offStatus = sppService.onStatus((kind, message) => {
      if (!mountedRef.current) return
      // FIN-44 flicker fix: dedupe repeats of the same status kind (the SPP
      // service emits per event; repeated 'connecting'/'error' bursts from the
      // auto-reconnect backoff re-rendered the BT connection-details row on
      // every attempt even though nothing changed). Transitions still render.
      setSppStatus((prevKind) => {
        if (prevKind === kind) {
          // Same state again — only 'error' carries a NEW message worth a repaint.
          if (kind !== 'error' || message === sppStatusMsgRef.current) return prevKind
        }
        return kind
      })
      switch (kind) {
        case 'connecting':
          setSppStatusMsg('')
          setShowSppsRetry(false)
          break
        case 'connected':
          setSppStatus('connected')
          setSppStatusMsg(message ?? 'Connected')
          setShowSppsRetry(false)
          sppReconnectAttemptsRef.current = 0
          // A-7: fresh link â€” drop any stub truth from the previous session
          // so the next car (or a re-flashed car) starts from the fallback
          // table until it reports per-token truth again (remote R-10 parity).
          setCarStubMap({})
          setCarAvailMap({})
          // Bugfix: only the manual handleConnect() used to set connected=true;
          // a silent auto-reconnect or retry that reached 'connected' left the
          // UI believing the link was down (dead Connect button on return).
          setConnected(true)
          // Force the car to broadcast its current STATE so the app
          // immediately picks up the active mode, speed, trim, etc.
          setTimeout(() => {
            sppService.requestState().catch(() => {})
          }, 200)
          break
        case 'disconnected':
          setSppStatus('disconnected')
          setSppStatusMsg('')
          setConnected(false)
          setDeviceName('')
          setDriveStatusOnce('Stop')
          setDriveDirOnce('S')
          // Auto-reconnect on unexpected disconnect (ESP remote parity):
          // silent exponential backoff; the banner appears when exhausted.
          if (!manualCloseRef.current && sppLastAddressRef.current) {
            startSppReconnect()
          } else {
            setShowSppsRetry(false)
          }
          break
        case 'error':
          setSppStatusMsg(message ?? 'Connection error')
          setConnected(false)
          setDeviceName('')
          setDriveStatusOnce('Stop')
          setDriveDirOnce('S')
          if (!manualCloseRef.current && sppLastAddressRef.current) {
            startSppReconnect()
          } else {
            setShowSppsRetry(false)
          }
          break
        default:
          break
      }
    })
    // BLE status â€” mirrors SPP connected/disconnected handling so BLE-only
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
      } else if (kind === 'error') {
        // BLE monitoring error â€” treat like disconnect if SPP is also down
        if (!sppService.isConnected) {
          setConnected(false)
          setDeviceName('')
        }
      }
    })
    // WiFi status â€” mirrors SPP/BLE handling so a shared link updates every
    // hub instance (Remote window + Control Panel) from the ONE socket.
    const offWifiStatus = wifiService.onStatus((kind, message) => {
      if (!mountedRef.current) return
      switch (kind) {
        case 'connecting':
          setConnecting(true)
          setError(null)
          break
        case 'connected':
          setConnected(true)
          setWifiConnected(true)
          setConnecting(false)
          setError(null)
          setShowSppsRetry(false)
          // A-7/R-10: fresh link â€” drop stale stub/avail truth from the old
          // session (same reset the SPP handler does on its own reconnect).
          setCarStubMap({})
          setCarAvailMap({})
          showConnectionMessage('WiFi connected', 'success')
          setTimeout(() => {
            wifiService.requestState().catch(() => {})
          }, 200)
          break
        case 'disconnected':
          setWifiConnected(false)
          setConnecting(false)
          // Only clear the global "connected" if SPP/BLE are also down.
          if (!sppService.isConnected && !bleService.isConnected) {
            setConnected(false)
            setDeviceName('')
          }
          break
        case 'error':
          setWifiConnected(false)
          setConnecting(false)
          setError(message ?? 'WiFi connection lost')
          if (!sppService.isConnected && !bleService.isConnected) {
            setConnected(false)
            setDeviceName('')
          }
          break
        default:
          break
      }
    })
    return () => { offSpp(); offBle(); offStatus(); offBleStatus(); offWifi(); offWifiStatus() }
    // NOTE: deps are intentionally empty â€” activeMode is read via
    // carModesRef (fresh on every telemetry frame) and setActiveMode is a
    // stable setState.  The old [activeMode] dependency tore down and
    // re-created the subscription on every mode change, which caused the
    // app to miss STATE;MODE=â€¦ frames from the car during the gap.
  }, [])

  // Check if SPP is supported on this device
  const sppSupported = sppService.supported

  // Periodic REQ_STATE â€” keeps the app synced with the car's current mode,
  // speed, and trim. The ESP32 firmware may not auto-broadcast STATE when
  // the physical mode button is pressed, so we poll every 2 s.
  // Works for SPP, BLE, and WiFi transports. Polling only runs while THIS
  // hub is the focused screen, so the Tools+Remote pair never sends
  // duplicate REQ_STATEs to the same car (bug: two wsRefs polled before).
  const isFocused = useIsFocused()
  // A-14: the poll loop depends ONLY on focus — `connected` is read from a
  // fresh ref, so connect/disconnect churn never tears down and re-creates
  // the interval (was a flicker source: the interval restarted whenever
  // `connected`/`wifiConnected` flipped, right when the link was recovering).
  useEffect(() => {
    if (!isFocused || !connectedRef.current) return
    const id = setInterval(() => {
      if (sppService.isConnected) {
        sppService.requestState().catch(() => {})
      }
      if (bleService.isConnected) {
        bleService.requestState().catch(() => {})
      }
      if (wifiService.isConnected) {
        wifiService.requestState().catch(() => {})
      }
    }, 2000)
    return () => clearInterval(id)
  }, [isFocused])

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

  const handleWifiConnect = useCallback(() => {
    setError(null)
    if (!wifiUrl) {
      setError('Enter the car WiFi address (e.g. ws://192.168.4.1:81)')
      return
    }
    const wsUrl = wifiUrl.startsWith('ws://') || wifiUrl.startsWith('wss://') ? wifiUrl : `ws://${wifiUrl}`
    manualCloseRef.current = false
    // Delegated to the shared singleton (the ONE socket every hub reads);
    // status events (connecting/connected/disconnected) drive the UI.
    wifiService.connect(wsUrl).catch((e) => {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'WiFi connect failed')
      }
    })
  }, [wifiUrl])

  const handleWifiDisconnect = useCallback(async () => {
    manualCloseRef.current = true
    // Safe-stop: send stop commands before closing (only over the live socket).
    if (wifiService.isConnected) {
      try { await wifiService.sendLine('S') } catch { /* ignore â€” link may already be dead */ }
      try { await wifiService.sendLine('SPD0') } catch { /* ignore */ }
    }
    await wifiService.disconnect()
    setWifiConnected(false)
    setError(null)
  }, [])

  // ---- v1.4.0 WiFi provisioning (app â†’ BT â†’ car) ----
  // Sends WIFICFG;<ssid>;<password> over the Bluetooth link; the car stores
  // the pair in Preferences and switches itself to ESP_SER (joins the router
  // and hosts its web page). The car's STATE echo carries REPLY=WIFICFG;â€¦
  const handleWifiProvision = useCallback(async () => {
    const ssid = wifiSsid.trim()
    if (!ssid) {
      setError('Enter the WiFi network name (SSID) first.')
      return
    }
    if (!connected || !sppService.isConnected) {
      setError('Connect the car over Bluetooth first â€” credentials travel the BT link.')
      return
    }
setWifiProvisioning(true)
    setError(null)
    try {
      await sppService.sendLine(buildWifiConfigLine(ssid, wifiPassword))
      // A-15 (device-round-2): update the deck optimistically — show the
      // just-sent network immediately instead of waiting for the car's
      // REPLY (the stale default-SSID bug). The car's T-35 confirm
      // (sendStateOn → REPLY=WIFICFG;STORED;<ssid>) re-confirms anyway.
      setCarSsid(ssid)
      persistPrefs({ lastWifiSsid: ssid })
      showConnectionMessage(`Sent WiFi "${ssid}" to the car — it is switching to Webserver mode.`, 'success')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send WiFi credentials')
    } finally {
      setWifiProvisioning(false)
    }
  }, [wifiSsid, wifiPassword, connected, showConnectionMessage, persistPrefs])

  // REPLY=â€¦ lines from the car (WIFICFG;STORED;<ssid>) confirm provisioning
  // and pre-fill the WS URL for the deck.
  const lastProvisionReplyRef = useRef<string | null>(null)
  const handleWifiProvisionReply = useCallback((reply: string) => {
    if (reply.startsWith('WIFICFG;STORED;')) {
      const ssid = reply.slice('WIFICFG;STORED;'.length).trim()
      setCarSsid(ssid)
      setWifiPassword('')
      // A-8: keep the SSID in the field (it doubles as confirmation of what
      // the car stored) and remember it per car so the card pre-fills next
      // session. The password is cleared â€” it must never linger in the UI.
      persistPrefs({ lastWifiSsid: ssid })
      // The car joins the router and gets a DHCP IP; default to its AP
      // address until the user reads the real IP off the OLED/deck.
      setWifiUrl('ws://192.168.4.1:81')
      showConnectionMessage(`Car stored WiFi "${ssid}" â€” switched to Webserver mode.`, 'success')
    } else if (reply.startsWith('WIFICFG;ERROR')) {
      setError(`Car rejected WiFi settings: ${reply}`)
    } else if (reply.startsWith('WIFICFG;SSID;')) {
      setCarSsid(reply.slice('WIFICFG;SSID;'.length).trim() || null)
    }
    lastProvisionReplyRef.current = reply
  }, [showConnectionMessage, persistPrefs])
  handleWifiProvisionReplyRef.current = handleWifiProvisionReply

  // R-4 (app half, fleet parity): the car replied NACK;E=UNKNOWN_MODE;ARG=<token>
  // to a mode token it doesn't recognize (mixed-pair case). Surface "Not
  // supported by car" and park the token as car-truth stub so selectMode() /
  // cycleMode() refuse it from here on â€” exactly what the hand-held remote
  // does (comms.cpp:505-508: setCarStub(arg,true) + setStatus(...)).
  const handleNack = useCallback((arg: string) => {
    const tok = canonicalCarToken(arg)
    if (!tok) return
    setCarStubMap((prev) => (prev[tok] === true ? prev : { ...prev, [tok]: true }))
    setDriveStatusOnce('Not supported by car')
    showConnectionMessage(`${MODE_NAME_FOR_TOKEN[tok] ?? tok} is not supported by this car.`, 'error')
  }, [showConnectionMessage])
  handleNackRef.current = handleNack

  // Safe stop on link loss (comms.cpp safeStopAndClearQueue parity): the
  // neutral commands are sent by the transport layer on disconnect; here we
  // reset the on-screen drive state so the app never shows a stale
  // "Forward" after the car already stopped.
  useFocusEffect(
    React.useCallback(() => {
      return sppService.onStatus((kind) => {
        if (!mountedRef.current) return
        if (kind === 'disconnected' || kind === 'error') {
          setDriveDirOnce('S')
        }
      })
    }, []),
  )

  const handleDisconnect = useCallback(async () => {
    // Persist everything before tearing down so the car remembers for next
    // power cycle (owner: "remember state after restart").
    persistPrefsRef.current?.({ modeId: activeMode.id })
    manualCloseRef.current = true
    // Safe-stop: send neutral commands over every live transport.
    try { await sppService.sendLine('SPD0') } catch { /* ignore */ }
    try { await sppService.sendLine('SERVO90') } catch { /* ignore */ }
    if (bleService.isConnected) {
      try { await bleService.sendLine('SPD0') } catch { /* ignore */ }
      try { await bleService.sendLine('SERVO90') } catch { /* ignore */ }
      await bleService.disconnect()
    }
    if (wifiService.isConnected) {
      try { await wifiService.sendLine('SPD0') } catch { /* ignore */ }
      try { await wifiService.sendLine('SERVO90') } catch { /* ignore */ }
      await wifiService.disconnect()
    }
    await sppService.disconnect()
    // Drive UI reset: only the live drive state â€” speed / servo / PID /
    // gimbal / telemetry stay at their current values so they restore on
    // reconnect (bug fix 2026-09-15: "remember after power cycle").
    setConnected(false)
    setWifiConnected(false)
    setDeviceName('')
    setSppDevices([])
    setDriveStatusOnce('Stop')
    setDriveDirOnce('S')
    setNavActive(false)
    setNavField('none')
    setPreviewMode(null)
  }, [activeMode])

  // Send a command over the right transport(s) for the ACTIVE mode; no-ops
  // when nothing is linked.
  //   â€¢ Every-link commands (mode tokens + neutral/emergency lines) go over
  //     all live links.
  //   â€¢ Everything else follows the active mode's own transports: WiFi modes
  //     (ESP_SER / ESP_CLI) drive over the WebSocket only, BT modes over
  //     SPP/BLE only (R-4 parity â€” a Bluetooth car must never hear a
  //     WiFi-mode drive letter).
  //   â€¢ When only ONE link is live it is used regardless of mode, so a 4WD4M
  //     car connected purely over the wireless car's WS still drives (that
  //     path accepts drive in any mode).
  const sendCommand = useCallback((cmd: string) => {
    const btLive = sppService.isConnected || bleService.isConnected
    const wsLive = wifiService.isConnected
    const onlyBt = btLive && !wsLive
    const onlyWs = wsLive && !btLive
    const modeUsesBt = activeMode.transport.includes('classic-bt') || activeMode.transport.includes('ble')
    const modeUsesWifi = activeMode.transport.includes('wifi')
    const broadcast = EVERY_LINK_COMMANDS.has(cmd.trim().toUpperCase().split(';')[0])
    const goBt = broadcast ? btLive : onlyBt ? true : modeUsesBt && btLive
    const goWs = broadcast ? wsLive : onlyWs ? true : modeUsesWifi && wsLive
    if (goBt && connected && sppService.isConnected) {
      void sppService.sendLine(cmd).catch(() => {})
    }
    if (goBt && connected && bleService.isConnected) {
      void bleService.sendLine(cmd).catch(() => {})
    }
    if (goWs && wifiService.isConnected) {
      void wifiService.sendLine(cmd).catch(() => {})
    }
  }, [connected, wifiConnected, activeMode])

  // ---- A-27: saved-router registry (wireless car v1.7.1, ROUTERS;*) ----
  // The car (NVS `botcfg`) is the source of truth; the app mirrors names in
  // savedRouters so the panel restores instantly. Commands broadcast over
  // EVERY link (W-14: system commands, never drive). Each edit persists the
  // mirror optimistically; the car's `networks` echo re-syncs within ~1-2 s
  // (1 s WS broadcast + 2 s REQ_STATE poll).
  const routerUse = useCallback((ssid: string) => {
    const s = ssid.trim()
    if (!s) return
    sendCommand(buildRouterCommand('USE', s))
    setDriveStatusOnce(`Switching WiFi to ${s}`)
    persistPrefsRef.current?.({ savedRouters: [...carNetworks] })
  }, [sendCommand, carNetworks])

  const routerAdd = useCallback((ssid: string, pass: string) => {
    const s = ssid.trim()
    if (!s) return
    sendCommand(buildRouterCommand('ADD', s, pass))
    // Optimistic list update (the car's next JSON echo is authoritative).
    setCarNetworks((prev) => (prev.includes(s) ? prev : [...prev, s]))
    persistPrefsRef.current?.({ savedRouters: carNetworks.includes(s) ? [...carNetworks] : [...carNetworks, s] })
    setDriveStatusOnce(`Saved router ${s}`)
  }, [sendCommand, carNetworks])

  const routerDelete = useCallback((ssid: string) => {
    const s = ssid.trim()
    if (!s) return
    sendCommand(buildRouterCommand('DEL', s))
    const next = carNetworks.filter((n) => n !== s)
    setCarNetworks(next)
    persistPrefsRef.current?.({ savedRouters: next })
  }, [sendCommand, carNetworks])

  const routerClearAll = useCallback(() => {
    // A-41 (round-9): wipe EVERY saved router + the stored active pair on the
    // car and remote (ROUTERS;CLEAR over every link, T-62). Optimistic reset
    // to an empty list — the car's own network (WirelessCar_Wifi) is virtual;
    // the car's next `networks` echo re-appends it as the leading, protected
    // entry (T-66). Never touches the car's own AP.
    sendCommand(buildRouterCommand('CLEAR', ''))
    setCarNetworks([])
    persistPrefsRef.current?.({ savedRouters: [] })
    setDriveStatusOnce('All routers cleared')
  }, [sendCommand])

  const handleDirection = useCallback((d: 'F' | 'B' | 'L' | 'R' | 'S') => {
    setDriveDirOnce(d)
    if (d === 'S') { setDriveStatusOnce('Stop'); sendCommand('S'); return }
    setDriveStatusOnce(d === 'F' ? 'Forward' : d === 'B' ? 'Backward' : d === 'L' ? 'Left' : 'Right')
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
  // only edits the PREVIEW (NAV highlight field); commitSpeed â€” called on
  // Select â€” sends SPD<n> once, sets the local "Speed:<n>" status and
  // persists (the .ino TOP_SPEED branch).
  const handleSpeed = useCallback((value: number) => {
    // Slider input is 0..255; snap into the ESP grid for display.
    const q = quantizeSpeedToStep(Math.max(SPEED_MIN, Math.min(SPEED_MAX, Math.round(value))))
    setSpeed(q)
  }, [])

  const commitSpeed = useCallback(() => {
    setSpeed((s) => {
      sendThrottled('spd', `SPD${Math.round(s)}`)
      setDriveStatusOnce(`Speed:${Math.round(s)}`)
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

  // R-20 fixed throttle (owner: "speed fixed, not gradually increasing"): the
  // joystick/d-pad signals DIRECTION only — the magnitude sent is ALWAYS the
  // speed setting (quantized 100..255). The car clamps it into MIN..MAX and
  // holds that exact PWM while the stick is deflected.
  const handleStickDrive = useCallback((signed: number) => {
    setDriveDirOnce(signed > 0 ? 'F' : signed < 0 ? 'B' : 'S')
    setDriveStatusOnce(signed > 0 ? 'Forward' : signed < 0 ? 'Backward' : 'Stop')
    const mag = quantizeSpeedToStep(speed)
    sendThrottled('spd', `SPD${signed > 0 ? mag : signed < 0 ? -mag : 0}`)
  }, [sendThrottled, speed])

  // R-20: steering travel LIMIT edits — clamp to the car's 10..90 range,
  // send STEER<n> IMMEDIATELY (car persists + echoes STATE ;STEER=, so the
  // hand-held remote mirrors the same value), and persist locally. Same
  // pattern as adjustTrim (TRIM<n>).
  const adjustSteerLimit = useCallback((delta: number) => {
    setSteerLimit((prev) => {
      const next = Math.max(STEER_LIMIT_MIN, Math.min(STEER_LIMIT_MAX, prev + delta))
      if (next !== prev) {
        sendCommand(buildSteer(next))
        persistPrefsRef.current?.({ steerLimit: next })
      }
      return next
    })
  }, [sendCommand])

  // Select on the Steer field: record the limit (status + persist + send).
  // Kept for NAV parity; the Remote screen's NAV no longer routes here (the
  // top strip is the SPEED slider in every mode) but the API stays stable.
  const commitSteerLimit = useCallback(() => {
    setSteerLimit((s) => {
      sendCommand(buildSteer(s))
      setDriveStatusOnce(`Steer limit:${s}`)
      persistPrefsRef.current?.({ steerLimit: s })
      return s
    })
  }, [sendCommand])

  const adjustTrim = useCallback((delta: number) => {
    setTrim((prev) => {
      const next = Math.max(-safetyLimits.maxTrim, Math.min(safetyLimits.maxTrim, prev + delta))
      sendCommand(`TRIM${next}`)
      persistPrefs({ trim: next })
      return next
    })
  }, [safetyLimits.maxTrim, sendCommand, persistPrefs])

  const handleEStop = useCallback(() => {
    setDriveDirOnce('S')
    setDriveStatusOnce('EMERGENCY STOP')
    sendCommand('ESTOP')
    sendCommand('SPD0')
    sendCommand('SERVO90')
  }, [sendCommand])

  // Mode select = the ESP confirm path: clear the queue, send the token
  // immediately, mirror the mode, status "Mode:<name>", stop driving.
  // Owner decision 2026-09-15: ALL 9 firmware modes are selectable â€” a
  // WIP/CS mode still receives its token (the car renders its own frame /
  // COMING SOON, WORK IN PROGRESS states) and the controller shows the badge.
  // The old A-7 app-side refuse gate is gone (the car says no itself via its
  // frame or a NACK;E=UNKNOWN_MODE if it truly rejects a token).
  const selectMode = useCallback((m: CarMode) => {
    setActiveMode(m)
    setDriveDirOnce('S')
    setDriveStatusOnce(`Mode:${MODE_NAME_FOR_TOKEN[m.token] ?? m.token}`)
    sendCommand('S')
    sendCommand(m.token)
    // A-37: open the commit-grace window (pre-commit car truth + chosen token)
    // so the stale in-flight MODE echo can't flicker the optimistic pick back.
    modeCommitRef.current = { token: canonicalCarToken(m.token), stale: carModeIdRef.current, at: Date.now() }
    // Persist the selected mode so it restores on reconnect / next power cycle.
    persistPrefsRef.current?.({ modeId: m.id })
  }, [sendCommand])

  const cycleMode = useCallback(() => {
    // Remote fleet cycle order â€” always advances and wraps. Unknown tokens
    // roll forward from the head of the order, never land on pool[0].
    const pool = (carModes.length > 0 ? sortRemoteModes(carModes) : [...LOCAL_CAR_MODES])
    const nextToken = nextRemoteModeToken(activeMode.token)
    const next = pool.find((m) => canonicalCarToken(m.token) === nextToken)
      ?? [...LOCAL_CAR_MODES].find((m) => canonicalCarToken(m.token) === nextToken)
    if (next) selectMode(next)
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

  // ---- SPP auto-reconnect â€” silent exponential backoff ----
  // Delays: 1s â†’ 2s â†’ 4s â†’ 8s â†’ give up â†’ show the reconnect banner.
  const startSppReconnect = useCallback(() => {
    if (sppReconnectTimerRef.current) {
      clearTimeout(sppReconnectTimerRef.current)
      sppReconnectTimerRef.current = null
    }
    const attempt = () => {
      if (!mountedRef.current || manualCloseRef.current || !sppLastAddressRef.current) return
      const n = sppReconnectAttemptsRef.current
      if (n >= SPP_RECONNECT_DELAYS_MS.length) {
        // All attempts exhausted â€” surface the banner so the user can decide.
        // (Previously this path gave up silently: the â€œconnection lostâ€ UI
        // never appeared and only a manual reconnect could recover.)
        sppReconnectAttemptsRef.current = 0
        setShowSppsRetry(true)
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
    // Dismiss the banner WITHOUT tearing the remembered device down â€” the
    // user may just want to keep browsing; a fresh connect from the device
    // list (or Retry) must stay possible (old behavior killed the address,
    // which contributed to the dead Connect button).
    setShowSppsRetry(false)
    manualCloseRef.current = true
    if (sppReconnectTimerRef.current) {
      clearTimeout(sppReconnectTimerRef.current)
      sppReconnectTimerRef.current = null
    }
  }, [])

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
    // v1.4.0 WiFi provisioning (app â†’ BT â†’ car) + car WiFi truth
    wifiSsid, setWifiSsid, wifiPassword, setWifiPassword, wifiProvisioning,
    handleWifiProvision, carApName, carSsid, carStubMap, carAvailMap,
    // A-27: saved-router registry (car truth names + command helpers)
    carNetworks, routerUse, routerAdd, routerDelete, routerClearAll,
    // SPP auto-reconnect
    handleReconnectPromptCancel,
    // mode + category (carStubMap is returned with the WiFi-truth group above)
    activeCategory, setActiveCategory, activeMode, carModes, carModeId,
    selectMode, cycleMode, handleCategoryPress,
    // drive state
    speed, setSpeed, servo, steerLimit, trim, driveStatus, driveDir, telemetry, safetyLimits,
    handleDirection, handleSpeed, handleServo, applyPid, handleStickDrive,
    adjustSteerLimit, commitSpeed, commitSteerLimit, adjustTrim, handleEStop, sendCommand,
    // R-19 (FIN-45): car-truth trip metrics (2WD1M family)
    tripAvg, maxSteer,
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
