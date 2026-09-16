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
//     NACK;E=UNKNOWN_MODE;ARG=<token>   mode-token rejection (R-4 fleet)
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
  /** WiFi link signal strength % (ESP32 WiFi.getRssi() → 0..100). */
  signal?: number
  /** Uptime ms since the car booted (JSON `uptime_ms`). */
  uptimeMs?: number
  /** Free heap bytes (JSON `free_heap`) — low heap = car running tight. */
  freeHeap?: number
  /** v1.4.0 provisioning reply from the car (REPLY=WIFICFG;… on STATE lines). */
  reply?: string
  /** v1.4.0: car truth flags — AP broadcast id, configured SSID, stub mode. */
  ap?: string
  ssid?: string
  stub?: boolean
  /**
   * R-4 fleet parity: the car replies `NACK;E=UNKNOWN_MODE;ARG=<token>` (or
   * `:` separators) when it does not recognize a sent mode token. The app
   * surfaces the rejection like the remote (comms.cpp:482-513) and parks the
   * token as car-truth stub. `nackArg` is the rejected token as sent (not yet
   * canonicalized); consumers canonicalize via canonicalCarToken().
   */
  nackError?: string
  nackArg?: string
  /**
   * R-10 (2026-09-15 fleet): the car broadcasts its complete per-token
   * availability table on every STATE send — `CAPS;4WD4M:LIVE;ESP_SER:LIVE;
   * PATH:CS;…;2WD1M:CS` (device order, no trailing `;`), also carried in the
   * WS JSON as `"caps": {"4WD4M":"LIVE", …}`. Values are LIVE / WIP / CS.
   * CAPS is authoritative per token; it replaces the old single-current-mode
   * stub flag (kept for back-compat with v1.4.0 cars).
   */
  caps?: Record<string, string>
  /**
   * T-49/A-27 (device-round-5): the wireless car's saved-router registry,
   * names only — WS JSON `"networks":["a","b",…]`. The app mirrors it in
   * DevicePrefs (per car) for the WiFi & Router panel. NEVER contains
   * passwords (the car never sends them off-device — W-14).
   */
  networks?: string[]
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

/**
 * Build a T-48 router-registry line for the wireless car (v1.7.1), sent over
 * ANY live link (the car dispatches ROUTERS;* from its system-command hook in
 * every mode). The car is the source of truth for the saved list; passwords
 * never leave the car's NVS (W-14). `USE` switches the car's ACTIVE pair and
 * rejoins the router — the server stays up, so a linked WS survives (T-34).
 * Semicolons are stripped from SSID/password (the protocol splits on ';').
 */
export function buildRouterCommand(op: 'LIST' | 'ADD' | 'USE' | 'DEL', ssid: string, pass = ''): string {
  const s = ssid.replace(/;/g, '').trim()
  if (!s) return 'ROUTERS;LIST'
  if (op === 'ADD') return `ROUTERS;ADD;${s};${pass.replace(/;/g, '')}`
  return `ROUTERS;${op};${s}`
}

/**
 * Build the v1.4.0 WiFi provisioning line: WIFICFG;<ssid>;<password>.
 * Sent over the Bluetooth SPP link; the car stores the pair in Preferences
 * and switches itself to ESP_SER (router join + web page). An empty password
 * provisions an open network. The password must never be logged.
 */
export function buildWifiConfigLine(ssid: string, password: string): string {
  return `WIFICFG;${ssid};${password}`
}

// -------------------------------------------------------------------
// A-7 / R-10: car-truth mode availability (3-state per token)
// -------------------------------------------------------------------

/**
 * Per-token availability a car may announce (CAPS wire / `caps` JSON).
 *   LIVE  – drives today
  *   WIP   – WORK IN PROGRESS (works in progress / partially wired) — NOT live yet
 *   CS    – COMING SOON (parked) — NOT live yet
 * Controllers render the state as a mark (drawAvailMarkBody parity) and the
 * car renders its own frame; every token stays selectable so app and device
 * can toggle across all 9 modes.
 */
export type ModeAvailReport = 'LIVE' | 'WIP' | 'CS'

/**
 * Fallback stub table for tokens the paired car has NOT reported yet.
 *
 * Owner decision 2026-09-15: unreported tokens default AVAILABLE (the fleet
 * wire lets every car drive every mode it recognizes, and a mode wait all of
 * a car's tokens announced up-front). The only hard exception is MAN —
 * RF-manual needs the RF handset, which no GENUM car carries, so it stays
 * COMING SOON fleet-wide until a handset ships.
 */
export const FALLBACK_STUB_TOKENS: ReadonlySet<string> = new Set([
  'MAN',
])

/**
 * Normalize a mode token for stub-map lookups (uppercase, trimmed).
 */
export function normalizeModeToken(token: string | null | undefined): string {
  return (token ?? '').trim().toUpperCase()
}

/**
 * X-8 legacy aliases: pre-v1.5.0 cars emit `MODE=BT` for the 4WD4M mode.
 * Receivers (this app) accept both forever; map the incoming token to the
 * new canonical one so mode mirroring and the stub map keep working against
 * old and new cars alike.
 */
