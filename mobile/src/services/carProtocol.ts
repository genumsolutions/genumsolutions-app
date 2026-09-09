// =====================================================================
// carProtocol.ts - SINGLE source of truth for the GENUM car command
// protocol on the native side.
//
// Mirrors the ESP32 remote firmware (Genum_ESP32_Remote_v1.0.0
// comms.cpp + README) and the website's lib/robo-car-transport.ts so the
// app speaks exactly the same wire protocol no matter which transport is
// used (BLE-UART, Classic BT SPP, or WiFi WebSocket):
//
//   Outgoing (app -> car), newline terminated:
//     Direction  F | B | L | R | S            (non-2WD1M modes)
//     Speed      SPD<n>    ±255 (2WD1M signed) or SPD<100..255> (absolute)
//     Servo      SERVO<n>  0..180, center 90
//     Steer      STEER<n>  -90..90 direct degrees (2WD1M)
//     Trim       TRIM<n>   steering offset, persisted on the car
//     Emergency  ESTOP
//     Mode       BT | 2WD1M | AUTO | PATH | OBS_US | OBS_IR | MAN | ESP_CLI | ESP_SER
//     Calibrate  CFG;Kp:..;Ki:..;Kd:..;OUT:..;OFF:..
//     Request    REQ_STATE
//   Incoming (car -> app):
//     (parity helpers exported: quantizeSpeedToStep, isAllowedDriveStatus,
//      statusToDirection, SPEED_MIN/MAX/STEP)
//     STATE;MODE=2WD1M;SPD=120;TRIM=0;STATUS=Forward
//     TEL;Kp:12.30;Ki:0.50;Kd:3.10;OUT:050;OFF:+0.75;ANGLE:+12.34
//     SPD<value> / SPD:<value>   simple speed feedback
//
// Transport services (bleService, sppService, the WiFi socket in the
// screens) import the builders + parser from here so one bugfix fixes
// every link.
// =====================================================================

export type CarTelemetry = {
  mode?: string
  speed?: number
  trim?: number
  status?: string
  // AUTO live PID
  kp?: number
  ki?: number
  kd?: number
  out?: number
  off?: number
  angle?: number
  // WiFi wireless-car JSON status (Genum_WIRELESS_CAR WebServerComm)
  ip?: string
  rssi?: number
  connected?: boolean
}

/** Neutral commands sent on disconnect / stale telemetry (safe stop). */
export const SAFE_STOP_LINES = ['SPD0', 'SERVO90']

// -------------------------------------------------------------------
// ESP-remote parity primitives (Genum_ESP32_Remote_v1.0.0)
// -------------------------------------------------------------------

/** ESP remote SPEED_MIN (config.h): UI speed floor. */
export const SPEED_MIN = 100
/** ESP remote SPEED_MAX (config.h): UI speed ceiling. */
export const SPEED_MAX = 255
/** ESP remote SPEED_STEP (config.h): UI speed grid. */
export const SPEED_STEP = 5

/**
 * Exact port of the ESP remote's quantizeSpeedToStep() (ui_misc.cpp):
 * snap a raw value to the nearest SPEED_STEP grid point inside
 * SPEED_MIN..SPEED_MAX. Values at/below the floor clamp to SPEED_MIN
 * (the car never drives below it), at/above the ceiling to SPEED_MAX.
 */
export function quantizeSpeedToStep(v: number, step: number = SPEED_STEP): number {
  if (v <= SPEED_MIN) return SPEED_MIN
  if (v >= SPEED_MAX) return SPEED_MAX
  const offset = v - SPEED_MIN
  const q = Math.round(offset / step) * step
  let res = SPEED_MIN + q
  if (res < SPEED_MIN) res = SPEED_MIN
  if (res > SPEED_MAX) res = SPEED_MAX
  return res
}

/**
 * Short statuses the remote may display (exact whitelist from the ESP
 * remote's isAllowedDriveStatusRemote() in state.cpp — same whitelist the
 * car uses). Anything longer/unknown (e.g. verbose WiFi-JSON statuses) is
 * ignored so the status bar never shows car-internal noise.
 */
const ALLOWED_DRIVE_STATUSES = [
  'Forward', 'Backward', 'Left', 'Right', 'Stopped', 'Stop',
  'Steer Left', 'Steer Right', 'EMERGENCY STOP', 'Speed set', 'Trim updated',
] as const

