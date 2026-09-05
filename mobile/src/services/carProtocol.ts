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
