// U-81: the Control Panel's telemetry formatting.
//
// These are the numbers the owner is asked to trust instead of catalog prose,
// so each one is pinned where it is easy to get wrong: an unknown reading must
// dash rather than read as zero, and a real zero (speed 0, a car that has just
// booted) must NOT dash — showing "—" for a stopped car would be its own lie.
import { describe, expect, it } from "vitest";

import {
  buildCarTelemetry,
  buildRestartField,
  DASH,
  describeCar,
  formatHeap,
  formatSignal,
  formatSpeed,
  formatUptime,
} from "./telemetryFormat";

describe("formatUptime", () => {
  it("scales the unit to the magnitude", () => {
    expect(formatUptime(0)).toBe("0s");
    expect(formatUptime(9_000)).toBe("9s");
    expect(formatUptime(65_000)).toBe("1m 05s");
    expect(formatUptime(3_599_000)).toBe("59m 59s");
    expect(formatUptime(3_600_000)).toBe("1h 00m");
    expect(formatUptime(3_814_000)).toBe("1h 03m");
    expect(formatUptime(45_000_000)).toBe("12h 30m");
  });

  it("dashes when the car has not reported an uptime", () => {
    expect(formatUptime(undefined)).toBe("—");
    expect(formatUptime(null)).toBe("—");
    expect(formatUptime(Number.NaN)).toBe("—");
    expect(formatUptime(-1)).toBe("—");
  });
});

describe("formatSignal", () => {
  it("reads dBm and grades it", () => {
    expect(formatSignal({ rssi: -42 })).toEqual({
      value: "-42 dBm",
      quality: "Excellent",
      tone: "good",
    });
    expect(formatSignal({ rssi: -60 }).quality).toBe("Good");
    expect(formatSignal({ rssi: -70 }).quality).toBe("Fair");
    expect(formatSignal({ rssi: -88 }).quality).toBe("Weak");
  });

  it("marks a weak signal as bad so it is visibly not fine", () => {
    expect(formatSignal({ rssi: -88 }).tone).toBe("bad");
    expect(formatSignal({ rssi: -50 }).tone).toBe("good");
  });

  it("falls back to a 0-100 reading when there is no dBm", () => {
    expect(formatSignal({ signal: 80 }).value).toBe("80%");
    expect(formatSignal({ signal: 10 }).tone).toBe("bad");
  });

  it("treats a bare 0 dBm as unknown, not as a perfect reading", () => {
    // Several firmwares report rssi 0 to mean "no reading". Printing "0 dBm"
    // would look like the strongest possible signal.
    expect(formatSignal({ rssi: 0 }).value).toBe("—");
    expect(formatSignal({ rssi: 0, signal: 0 }).value).toBe("—");
  });

  it("dashes when there is no signal information at all", () => {
    expect(formatSignal({}).value).toBe("—");
    expect(formatSignal({ rssi: Number.NaN }).value).toBe("—");
    expect(formatSignal({}).quality).toBeNull();
  });

  it("prefers dBm over the percentage when the car sends both", () => {
    expect(formatSignal({ rssi: -55, signal: 90 }).value).toBe("-55 dBm");
  });
});