export const LEGACY_TOKEN_ALIASES: Readonly<Record<string, string>> = {
  BT: '4WD4M',
}

/** Canonicalize an incoming car token (applies legacy aliases). */
export function canonicalCarToken(token: string | null | undefined): string {
  const t = normalizeModeToken(token)
  return LEGACY_TOKEN_ALIASES[t] ?? t
}

/**
 * Pure helper (A-7 / R-10): resolve a mode's availability for the paired
 * car. Resolution order:
 *  1. `carAvailMap` (from the car's CAPS broadcast) when it mentions the
 *     token — authoritative per token (LIVE / WIP / CS).
 *  2. the legacy per-token stub flag (CAP=STUB for the CURRENT mode) — for
 *     v1.4.0 cars that don't broadcast the full table yet.
 *  3. the fleet fallback: everything defaults LIVE except MAN (hard CS).
 *
 * The legacy stub map keeps filling as the car visits modes, so mixed
 * old/new fleets converge without extra controller work.
 */
export function modeAvailStatus(
  token: string | null | undefined,
  carStubMap: Record<string, boolean>,
  carAvailMap?: Record<string, string>,
): ModeAvailReport {
  const t = canonicalCarToken(token)
  if (!t) return 'CS'
  const report = carAvailMap?.[t]
  if (report === 'LIVE' || report === 'WIP' || report === 'CS') return report
  const reported = carStubMap[t]
  if (typeof reported === 'boolean') return reported ? 'CS' : 'LIVE'
  return FALLBACK_STUB_TOKENS.has(t) ? 'CS' : 'LIVE'
}

/**
 * Pure helper (A-7): whether a mode is NOT functional for the paired car
 * (either WORK IN PROGRESS or COMING SOON). Car truth wins token by token; the
 * car's CAPS table (or legacy stub map) overrides the default. Selectable
 * in every controller regardless — it only changes the mark/badge.
 */
export function isTokenComingSoon(
  token: string | null | undefined,
  carStubMap: Record<string, boolean>,
  carAvailMap?: Record<string, string>,
): boolean {
  return modeAvailStatus(token, carStubMap, carAvailMap) !== 'LIVE'
}

/** Build the AUTO calibration line: CFG;Kp:..;Ki:..;Kd:..;OUT:..;OFF:.. */
export function buildCalibration(p: { kp: number; ki: number; kd: number; out: number; off: number }): string {
  return `CFG;Kp:${p.kp.toFixed(2)};Ki:${p.ki.toFixed(3)};Kd:${p.kd.toFixed(3)};OUT:${p.out.toFixed(0)};OFF:${p.off.toFixed(2)}`
}

/**
 * Parse one GENUM telemetry line into a partial CarTelemetry. Returns an
 * empty object when the line carries no telemetry (so callers can skip it).
 * Handles:
 *   STATE;MODE=2WD1M;SPD=120;TRIM=0;STATUS=Forward  (keys use '=' or ':')
 *   TEL;Kp:12.30;Ki:0.50;Kd:3.10;OUT:050;OFF:+0.75;ANGLE:+12.34
 *   SPD<value> / SPD:<value> / SPD=<value>
 */
