// =====================================================================
// CarRemoteScreen - per-package remote for a robot-car product.
//
// A robot-car project package (e.g. "2WD1M Basic Robot Car") gets its own
// control screen instead of the generic Tools hub. The screen loads the
// product, resolves the car mode it maps to (badge/id -> CarMode), and
// opens a remote preconfigured for that car's firmware - mirroring the
// hand-held ESP remote (Genum_ESP32_Remote_v1.0.0) and the MIT App
// Inventor apps that ship with the same cars.
//
// Transports (chosen by the mode + platform):
//   Classic BT (SPP) - Android only, via sppService. This is how the ESP
//                      remote and MIT apps pair (BluetoothSerial on the
//                      ESP32 car, PIN 1234 when pairing fresh).
//   BLE              - BLE-UART cars via bleService.
//   WiFi             - WebSocket cars via ws://<car-ip>:81.
//
// All three speak the SAME GENUM line protocol (carProtocol.ts), so the
// deck below is transport-agnostic: SPD/SERVO/STEER/TRIM/ESTOP out,
// STATE/TEL/SPD telemetry in.
// =====================================================================
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useRoute, type RouteProp } from '@react-navigation/native'
import { Feather } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { APP_VERSION } from '../config/site'
import { getProductByIdWithSource } from '../services/productService'
import { resolveModeForProduct, type CarMode } from '../config/roboCarCatalog'
import { bleService } from '../services/bleService'
import { sppService } from '../services/sppService'
import { ESTOP_LINE, SAFE_STOP_LINES, buildCalibration, isCompleteJsonObject } from '../services/carProtocol'
import type { CarTelemetry } from '../services/carProtocol'
import { parseTelemetryLine as parseIncomingLine } from '../services/carProtocol'
import { OledDisplay } from '../components/tools/OledDisplay'
import { DriveControls } from '../components/tools/DriveControls'
import { BalanceControls } from '../components/tools/BalanceControls'
import { AutonomousControls } from '../components/tools/AutonomousControls'
import { WeblinkControls } from '../components/tools/WeblinkControls'
import { TwoWd1mExtras } from '../components/tools/TwoWd1mExtras'
import { ModeInfo } from '../components/tools/ModeInfo'
import type { RootStackParamList } from '../navigation/types'

type Props = NativeStackScreenProps<RootStackParamList, 'CarRemote'>
type Route = RouteProp<RootStackParamList, 'CarRemote'>

// Continuous drive sends must not flood the link (mirrors the physical
// remote's ~30ms resend cadence and ToolsScreen's 50ms throttle).
const DRIVE_CMD_MIN_INTERVAL_MS = 50
const WIFI_RECONNECT_DELAY_MS = 3000
const WIFI_MAX_RECONNECT_ATTEMPTS = 5

type TransportKind = 'spp' | 'ble' | 'wifi'

