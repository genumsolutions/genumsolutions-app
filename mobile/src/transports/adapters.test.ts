// adapters.test.ts — the Connections-Hub adapter registries.
//
// Pins the behaviors that the "both WiFi rows connected" bug class needs:
//   1. Truthful per-link status: both WiFi adapters (AP, STA) share ONE
//      process-wide socket (wifiService). A row is "connected" only when the
//      live socket's URL equals THIS transport's target — AP and STA can
//      never both light up from the same socket.
//   2. The HTTP/REST adapter: verifies by one /status round-trip, maps the
//      text protocol to the car's ACTUAL web-server routes (/forward
//      /backward /left /right /stop, /speed?val=, /mode?val=) and refuses
//      orders with no REST route. The direction-route names are pinned
//      here because the app once shipped the short forms (/f /b /l /r),
//      which the car answers with 404 (F-50).
//   3. The placeholders: isSupported()===false, connect() throws the roadmap
//      note, and the registry contains every possible comm method.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mutable singletons so tests can flip the shared socket's state.
const serviceMocks = vi.hoisted(() => {
  const wifi = {
    isConnected: false,
    isConnecting: false,
    url: null as string | null,
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    sendLine: vi.fn(async () => undefined),
    requestState: vi.fn(async () => undefined),
    waitForCarAnswer: vi.fn(async () => true),
    onTelemetry: vi.fn(() => () => undefined),
    onStatus: vi.fn(() => () => undefined),
  };
  const spp = {
    supported: true,
    isConnected: false,
    isConnecting: false,
    deviceName: null as string | null,
    currentAddress: null as string | null,
    scan: vi.fn(async () => []),
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    sendLine: vi.fn(async () => undefined),
    requestState: vi.fn(async () => undefined),
    onTelemetry: vi.fn(() => () => undefined),
    onStatus: vi.fn(() => () => undefined),
  };
  const ble = {
    isConnected: false,
    deviceName: null as string | null,
    deviceId: null as string | null,
    scan: vi.fn(async () => []),
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    sendLine: vi.fn(async () => undefined),
    requestState: vi.fn(async () => undefined),
    onTelemetry: vi.fn(() => () => undefined),
    onStatus: vi.fn(() => () => undefined),
  };
  return { wifi, spp, ble };
});
const wifiMock = serviceMocks.wifi;
const sppMock = serviceMocks.spp;
const bleMock = serviceMocks.ble;

vi.mock("../services/wifiService", () => ({ wifiService: serviceMocks.wifi }));
vi.mock("../services/sppService", () => ({ sppService: serviceMocks.spp }));
vi.mock("../services/bleService", () => ({ bleService: serviceMocks.ble }));

import { DEFAULT_WS_URL } from "../services/carProtocol";
import { linkManager } from "./linkManager";
import {
  createBleTransport,
  createHttpTransport,
  createWifiApTransport,
  createWifiStaTransport,
  registerAllTransports,
} from "./adapters";

beforeEach(() => {
  wifiMock.isConnected = false;
  wifiMock.isConnecting = false;
  wifiMock.url = null;
  wifiMock.connect.mockClear();
  wifiMock.disconnect.mockClear();
  wifiMock.waitForCarAnswer.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WiFi adapters — one shared socket, one truthful live row", () => {
  it("connects the AP row only when the socket URL is the car-hotspot URL", () => {
    const ap = createWifiApTransport();
    const sta = createWifiStaTransport();

    // Phone joined the car's hotspot, socket on 192.168.245.1.
    wifiMock.isConnected = true;
    wifiMock.url = DEFAULT_WS_URL;
    expect(ap.getStatus()).toBe("connected");
    expect(ap.isConnected()).toBe(true);
    // The OTHER wifi row must NOT report connected from the same socket.
    expect(sta.getStatus()).toBe("idle");
    expect(sta.isConnected()).toBe(false);
  });

  it("shows 'connecting' only while the shared socket is dialing its target", () => {
    const ap = createWifiApTransport();
    wifiMock.isConnecting = true;
    wifiMock.isConnected = false;
    wifiMock.url = DEFAULT_WS_URL;
    expect(ap.getStatus()).toBe("connecting");
  });

  it("binding the STA row makes it the live row, and only it", async () => {
    const ap = createWifiApTransport();
    const sta = createWifiStaTransport();

    await sta.connect({ url: "ws://10.0.0.5:81" });
    wifiMock.url = "ws://10.0.0.5:81";
    wifiMock.isConnected = true;

    expect(sta.getStatus()).toBe("connected");
    expect(sta.isConnected()).toBe(true);
    // The car-hotspot row cannot light up from a router-URL socket.
    expect(ap.getStatus()).toBe("idle");
    expect(ap.isConnected()).toBe(false);
  });
});

