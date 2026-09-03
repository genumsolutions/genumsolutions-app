// =====================================================================
// bleService - native BLE communication for GENUM ESP32 devices.
// Uses react-native-ble-plx to scan, connect, and send GENUM command
// lines over the ESP32 UART (HM-10 / Nordic UART) BLE service.
// =====================================================================
// @ts-ignore
import { BleManager } from '@sfourdrinier/react-native-ble-plx'

// ESP32 UART (HM-10 / Nordic UART) service & characteristic UUIDs
const UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
const UART_TX_CHAR = '6e400002-b5a3-f393-e0a9-e50e24dcca9e' // device writes here
const UART_RX_CHAR = '6e400003-b5a3-f393-e0a9-e50e24dcca9e' // device notifies here

// Alternative UUID variants some ESP32 firmwares use
const ALT_SERVICE_UUIDS = [
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
]
const ALT_TX_UUIDS = [
  '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  '0000ffe1-0000-1000-8000-00805f9b34fb',
]
const ALT_RX_UUIDS = [
  '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
  '0000ffe2-0000-1000-8000-00805f9b34fb',
]

// Default timeout for BLE connection attempts (slow devices can exceed it;
// override per-call by passing timeoutMs to connect()).
export const BLE_CONNECT_TIMEOUT_MS = 10000

export type CarTelemetry = {
  mode?: string
  speed?: number
  trim?: number
  status?: string
  kp?: number
  ki?: number
  kd?: number
  out?: number
  off?: number
  angle?: number
}

export type BleDevice = {
  id: string
  name: string
  rssi: number
  adData?: { rssi: number }
}

type ConnectionState =
  | { kind: 'disconnected' }
  | { kind: 'scanning' }
  | { kind: 'connecting'; deviceName: string }
  | { kind: 'connected'; deviceId: string; deviceName: string }
  | { kind: 'error'; message: string }

type TelemetryCallback = (t: CarTelemetry) => void
type StatusCallback = (kind: 'connecting' | 'connected' | 'disconnected' | 'error', message?: string) => void

class BleService {
  private manager: BleManager | null = null
  private connectedDeviceId: string | null = null
  private connectedDeviceName: string | null = null
  private txCharacteristic: string | null = null
  private rxCharacteristic: string | null = null
  private telemetryCallbacks: Set<TelemetryCallback> = new Set()
  private statusCallbacks: Set<StatusCallback> = new Set()
  private monitoring: boolean = false

  /** Lazily initialize BleManager on first use (prevents crash on import). */
  private getManager(): BleManager {
    if (!this.manager) {
      this.manager = new BleManager()
    }
    return this.manager
  }