export function CarRemoteScreen({ navigation }: Props) {
  const route = useRoute<Route>()
  const productId = route.params.productId

  const [product, setProduct] = useState<{ name: string; image?: string } | null>(null)
  const [mode, setMode] = useState<CarMode | null>(null)
  const [loading, setLoading] = useState(true)
  const [notACar, setNotACar] = useState(false)

  // ---- Connection state ----
  const [transport, setTransport] = useState<TransportKind | null>(null)
  const [sppDevices, setSppDevices] = useState<{ id: string; name: string; bonded: boolean }[]>([])
  const [bleDevices, setBleDevices] = useState<{ id: string; name: string }[]>([])
  const [connected, setConnected] = useState(false)
  const [deviceName, setDeviceName] = useState('')
  const [scanning, setScanning] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [wifiUrl, setWifiUrl] = useState('ws://192.168.4.1:81')
  const [wifiConnected, setWifiConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // ---- Remote-style state (deck below is transport-agnostic) ----
  const [speed, setSpeed] = useState(170)
  const [servo, setServo] = useState(90)
  const [steerLimit, setSteerLimit] = useState(90)
  const [trim, setTrim] = useState(0)
  const [driveStatus, setDriveStatus] = useState('Stop')
  const [useJoystick, setUseJoystick] = useState(true)
  const [telemetry, setTelemetry] = useState<CarTelemetry>({})
  const [pidKp, setPidKp] = useState(12.0)
  const [pidKi, setPidKi] = useState(3.0)
  const [pidKd, setPidKd] = useState(1.0)
  const [pidOut, setPidOut] = useState(0)
  const [pidOff, setPidOff] = useState(0)

  const wsRef = useRef<WebSocket | null>(null)
  const wsLineBufferRef = useRef('')
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const manualCloseRef = useRef(false)
  const lastDriveCmdAtRef = useRef<Record<string, number>>({})
  const mountedRef = useRef(true)

  // Load the product and resolve its car mode.
  useEffect(() => {
    mountedRef.current = true
    let active = true
    ;(async () => {
      try {
        const { product: p } = await getProductByIdWithSource(productId)
        if (!active) return
        if (!p) {
          setLoading(false)
          setNotACar(true)
          return
        }
        setProduct({ name: p.name, image: p.image })
        const resolved = resolveModeForProduct(p)
        if (!resolved) {
          // Not a robot-car product - point the user back at the hub.
          setNotACar(true)
          setLoading(false)
          return
        }
        setMode(resolved)
        setLoading(false)
      } catch {
        if (active) { setLoading(false); setNotACar(true) }
      }
    })()
    return () => { active = false; mountedRef.current = false }
  }, [productId])

  // Which transports does the resolved car expose here?
  const supports = (kind: TransportKind): boolean => {
    if (!mode) return false
    if (kind === 'spp') {
      return sppService.supported && mode.transport.includes('classic-bt')
    }
    if (kind === 'ble') return mode.transport.includes('ble')
    return mode.transport.includes('wifi')
  }
  const canControl = connected || wifiConnected

  // On unmount: stop reconnects, close socket, disconnect both links.
  useEffect(() => {
    return () => {
      mountedRef.current = false
      manualCloseRef.current = true
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      try { wsRef.current?.close() } catch { /* ignore */ }
      wsRef.current = null
      void bleService.disconnect().catch(() => {})
      void sppService.disconnect().catch(() => {})
    }
  }, [])

  // ---- Telemetry wiring ----
  useEffect(() => {
    if (!mode) return
    const applyTelemetry = (t: CarTelemetry) => {
      if (!mountedRef.current) return
      setTelemetry((prev) => ({ ...prev, ...t }))
      if (t.status) setDriveStatus(t.status)
    }
    const offBle = bleService.onTelemetry(applyTelemetry)
    const offSpp = sppService.onTelemetry(applyTelemetry)
    return () => { offBle(); offSpp() }
  }, [mode])

  // ---- Scan + connect per transport ----
  const handleScan = useCallback(async () => {
    if (!transport) return
    setScanning(true)
    setError(null)
    try {
      if (transport === 'spp') {
        const devices = await sppService.scan()
        setSppDevices(devices)
      } else if (transport === 'ble') {
        const devices = await bleService.scan(8)
        setBleDevices(devices)
      }
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : 'Scan failed')
    } finally {
      if (mountedRef.current) setScanning(false)
    }
  }, [transport])

  const handleConnect = useCallback(async (deviceId: string) => {
    setConnecting(true)
    setError(null)
    try {
      if (transport === 'spp') {
        await sppService.connect(deviceId)
        setConnected(true)
        setDeviceName(sppService.deviceName ?? 'Car')
      } else if (transport === 'ble') {
        await bleService.connect(deviceId)
        setConnected(true)
        setDeviceName(bleService.deviceName ?? 'Car')
      }
      setConnecting(false)
      // Ask the car to echo its current state (mode/speed/trim/status).
      if (transport === 'spp') void sppService.requestState().catch(() => {})
      else void bleService.requestState().catch(() => {})
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'Connect failed')
        setConnecting(false)
      }
    }
  }, [transport])

  // ---- WiFi WebSocket (LAN cars) ----
  const openSocket = useCallback((url: string) => {
    setBusy(true)
    let socket: WebSocket
    try {
      socket = new WebSocket(url)
    } catch (e) {
      setBusy(false)
      setError(e instanceof Error ? e.message : 'WiFi connect failed')
      return
    }
    wsRef.current = socket
    socket.onopen = () => {
      reconnectAttemptsRef.current = 0
      wsLineBufferRef.current = ''
      setWifiConnected(true)
      setConnected(true)
      setBusy(false)
      setError(null)
    }
    socket.onmessage = (event) => {
      try {
        const text = typeof event.data === 'string' ? event.data : ''
        wsLineBufferRef.current += text
        const lines = wsLineBufferRef.current.split('\n')
        wsLineBufferRef.current = lines.pop() ?? ''
        for (const line of lines) {
          const parsed = parseIncomingLine(line)
          if (Object.keys(parsed).length) setTelemetry((prev) => ({ ...prev, ...parsed }))
        }
        // Multimode wireless cars broadcast JSON status WITHOUT a trailing
        // newline — flush a complete object immediately instead of waiting
        // for a line terminator that never arrives.
        if (isCompleteJsonObject(wsLineBufferRef.current)) {
          const parsed = parseIncomingLine(wsLineBufferRef.current)
          if (Object.keys(parsed).length) setTelemetry((prev) => ({ ...prev, ...parsed }))
          wsLineBufferRef.current = ''
        }
      } catch { /* ignore non-JSON */ }
    }
    socket.onclose = () => {
      wsLineBufferRef.current = ''
    }
    socket.onclose = () => {
      setWifiConnected(false)
      setConnected(false)
      if (wsRef.current === socket) wsRef.current = null
      if (manualCloseRef.current) return
      if (reconnectAttemptsRef.current >= WIFI_MAX_RECONNECT_ATTEMPTS) {
        setError('WiFi connection lost - reconnection failed. Tap Connect to retry.')
        return
      }
      reconnectAttemptsRef.current += 1
      reconnectTimerRef.current = setTimeout(() => openSocket(url), WIFI_RECONNECT_DELAY_MS)
    }
    socket.onerror = () => { /* onclose owns cleanup */ }
  }, [])

  const handleWifiConnect = useCallback(() => {
    setError(null)
    if (!wifiUrl || !wifiUrl.trim()) { setError('Enter the car WebSocket address (e.g. ws://192.168.4.1:81)'); return }
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null }
    const wsUrl = wifiUrl.startsWith('ws://') || wifiUrl.startsWith('wss://') ? wifiUrl : `ws://${wifiUrl}`
    manualCloseRef.current = false
    reconnectAttemptsRef.current = 0
    openSocket(wsUrl)
  }, [wifiUrl, openSocket])

  const handleDisconnect = useCallback(async () => {
    manualCloseRef.current = true
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null }
    // Safe stop: clear queue + neutral commands (SPD0, SERVO90) - same as the
    // ESP remote does on disconnect.
    try { wsRef.current?.send('SPD0\n') } catch { /* ignore */ }
    try { await bleService.sendLine(SAFE_STOP_LINES[0]!) } catch { /* ignore */ }
    try { await sppService.sendLine(SAFE_STOP_LINES[0]!) } catch { /* ignore */ }
    await Promise.allSettled([bleService.disconnect(), sppService.disconnect()])
    try { wsRef.current?.close() } catch { /* ignore */ }
    wsRef.current = null
    setConnected(false)
    setWifiConnected(false)
    setDeviceName('')
    setTelemetry({})
    setDriveStatus('Stop')
  }, [])

  // ---- Command send (transport-agnostic) ----
  const sendCommand = useCallback((cmd: string) => {
    if (connected && transport === 'spp') void sppService.sendLine(cmd).catch(() => {})
    if (connected && transport === 'ble') void bleService.sendLine(cmd).catch(() => {})
    if (wifiConnected && wsRef.current) { try { wsRef.current.send(cmd + '\n') } catch { /* ignore */ } }
  }, [connected, transport, wifiConnected])

  const sendThrottled = useCallback((kind: string, cmd: string) => {
    const now = Date.now()
    const last = lastDriveCmdAtRef.current[kind] ?? 0
    if (now - last < DRIVE_CMD_MIN_INTERVAL_MS) return
    lastDriveCmdAtRef.current[kind] = now
    sendCommand(cmd)
  }, [sendCommand])

  const handleDirection = useCallback((d: 'F' | 'B' | 'L' | 'R' | 'S') => {
    if (d === 'S') { setDriveStatus('Stop'); sendCommand('S'); return }
    setDriveStatus(d === 'F' ? 'Forward' : d === 'B' ? 'Backward' : d === 'L' ? 'Left' : 'Right')
    sendCommand(d)
  }, [sendCommand])

  const handleSpeed = useCallback((value: number) => {
    setSpeed(value)
    sendThrottled('spd', `SPD${Math.round(value)}`)
  }, [sendThrottled])

  // ESP-remote joystick parity (2WD1M): left stick streams signed SPD (-255..255)
  // as transient drive, exactly like the physical remote. Keeps the OLED status
  // honest about direction while the stick is deflected.
  const handleStickDrive = useCallback((signed: number) => {
    setDriveStatus(signed > 0 ? 'Forward' : signed < 0 ? 'Backward' : 'Stop')
    sendThrottled('spd', `SPD${Math.round(signed)}`)
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
    sendCommand(buildCalibration(next))
  }, [pidKp, pidKi, pidKd, pidOut, pidOff, sendCommand])

  // ESP-remote 2WD1M extras: steering limit, trim, emergency stop.
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
    sendCommand(ESTOP_LINE)
    sendCommand('SPD0')
  }, [sendCommand])

  // Per-package mode entry: put the car into this package's mode (the same
  // token the ESP remote sends when a mode is selected). Idempotent — the
  // car ignores a repeat of its current mode.
  const handleEnterMode = useCallback(() => {
    if (!mode) return
    sendCommand(mode.token)
    setDriveStatus(`${mode.token} mode selected`)
  }, [mode, sendCommand])

  // Website-server cars host their own control page on HTTP :80 (the
  // WebPage.h served by Genum_WIRELESS_CAR) — open it in the browser.
  const handleOpenWebPage = useCallback(() => {
    const host = (wifiUrl || '').replace(/^wss?:\/\//, '').split('/')[0]?.split(':')[0] || '192.168.4.1'
    void Linking.openURL(`http://${host}/`).catch(() => {
      setError('Could not open the car web page. Check the WiFi address.')
    })
  }, [wifiUrl])

  // ---- Render ----
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    )
  }

  if (notACar || !mode || !product) {
    return (
      <ScrollView className="flex-1 bg-mist" contentContainerStyle={{ padding: 20 }}>
        <View className="rounded-2xl border border-line bg-card p-6">
          <Feather name="alert-circle" size={28} color="#1e3a8a" />
          <Text className="mt-3 font-display text-xl font-bold text-ink">
            Not a robot-car package
          </Text>
          <Text className="mt-2 text-sm leading-6 text-muted">
            This product does not map to a GENUM robot-car firmware mode, so it has no
            dedicated remote. Open the Tools &amp; IoT hub for the general controller.
          </Text>
          <Pressable
            onPress={() => navigation.replace('Tools')}
            className="mt-5 flex-row items-center justify-center gap-2 rounded-full bg-navy px-6 py-3"
          >
            <Feather name="tool" size={14} color="#fff" />
            <Text className="text-sm font-black text-white">Open Tools &amp; IoT</Text>
          </Pressable>
        </View>
      </ScrollView>
    )
  }

  const is2wd1m = mode.controls.includes('drive-2wd1m')
  const isAuto = mode.controls.includes('pid-auto') // self-balancing deck
  const isAutonomous = mode.controls.includes('start-stop') // obstacle/path deck
  const isWeblink = mode.controls.includes('weblink') // wireless-car deck
  const isRf = mode.transport.includes('rf') // RF handset cars: no app link

  // Link label for the OLED chip (ESP remote over classic BT shows SPP LINK).
  const linkKind: 'ble' | 'spp' | 'wifi' | undefined =
    wifiConnected ? 'wifi'
      : connected && transport === 'spp' ? 'spp'
        : connected && transport === 'ble' ? 'ble'
          : undefined

  return (
    <ScrollView className="flex-1 bg-mist" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {/* Header */}
      <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
        {mode.name.split('·')[0].trim()} · {mode.token}
      </Text>
      <Text className="mt-1 font-display text-2xl font-bold text-ink">{product.name}</Text>
      <Text className="mt-1 text-xs leading-5 text-muted">
        {mode.blurb}
      </Text>

      {/* Non-RF cars get an in-app link (SPP / BLE / WiFi). RF-manual cars are
          driven only by their 433 MHz handset, so they get a note card instead
          of the connection panel + deck sections. */}
      {!isRf ? (
        <>
      {/* Transport picker — shown transports depend on the car mode */}
      <View className="mt-5 flex-row flex-wrap gap-2">
        {(['spp', 'ble', 'wifi'] as TransportKind[]).map((kind) => {
          if (!supports(kind)) return null
          const label = kind === 'spp' ? 'Classic BT (SPP)' : kind === 'ble' ? 'BLE' : 'WiFi'
          const active = transport === kind
          return (
            <Pressable
              key={kind}
              onPress={() => {
                setTransport(kind)
                setError(null)
                setSppDevices([])
                setBleDevices([])
              }}
              className={`rounded-full px-4 py-2 ${active ? 'bg-navy' : 'border border-line bg-card'}`}
            >
              <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-navy'}`}>{label}</Text>
            </Pressable>
          )
        })}
      </View>

      {/* Connection panel */}
      <View className="mt-4 rounded-2xl border border-line bg-card p-5 shadow-card">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <View className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-accent' : 'bg-border'}`} />
            <Text className="text-sm font-bold text-ink">
              {connected ? (deviceName ? `Connected · ${deviceName}` : 'Connected') : 'Not connected'}
            </Text>
          </View>
          {connected && (
            <Pressable onPress={() => void handleDisconnect()}>
              <Text className="text-sm font-bold text-gold underline">Disconnect</Text>
            </Pressable>
          )}
        </View>

        {!connected && (
          <View className="mt-4">
            {transport === 'wifi' && (
              <>
                <TextInput
                  value={wifiUrl}
                  onChangeText={setWifiUrl}
                  placeholder="ws://192.168.4.1:81"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink"
                />
                <Pressable
                  onPress={handleWifiConnect}
                  disabled={busy}
                  className="mt-3 flex-row items-center justify-center gap-2 rounded-full bg-navy px-5 py-2.5 disabled:opacity-60"
                >
                  {busy ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="wifi" size={14} color="#fff" />}
                  <Text className="text-xs font-black text-white">{busy ? 'Connecting…' : 'Connect WiFi car'}</Text>
                </Pressable>
              </>
            )}

            {(transport === 'spp' || transport === 'ble') && (
              <>
                {transport === 'spp' && (
                  <Text className="mb-2 text-xs leading-5 text-muted">
                    Pairs like the ESP remote / MIT app over Classic Bluetooth. If the car asks
                    for a PIN when pairing, use 1234.
                  </Text>
                )}
                <Pressable
                  onPress={() => void handleScan()}
                  disabled={scanning || connecting}
                  className="flex-row items-center justify-center gap-2 rounded-full bg-navy px-5 py-2.5 disabled:opacity-60"
                >
                  {scanning ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="search" size={14} color="#fff" />}
                  <Text className="text-xs font-black text-white">
                    {scanning ? 'Scanning…' : transport === 'spp' ? 'Scan cars (SPP)' : 'Scan cars (BLE)'}
                  </Text>
                </Pressable>

                {(sppDevices.length > 0 || bleDevices.length > 0) && (
                  <View className="mt-2">
                    {(transport === 'spp' ? sppDevices : bleDevices).map((d) => (
                      <Pressable
                        key={d.id}
                        onPress={() => void handleConnect(d.id)}
                        disabled={connecting}
                        className="mt-1 flex-row items-center justify-between rounded-lg border border-line px-3 py-2"
                      >
                        <View className="min-w-0 flex-1 flex-row items-center gap-2">
                          <Feather name="bluetooth" size={13} color="#1e3a8a" />
                          <Text className="flex-1 text-xs font-semibold text-ink" numberOfLines={1}>{d.name}</Text>
                          {'bonded' in d && d.bonded ? (
                            <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">Paired</Text>
                          ) : null}
                        </View>
                        <Text className="ml-2 text-xs font-bold text-navy">
                          {connecting ? '…' : 'Connect'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            )}

            {!transport && (
              <Text className="text-xs leading-5 text-muted">
                Pick a connection type above. Classic BT (SPP) matches the hand-held ESP remote;
                choose BLE or WiFi for cars that expose those links.
              </Text>
            )}
          </View>
        )}

        {error && (
          <View className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <Text className="text-xs leading-5 text-red-600">{error}</Text>
          </View>
        )}
      </View>

      {/* OLED-style status + remote deck */}
      <View className={`mt-4 ${!canControl ? 'opacity-40' : ''}`}>
        <OledDisplay
          connected={connected}
          wifiConnected={wifiConnected}
          deviceName={deviceName || 'CAR'}
          activeMode={mode}
          speed={speed}
          servo={servo}
          driveStatus={driveStatus}
          targetAltitude={0}
          gimbalPan={0}
          gimbalTilt={0}
          sensorData={{ temperature: 0, humidity: 0, soilMoisture: 0, lightLevel: 0, airQuality: 0, distance: 0 }}
          telemetry={telemetry}
          isDrone={false}
          isNonRobocar={false}
          linkKind={linkKind}
        />

        {!canControl && (
          <View className="mt-3 rounded-xl bg-sky px-4 py-3">
            <Text className="text-sm font-bold text-navy">
              {mode.remoteWith.includes('ESP REMOTE') || mode.remoteWith.includes('RF')
                ? 'Connect to the car to unlock the remote controls.'
                : 'Connect a device to unlock the remote controls.'}
            </Text>
          </View>
        )}
      </View>

      {/* ESP-remote extras for the 2WD1M (servo-steer) pairing */}
      {is2wd1m && canControl && (
        <TwoWd1mExtras
          canControl={canControl}
          steerLimit={steerLimit}
          trim={trim}
          onAdjustSteerLimit={adjustSteerLimit}
          onAdjustTrim={adjustTrim}
          onEStop={handleEStop}
        />
      )}

      {/* Per-mode deck ----------------------------------------------
          - pid-auto (self-balancing): live-angle + PID tuning card that
            mirrors the ESP remote's AUTO dashboard (BalanceControls).
          - start-stop (obstacle-US/IR, path-following): autonomous card
            with Run/Stop + run-speed tuning (AutonomousControls).
          - everything else: a mode-entry chip that puts the car into this
            package's mode, then the shared drive deck.
          ------------------------------------------------------------------ */}
      {isAuto ? (
        <BalanceControls
          canControl={canControl}
          angle={telemetry.angle ?? null}
          telemetry={telemetry}
          kp={pidKp}
          ki={pidKi}
          kd={pidKd}
          out={pidOut}
          off={pidOff}
          onPid={applyPid}
          onEnterMode={handleEnterMode}
        />
      ) : isAutonomous ? (
        <AutonomousControls
          canControl={canControl}
          activeMode={mode}
          speed={speed}
          driveStatus={driveStatus}
          onSpeed={handleSpeed}
          // Firmware-exact: Run enters the mode token (the routine then runs
          // from the car's loop); Stop returns to BT/manual, which halts the
          // motors. Letters F/S only move in BT mode and can't stop a routine.
          onRun={() => { sendCommand(mode.token); setDriveStatus(`${mode.name} running (${mode.token})`) }}
          onStop={() => { sendCommand('BT'); setDriveStatus(`${mode.name} stopped · BT manual`) }}
        />
      ) : (
        <>
          {/* Multimode wireless-car deck: mode guidance + live JSON status + the
              car's own web page (website-server / website-client packages). */}
          {isWeblink && (
            <WeblinkControls
              canControl={canControl}
              wifiConnected={wifiConnected}
              activeMode={mode}
              telemetry={telemetry}
              onOpenWebPage={handleOpenWebPage}
              onEnterMode={handleEnterMode}
            />
          )}

          {canControl && !isWeblink && (
            <View className="mt-4 flex-row items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-3">
              <Text className="min-w-0 flex-1 text-xs leading-4 text-muted">
                If the car is not already in {mode.token} mode, tap to switch it
                (mirrors the ESP remote's mode select).
              </Text>
              <Pressable onPress={handleEnterMode} className="shrink-0 rounded-full bg-navy px-4 py-2">
                <Text className="text-xs font-black text-white">Enter {mode.token}</Text>
              </Pressable>
            </View>
          )}

          {/* Drive controls (d-pad OR dual joysticks, speed/servo, PID, start/stop) */}
          <View className="mt-4">
            {!is2wd1m && (
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
            <DriveControls
              canControl={canControl}
              isDrone={false}
              activeMode={mode}
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
              onSignedDrive={is2wd1m ? handleStickDrive : undefined}
              steerLimit={is2wd1m ? steerLimit : undefined}
              onRun={() => { sendCommand('F'); setDriveStatus(`${mode.name} running`) }}
              onStop={() => { sendCommand('S'); setDriveStatus(`${mode.name} stopped`) }}
            />
          </View>
        </>
      )}
        </>
      ) : (
        <View className="mt-4 rounded-2xl border border-line bg-card p-5 shadow-card">
          <View className="flex-row items-center gap-2">
            <Feather name="radio" size={16} color="#1e3a8a" />
            <Text className="text-sm font-bold text-ink">RF handset control</Text>
          </View>
          <Text className="mt-2 text-xs leading-5 text-muted">
            This package is a Manual RF (433 MHz) build — the car is driven with its RF
            handset, not over Bluetooth or WiFi, so the app has no link to open for it.
            Use the RF remote that ships with the car.
          </Text>
        </View>
      )}

      {/* About this mode */}
      <View className="mt-4">
        <ModeInfo mode={mode} />
      </View>

      {/* Footer */}
      <View className="mt-6 rounded-lg border border-line bg-card p-4">
        <Text className="text-sm font-semibold text-navy">GENUM Solutions</Text>
        <Text className="mt-0.5 text-xs text-muted">
          App v{APP_VERSION} · Car Remote · {mode.token} ({mode.transport.join(', ')})
        </Text>
      </View>
    </ScrollView>
  )
}