describe("HTTP / REST adapter", () => {
  const requested: string[] = [];
  const pathOf = (input: unknown): string => {
    const u = String(input);
    const slash = u.indexOf("/", u.indexOf("://") + 3);
    return u.slice(slash);
  };

  beforeEach(() => {
    requested.length = 0;
  });

  function stubFetch(
    handler: (path: string) => { ok: boolean; text: () => Promise<string> },
  ) {
    const fn = vi.fn(async (input: unknown) => {
      const path = pathOf(input);
      requested.push(path);
      return handler(path);
    });
    vi.stubGlobal("fetch", fn);
    return fn;
  }

  it("connects via one /status round-trip, maps the protocol to routes, emits telemetry", async () => {
    stubFetch((path) =>
      path === "/status"
        ? {
            ok: true,
            text: async () =>
              JSON.stringify({
                ok: true,
                cmd: "S",
                status: "READY",
                mode: "4WD4M",
                speed: 0,
              }),
          }
        : { ok: true, text: async () => JSON.stringify({ ok: true }) },
    );

    const http = createHttpTransport();
    const frames: Array<Record<string, unknown>> = [];
    http.onTelemetry((t) => frames.push(t as Record<string, unknown>));

    expect(http.radio).toBe("internet");
    await http.connect();
    expect(http.getStatus()).toBe("connected");
    expect(http.isConnected()).toBe(true);
    expect(http.getTargetLabel()).toBe("http://192.168.245.1:80");
    // The /status payload is telemetry, so the manager can mark 'verified'.
    expect(frames.length).toBe(1);
    expect(frames[0]).toMatchObject({ mode: "4WD4M" });

    await http.sendLine("F");
    await http.sendLine("B");
    await http.sendLine("L");
    await http.sendLine("R");
    await http.sendLine("S");
    await http.sendLine("SPD200");
    await http.sendLine("4WD4M");

    expect(requested).toContain("/status");
    // F-50: the car registers the SPELLED-OUT routes (WebServerComm.cpp
    // server.on("/forward") etc, same on the wireless donor and the 4WD4M
    // testbed). This adapter used to build /f /b /l /r and the car answered
    // 404 — direction commands failed while the link looked healthy.
    expect(requested).toContain("/forward");
    expect(requested).toContain("/backward");
    expect(requested).toContain("/left");
    expect(requested).toContain("/right");
    expect(requested).toContain("/stop");
    expect(requested).toContain("/speed?val=200");
    expect(requested).toContain("/mode?val=4WD4M");
    // The short forms must NEVER reappear: they are the bug.
    expect(requested).not.toContain("/f");
    expect(requested).not.toContain("/b");
    expect(requested).not.toContain("/l");
    expect(requested).not.toContain("/r");
  });

  it("maps emergency stop (ESTOP) and stop (S) to /stop", async () => {
    stubFetch((path) =>
      path === "/status"
        ? { ok: true, text: async () => JSON.stringify({ ok: true, cmd: "S" }) }
        : { ok: true, text: async () => JSON.stringify({ ok: true }) },
    );
    const http = createHttpTransport();
    await http.connect();
    await http.sendLine("S");
    await http.sendLine("ESTOP");
    expect(requested.filter((p) => p === "/stop").length).toBe(2);
  });

  it("routes SPD0 to /stop, NEVER to /speed (F-51)", async () => {
    // SPD0 is a neutral stop line on BT/WS. The firmware's /speed handler
    // clamps with constrain(val, MIN_SPEED, MAX_SPEED), so /speed?val=0
    // would set speed 100 and the car would DRIVE. The same "stop" command
    // meaning opposite things on two transports is the F-30 class.
    stubFetch((path) =>
      path === "/status"
        ? {
            ok: true,
            text: async () => JSON.stringify({ ok: true, status: "READY" }),
          }
        : { ok: true, text: async () => JSON.stringify({ ok: true }) },
    );
    const http = createHttpTransport();
    await http.connect();
    await http.sendLine("SPD0");
    expect(requested).toContain("/stop");
    expect(requested).not.toContain("/speed?val=0");

    // Anything below the car floor is a stop intent too, never a speed.
    await http.sendLine("SPD50");
    expect(requested).not.toContain("/speed?val=50");

    // In-window speeds still use /speed.
    await http.sendLine("SPD100");
    expect(requested).toContain("/speed?val=100");
  });

  it("refuses orders that have no REST route", async () => {
    stubFetch(() => ({
      ok: true,
      text: async () => JSON.stringify({ ok: true, cmd: "S" }),
    }));
    const http = createHttpTransport();
    await http.connect();

    await expect(http.sendLine("SERVO90")).rejects.toThrow(/no \/route/i);
    await expect(http.sendLine("ROUTERS;SCAN")).rejects.toThrow(/no \/route/i);
    expect(requested).toEqual(["/status"]); // nothing bad hit the car
  });

  it("reports 'error' (not connected) when the car does not answer", async () => {
    stubFetch(() => ({ ok: false, text: async () => "" }));
    const http = createHttpTransport();
    await expect(http.connect()).rejects.toThrow(/did not answer/);
    expect(http.getStatus()).toBe("error");
    expect(http.isConnected()).toBe(false);
    expect(http.getLastError()).toMatch(/did not answer/);
  });
});

