// U-89 - the method the page shows must follow the link actually in use.
//
// The failure this pins: connected over Wi-Fi, but the Wi-Fi controls were not
// on the screen, because the method had only ever been set by tapping a
// dropdown the user never needed to touch.
import { describe, expect, it } from "vitest";

import { effectiveMethod } from "./effectiveMethod";

const idle = { chosen: null, wifiConnected: false, bluetoothConnected: false };

describe("effectiveMethod", () => {
  it("shows Wi-Fi controls once the car is connected over Wi-Fi", () => {
    // THE regression: this used to be null, so the whole Wi-Fi list was hidden
    // on a perfectly working connection.
    expect(
      effectiveMethod({
        chosen: null,
        wifiConnected: true,
        bluetoothConnected: false,
      }),
    ).toBe("wifi");
  });

  it("shows Bluetooth controls when the link is Bluetooth", () => {
    expect(
      effectiveMethod({
        chosen: null,
        wifiConnected: false,
        bluetoothConnected: true,
      }),
    ).toBe("bluetooth");
  });

  it("prefers Wi-Fi when both links are live", () => {
    // The car keeps every transport up, and the web transport is the one the
    // owner is looking at; the panel is the Wi-Fi one.
    expect(
      effectiveMethod({
        chosen: null,
        wifiConnected: true,
        bluetoothConnected: true,
      }),
    ).toBe("wifi");
  });

  it("opens on Wi-Fi when idle and nothing chosen", () => {
    // Owner: "connection method with wifi first". An idle open shows the Wi-Fi
    // method so its controls (and the saved-network list) are on screen from
    // the start, rather than an empty page with no setup card.
    expect(effectiveMethod(idle)).toBe("wifi");
  });

  it("NEVER overrides a deliberate choice", () => {
    expect(
      effectiveMethod({
        chosen: "bluetooth",
        wifiConnected: true,
        bluetoothConnected: false,
      }),
    ).toBe("bluetooth");
    expect(
      effectiveMethod({
        chosen: "wifi",
        wifiConnected: false,
        bluetoothConnected: true,
      }),
    ).toBe("wifi");
  });

  it("keeps showing Wi-Fi while the car is mid-switch", () => {
    // The car drops the link while it moves between networks. The method must
    // not flicker to null and take the controls away mid-switch, which is
    // exactly when the user is watching them.
    expect(
      effectiveMethod({
        chosen: "wifi",
        wifiConnected: false,
        bluetoothConnected: false,
      }),
    ).toBe("wifi");
  });
});
