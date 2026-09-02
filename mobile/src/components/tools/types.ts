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
  connected: boolean
  onSelect: (mode: CarMode) => void
  onCycle: () => void
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
  onDirection: (d: 'F' | 'B' | 'L' | 'R' | 'S') => void
  onSpeed: (v: number) => void
  onServo: (v: number) => void
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
