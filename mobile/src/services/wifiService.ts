// =====================================================================
// wifiService - shared WebSocket transport for the IoT Control Panel.
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
// The service owns the socket lifecycle — NOT the recovery. After an
// UNEXPECTED close it announces "reconnecting" (so every hub drops the
// false green immediately) and DOES NOT re-dial on its own: U-120 item 8
// (owner 2026-10-22) — "reconnecting should not be automatic, it should
// prompt the reconnect dialog box ... and only reconnect if sayed yes."
// Recovery belongs to the hub's reconnect dialog; a `connect()` only ever
// runs because the user said yes (or started a fresh connect).
// `disconnect()` is the only manual close; unmounting a screen must NEVER
// kill a shared link (navigation-survivable, like SPP/BLE).
//
// Every inbound frame runs the shared carProtocol parser (STATE / SPD /
// TEL / CAPS / NACK / JSON), so all consumers see identical telemetry.
// =====================================================================
import {
  parseTelemetryLine,
  REQ_STATE_LINE,
  type CarTelemetry,
} from "./carProtocol";
import { logger } from "./logger";

type TelemetryCallback = (t: CarTelemetry) => void;
type StatusCallback = (
  kind: "connecting" | "connected" | "disconnected" | "reconnecting" | "error",
  message?: string,
) => void;

// R1 fix (owner round 1, 2026-09-28): a WebSocket to an unreachable car can
// hang in CONNECTING forever (RN does not always fire onclose promptly), so
// "Connecting..." never resolved. Hard cap: if the socket is not OPEN
// within CONNECT_TIMEOUT_MS, tear it down and surface a real, actionable
// error.
const CONNECT_TIMEOUT_MS = 8000;
// R1 fix (owner round 1, 2026-09-28): a WebSocket can OPEN while nothing is
// really there — the phone is on the right network but the car's web layer is
// dead, so the car never answers. Transport-up is NOT car-up. After the socket
// opens we wait this long for the first inbound frame that proves the car is
// alive (STATE / CAPS / REPLY / TEL), and report the difference to the user.
const CAR_ANSWER_TIMEOUT_MS = 5000;

export class WifiService {
  private socket: WebSocket | null = null;
  private socketUrl: string | null = null;
  private connectingMarker = false;
  private manualClose = true;
  private verified = false;
  private telemetryCallbacks: Set<TelemetryCallback> = new Set();
  private statusCallbacks: Set<StatusCallback> = new Set();

  get isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  get isConnecting(): boolean {
    return this.connectingMarker;
  }

  /**
   * True once the car has actually answered on the current socket — i.e. a
   * frame came back, not merely that the TCP/WS handshake completed.
   */
  get linkVerified(): boolean {
    return this.verified;
  }

  get url(): string | null {
    return this.socketUrl;
  }

  onTelemetry(cb: TelemetryCallback): () => void {
    this.telemetryCallbacks.add(cb);
    return () => {
      this.telemetryCallbacks.delete(cb);
    };
  }

  onStatus(cb: StatusCallback): () => void {
    this.statusCallbacks.add(cb);
    return () => {
      this.statusCallbacks.delete(cb);
    };
  }

  private emitStatus(
    kind:
      "connecting" | "connected" | "disconnected" | "reconnecting" | "error",
    message?: string,
  ) {
    this.statusCallbacks.forEach((cb) => {
      try {
        cb(kind, message);
      } catch {
        /* drop bad listener */
      }
    });
  }

  private emitTelemetry(t: CarTelemetry) {
    this.telemetryCallbacks.forEach((cb) => {
      try {
        cb(t);
      } catch {
        /* drop bad listener */
      }
    });
  }

  /**
   * Open (or reuse) the WebSocket for a car at `url`. Safe to call from any
   * hub instance at any time: reuses an already-open socket to the same URL
   * (no duplicate links), otherwise closes the old one first.
   */
  async connect(url: string): Promise<void> {
    this.manualClose = false;

    if (
      this.socket &&
      this.socket.readyState === WebSocket.OPEN &&
      this.socketUrl === url
    ) {
      // Already live on this car — no second socket.
      return;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        /* ignore */
      }
      this.socket = null;
    }

    this.socketUrl = url;
    this.connectingMarker = true;
    // A fresh dial must re-prove the car: drop the previous verification.
    this.verified = false;
    this.emitStatus("connecting", url);

    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch (e) {
      this.connectingMarker = false;
      this.socket = null;
      this.socketUrl = null;
      this.emitStatus(
        "error",
        e instanceof Error ? e.message : "WiFi connect failed",
      );
      throw e;
    }
    this.socket = socket;

