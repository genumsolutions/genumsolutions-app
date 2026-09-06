// Shared types for IoT controller sub-components.
// ToolsScreen holds all state and passes subsets down as props.

// Storage bridge surface so the rest of the app can persist per-device
// preferences without importing a specific storage package in this file.

/** Runtime storage bridge provided by the app. Until it is set, device memory
    falls back to in-memory only. */
let storageBridge: { getPrefs?: (key: string) => string | null | Promise<string | null>; setPrefs?: (key: string, value: string) => void | Promise<void> } | null = null;
export { storageBridge as deviceMemoryBridge };

export function setDeviceMemoryBridge(bridge: typeof storageBridge): void {
  storageBridge = bridge ?? null;
}

import type { CarTelemetry } from '../../services/carProtocol';
import type { CarMode } from '../../config/roboCarCatalog';
import { sppService } from '../../services/sppService';

export type SensorData = {
  temperature: number
  humidity: number
  soilMoisture: number
  lightLevel: number
  airQuality: number
  distance: number
}

/** ESP-remote-style safety limits so the app cannot command unsafe values. */
export type SafetyLimits = {
  /** Absolute motor PWM/speed ceiling (esp32 remote SAFE_PWM / SPEED_MAX style). */
  maxSpeed: number
  /** Signed joystick drive ceiling (esp32 remote joystick drive range). */
  maxSignedDrive: number
  /** Steering center for the app's SERVO mapping. */
  servoCenter: number
  /** Max servo deflection from center (esp32 remote STEER limit style). */
  maxSteerDeviation: number
  /** Trim ceiling (esp32 remote TRIM range style). */
  maxTrim: number
}

/** Default safety limits mirroring the ESP32 remote's SAFE_PWM / limits. */

export const DEFAULT_SAFETY_LIMITS: SafetyLimits = {
  maxSpeed: 255,
  maxSignedDrive: 255,
  servoCenter: 90,
  maxSteerDeviation: 90,
  maxTrim: 90,
}

/** Saved per-device preferences (mirrors the ESP remote remembered values). */
export type DevicePrefs = {
  /** Last used SPP address so the app can re-select the same car. */
  address: string | null
  /** Last used car name for display. */
  name: string | null
  /** Last selected mode id. */
  modeId: string | null
  /** Last speed value used by the app. */
  speed: number
  /** Last servo/steering value used by the app. */
  servo: number
  /** Last steer limit the user set (2WD1M style). */
  steerLimit: number
  /** Last trim value the user set (car-persisted trim). */
  trim: number
  /** Last joystick control style the user chose. */
  useJoystick: boolean
  /** Last fullscreen state so the app can restore it. */
  fullscreen: boolean
  /** Last selected joystick layout id. */
  joystickLayout: string
}

/** Per-device storage key prefix. */

export function devicePrefsKey(address: string): string {
  return `genum.device.${address}`
}

/** Simple per-device storage backend. Uses Platform.OS to decide where
    preferences are kept; on supported platforms this integrates with the
    app's existing storage so remembered values survive restarts. */

export const deviceMemory = {
  read: (address: string): DevicePrefs | null => {
    try {
      const key = devicePrefsKey(address)
      // Prefer the app's existing storage bridge when available.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bridge = (sppService as any).getPrefs
      if (typeof bridge === 'function') {
        const raw = bridge(key)
        if (typeof raw === 'string' && raw.length > 0) {
          return JSON.parse(raw) as DevicePrefs
        }
      }
      return null
    } catch {
      return null
    }
  },

  write: (address: string, prefs: DevicePrefs): void => {
    try {
      const key = devicePrefsKey(address)
      // Prefer the app's existing storage bridge when available.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bridge = (sppService as any).setPrefs
      if (typeof bridge === 'function') {
        bridge(key, JSON.stringify(prefs))
        return
      }
      // Fallback placeholder: persist through the app's chosen storage later.
    } catch {
      /* ignore write failures for now */
    }
  },
}

// Keep legacy ConnectionPanel import paths working until the panel is retired.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type ConnectionPanelProps = {
  connected: boolean
  wifiConnected: boolean
  deviceName: string
  scanningBle: boolean
  connecting: boolean
  devices: { id: string; name: string }[]
  wifiUrl: string
  error: string | null
  onScan: () => void
  onConnectBle: (id: string) => void
  onWifiConnect: () => void
  onWifiDisconnect: () => void
  onDisconnect: () => void
  onSetWifiUrl: (url: string) => void
  onClearError: () => void
}

