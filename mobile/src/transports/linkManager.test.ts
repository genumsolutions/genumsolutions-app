import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LinkManager, __setStorageForTests } from "./linkManager";
import type {
  Transport,
  TransportConnectOptions,
  TransportStatus,
  TransportStatusEvent,
} from "./types";

/** Minimal in-memory stand-in for a real transport. */
function fakeTransport(
  id: string,
  opts: { hang?: boolean } = {},
): Transport & {
  sent: string[];
  connects: number;
  disconnects: number;
  fireTelemetry: (t: unknown) => void;
  fireStatus: (e: TransportStatusEvent) => void;
  setStatus: (s: TransportStatus) => void;
} {
  const telemetry = new Set<(t: unknown) => void>();
  const status = new Set<(e: TransportStatusEvent) => void>();
  let status_: TransportStatus = "idle";

  const t = {
    id: id as Transport["id"],
    label: id,
    radio: "wifi" as const,
    blurb: "",
    capabilities: ["drive", "telemetry"] as const,
    sent: [] as string[],
    connects: 0,
    disconnects: 0,
    isSupported: () => true,
    getStatus: () => status_,
    isConnected: () => status_ === "connected",
    getTargetLabel: () => null,
    getLastError: () => null,
    async connect(_o?: TransportConnectOptions) {
      t.connects += 1;
      status_ = "connecting";
      // A real native connect can hang; return a promise that never settles.
      if (opts.hang) return new Promise<void>(() => undefined);
      status_ = "connected";
    },
    async disconnect() {
      t.disconnects += 1;
      status_ = "idle";
    },
    async sendLine(line: string) {
      t.sent.push(line);
    },
    async requestState() {},
    onTelemetry(cb: (x: unknown) => void) {
      telemetry.add(cb);
      return () => telemetry.delete(cb);
    },
    onStatus(cb: (e: TransportStatusEvent) => void) {
      status.add(cb);
      return () => status.delete(cb);
    },
    fireTelemetry: (x: unknown) => telemetry.forEach((cb) => cb(x)),
    fireStatus: (e: TransportStatusEvent) => status.forEach((cb) => cb(e)),
    setStatus: (s: TransportStatus) => (status_ = s),
  };
  return t as never;
}

beforeEach(() => {
  __setStorageForTests({ getItem: async () => null, setItem: async () => {} });
});
afterEach(() => {
  __setStorageForTests(null);
  vi.useRealTimers();
});

