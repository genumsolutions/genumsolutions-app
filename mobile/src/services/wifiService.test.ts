// wifiService.test.ts — R1 (owner round 1, 2026-09-28) regression tests for
// the WiFi link's two distinct truths.
//
// The bug class: a WebSocket can OPEN while no car is on the other end (the
// phone is on the right network, the car's web layer is dead). The UI used to
// treat "socket open" as "connected", so the user got a spinner or a false
// green. These tests pin the distinction:
//   1. linkVerified is FALSE on a fresh dial and only becomes true when the
//      car actually sends a frame,
//   2. waitForCarAnswer() resolves true on the first frame,
//   3. waitForCarAnswer() resolves FALSE on silence (never hangs),
//   4. a re-dial and a manual disconnect both clear the verification,
//   5. the hard connect timeout still tears the socket down and errors.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

import { WifiService } from "./wifiService";

type FakeSocket = {
  readyState: number;
  sent: string[];
  close: () => void;
  send: (line: string) => void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
};

const OPEN = 1;
const CONNECTING = 0;

let sockets: FakeSocket[] = [];

class FakeWebSocket {
  static CONNECTING = CONNECTING;
  static OPEN = OPEN;
  static CLOSED = 3;
  readonly impl: FakeSocket;
  constructor(public url: string) {
    this.impl = {
      readyState: CONNECTING,
      sent: [],
      close: () => {
        this.impl.readyState = 3;
      },
      send: (line: string) => this.impl.sent.push(line),
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
    };
    sockets.push(this.impl);
  }
  // The service reads readyState off the INSTANCE it holds, while the test
  // drives the impl record — proxy both onto one value.
  get readyState(): number {
    return this.impl.readyState;
  }
  set readyState(value: number) {
    this.impl.readyState = value;
  }
  close() {
    this.impl.close();
  }
  send(line: string) {
    this.impl.send(line);
  }
  get onopen() {
    return this.impl.onopen;
  }
  set onopen(fn: (() => void) | null) {
    this.impl.onopen = fn;
  }
  get onmessage() {
    return this.impl.onmessage;
  }
  set onmessage(fn: ((e: { data: string }) => void) | null) {
    this.impl.onmessage = fn;
  }
  get onclose() {
    return this.impl.onclose;
  }
  set onclose(fn: (() => void) | null) {
    this.impl.onclose = fn;
  }
  get onerror() {
    return this.impl.onerror;
  }
  set onerror(fn: (() => void) | null) {
    this.impl.onerror = fn;
  }
}

/** The socket the service just built, opened by the fake handshake. */
function latest(): FakeSocket {
  const socket = sockets[sockets.length - 1];
  if (!socket) throw new Error("no socket was created");
  return socket;
}

function open(socket: FakeSocket) {
  socket.readyState = OPEN;
  socket.onopen?.();
}

function feed(socket: FakeSocket, line: string) {
  socket.onmessage?.({ data: line });
}

beforeEach(() => {
  sockets = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("WifiService link verification (R1)", () => {
  it("is NOT verified just because the socket opened", async () => {
    const service = new WifiService();
    const pending = service.connect("ws://192.168.245.1:81");
    open(latest());
    await pending;
    // Transport is up, the car has said nothing.
    expect(service.isConnected).toBe(true);
    expect(service.linkVerified).toBe(false);
  });

  it("becomes verified when the car answers with STATE", async () => {
    const service = new WifiService();
    const pending = service.connect("ws://192.168.245.1:81");
    open(latest());
    await pending;
    feed(latest(), "STATE;MODE=4WD4M;SPD=0;STATUS=Stopped");
    expect(service.linkVerified).toBe(true);
  });

  it("waitForCarAnswer resolves true on the first inbound frame", async () => {
    const service = new WifiService();
    const pending = service.connect("ws://192.168.245.1:81");
    open(latest());
    await pending;
    const wait = service.waitForCarAnswer(1000);
    feed(latest(), "STATE;MODE=4WD4M;SPD=0;STATUS=Stopped");
    await expect(wait).resolves.toBe(true);
  });

  it("waitForCarAnswer resolves FALSE (never hangs) when the car is silent", async () => {
    const service = new WifiService();
    const pending = service.connect("ws://192.168.245.1:81");
    open(latest());
    await pending;
    await expect(service.waitForCarAnswer(30)).resolves.toBe(false);
    expect(service.linkVerified).toBe(false);
  });

  it("resolves immediately when the link is already verified", async () => {
    const service = new WifiService();
    const pending = service.connect("ws://192.168.245.1:81");
    open(latest());
    await pending;
    feed(latest(), "STATE;MODE=4WD4M;SPD=0;STATUS=Stopped");
    await expect(service.waitForCarAnswer(5000)).resolves.toBe(true);
  });

  it("clears verification on a re-dial to another car", async () => {
    const service = new WifiService();
    const first = service.connect("ws://192.168.245.1:81");
    open(latest());
    await first;
    feed(latest(), "STATE;MODE=4WD4M;SPD=0;STATUS=Stopped");
    expect(service.linkVerified).toBe(true);

    // A different URL = a new car: the new dial must re-prove itself.
    const second = service.connect("ws://192.168.1.42:81");
    open(latest());
    await second;
    expect(service.linkVerified).toBe(false);
  });

  it("clears verification on manual disconnect", async () => {
    const service = new WifiService();
    const pending = service.connect("ws://192.168.245.1:81");
    open(latest());
    await pending;
    feed(latest(), "STATE;MODE=4WD4M;SPD=0;STATUS=Stopped");
    expect(service.linkVerified).toBe(true);
    await service.disconnect();
    expect(service.linkVerified).toBe(false);
    expect(service.isConnected).toBe(false);
  });

  it("ignores frames that are not car telemetry", async () => {
    const service = new WifiService();
    const pending = service.connect("ws://192.168.245.1:81");
    open(latest());
    await pending;
    feed(latest(), "");
    expect(service.linkVerified).toBe(false);
  });

  it("still hard-times-out a socket that never opens (R1 connect hang)", async () => {
    vi.useFakeTimers();
    const service = new WifiService();
    const statuses: string[] = [];
    service.onStatus((kind, message) =>
      statuses.push(`${kind}: ${message ?? ""}`),
    );
    void service.connect("ws://192.168.245.1:81").catch(() => undefined);
    // Never opens.
    await vi.advanceTimersByTimeAsync(8001);
    expect(statuses.some((s) => s.startsWith("error"))).toBe(true);
    expect(statuses.some((s) => s.includes("not reachable"))).toBe(true);
    expect(service.isConnected).toBe(false);
    expect(service.linkVerified).toBe(false);
  });
});