    // R1: hard connect timeout — never hang on "Connecting…".
    let connectTimedOut = false;
    const connectTimer = setTimeout(() => {
      if (this.socket !== socket) return; // a newer dial replaced us
      if (socket.readyState === WebSocket.OPEN) return;
      connectTimedOut = true;
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      this.connectingMarker = false;
      if (this.socket === socket) {
        this.socket = null;
        this.socketUrl = null;
      }
      this.emitStatus(
        "error",
        `Car not reachable at ${url} within ${CONNECT_TIMEOUT_MS / 1000}s. Check: phone joined the car's Wi-Fi (4WD4MCar_WiFi), the car is powered, and the IP/port are correct.`,
      );
    }, CONNECT_TIMEOUT_MS);

    socket.onopen = () => {
      clearTimeout(connectTimer);
      this.connectingMarker = false;
      if (this.socket !== socket) return;
      this.emitStatus("connected", url);
    };

    socket.onmessage = (event) => {
      try {
        const raw = typeof event.data === "string" ? event.data : "";
        if (!raw) return;
        const telemetry = parseTelemetryLine(raw);
        if (Object.keys(telemetry).length > 0) {
          // First real frame on this socket: the car is alive, not just
          // reachable. This is what makes `linkVerified` true.
          if (this.socket === socket) this.verified = true;
          this.emitTelemetry(telemetry);
        }
      } catch (e) {
        if (__DEV__) logger.warn("wifi", "read handler error:", e);
      }
    };

    socket.onclose = () => {
      clearTimeout(connectTimer);
      const isCurrent = this.socket === socket;
      if (isCurrent) {
        this.socket = null;
        this.socketUrl = null;
      }
      this.connectingMarker = false;
      // A NEWER socket replaced us (connect() closed this one to re-dial) —
      // this stale close must not emit or schedule anything. Same for the
      // timeout teardown: it already surfaced its own error.
      if (!isCurrent || connectTimedOut) return;
      if (this.manualClose) {
        this.emitStatus("disconnected");
        return;
      }
      // U-120 Phase C (owner item 8): an unexpected close announces the drop
      // (F-65: every hub clears the false green on this event) and hands
      // recovery to the hub's reconnect dialog — the service does NOT
      // re-dial. `manualClose` paths never reach here: disconnect() nulls
      // the socket first, so their close is stale; the guard above is
      // defensive parity with the pre-U-120 behaviour.
      this.verified = false;
      this.emitStatus("reconnecting", url);
    };

    socket.onerror = () => {
      /* onclose owns state; the reconnect dialog owns recovery */
    };
  }

  /** The ONLY manual teardown. Emits 'disconnected' so every hub updates. */
  async disconnect(): Promise<void> {
    this.manualClose = true;
    const s = this.socket;
    this.socket = null;
    this.socketUrl = null;
    this.connectingMarker = false;
    this.verified = false;
    if (s) {
      try {
        s.close();
      } catch {
        /* ignore */
      }
    }
    this.emitStatus("disconnected");
  }

  /**
   * Resolve once the car proves it is alive on this socket, or false after
   * `timeoutMs`. Call it right after `connect()` resolves: `connect()` only
   * proves the socket opened, this proves a car is on the other end.
   */
  waitForCarAnswer(
    timeoutMs: number = CAR_ANSWER_TIMEOUT_MS,
  ): Promise<boolean> {
    if (this.linkVerified) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let off: () => void = () => undefined;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        if (timer !== null) clearTimeout(timer);
        off();
        resolve(ok);
      };
      // Subscribe BEFORE arming the timer so a frame that lands in this tick
      // can't slip through the gap.
      off = this.onTelemetry(() => done(true));
      timer = setTimeout(() => done(false), timeoutMs);
    });
  }

  /** Send one GENUM command line to the car (newline terminated). */
  async sendLine(line: string): Promise<void> {
    const s = this.socket;
    if (!s || s.readyState !== WebSocket.OPEN) throw new Error("Not connected");
    s.send(`${line}\n`);
  }

  /** Ask the car to re-broadcast STATE (mode/speed/trim/status). */
  async requestState(): Promise<void> {
    await this.sendLine(REQ_STATE_LINE);
  }
}

// Singleton shared by every hub instance (Control Panel + Remote window),
// the same way sppService / bleService are shared.
export const wifiService = new WifiService();