export type ModeChooserProps = {
  activeMode: CarMode
  canControl: boolean
  onSelect: (mode: CarMode) => void
  onCycle: () => void
  /** Display catalogue (DB-first). Defaults to the bundled modes when omitted. */
  modes?: CarMode[]
}

export type OledDisplayProps = {
  connected: boolean
  wifiConnected: boolean
  deviceName: string
  activeMode: CarMode
  speed: number
  servo: number
  driveStatus: string
  targetAltitude: number
  gimbalPan: number
  gimbalTilt: number
  sensorData: SensorData
  telemetry: CarTelemetry
  isDrone: boolean
  isNonRobocar: boolean
  /** Link label for the status chip; defaults to 'SPP LINK' / 'WiFi WS'. */
  linkKind?: 'spp' | 'wifi'
}

export type BalanceControlsProps = {
  canControl: boolean
  /** Live tilt from TEL;…ANGLE — null until the first telemetry frame. */
  angle: number | null
  /** Latest parsed car telemetry (mode / speed / live PID values). */
  telemetry: CarTelemetry
  kp: number
  ki: number
  kd: number
  out: number
  off: number
  onPid: (key: 'kp' | 'ki' | 'kd' | 'out' | 'off', v: number) => void
  /** Switches the car into AUTO (self-balancing) mode. */
  onEnterMode: () => void
}

export type AutonomousControlsProps = {
  canControl: boolean
  activeMode: CarMode
  /** Current run speed (100..255, 5-unit steps — absolute SPD). */
  speed: number
  /** Latest drive status (e.g. "Running" / "Stopped") for the status row. */
  driveStatus: string
  onSpeed: (v: number) => void
  onRun: () => void
  onStop: () => void
}

export type WeblinkControlsProps = {
  canControl: boolean
  wifiConnected: boolean
  activeMode: CarMode
  /** Latest parsed telemetry — wireless cars stream JSON status over WS. */
  telemetry: CarTelemetry
  /** Opens the car's own web page (website-server cars host one on :80). */
  onOpenWebPage: () => void
  /** Switches the car into this package's mode (token ESP_SER / ESP_CLI). */
  onEnterMode: () => void
}

export type TwoWd1mExtrasProps = {
  canControl: boolean
  /** Max servo deflection from center 90 (±). */
  steerLimit: number
  /** Steering trim offset (persisted on the car via TRIM). */
  trim: number
  onAdjustSteerLimit: (delta: number) => void
  onAdjustTrim: (delta: number) => void
  onEStop: () => void
}

export type DriveControlsProps = {
  canControl: boolean
  isDrone: boolean
  activeMode: CarMode
  speed: number
  servo: number
  pidKp: number
  pidKi: number
  pidKd: number
  pidOut: number
  pidOff: number
  /** When true, show dual joysticks instead of d-pad buttons. */
  useJoystick: boolean
  onDirection: (d: 'F' | 'B' | 'L' | 'R' | 'S') => void
  onSpeed: (v: number) => void
  onServo: (v: number) => void
  /** ESP-remote 2WD1M joystick parity: left stick streams signed SPD
      (-255..255, transient drive) through this callback instead of direction
      letters, and the right stick clamps to ±steerLimit around center 90.
      Omit for the legacy letter-based mapping. */
  onSignedDrive?: (signed: number) => void
  /** Max servo deflection (±°) from center 90 for the right joystick when
      onSignedDrive is set (mirrors the ESP remote's Steer limit). */
  steerLimit?: number
  onPid: (key: 'kp' | 'ki' | 'kd' | 'out' | 'off', v: number) => void
  onRun: () => void
  onStop: () => void
}

export type DroneControlsProps = {
  canControl: boolean
  targetAltitude: number
  gimbalPan: number
  gimbalTilt: number
  onAltitude: (v: number) => void
  onGimbalPan: (v: number) => void
  onGimbalTilt: (v: number) => void
  onCommand: (cmd: string) => void
  onSetAltitude: (v: number) => void
}

export type SensorGridProps = {
  canControl: boolean
  isDrone: boolean
  isNonRobocar: boolean
  activeCategory: string
  sensorData: SensorData
  relays: Record<number, boolean>
  telemetry: CarTelemetry
  onToggleRelay: (i: number) => void
}
