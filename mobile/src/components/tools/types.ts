// Shared types for IoT controller sub-components.
// ToolsScreen holds all state and passes subsets down as props.

import type { CarTelemetry } from '../../services/bleService'
import type { CarMode } from '../../config/roboCarCatalog'

export type SensorData = {
  temperature: number
  humidity: number
  soilMoisture: number
  lightLevel: number
  airQuality: number
  distance: number
}

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
  /** Link label for the status chip; defaults to 'BLE LINK' / 'WiFi WS'. */
  linkKind?: 'ble' | 'spp' | 'wifi' | 'auto'
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
