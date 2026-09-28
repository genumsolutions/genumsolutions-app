// sppService.test.ts — F-33 regression: an explicit disconnect() must arm a
// SHARED "manual close" gate so the SPP auto-reconnect does not silently
// undo it.
//
// The bug: useControlHub is instantiated once per screen (Drive Deck AND the
// still-mounted Control Panel). Auto-reconnect was gated only on each
// instance's own manualCloseRef, so a disconnect taken in the Drive Deck was
// seen by the other instance as an UNEXPECTED loss and it auto-re-dialed ~1s
// later — "it takes two times to disconnect". The gate is now also keyed on
// sppService.manualClose, which connect()/disconnect() own.
import { describe, expect, it, vi } from "vitest";

vi.mock("./logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

vi.mock("react-native", () => ({
  NativeModules: { RNBluetoothClassic: {} },
  PermissionsAndroid: {
    PERMISSIONS: {
      BLUETOOTH_SCAN: "android.permission.BLUETOOTH_SCAN",
      BLUETOOTH_CONNECT: "android.permission.BLUETOOTH_CONNECT",
      ACCESS_FINE_LOCATION: "android.permission.ACCESS_FINE_LOCATION",
    },
    RESULTS: { GRANTED: "granted" },
    requestMultiple: vi.fn(async () => ({
      "android.permission.BLUETOOTH_SCAN": "granted",
      "android.permission.BLUETOOTH_CONNECT": "granted",
    })),
  },
  Platform: { OS: "android", Version: 34 },
}));

vi.mock("react-native-bluetooth-classic", () => ({
  default: {
    connectToDevice: vi.fn(async () => "Connected"),
    disconnectFromDevice: vi.fn(async () => undefined),
    onDeviceRead: vi.fn(() => ({ remove: vi.fn() })),
    onDeviceDisconnected: vi.fn(() => ({ remove: vi.fn() })),
  },
}));

import { SppService } from "./sppService";

const MAC = "11:22:33:44:55:66";

describe("SppService — shared manualClose reconnect gate (F-33)", () => {
  it("arms auto-reconnect by default", () => {
    expect(new SppService().manualClose).toBe(false);
  });

  it("an explicit disconnect() arms the gate for EVERY screen", async () => {
    const s = new SppService();
    await s.disconnect();
    expect(s.manualClose).toBe(true);
  });

  it("disconnect() arms the gate even when nothing is connected", async () => {
    const s = new SppService();
    await s.disconnect();
    expect(s.manualClose).toBe(true);
    await s.disconnect(); // idempotent
    expect(s.manualClose).toBe(true);
  });

  it("the next connect() re-arms auto-reconnect (losses are unexpected again)", async () => {
    const s = new SppService();
    await s.disconnect();
    await s.connect(MAC);
    expect(s.manualClose).toBe(false);
    expect(s.isConnected).toBe(true);
  });
});
