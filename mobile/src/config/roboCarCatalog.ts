// =====================================================================
// roboCarCatalog.ts - local catalogue of robot-car modes for the GENUM app.
//
// Mirrors the website's lib/robo-car-catalog.ts but is a standalone copy
// so the app can work offline. Keep in sync with the website catalog
// (supabase.schema.sql + content-store.ts) when publishing new modes.
//
// Each entry maps the website ModeType enum to a friendly UI description.
// The app uses these when the WebView is offline or when rendering the
// native IoT & Remote Controller screen.
// =====================================================================

export type CarModeId =
  | '4wd4m'          // Bluetooth · 4WD (4M)
  | '2wd1m'          // Bluetooth · 2WD + Servo (1M)
  | 'self-balancing' // Self-Balancing
  | 'obstacle-us'    // Obstacle Avoidance · Ultrasonic
  | 'obstacle-ir'    // Obstacle Avoidance · IR
  | 'website-client' // Website Controlled · Client
  | 'website-server' // Website Controlled · Server
  | 'path-follow'    // Path Following · IR
  | 'rf-manual'      // Manual · RF

export type ControlKind =
  | 'drive-tank'      // 4WD: drive+direction
  | 'drive-2wd1m'     // 2WD1M: motor speed + servo steer
  | 'pid-auto'        // self-balancing: PID sliders + live angle
  | 'start-stop'      // autonomous: run/stop + read-only telemetry
  | 'tuning'          // config-driven (path/obstacle thresholds)
  | 'weblink'         // website client/server: point at ESP IP

export interface CarMode {
  id: CarModeId
  name: string
  token: string
  deviceIndex: number
  car: string
  wheel: string
  steering: string
  sensors: string[]
  transport: ('ble' | 'wifi' | 'classic-bt' | 'rf')[]
  remoteWith: string
  controls: ControlKind[]
  requiresConnection: boolean
  blurb: string
}

// The 9 modes from the ESP32 remote firmware (Genum_ESP32_Remote_v1.0.0)
export const LOCAL_CAR_MODES: CarMode[] = [
  {
    id: '4wd4m',
    name: 'Bluetooth · 4WD (4M)',
    token: 'BT',
    deviceIndex: 0,
    car: '4-wheel-drive',
    wheel: '4 × BO/brushed motors',
    steering: 'Skid-steer (differential)',
    sensors: [],
    transport: ['ble', 'classic-bt'],
    remoteWith: 'ESP REMOTE or app',
    controls: ['drive-tank'],
    requiresConnection: true,
    blurb: 'A 4-motor drive car driven by direction (F/B/L/R) and speed.',
  },
  {
    id: '2wd1m',
    name: 'Bluetooth · 2WD + Servo (1M)',
    token: '2WD1M',
    deviceIndex: 8,
    car: '2-wheel-drive',
    wheel: '1 × BO motor (rear)',
    steering: '1 × servo (0..180, center 90)',
    sensors: [],
    transport: ['ble', 'classic-bt'],
    remoteWith: 'ESP REMOTE two-joystick',
    controls: ['drive-2wd1m'],
    requiresConnection: true,
    blurb: 'One drive motor plus a steering servo. Speed is signed SPD (fwd +ve).',
  },
  {
    id: 'self-balancing',
    name: 'Self-Balancing',
    token: 'AUTO',
    deviceIndex: 6,
    car: 'Self-balancing',
    wheel: '2 × BO motors',
    steering: 'Self-balance (PID)',
    sensors: ['MPU6050 IMU'],
    transport: ['ble', 'wifi', 'classic-bt'],
    remoteWith: 'ESP REMOTE (PID tuning)',
    controls: ['pid-auto'],
    requiresConnection: true,
    blurb: 'Balances itself in AUTO mode. The app/remote tune Kp/Ki/Kd OUT/OFF live.',
  },
  {
    id: 'obstacle-us',
    name: 'Obstacle Avoidance · Ultrasonic',
    token: 'OBS_US',
    deviceIndex: 3,
    car: 'Obstacle avoider',
    wheel: '2/4 × BO motors',
    steering: 'Skid-steer',
    sensors: ['HC-SR04 / ultrasonic'],
    transport: ['ble', 'wifi', 'classic-bt'],
    remoteWith: 'ESP REMOTE',
    controls: ['start-stop'],
    requiresConnection: true,
    blurb: 'Runs autonomous obstacle avoidance using an ultrasonic sensor.',
  },
  {
    id: 'obstacle-ir',
    name: 'Obstacle Avoidance · IR',
    token: 'OBS_IR',
    deviceIndex: 4,
    car: 'Obstacle avoider',
    wheel: '2/4 × BO motors',
    steering: 'Skid-steer',
    sensors: ['IR / photodiode pair'],
    transport: ['ble', 'wifi', 'classic-bt'],
    remoteWith: 'ESP REMOTE',
    controls: ['start-stop'],
    requiresConnection: true,
    blurb: 'Autonomous obstacle avoidance driven by IR sensors.',
  },
  {
    id: 'website-client',
    name: 'Website Controlled · Client',
    token: 'ESP_CLI',
    deviceIndex: 7,
    car: 'Website car',
    wheel: '2/4 × BO motors',
    steering: 'Skid-steer',
    sensors: [],
    transport: ['wifi'],
    remoteWith: 'Browser / app',
    controls: ['weblink'],
    requiresConnection: false,
    blurb: 'The ESP32 is a WiFi client; the browser/app acts as the control server.',
  },
  {
    id: 'website-server',
    name: 'Website Controlled · Server',
    token: 'ESP_SER',
    deviceIndex: 1,
    car: 'Website car',
    wheel: '2/4 × BO motors',
    steering: 'Skid-steer',
    sensors: [],
    transport: ['wifi'],
    remoteWith: 'Browser / app',
    controls: ['weblink'],
    requiresConnection: false,
    blurb: 'The ESP32 hosts its own web page; open its IP to drive it.',
  },
  {
    id: 'path-follow',
    name: 'Path Following · IR',
    token: 'PATH',
    deviceIndex: 2,
    car: 'Line follower',
    wheel: '2/4 × BO motors',
    steering: 'Skid-steer',
    sensors: ['IR line sensors'],
    transport: ['ble', 'wifi', 'classic-bt'],
    remoteWith: 'ESP REMOTE',
    controls: ['start-stop'],
    requiresConnection: true,
    blurb: 'Follows an IR-detected line or path autonomously.',
  },
  {
    id: 'rf-manual',
    name: 'Manual · RF',
    token: 'MAN',
    deviceIndex: 5,
    car: 'RF car',
    wheel: '2/4 × BO motors',
    steering: 'Skid-steer',
    sensors: [],
    transport: ['rf'],
    remoteWith: 'RF hand-held remote',
    controls: ['drive-tank'],
    requiresConnection: false,
    blurb: 'Manual control over RF modules (not BT or WiFi) - drive with the RF handset.',
  },
]

