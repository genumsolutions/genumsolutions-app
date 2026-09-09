// Shared types for IoT controller sub-components.
// ToolsScreen holds all state and passes subsets down as props.
import { Platform } from 'react-native';
import type { CarTelemetry } from '../../services/carProtocol';
import type { CarMode } from '../../config/roboCarCatalog';

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

/** Minimal shape of the storage backend used for remembered device prefs. */
type KVStore = {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
}

let storagePromise: Promise<KVStore | null> | null = null

/** Lazy-load AsyncStorage once. Kept behind Platform.OS so web builds stay
    native-free (mirrors how ToolsScreen handled it before). */
function getStorage(): Promise<KVStore | null> {
  if (storagePromise) return storagePromise
  storagePromise = (async () => {
    if (!(Platform.OS === 'android' || Platform.OS === 'ios')) return null
    try {
      const mod = await import('@react-native-async-storage/async-storage')
      return (mod.default ?? mod) as unknown as KVStore
    } catch {
      return null
    }
  })()
  return storagePromise
}

/** Simple per-device storage backend. Remembered car prefs (speed, mode,
    steer, trim, joystick, fullscreen) are persisted per Bluetooth address so
    they survive app restarts; when storage is unavailable the backend falls
    back to in-memory only (returns null). */
export const deviceMemory = {
  read: async (address: string): Promise<DevicePrefs | null> => {
    try {
      const storage = await getStorage()
      const raw = await storage?.getItem(devicePrefsKey(address))
      if (typeof raw === 'string' && raw.length > 0) {
        return JSON.parse(raw) as DevicePrefs
      }
      return null
    } catch {
      return null
    }
  },

  write: async (address: string, prefs: DevicePrefs): Promise<void> => {
    try {
      const storage = await getStorage()
      if (!storage) return
      await storage.setItem(devicePrefsKey(address), JSON.stringify(prefs))
    } catch {
      /* ignore write failures for now */
    }
  },
}

export type ModeChooserProps = {
  activeMode: CarMode
  canControl: boolean
  onSelect: (mode: CarMode) => void
  onCycle: () => void
  /** NAV highlight: draw the ESP-style inverted box around the trigger
      while the Mode top-bar field is selected. */
  highlighted?: boolean
  /** NAV preview: show the browsed-to mode (before Select confirms). */
  previewMode?: CarMode | null
  /** Disable direct selection (NAV up/down owns mode changes; the dropdown
      still opens so the user can see the list, matching the physical
      remote where the list is display-only while browsing). */
  locked?: boolean
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
  /** Renders at the physical 1.3" OLED's 2:1 shape for the game remote:
      tighter padding/fonts and only the essential lines (no PID/Angle/echo). */
  compact?: boolean
  /** ESP-remote dashboard parity (ui.md): which top-bar field is highlighted
      in NAV mode ('none' = DRIVE). Inverted-box highlight mirrors u8g2. */
  topField?: 'mode' | 'speed' | 'steer' | 'none'
  /** While browsing modes in NAV, the PREVIEWED mode is shown (top bar +
      body title / dashboard preview) before Select confirms — exactly like
      previewModeIndex on the physical remote. */
  previewMode?: CarMode | null
  /** Unavailable firmware modes preview as COMING SOON (ui.md screen 9). */
  previewComingSoon?: boolean
  /** 2WD1M: the user-set MAX steer limit for the top bar — the ESP remote
      top bar shows the LIMIT, never the live servo angle. */
  steerLimit?: number
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
  /** Max steering deflection the user allows (0..90). */
  steerLimit: number
  /** Steering trim offset (persisted on the car via TRIM). */
  trim: number
  onAdjustSteerLimit: (delta: number) => void
  onAdjustTrim: (delta: number) => void
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
  onRun?: () => void
  onStop?: () => void
  /** Emergency stop (ESTOP + SPD0). Rendered when provided. */
  onEStop?: () => void
  /** Compact game-remote deck: board fills the available space (joystick
      flex-fill), slim speed strip, and the PID / start-stop / emergency
      rows are hidden (the remote screen shows those elsewhere). */
  compact?: boolean
  /** NAV routing (ESP-remote parity): the deck reads this ref's CURRENT
      value on every touch (never stale) and routes input to the NAV
      handler instead of driving while NAV is active. Optional — decks
      without it always drive. */
  navActiveRef?: { current: boolean }
  /** NAV input from the pads/joysticks (left stick / d-pad nav: -1 left,
      +1 right, 0 up, 1 down on the Y axis). Optional. */
  onNavInput?: (axis: 'x' | 'y', value: -1 | 0 | 1) => void
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