export function parseTelemetryLine(line: string): CarTelemetry {
  const l = line.trim()
  if (!l) return {}
  const up = l.toUpperCase()
  const telemetry: CarTelemetry = {}

  // R-4 (app half, fleet parity): the car replies `NACK;E=UNKNOWN_MODE;ARG=<token>`
  // (tolerating `:` separators — comms.cpp:482) when it does not recognize a
  // mode token it was sent. The remote marks the token a permanent stub and
  // surfaces "Not supported by car"; we parse the same line here and let the
  // consumer (useControlHub) apply the same policy.
  if (/^NACK[:;]/i.test(up)) {
    const body = l.split(/[;:]/)
    let err = ''
    let arg = ''
    for (let i = 1; i < body.length; i++) {
      const m = /^([A-Za-z]+)[:=](.*)$/.exec(body[i].trim())
      if (!m) continue
      const key = m[1].toUpperCase()
      if (key === 'E') err = m[2].trim()
      else if (key === 'ARG') arg = m[2].trim()
    }
    if (arg) {
      telemetry.nackArg = arg
      if (err) telemetry.nackError = err.toUpperCase()
    }
    return telemetry
  }

  // STATE;MODE=2WD1M;SPD=120;TRIM=0;STATUS=Forward
  // Car firmware uses '=' as key-value separator (e.g. MODE=2WD1M),
  // while older remote firmware uses ':'.  Split on ';' only and find
  // the first '=' or ':' within each token — mirrors the ESP32 remote's
  // C parser (comms.cpp: strtok_r + strchr('=' / ':')).
  if (up.startsWith('STATE')) {
    const body = l.split(';')
    for (let i = 1; i < body.length; i++) {
      const eqIdx = body[i].indexOf('=')
      const sep = eqIdx >= 0 ? eqIdx : body[i].indexOf(':')
      if (sep < 0) continue
      const key = body[i].slice(0, sep).toUpperCase()
      const val = body[i].slice(sep + 1).trim()
      if (key === 'MODE') telemetry.mode = val
      else if (key === 'SPD') telemetry.speed = Number(val) || 0
      else if (key === 'TRIM') telemetry.trim = Number(val) || 0
      else if (key === 'STATUS') telemetry.status = val
      else if (key === 'CAP') {
        // A-7 (fleet parity with the remote's R-10): the car announces the
        // CURRENT mode as a stub via CAP=STUB on its STATE lines. Bare token
        // and key=value shapes both accepted (comms.cpp emits `;CAP=STUB`).
        telemetry.stub = val.trim().toUpperCase() === 'STUB'
      } else if (key === 'REPLY') {
        // The reply payload itself contains semicolons (WIFICFG;STORED;<ssid>)
        // — rejoin everything after 'REPLY=' so it survives the split.
        const rest = body.slice(i + 1).join(';')
        telemetry.reply = rest ? `${val};${rest}` : val
        break
      } else if (key === 'AP') telemetry.ap = val
      else if (key === 'SSID') telemetry.ssid = val
      else if (key === 'IP') telemetry.ip = val
    }
    return telemetry
  }

  // R-10 (2026-09-15 fleet): the car broadcasts its COMPLETE per-token
  // availability table on every STATE send — `CAPS;4WD4M:LIVE;ESP_SER:LIVE;
  // PATH:CS;…;2WD1M:CS` (device order, no trailing ';'). Tolerates ':' or
  // '=' separators (remote comms.cpp applyCapsMap). Keyed canonical so a
  // legacy `CAPS;BT:LIVE` resolves onto the 4WD4M row.
  if (up.startsWith('CAPS')) {
    const body = l.split(';')
    const caps: Record<string, string> = {}
    for (let i = 1; i < body.length; i++) {
      const part = body[i].trim()
      if (!part) continue
      const eqIdx = part.indexOf('=')
      const sep = eqIdx >= 0 ? eqIdx : part.indexOf(':')
      if (sep <= 0) continue
      const tok = canonicalCarToken(part.slice(0, sep))
      const val = part.slice(sep + 1).trim().toUpperCase()
      if (tok && val) caps[tok] = val
    }
    if (Object.keys(caps).length > 0) telemetry.caps = caps
    return telemetry
  }

  // TEL;Kp:12.30;Ki:0.50;Kd:3.10;OUT:050;OFF:+0.75;ANGLE:+12.34
  if (up.startsWith('TEL')) {
    const body = l.replace(/^TEL[:;]/i, '')
    for (const part of body.split(';')) {
      const m = /^([A-Za-z]+)[:=](.+)$/.exec(part.trim())
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

  // SPD<value> or SPD:<value> or SPD=<value> — positive echo only (SPD0 = stop echo)
  if (/^SPD[:=]?-?[\d]+$/i.test(l)) {
    const num = Number(l.replace(/^SPD[:=]?/i, '')) || 0
    if (num > 0) telemetry.speed = num
  }

  // JSON status from the wireless-car WebServerComm (broadcast WITHOUT a
  // trailing newline): {"status":"OK","mode":"ESP_SER","connected":true,
  // "ip":"192.168.4.1","rssi":-45,"signal":62,"uptime_ms":120000,"free_heap":1048576,
  // "speed":170,...}. Maps the display + telemetry-deck fields.
  if (l.startsWith('{') && l.endsWith('}')) {
    try {
      const j = JSON.parse(l) as Record<string, unknown>
      if (typeof j.status === 'string') telemetry.status = j.status
      if (typeof j.mode === 'string') telemetry.mode = j.mode
      if (typeof j.speed === 'number') telemetry.speed = j.speed
      if (typeof j.ip === 'string') telemetry.ip = j.ip
      if (typeof j.rssi === 'number') telemetry.rssi = j.rssi
      if (typeof j.signal === 'number') telemetry.signal = j.signal
      if (typeof j.uptime_ms === 'number') telemetry.uptimeMs = j.uptime_ms
      if (typeof j.free_heap === 'number') telemetry.freeHeap = j.free_heap
      if (typeof j.connected === 'boolean') telemetry.connected = j.connected
      if (typeof j.ssid === 'string') telemetry.ssid = j.ssid
      if (typeof j.ap === 'string') telemetry.ap = j.ap
      if (typeof j.stub === 'boolean') telemetry.stub = j.stub
      // R-10: WS JSON carries the full availability table as `"caps":
      // {"4WD4M":"LIVE", "ESP_SER":"LIVE", …, "2WD1M":"CS"}`.
      if (j.caps && typeof j.caps === 'object') {
        const caps: Record<string, string> = {}
        for (const [k, v] of Object.entries(j.caps as Record<string, unknown>)) {
          const tok = canonicalCarToken(k)
          const val = String(v).trim().toUpperCase()
          if (tok && val) caps[tok] = val
        }
        if (Object.keys(caps).length > 0) telemetry.caps = caps
      }
      // T-49/A-27: saved-router registry (names only, from the car's NVS).
      if (Array.isArray(j.networks)) {
        telemetry.networks = (j.networks as unknown[])
          .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
          .map((n) => n.trim())
      }
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