  /** Reject `promise` with a descriptive error if it doesn't settle in `ms`. */
  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`))
      }, ms)
      promise.then(
        (value) => { clearTimeout(timer); resolve(value) },
        (error) => { clearTimeout(timer); reject(error) },
      )
    })
  }

  get isConnected(): boolean {
    return this.connectedDeviceId !== null
  }

  get deviceId(): string | null {
    return this.connectedDeviceId
  }

  get deviceName(): string | null {
    return this.connectedDeviceName
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

  /** Scan for BLE devices for `seconds` duration. Returns discovered devices. */
  async scan(seconds: number = 10): Promise<BleDevice[]> {
    return new Promise((resolve, reject) => {
      const devices: BleDevice[] = []

      const listener = (error: Error, device: { id: string; name: string; adData?: { rssi: number } }) => {
        if (device.name && !devices.find((d) => d.id === device.id)) {
          devices.push({ id: device.id, name: device.name, rssi: device.adData?.rssi ?? -127 })
        }
      }

      const mgr = this.getManager()
      mgr.onDeviceDiscover(listener)
      mgr.startDeviceScan(null, { allowDuplicates: false }, (error: Error) => {
        mgr.removeListener('DeviceDiscover', listener)
        mgr.stopDeviceScan()
        if (error) {
          reject(error)
          return
        }
        resolve(devices)
      })

      setTimeout(() => {
        mgr.stopDeviceScan()
        resolve(devices)
      }, seconds * 1000)
    })
  }

  /** Connect to a device by ID and discover the UART service/characteristics. */
  async connect(deviceId: string, timeoutMs: number = BLE_CONNECT_TIMEOUT_MS): Promise<void> {
    try {
      this.emitStatus('connecting', deviceId)
      const mgr = this.getManager()
      // Explicit <any>: the @ts-ignore'd package types resolve to `any`, and
      // passing `any` into the generic helper would infer `{}` otherwise.
      const device = await this.withTimeout<any>(
        mgr.connectToDevice(deviceId, { autoConnect: false }),
        timeoutMs,
        'BLE connection',
      )
      if (!device) throw new Error('Device not found')

      const services = await device.services()
      const service = services.find((s: any) =>
        ALT_SERVICE_UUIDS.includes(s.id.toLowerCase())
      )
      if (!service) throw new Error('UART service not found on this device')

      const chars = await service.characteristics()
      const txChar = chars.find((c: any) =>
        ALT_TX_UUIDS.includes(c.id.toLowerCase())
      )
      const rxChar = chars.find((c: any) =>
        ALT_RX_UUIDS.includes(c.id.toLowerCase())
      )

      if (!txChar) throw new Error('TX characteristic not found')
      if (!rxChar) throw new Error('RX characteristic not found')

      this.txCharacteristic = txChar.id
      this.rxCharacteristic = rxChar.id
      this.connectedDeviceId = deviceId
      this.connectedDeviceName = device.name ?? 'Device'

      // Subscribe to RX for telemetry
      await mgr.monitorCharacteristicForDevice(
        deviceId,
        service.id,
        rxChar.id,
        (error: Error, characteristic: { value?: string | null }) => {
          if (error) {
            this.emitStatus('error', error.message)
            return
          }
          if (characteristic?.value) {
            const text = characteristic.value
            const lines = text.split('\n').filter(Boolean)
            for (const line of lines) {
              const telemetry = this.parseTelemetryLine(line)
              if (Object.keys(telemetry).length > 0) {
                this.emitTelemetry(telemetry)
              }
            }
          }
        }
      )

      this.emitStatus('connected')
    } catch (e) {
      this.emitStatus('error', e instanceof Error ? e.message : 'Connection failed')
      throw e
    }
  }

  /** Disconnect from the current device. */
  async disconnect(): Promise<void> {
    if (this.connectedDeviceId && this.manager) {
      try {
        await this.manager.cancelDeviceConnection(this.connectedDeviceId)
      } catch { /* ignore */ }
    }
    this.connectedDeviceId = null
    this.connectedDeviceName = null
    this.txCharacteristic = null
    this.rxCharacteristic = null
    this.monitoring = false
    this.emitStatus('disconnected')
  }

  /** Send a single GENUM command line to the device. */
  async sendLine(line: string): Promise<void> {
    if (!this.connectedDeviceId || !this.txCharacteristic) {
      throw new Error('Not connected')
    }
    const message = new TextEncoder().encode(line + '\n')
    const mgr = this.getManager()
    await mgr.writeCharacteristicWithoutResponseForDevice(
      this.connectedDeviceId,
      this.txCharacteristic,
      message
    )
  }

  /** Request current state from the device. */
  async requestState(): Promise<void> {
    await this.sendLine('REQ_STATE')
  }

  /** Send direction command (F|B|L|R|S). */
  async sendDirection(d: 'F' | 'B' | 'L' | 'R' | 'S'): Promise<void> {
    await this.sendLine(d)
  }

  /** Set speed (0-255). */
  async setSpeed(value: number): Promise<void> {
    await this.sendLine(`SPD${Math.round(value)}`)
  }

  /** Set servo angle (0-180). */
  async setServo(value: number): Promise<void> {
    await this.sendLine(`SERVO${Math.round(value)}`)
  }

  /** Calibrate PID. */
  async calibratePid(p: { kp: number; ki: number; kd: number; out: number; off: number }): Promise<void> {
    const cmd = `CFG;Kp:${p.kp.toFixed(2)};Ki:${p.ki.toFixed(3)};Kd:${p.kd.toFixed(3)};OUT:${p.out.toFixed(0)};OFF:${p.off.toFixed(2)}`
    await this.sendLine(cmd)
  }

  /** Parse a telemetry line into CarTelemetry. */
  private parseTelemetryLine(line: string): CarTelemetry {
    const l = line.trim()
    if (!l) return {}
    const up = l.toUpperCase()
    const telemetry: CarTelemetry = {}

    // STATE;MODE=2WD1M;SPD=120;TRIM=0;STATUS=Forward
    if (up.startsWith('STATE')) {
      const body = l.split(/[;:]/)
      let i = 1
      while (i < body.length) {
        const key = body[i]?.toUpperCase()
        const val = body[i + 1]
        if (!key || val === undefined) { i += 1; continue }
        if (key === 'MODE') telemetry.mode = val
        else if (key === 'SPD') telemetry.speed = Number(val) || 0
        else if (key === 'TRIM') telemetry.trim = Number(val) || 0
        else if (key === 'STATUS') telemetry.status = val
        i += 2
      }
      return telemetry
    }

    // TEL;Kp:12.30;Ki:0.50;Kd:3.10;OUT:050;OFF:+0.75;ANGLE:+12.34
    if (up.startsWith('TEL')) {
      const body = l.replace(/^TEL[:;]/i, '')
      for (const part of body.split(';')) {
        const m = /^([A-Za-z]+):(.+)$/.exec(part.trim())
        if (!m) continue
        const key = m[1]!.toUpperCase()
        const num = Number(m[2]) || 0
        if (key === 'KP') telemetry.kp = num
        else if (key === 'KI') telemetry.ki = num
        else if (key === 'KD') telemetry.kd = num
        else if (key === 'OUT') telemetry.out = num
        else if (key === 'OFF') telemetry.off = num
        else if (key === 'ANGLE') telemetry.angle = num
      }
      return telemetry
    }

    // SPD<value>
    if (/^SPD[:]?-?[\d]+$/i.test(l)) {
      const num = Number(l.replace(/^SPD[:]?/i, '')) || 0
      if (num > 0) telemetry.speed = num
    }

    return telemetry
  }
}

// Singleton instance used throughout the app
export const bleService = new BleService()