// Map from mode token to CarModeId (mirrors website MODE_CMDS[] ordering)
export const TOKEN_TO_MODE_ID: Record<string, CarModeId> = {
  BT: '4wd4m',
  ESP_SER: 'website-server',
  PATH: 'path-follow',
  OBS_US: 'obstacle-us',
  OBS_IR: 'obstacle-ir',
  MAN: 'rf-manual',
  AUTO: 'self-balancing',
  ESP_CLI: 'website-client',
  '2WD1M': '2wd1m',
}

// Map from mode token to human-readable name (for offline display)
export const MODE_NAMES: Record<string, string> = {
  BT: 'Bluetooth',
  ESP_SER: 'EspWebServer',
  PATH: 'PathFollowing',
  OBS_US: 'Obstacle_US',
  OBS_IR: 'ObstacleIR',
  MAN: 'Manual',
  AUTO: 'Autonomous',
  ESP_CLI: 'EspWebClient',
  '2WD1M': '2WD1M',
}

// -------------------------------------------------------------------
// Resolve a mode by its token (as sent over BLE/WS protocol)
// -------------------------------------------------------------------
export function resolveModeByToken(token: string): CarMode | undefined {
  const id = TOKEN_TO_MODE_ID[token]
  if (!id) return undefined
  return LOCAL_CAR_MODES.find((m) => m.id === id)
}

// Resolve a mode by its index in the firmware cycle (0..8)
export function resolveModeByIndex(idx: number): CarMode | undefined {
  return LOCAL_CAR_MODES.find((m) => m.deviceIndex === idx)
}

// Get the mode that follows `from` in the firmware cycle (wrapping)
export function nextMode(from: CarMode): CarMode {
  const fromIdx = LOCAL_CAR_MODES.findIndex((m) => m.id === from.id)
  if (fromIdx === -1) return LOCAL_CAR_MODES[0]
  return LOCAL_CAR_MODES[(fromIdx + 1) % LOCAL_CAR_MODES.length]
}