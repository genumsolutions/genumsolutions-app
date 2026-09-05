// =====================================================================
// sppService - Classic Bluetooth SPP transport for GENUM ESP32 cars.
//
// The hand-held ESP remote (Genum_ESP32_Remote) and the MIT App Inventor
// car apps pair over CLASSIC Bluetooth SPP (BluetoothSerial on the ESP32),
// not BLE. react-native-ble-plx can only reach BLE UART cars, so this
// service adds the classic-BT path so the native app can pair with the
// same cars as the physical remote.
//
// Implementation notes:
// - Wraps `react-native-bluetooth-classic` (Android classic Bluetooth /
//   iOS MFi). Classic SPP scanning + RFCOMM sockets are Android-only, so
//   every method rejects with a clear message on other platforms.
// - The module is lazy-loaded inside getModule() and never imported
//   statically: its index.js constructs the native wrapper at import time,
//   which would crash web / unsupported builds (same pattern as
//   bleService's lazy BleManager).
// - Uses the default 'delimited' connection (delimiter "\n") so the native
//   side emits one event per GENUM command line; the shared carProtocol
//   parser then turns lines into telemetry.
// =====================================================================
import { NativeModules, PermissionsAndroid, Platform } from 'react-native'
import { parseTelemetryLine, REQ_STATE_LINE, type CarTelemetry } from './carProtocol'

export type SppDevice = {
  id: string
  name: string
  address: string
  bonded: boolean
}

type TelemetryCallback = (t: CarTelemetry) => void
type StatusCallback = (kind: 'connecting' | 'connected' | 'disconnected' | 'error', message?: string) => void

/** Android runtime permissions needed for classic discovery + connect. */
const SPP_PERMISSIONS =
  Platform.OS === 'android' && Platform.Version >= 31
    ? [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]
    : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]

export class SppService {
  private module: any = null
  private connectedAddress: string | null = null
  private connectedName: string | null = null
  private readSubscription: { remove: () => void } | null = null
  private telemetryCallbacks: Set<TelemetryCallback> = new Set()
  private statusCallbacks: Set<StatusCallback> = new Set()

  /** True on Android when the classic-BT native module is present. */
  get supported(): boolean {
    return (
      Platform.OS === 'android' &&
      Boolean(NativeModules?.RNBluetoothClassic)
    )
  }

  get isConnected(): boolean {
    return this.connectedAddress !== null
  }

  get deviceName(): string | null {
    return this.connectedName
  }

  onTelemetry(cb: TelemetryCallback): () => void {
    this.telemetryCallbacks.add(cb)
    return () => { this.telemetryCallbacks.delete(cb) }
  }

  onStatus(cb: StatusCallback): () => void {
    this.statusCallbacks.add(cb)
    return () => { this.statusCallbacks.delete(cb) }
  }

  private emitStatus(kind: 'connecting' | 'connected' | 'disconnected' | 'error', message?: string) {
    this.statusCallbacks.forEach((cb) => cb(kind, message))
  }

  private emitTelemetry(t: CarTelemetry) {
    this.telemetryCallbacks.forEach((cb) => cb(t))
  }

  /** Lazy-load the classic module (Android only). Never static-import it. */
  private async getModule(): Promise<any> {
    if (!this.supported) {
      throw new Error('Classic Bluetooth (SPP) is available on Android only. Use BLE or WiFi on this device.')
    }
    if (!this.module) {
      try {
        // Dynamic import keeps the wrapper constructor off the import graph
        // for web / unsupported platforms.
        const loaded = await import('react-native-bluetooth-classic')
        this.module = loaded.default ?? loaded
      } catch {
        this.module = null
        throw new Error('Classic Bluetooth module failed to load. Rebuild the APK with the SPP native module linked.')
      }
    }
    return this.module
  }