describe("Registered placeholders and the full registry", () => {
  it("declares BLE honest: registered but not supported until firmware", () => {
    const ble = createBleTransport();
    expect(ble.isSupported()).toBe(false);
    expect(ble.getStatus()).toBe("idle");
    expect(ble.getTargetLabel()).toBeNull();
    expect(ble.roadmapNote).toMatch(/firmware/i);
  });

  it("registers every possible comm method, placeholders stay inert", async () => {
    registerAllTransports();
    const ids = linkManager.list().map((t) => t.id);
    for (const want of [
      "bt-classic",
      "bt-ble",
      "wifi-ap-ws",
      "wifi-sta-ws",
      "http",
      "mdns",
      "mqtt",
      "cloud-relay",
    ]) {
      expect(ids).toContain(want);
    }
    // The cable/USB-serial method was removed at the owner's request.
    expect(ids).not.toContain("usb-serial");
    expect(linkManager.list().length).toBe(8);

    const mdns = linkManager.get("mdns");
    const mqtt = linkManager.get("mqtt");
    const cloud = linkManager.get("cloud-relay");

    expect(mdns?.isSupported()).toBe(false);
    expect(mdns?.radio).toBe("wifi");
    expect(mqtt?.isSupported()).toBe(false);
    expect(mqtt?.radio).toBe("internet");
    expect(cloud?.isSupported()).toBe(false);
    expect(cloud?.radio).toBe("internet");

    // connect() throws the roadmap note instead of lifting a dead link.
    await expect(mdns?.connect?.()).rejects.toThrow(/mDNS/i);
    await expect(mqtt?.connect?.()).rejects.toThrow(/broker/i);
    expect(mdns?.getStatus()).toBe("idle");
    expect(mdns?.getTargetLabel()).toBeNull();
  });
});