describe("LinkManager — one active transport at a time", () => {
  it("routes sendLine only to the selected transport", async () => {
    const m = new LinkManager();
    const bt = fakeTransport("bt-classic");
    const wifi = fakeTransport("wifi-ap-ws");
    m.register(bt);
    m.register(wifi);

    await m.activate("bt-classic");
    await m.sendLine("F");
    expect(bt.sent).toEqual(["F"]);
    expect(wifi.sent).toEqual([]);

    await m.activate("wifi-ap-ws");
    await m.sendLine("B");
    expect(wifi.sent).toEqual(["B"]);
    // The BT link must not receive traffic once WiFi is selected.
    expect(bt.sent).toEqual(["F"]);
  });

  it("disconnects the previous link when switching", async () => {
    const m = new LinkManager();
    const bt = fakeTransport("bt-classic");
    const wifi = fakeTransport("wifi-ap-ws");
    m.register(bt);
    m.register(wifi);

    await m.activate("bt-classic");
    await m.activate("wifi-ap-ws");

    // This is the fix for the silent `goBt ?? goWs` preference: selecting
    // WiFi genuinely tears Bluetooth down.
    expect(bt.disconnects).toBe(1);
    expect(m.getActive()?.id).toBe("wifi-ap-ws");
  });

  it("refuses to send when nothing is selected", async () => {
    const m = new LinkManager();
    m.register(fakeTransport("wifi-ap-ws"));
    await expect(m.sendLine("F")).rejects.toThrow(/No active connection/i);
  });

  it("sendSafe never throws", async () => {
    const m = new LinkManager();
    await expect(m.sendSafe("F")).resolves.toBeUndefined();
  });

  it("marks verified only after real telemetry, not on connect", async () => {
    const m = new LinkManager();
    const wifi = fakeTransport("wifi-ap-ws");
    m.register(wifi);
    const seen: unknown[] = [];
    m.onTelemetry((t) => seen.push(t));

    await m.activate("wifi-ap-ws");
    // Transport-up is NOT car-up.
    expect(m.getState().verified).toBe(false);

    wifi.fireTelemetry({ mode: "4WD4M" });
    expect(m.getState().verified).toBe(true);
    expect(seen).toEqual([{ mode: "4WD4M" }]);
  });

  it("stops forwarding telemetry from the abandoned transport", async () => {
    const m = new LinkManager();
    const bt = fakeTransport("bt-classic");
    const wifi = fakeTransport("wifi-ap-ws");
    m.register(bt);
    m.register(wifi);
    const seen: unknown[] = [];
    m.onTelemetry((t) => seen.push(t));

    await m.activate("bt-classic");
    await m.activate("wifi-ap-ws");
    // The old link is detached, so its frames must not leak through.
    bt.fireTelemetry({ stale: true });
    expect(seen).toEqual([]);
  });

  it("surfaces a transport error into shared state", async () => {
    const m = new LinkManager();
    const wifi = fakeTransport("wifi-ap-ws");
    m.register(wifi);
    await m.activate("wifi-ap-ws");

    wifi.fireStatus({ kind: "error", message: "boom" });
    expect(m.getState().error).toBe("boom");
    expect(m.getState().verified).toBe(false);
  });

  it("clears verification on disconnect", async () => {
    const m = new LinkManager();
    const wifi = fakeTransport("wifi-ap-ws");
    m.register(wifi);
    await m.activate("wifi-ap-ws");
    wifi.fireTelemetry({ ok: true });
    expect(m.getState().verified).toBe(true);

    wifi.fireStatus({ kind: "disconnected" });
    expect(m.getState().verified).toBe(false);
  });

  it("remembers connect options per transport", async () => {
    const m = new LinkManager();
    const wifi = fakeTransport("wifi-ap-ws");
    m.register(wifi);
    await m.activate("wifi-ap-ws", { url: "ws://10.0.0.5:81" });
    // Re-selecting with no new options must reuse the remembered address.
    await m.activate("wifi-ap-ws");
    expect(wifi.connects).toBe(2);
    expect(m.getActive()?.getTargetLabel()).toBeNull();
  });

  it("rejects an unknown transport id", async () => {
    const m = new LinkManager();
    await expect(m.activate("nope" as never)).rejects.toThrow(/Unknown/i);
  });

  it("keeps the selection through deactivate but drops the link", async () => {
    const m = new LinkManager();
    const wifi = fakeTransport("wifi-ap-ws");
    m.register(wifi);
    await m.activate("wifi-ap-ws");
    await m.deactivate();
    expect(wifi.disconnects).toBe(1);
    expect(m.getActive()).toBeNull();
    expect(m.getState().verified).toBe(false);
  });
});

describe("LinkManager — F-16 bounded connect", () => {
  it("never leaves the manager stuck in 'connecting' on a hung transport", async () => {
    vi.useFakeTimers();
    const m = new LinkManager();
    m.register(fakeTransport("wifi-ap-ws", { hang: true }));

    let caught: unknown = null;
    const attempt = m.activate("wifi-ap-ws").catch((e) => {
      caught = e;
    });

    // The manager must resolve to a definite error state, not hang.
    await vi.advanceTimersByTimeAsync(20000);
    await attempt;

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/did not finish connecting/i);

    const s = m.getState();
    expect(s.status).not.toBe("connecting");
    expect(s.error).toMatch(/did not finish connecting/i);
    expect(s.verified).toBe(false);
  }, 10000);
});
