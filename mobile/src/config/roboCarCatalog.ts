// =====================================================================
// roboCarCatalog.ts - bundled (OFFLINE FALLBACK) robot-car catalogue.
//
// The DISPLAY catalogue is read DB-first from the shared `robo_car_modes`
// Supabase table via services/carModeService.ts (the same rows the website
// admin edits). This bundled list is the fallback when Supabase is
// unreachable, mirrors the website's lib/robo-car-catalog.ts, and doubles
// as the seed source for the table. Keep it in sync with that file.
//
// The protocol helpers below (TOKEN_TO_MODE_ID, resolveModeByToken,
// resolveModeByIndex, nextMode) stay bound to the bundled 9 firmware modes:
// the ESP32 firmware only understands those fixed tokens, so they are the
// command-protocol truth regardless of DB catalogue edits.
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
    name: '4WD4M · 4WD (4M)',
    token: '4WD4M',
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

// Map from mode token to remote OLED display name (state.cpp MODE_NAMES[])
// X-8: the drive mode's token is `4WD4M`; legacy key `BT` kept for display
// lookups of cached old-token data.
export const MODE_NAMES: Record<string, string> = {
  '4WD4M': '4WD4M',
  BT: '4WD4M',
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

// -------------------------------------------------------------------
// Fleet mode-cycling order (owner matrix 2026-09-15) — the ONE source of
// truth for how the remote / app walk the 9 firmware modes. Mirrors the
// ESP remote's state.cpp MODE_CMDS[] scroll order. Every consumer (Mode
// Chooser browse, Remote nav preview, hub cycleMode) must use these
// helpers so no screen invents its own order or falls back to pool[0].
// -------------------------------------------------------------------
export const REMOTE_MODE_ORDER = [
  '4WD4M',
  'ESP_SER',
  'PATH',
  'OBS_US',
  'OBS_IR',
  'MAN',
  'AUTO',
  'ESP_CLI',
  '2WD1M',
] as const

function remoteOrderIndex(token: string): number {
  const t = token.trim().toUpperCase()
  const idx = REMOTE_MODE_ORDER.indexOf(t as (typeof REMOTE_MODE_ORDER)[number])
  return idx
}

/**
 * The mode token that follows `token` in the fleet order — ALWAYS advances
 * and wraps, never falls back to a "default" mode (the old cycleMode could
 * bounce to pool[0] when its id-lookup missed). Unknown / legacy tokens
 * (BT) start from the head of the order (4WD4M) and move to its successor.
 */
export function nextRemoteModeToken(token: string): string {
  const t = token.trim().toUpperCase()
  const idx = remoteOrderIndex(t)
  const base = idx === -1 ? 0 : idx
  return REMOTE_MODE_ORDER[(base + 1) % REMOTE_MODE_ORDER.length]
}

/**
 * Stable-sort a mode list (DB rows or bundled) into the fleet cycle order.
 * Unknown/unmapped tokens drop to the tail. Used by the chooser, the
 * remote nav preview and cycleMode so the on-screen order ALWAYS matches
 * the car's physical scroll order.
 */
export function sortRemoteModes<T extends Pick<CarMode, 'token'>>(modes: Array<T>): Array<T> {
  return [...modes].sort(
    (a, b) => (remoteOrderIndex(a.token) === -1 ? 999 : remoteOrderIndex(a.token))
      - (remoteOrderIndex(b.token) === -1 ? 999 : remoteOrderIndex(b.token)),
  )
}

// -------------------------------------------------------------------
// Product → car-mode resolution (per-package remotes)
// -------------------------------------------------------------------

/**
 * Resolve the robot-car mode a store product corresponds to, so a
 * per-package "Control" button can open the remote already configured for
 * that car. Matches, in order:
 *  1. the product `badge` when it is a CarModeId or a mode token
 *  2. the product `id` prefix (e.g. `2wd1m-basic` → `2wd1m`)
 *
 * Returns undefined for non-car products (plain kits, materials, services).
 */
export function resolveModeForProduct(product: {
  id?: string
  badge?: string
}): CarMode | undefined {
  const candidates = [product.badge, product.id].filter(Boolean) as string[]

  for (const raw of candidates) {
    const norm = raw.trim().toLowerCase()
    if (!norm) continue

    // Exact CarModeId match (badges like `2wd1m`, `self-balancing`, …)
    const byId = LOCAL_CAR_MODES.find((m) => m.id === norm)
    if (byId) return byId

    // Mode token match (badges like `2WD1M`, `AUTO`, `BT`, …)
    const tokenId = TOKEN_TO_MODE_ID[raw.trim().toUpperCase()]
    if (tokenId) {
      const byToken = LOCAL_CAR_MODES.find((m) => m.id === tokenId)
      if (byToken) return byToken
    }

    // id-prefix match (`2wd1m-basic` → `2wd1m`)
    const byPrefix = LOCAL_CAR_MODES.find((m) => norm.startsWith(`${m.id}-`))
    if (byPrefix) return byPrefix
  }

  return undefined
}