/** Case-insensitive prefix match against the whitelist. */
export function isAllowedDriveStatus(s: string | null | undefined): boolean {
  if (!s) return false
  const up = s.toUpperCase()
  return ALLOWED_DRIVE_STATUSES.some((a) => up.startsWith(a.toUpperCase()))
}

/**
 * Map a whitelisted drive status back to the direction letter it
 * represents, so the app's d-pad/joystick highlight and the OLED body
 * mirror the car even when the car was driven by its OWN buttons
 * (STATE;STATUS=Left arrives with no command from us). Returns 'S' for
 * stop statuses and null for statuses that imply no direction.
 */
export function statusToDirection(s: string | null | undefined): 'F' | 'B' | 'L' | 'R' | 'S' | null {
  if (!s) return null
  const up = s.toUpperCase()
  if (up.startsWith('FORWARD')) return 'F'
  if (up.startsWith('BACKWARD')) return 'B'
  if (up.startsWith('STEER LEFT') || up.startsWith('LEFT')) return 'L'
  if (up.startsWith('STEER RIGHT') || up.startsWith('RIGHT')) return 'R'
  if (up.startsWith('STOP') || up.startsWith('STOPPED') || up.startsWith('EMERGENCY')) return 'S'
  return null
}

/** Build a signed/absolute speed command: SPD<value>. */
export function buildSpd(value: number): string {
  return `SPD${Math.round(value)}`
}

/** Build a servo command: SERVO<angle>, 0..180 center 90. */
export function buildServo(value: number): string {
  return `SERVO${Math.round(value)}`
}

/** Build a direct steering command: STEER<degrees>, -90..90. */
export function buildSteer(value: number): string {
  return `STEER${Math.round(value)}`
}

/** Build a trim command: TRIM<offset> (persisted on the car). */
export function buildTrim(value: number): string {
  return `TRIM${Math.round(value)}`
}

export const ESTOP_LINE = 'ESTOP'
export const REQ_STATE_LINE = 'REQ_STATE'

/** Build the AUTO calibration line: CFG;Kp:..;Ki:..;Kd:..;OUT:..;OFF:.. */
export function buildCalibration(p: { kp: number; ki: number; kd: number; out: number; off: number }): string {
  return `CFG;Kp:${p.kp.toFixed(2)};Ki:${p.ki.toFixed(3)};Kd:${p.kd.toFixed(3)};OUT:${p.out.toFixed(0)};OFF:${p.off.toFixed(2)}`
}

/**
 * Parse one GENUM telemetry line into a partial CarTelemetry. Returns an
 * empty object when the line carries no telemetry (so callers can skip it).
 * Handles:
 *   STATE;MODE=2WD1M;SPD=120;TRIM=0;STATUS=Forward
 *   TEL;Kp:12.30;Ki:0.50;Kd:3.10;OUT:050;OFF:+0.75;ANGLE:+12.34
 *   SPD<value> / SPD:<value>
 */
export function parseTelemetryLine(line: string): CarTelemetry {
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

  // SPD<value> or SPD:<value> — positive echo only (SPD0 = stop echo)
  if (/^SPD[:]?-?[\d]+$/i.test(l)) {
    const num = Number(l.replace(/^SPD[:]?/i, '')) || 0
    if (num > 0) telemetry.speed = num
  }

  // JSON status from the wireless-car WebServerComm (broadcast WITHOUT a
  // trailing newline): {"status":"OK","mode":"ESP_SER","connected":true,
  // "ip":"192.168.4.1","rssi":-45,"speed":170,...}. Maps the fields we
  // display; the rest (signal/uptime/heap) are ignored.
  if (l.startsWith('{') && l.endsWith('}')) {
    try {
      const j = JSON.parse(l) as Record<string, unknown>
      if (typeof j.status === 'string') telemetry.status = j.status
      if (typeof j.mode === 'string') telemetry.mode = j.mode
      if (typeof j.speed === 'number') telemetry.speed = j.speed
      if (typeof j.ip === 'string') telemetry.ip = j.ip
      if (typeof j.rssi === 'number') telemetry.rssi = j.rssi
      if (typeof j.connected === 'boolean') telemetry.connected = j.connected
    } catch { /* not JSON — ignore */ }
  }

  return telemetry
}

/**
 * True when the buffered WebSocket text is a complete JSON object with no
 * trailing newline. The wireless-car status broadcasts look like this, so
 * transports can flush the buffer and parse it immediately instead of
 * waiting for a line terminator that never comes.
 */
export function isCompleteJsonObject(text: string): boolean {
  const t = text.trim()
  return t.startsWith('{') && t.endsWith('}')
}