  /** Request Android runtime permissions for classic scanning/connecting. */
  private async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return false
    try {
      const results = await PermissionsAndroid.requestMultiple(SPP_PERMISSIONS)
      return SPP_PERMISSIONS.every((p) => results[p] === PermissionsAndroid.RESULTS.GRANTED)
    } catch {
      return false
    }
  }

  /** Map a native device object to the app's SppDevice shape. */
  private toDevice(d: any): SppDevice {
    return {
      id: d.address ?? d.id ?? '',
      name: d.name || d.address || 'Unknown',
      address: d.address ?? '',
      bonded: d.bonded === true || d.bonded === 'true',
    }
  }

  /**
   * List classic-BT devices: bonded devices first, then any newly
   * discovered (unbonded) devices. Android-only; rejects elsewhere.
   */
  async scan(): Promise<SppDevice[]> {
    const mod = await this.getModule()
    const granted = await this.requestPermissions()
    if (!granted) {
      throw new Error('Bluetooth permission needed. Allow Bluetooth access and try again.')
    }

    const devices = new Map<string, SppDevice>()

    // Bonded (already paired) devices — the common case for an ESP32 car
    // the phone has paired with before (PIN 1234).
    try {
      const bonded = await mod.getBondedDevices()
      for (const d of bonded ?? []) {
        const dev = this.toDevice(d)
        if (dev.address) devices.set(dev.address, { ...dev, bonded: true })
      }
    } catch { /* bonded list is best-effort */ }

    // Discovery finds new (unpaired) devices so users can pair a fresh car.
    try {
      const found = await mod.startDiscovery()
      for (const d of found ?? []) {
        const dev = this.toDevice(d)
        if (dev.address && !devices.has(dev.address)) devices.set(dev.address, dev)
      }
    } catch { /* discovery is best-effort */ }
    try {
      await mod.cancelDiscovery()
    } catch { /* ignore */ }

    return [...devices.values()]
  }

  /**
   * Connect to a classic SPP device by MAC address. The ESP32 car's
   * BluetoothSerial server accepts an unauthenticated RFCOMM socket, so no
   * pairing is required when the phone already bonded (OS pairing dialog
   * appears automatically for a fresh device, PIN 1234 on the cars).
   */
  async connect(address: string): Promise<void> {
    if (!address) throw new Error('Choose a car from the list first.')
    const mod = await this.getModule()
    this.emitStatus('connecting', address)

    try {
      await mod.connectToDevice(address, { delimiter: '\n', charset: 'utf-8' })
      this.connectedAddress = address
      this.connectedName = address

      // Start listening for the newline-delimited telemetry stream. The
      // read event is emitted per message by the native 'delimited'
      // connection, so one event == one GENUM line (no manual buffering).
      this.readSubscription?.remove()
      this.readSubscription = mod.onDeviceRead(address, (event: { data?: string }) => {
        if (!event?.data) return
        const telemetry = parseTelemetryLine(event.data)
        if (Object.keys(telemetry).length > 0) this.emitTelemetry(telemetry)
      })

      this.emitStatus('connected', address)
    } catch (e) {
      this.emitStatus('error', e instanceof Error ? e.message : 'Classic BT connection failed')
      throw e
    }
  }

  /** Disconnect and tear down the read subscription. */
  async disconnect(): Promise<void> {
    if (this.connectedAddress) {
      try {
        const mod = await this.getModule()
        await mod.disconnectFromDevice(this.connectedAddress)
      } catch { /* ignore */ }
    }
    this.readSubscription?.remove()
    this.readSubscription = null
    this.connectedAddress = null
    this.connectedName = null
    this.emitStatus('disconnected')
  }

  /** Send one GENUM command line to the car (newline terminated). */
  async sendLine(line: string): Promise<void> {
    if (!this.connectedAddress) throw new Error('Not connected')
    const mod = await this.getModule()
    await mod.writeToDevice(this.connectedAddress, `${line}\n`, 'utf-8')
  }

  /** Ask the car to re-broadcast STATE (mode/speed/trim/status). */
  async requestState(): Promise<void> {
    await this.sendLine(REQ_STATE_LINE)
  }
}

// Singleton instance used throughout the app (mirrors bleService).
export const sppService = new SppService()