describe("formatHeap", () => {
  it("reports the car's free heap", () => {
    expect(formatHeap(41_000)).toBe("40 kB");
    expect(formatHeap(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  it("dashes rather than claiming 0 kB of memory", () => {
    expect(formatHeap(0)).toBe("—");
    expect(formatHeap(undefined)).toBe("—");
    expect(formatHeap(-5)).toBe("—");
  });
});

describe("formatSpeed", () => {
  it("keeps a real zero — a stopped car is stopped, not unknown", () => {
    expect(formatSpeed(0)).toBe("0");
    expect(formatSpeed(170)).toBe("170");
    expect(formatSpeed(170.4)).toBe("170");
  });

  it("dashes only for genuinely absent values", () => {
    expect(formatSpeed(undefined)).toBe("—");
    expect(formatSpeed(Number.NaN)).toBe("—");
  });
});

describe("describeCar", () => {
  it("joins only what the car actually said", () => {
    expect(
      describeCar({ mode: "4WD4M", ssid: "HomeNet", ip: "192.168.1.57" }),
    ).toBe("4WD4M  ·  HomeNet  ·  192.168.1.57");
    expect(describeCar({ mode: "4WD4M" })).toBe("4WD4M");
  });

  it("says plainly that there is no car, instead of an empty line", () => {
    expect(describeCar({})).toBe("No car reporting yet");
    expect(describeCar({ mode: "  ", ssid: "", ip: null })).toBe(
      "No car reporting yet",
    );
  });
});

describe("buildCarTelemetry", () => {
  it("shows every reading when the car is connected", () => {
    const fields = buildCarTelemetry({
      connected: true,
      mode: "4WD4M",
      speed: 170,
      rssi: -58,
      uptimeMs: 3_814_000,
      freeHeap: 41_000,
      linkLabel: "Wi-Fi",
    });
    const by = Object.fromEntries(fields.map((f) => [f.label, f.value]));
    expect(by.Mode).toBe("4WD4M");
    expect(by.Speed).toBe("170");
    expect(by.Signal).toBe("-58 dBm");
    expect(by.Uptime).toBe("1h 03m");
    expect(by.Heap).toBe("40 kB");
    expect(by.Link).toBe("Wi-Fi");
    // signal quality rides as a hint, so the value stays a bare number
    expect(fields.find((f) => f.label === "Signal")?.hint).toBe("Good");
  });

  it("is uniformly offline when there is no link — no stale readings", () => {
    const fields = buildCarTelemetry({
      connected: false,
      mode: "4WD4M",
      speed: 170,
      rssi: -58,
      uptimeMs: 3_814_000,
      freeHeap: 41_000,
    });
    for (const f of fields) {
      if (f.label === "Link") {
        expect(f.value).toBe("Offline");
        expect(f.tone).toBe("bad");
      } else {
        // A disconnected page must not keep displaying the last-known numbers
        // as if they were current.
        expect(f.value, f.label).toBe("—");
        expect(f.tone, f.label).toBe("muted");
      }
    }
  });

  it("dashes the readings a connected car did not send, and keeps the zeros", () => {
    const fields = buildCarTelemetry({ connected: true, speed: 0 });
    const by = Object.fromEntries(fields.map((f) => [f.label, f.value]));
    expect(by.Speed).toBe("0"); // real reading
    expect(by.Mode).toBe("—"); // not sent
    expect(by.Signal).toBe("—");
    expect(by.Link).toBe("Connected"); // connected, but no label offered
  });

  it("uses the car's reported mode, not an optimistic guess", () => {
    // The app can briefly display a mode the car has not confirmed. The strip
    // must render what the car said, so a refusal cannot be papered over.
    const fields = buildCarTelemetry({ connected: true, mode: " 4WD4M " });
    expect(fields[0]!.value).toBe("4WD4M");
  });
});

// ---- U-95/F-79: the restart record ----

describe("buildRestartField", () => {
  it("shows NO ROW when the car reports nothing — a dash would imply all-clear", () => {
    // Firmware older than 1.2.0 has no crash_count. Rendering a dash or, worse,
    // a green "None" would tell the owner a car that never checked is healthy.
    expect(buildRestartField({ connected: true })).toBeNull();
    expect(
      buildRestartField({ connected: true, crashCount: null, bootCount: null }),
    ).toBeNull();
  });

  it("shows a real zero as 'None', not as a dash", () => {
    const f = buildRestartField({
      connected: true,
      crashCount: 0,
      bootCount: 7,
    });
    expect(f).toEqual({
      label: "Restarts",
      value: "None",
      tone: "good",
      hint: "7 clean boots",
    });
  });

  it("names the reason AND the phase when the car crashed", () => {
    // This is the whole point of U-95: "it resets again and again" becomes a
    // specific operation, which is the difference between a feeling and a bug.
    const f = buildRestartField({
      connected: true,
      crashCount: 12,
      resetReason: "TASK_WDT",
      lastCrashPhase: "http-root",
    });
    expect(f?.value).toBe("12");
    expect(f?.tone).toBe("bad");
    expect(f?.hint).toBe("TASK_WDT during http-root");
  });

  it("survives a crash with no reason or phase reported", () => {
    const f = buildRestartField({ connected: true, crashCount: 3 });
    expect(f?.value).toBe("3");
    expect(f?.tone).toBe("bad");
    expect(f?.hint).toBeUndefined();
  });

  it("mentions the heap only when it is small enough to be the cause", () => {
    // A healthy heap number on every crash is noise.
    expect(
      buildRestartField({
        connected: true,
        crashCount: 1,
        lastCrashHeap: 38000,
      })?.hint,
    ).toBe("low heap 37 kB");
    expect(
      buildRestartField({
        connected: true,
        crashCount: 1,
        lastCrashHeap: 900_000,
      })?.hint,
    ).toBeUndefined();
  });

  it("does not present a stale record as current when the car is offline", () => {
    // Last seen was 12 crashes; showing "12" now would state a fact about a car
    // we are not currently talking to.
    const f = buildRestartField({
      connected: false,
      crashCount: 12,
      resetReason: "TASK_WDT",
    });
    expect(f).toEqual({ label: "Restarts", value: DASH, tone: "muted" });
  });

  it("says the firmware is too old rather than implying a clean car", () => {
    // boot_count but no crash_count is a partial record, not a clean bill.
    const f = buildRestartField({ connected: true, bootCount: 4 });
    expect(f?.value).toBe(DASH);
    expect(f?.tone).toBe("muted");
    expect(f?.hint).toBe("Firmware too old to report restarts");
  });
});
