// =====================================================================
// wifiService — shared WebSocket transport for the IoT Control Panel.
//
// WHY a singleton (owner bug report 2026-09-15): each hub instance
// (ToolsScreen AND the Remote window) used to own its OWN WebSocket
// (`wsRef` inside useControlHub). Over a WiFi-only link the Remote window
// therefore had NO socket — it could not send mode tokens (the car looked
// "stuck on 4WD4M"), could not receive WS telemetry, and its connection
// section flickered out of sync with the Control Panel's still-live
// socket. Exactly ONE WebSocket must exist per car, shared by every hub
// instance — same pattern as sppService / bleService.
//
// The service owns the socket lifecycle + silent auto-reconnect (remote
// parity: 5 quiet retries at 3 s, then an error status the UI turns into
// a banner). `disconnect()` is the only manual close; unmounting a screen
// must NEVER kill a shared link (navigation-survivable, like SPP/BLE).
//
// Every inbound frame runs the shared carProtocol parser (STATE / SPD /
// TEL / CAPS / NACK / JSON), so all consumers see identical telemetry.
// =====================================================================
import { parseTelemetryLine, REQ_STATE_LINE, type CarTelemetry } from './carProtocol'

type TelemetryCallback = (t: CarTelemetry) => void
type StatusCallback = (kind: 'connecting' | 'connected' | 'disconnected' | 'error', message?: string) => void

const RECONNECT_DELAY_MS = 3000
const MAX_RECONNECTS = 5

export class WifiService {
  private socket: WebSocket | null = null
  private socketUrl: string | null = null
  private connectingMarker = false
  private manualClose = true
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private telemetryCallbacks: Set<TelemetryCallback> = new Set()
  private statusCallbacks: Set<StatusCallback> = new Set()

  get isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN
  }

  get isConnecting(): boolean {
    return this.connectingMarker
  }

  get url(): string | null {
    return this.socketUrl
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
    this.statusCallbacks.forEach((cb) => {
      try { cb(kind, message) } catch { /* drop bad listener */ }
    })
  }

  private emitTelemetry(t: CarTelemetry) {
    this.telemetryCallbacks.forEach((cb) => {
      try { cb(t) } catch { /* drop bad listener */ }
    })
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  /**
   * Open (or reuse) the WebSocket for a car at `url`. Safe to call from any
   * hub instance at any time: reuses an already-open socket to the same URL
   * (no duplicate links), otherwise closes the old one first.
   */
  async connect(url: string): Promise<void> {
    this.manualClose = false
    this.clearReconnectTimer()

    if (this.socket && this.socket.readyState === WebSocket.OPEN && this.socketUrl === url) {
      // Already live on this car — no second socket.
      this.reconnectAttempts = 0
      return
    }
    if (this.socket) {
      try { this.socket.close() } catch { /* ignore */ }
      this.socket = null
    }

    this.socketUrl = url
    this.reconnectAttempts = 0
    this.connectingMarker = true
    this.emitStatus('connecting', url)

    let socket: WebSocket
    try {
      socket = new WebSocket(url)
    } catch (e) {
      this.connectingMarker = false
      this.socket = null
      this.socketUrl = null
      this.emitStatus('error', e instanceof Error ? e.message : 'WiFi connect failed')
      throw e
    }
    this.socket = socket

    socket.onopen = () => {
      this.connectingMarker = false
      this.reconnectAttempts = 0
      if (this.socket !== socket) return
      this.emitStatus('connected', url)
    }

    socket.onmessage = (event) => {
      try {
        const raw = typeof event.data === 'string' ? event.data : ''
        if (!raw) return
        const telemetry = parseTelemetryLine(raw)
        if (Object.keys(telemetry).length > 0) this.emitTelemetry(telemetry)
      } catch (e) {
        if (__DEV__) console.warn('WiFi read handler error:', e)
      }
    }

    socket.onclose = () => {
      const isCurrent = this.socket === socket
      if (isCurrent) {
        this.socket = null
        this.socketUrl = null
      }
      this.connectingMarker = false
      // A NEWER socket replaced us (connect() closed this one to re-dial) —
      // this stale close must not emit or schedule anything.
      if (!isCurrent) return
      if (this.manualClose) {
        this.emitStatus('disconnected')
        return
      }
      this.scheduleReconnect(url)
    }

    socket.onerror = () => { /* onclose owns state + reconnect */ }
  }

  /** Silent auto-reconnect: 5 retries at RECONNECT_DELAY_MS, then error. */
  private scheduleReconnect(url: string) {
    if (this.reconnectAttempts >= MAX_RECONNECTS) {
      this.emitStatus('error', 'WiFi connection lost — reconnection failed.')
      return
    }
    this.reconnectAttempts += 1
    this.clearReconnectTimer()
    this.reconnectTimer = setTimeout(() => {
      this.connect(url).catch(() => { /* onclose status already reported */ })
    }, RECONNECT_DELAY_MS)
  }

  /** The ONLY manual teardown. Emits 'disconnected' so every hub updates. */
  async disconnect(): Promise<void> {
    this.manualClose = true
    this.clearReconnectTimer()
    this.reconnectAttempts = 0
    const s = this.socket
    this.socket = null
    this.socketUrl = null
    this.connectingMarker = false
    if (s) {
      try { s.close() } catch { /* ignore */ }
    }
    this.emitStatus('disconnected')
  }

  /** Send one GENUM command line to the car (newline terminated). */
  async sendLine(line: string): Promise<void> {
    const s = this.socket
    if (!s || s.readyState !== WebSocket.OPEN) throw new Error('Not connected')
    s.send(`${line}\n`)
  }

  /** Ask the car to re-broadcast STATE (mode/speed/trim/status). */
  async requestState(): Promise<void> {
    await this.sendLine(REQ_STATE_LINE)
  }
}

// Singleton shared by every hub instance (Control Panel + Remote window),
// the same way sppService / bleService are shared.
export const wifiService = new WifiService()