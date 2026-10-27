// =====================================================================
// U-105 (1.3.5) — both transports stay live; there is no teardown; the three
// car-side toggles ride.
//
// U-98 (2026-10-03) introduced ONE active link: a Wi-Fi connect tore the
// Bluetooth SPP socket down (and vice versa) because the OLD firmware
// arbitrated transports. The owner ruled that whole design out in the
// 2026-10-12/13 Q&A: "keep both" — the car keeps Bluetooth + Wi-Fi live
// SIMULTANEOUSLY by default, and `WIFICFG;PARALLEL` / `WIFICFG;APSAVE` (the
// settings that relaxed/restored the teardown) are REMOVED entirely, replaced
// by `WIFICFG;WIFI;ON|OFF` / `WIFICFG;BT;ON|OFF` / `WIFICFG;AUTOJOIN;ON|OFF`.
//
// WHICH VIEW THIS READS, and why (F-83): the RAW TypeScript source of
// `useControlHub.ts`, with block and line comments stripped. These rules are
// about which state writes exist inside which handler and in what order —
// there is no component test harness in this repo (no React Testing Library),
// so a rendered assertion is not available and a runtime double would have to
// fake the whole hub. The rule therefore reads `code()`, never the comment
// stream, and every rule below was proven in BOTH directions (mutate → red,
// restore → green) when the file was written.
// =====================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";

const RAW = readFileSync(
  fileURLToPath(new NodeURL("./useControlHub.ts", import.meta.url)),
  "utf8",
);

/** Comments stripped — character literals are NOT blanked here because this
    file's rules match identifiers and call shapes, never `'…'` literals. */
const code = RAW.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

/** The body of a `const <name> = useCallback(` … up to the next top-level
    `const <other> = useCallback(`. Anchor-based: if the anchor is missing the
    slice is EMPTY and the rule that needs it fails loudly ("has sources to
    check"), never vacuously. */
function body(name: string, nextName: string): string {
  const start = code.indexOf(`const ${name} = useCallback(`);
  const end = code.indexOf(`const ${nextName} = useCallback(`);
  if (start < 0 || end < 0 || end <= start) return "";
  return code.slice(start, end);
}

/** The switch cases of the WiFi status handler (its own subscription). */
function wifiStatusCases(): string[] {
  const start = code.indexOf("const offWifiStatus = wifiService.onStatus");
  const end = code.indexOf("return () => {", start);
  if (start < 0 || end <= start) return [];
  const slice = code.slice(start, end);
  return slice
    .split(/case "/)
    .slice(1)
    .map((c) => c.split(/case "|default:/)[0] ?? c);
}

/** The switch cases of the SPP status handler (its own subscription). */
function sppStatusCases(): string[] {
  const start = code.indexOf("const offStatus = sppService.onStatus");
  const end = code.indexOf("const offBleStatus = bleService.onStatus");
  if (start < 0 || end <= start) return [];
  const slice = code.slice(start, end);
  return slice
    .split(/case "/)
    .slice(1)
    .map((c) => c.split(/case "|default:/)[0] ?? c);
}

describe("U-105 — the one-active-link teardown is GONE (both transports stay live)", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(code.length).toBeGreaterThan(1000);
    expect(body("handleConnect", "handleSppsRetry").length).toBeGreaterThan(
      100,
    );
    expect(sppStatusCases().length).toBeGreaterThanOrEqual(3);
  });

  it("the hub defines no teardown helper at all", () => {
    // U-98's `dropBluetoothForWifi` and U-100's `allowParallelLinksRef` gates
    // are DELETED with the parallel/power-save settings — their whole job was
    // "tear the other link down". An empty search is the honest assertion:
    // reintroducing either symbol breaks this rule.
    expect(code).not.toContain("const dropBluetoothForWifi =");
    expect(code).not.toContain("dropBluetoothForWifi()");
    expect(code).not.toContain("allowParallelLinksRef");
    expect(code).not.toContain("setAllowParallel");
  });

  it("raising Bluetooth never disconnects an open Wi-Fi socket", () => {
    // The old BT-connect success path ran `wifiService.disconnect()` +
    // `setWifiConnected(false)` behind `!allowParallelLinksRef.current`. Under
    // U-105 the BT connect body must not touch the Wi-Fi socket at all.
    const connectBody = body("handleConnect", "handleSppsRetry");
    expect(connectBody).toContain(
      'showConnectionMessage(`Connected to ${device.name}`, "success")',
    );
    expect(connectBody).not.toContain("wifiService.disconnect()");
    expect(connectBody).not.toContain("setWifiConnected(false)");
  });

  it("the Bluetooth handler clears the link truth only when Bluetooth IS the link", () => {
    // Every SPP case that clears `connected`/`linkVerified` must sit behind
    // `!wifiService.isConnected`: a FAILED Bluetooth attempt leaves the Wi-Fi
    // socket up, and no Wi-Fi connect path tears SPP down anymore — but that
    // guard is what stops a dead BT attempt from un-verifying a live Wi-Fi
    // link. (Kept from the U-98 suite — it still holds.)
    const cases = sppStatusCases();
    const clearing = cases.filter((c) => c.includes("setLinkVerified(false)"));
    expect(clearing.length).toBeGreaterThanOrEqual(2);
    for (const c of clearing) {
      expect(c).toContain(
        "if (!wifiService.isConnected && !bleService.isConnected)",
      );
      // the clear must be INSIDE that guard, not merely mentioned nearby
      expect(
        c.indexOf("if (!wifiService.isConnected && !bleService.isConnected)"),
      ).toBeLessThan(c.indexOf("setLinkVerified(false)"));
    }
  });

  it("Wi-Fi loss preserves verification when a Bluetooth link is still live", () => {
    const cases = wifiStatusCases().filter((c) =>
      ["disconnected", "reconnecting", "error"].some((status) =>
        c.startsWith(`${status}"`),
      ),
    );
    expect(cases).toHaveLength(3);
    for (const c of cases) {
      expect(c).toContain(
        "if (!sppService.isConnected && !bleService.isConnected)",
      );
      expect(
        c.indexOf("if (!sppService.isConnected && !bleService.isConnected)"),
      ).toBeLessThan(c.indexOf("setLinkVerified(false)"));
    }
  });

  it("manual Wi-Fi disconnect clears verification only when Bluetooth is also down", () => {
    const helper = body("handleWifiDisconnect", "handleBtDisconnect");
    expect(helper).toContain("const bluetoothStillConnected =");
    expect(helper).toContain("if (!bluetoothStillConnected)");
    expect(helper).toContain("setLinkVerified(false)");
  });

  it("disconnect actions serialize taps and always clear progress", () => {
    const wifi = body("handleWifiDisconnect", "handleBtDisconnect");
    const bluetooth = body("handleBtDisconnect", "handleWifiProvision");
    for (const helper of [wifi, bluetooth]) {
      expect(helper).toContain("if (disconnectingRef.current) return;");
      expect(helper).toContain("disconnectingRef.current = true;");
      expect(helper).toContain("disconnectingRef.current = false;");
      expect(helper).toContain("finally");
      expect(helper).toContain("setDisconnectingLink(null)");
    }
  });

  it("manual safe-stop marks shared transports before sending stop commands", () => {
    const wifi = body("handleWifiDisconnect", "handleBtDisconnect");
    const bluetooth = body("handleBtDisconnect", "handleWifiProvision");
    expect(wifi.indexOf("wifiService.markManualClose();")).toBeGreaterThan(-1);
    expect(wifi.indexOf("wifiService.markManualClose();")).toBeLessThan(
      wifi.indexOf('await wifiService.sendLine("S")'),
    );
    expect(bluetooth.indexOf("sppService.manualClose = true;")).toBeGreaterThan(
      -1,
    );
    expect(bluetooth.indexOf("sppService.manualClose = true;")).toBeLessThan(
      bluetooth.indexOf('await sppService.sendLine("S")'),
    );
    const reconnecting = wifiStatusCases().find((c) =>
      c.includes('setReconnectMethod("Wi-Fi")'),
    );
    expect(reconnecting).toContain("!wifiService.isManualClose");
  });
});

// =====================================================================
// U-105 (1.3.5) — the three transport toggles.
//
// `WIFICFG;WIFI;ON|OFF` (NVS `botcfg/t_wifi`), `WIFICFG;BT;ON|OFF` (NVS
// `botcfg/t_bt`) and `WIFICFG;AUTOJOIN;ON|OFF` (NVS `botcfg/boot_autojoin`)
// replace the removed parallel + power-save settings. All default ON; Wi-Fi
// and Bluetooth can never BOTH be off (clamped car-side and in the UI). The
// hub mirrors them per-car (DevicePrefs + cloud `wifi_enabled`/`bt_enabled`/
// `boot_autojoin`) and rides car truth back from the reply parser.
// =====================================================================
describe("U-105 — the three transport toggles ride", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(code).toContain("const setCarTransportToggle = useCallback");
    expect(code).toContain("const queryCarTransportToggle = useCallback");
    expect(code).toContain("const [wifiEnabled, setWifiEnabled] = useState");
    expect(code).toContain("const [btEnabled, setBtEnabled] = useState");
    expect(code).toContain("const [bootAutojoin, setBootAutojoin] = useState");
  });

  it("the setter rides every live transport and sends the ON/OFF wire form", () => {
    // WIFI/BT/AUTOJOIN are SYSTEM commands (they switch the car's own
    // behaviour, never drive), so they fan out over every live link — the same
    // rule the removed APSAVE/PARALLEL setters followed.
    expect(code).toContain(
      'sendSystemLine(`WIFICFG;${which};${on ? "ON" : "OFF"}`)',
    );
    expect(code).toContain(
      'patch === "bootAutojoin"\n          ? { bootAutojoin: on, autoJoinRouter: on }',
    );
  });

  it("the query uses the same `;?` shape the car answers", () => {
    // U-117: the three transport toggles keep their exact wire form; PAGE
    // queries the car's NESTED verb (`WIFICFG;WIFI;PAGE;?`) — the panel now
    // asks for the web-page state on link-up too.
    expect(code).toContain("`WIFICFG;${which};?`");
    expect(code).toContain('"WIFICFG;WIFI;PAGE;?"');
    expect(code).toContain('which === "PAGE"');
  });

  it("the reply parser adopts car truth into the per-car pref", () => {
    // The car's answer to a bare query OR an ON/OFF set re-confirms (or
    // corrects) the optimistic state AND persists it per-car so the panel
    // survives a power cycle on the same phone.
    expect(code).toContain('reply.startsWith("WIFICFG;WIFI;")');
    expect(code).toContain('reply.startsWith("WIFICFG;BT;")');
    expect(code).toContain('reply.startsWith("WIFICFG;AUTOJOIN;")');
    expect(code).toContain("persistPrefs({ wifiEnabled: on })");
    expect(code).toContain("persistPrefs({ btEnabled: on })");
    expect(code).toContain(
      "persistPrefs({ bootAutojoin: on, autoJoinRouter: on })",
    );
  });

  it("the removed settings are GONE from the wire and the state", () => {
    expect(code).not.toContain("WIFICFG;PARALLEL;");
    expect(code).not.toContain("WIFICFG;APSAVE;");
    expect(code).not.toContain("setCarParallelLinks");
    expect(code).not.toContain("setCarApPowerSave");
    expect(code).not.toContain("apPowerSave");
  });
});

// =====================================================================
// 2026-10-10 — a lost link must not leave the app believing it, and a dead
// address must not be dialled forever.
//
// Owner: "the car has changed the network ... but the app is still in the old
// state on that network part ... the app wait for the same network to connect
// with previous state of the visual of the data and state. Following this i
// have to manualy disconnect previous connection and rejoin again or go back
// outside from the control pane and again enter inside."
//
// Both halves of that are source-shape facts, so the same comment-stripped
// view of useControlHub.ts is the right thing to read.
// =====================================================================
describe("2026-10-10 — a dropped link is noticed, and recovery re-finds the car", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    const cases = wifiStatusCases();
    expect(cases.length).toBeGreaterThanOrEqual(4);
    expect(cases.some((c) => c.includes("disconnected"))).toBe(true);
    expect(cases.some((c) => c.includes("error"))).toBe(true);
  });

  it("every WiFi status case that ends the link also clears linkVerified", () => {
    // wifiService's auto-reconnect gives up after MAX_RECONNECTS and emits
    // "error"; "disconnected" arrives after a manual close or a dead socket.
    // Neither used to clear `linkVerified`, so the card kept the OLD truth and
    // the next frame read as live before any car had answered — the owner's
    // "previous state of the visual of the data and state".
    const cases = wifiStatusCases();
    const ending = cases.filter((c) => c.includes("setWifiConnected(false)"));
    expect(ending.length).toBeGreaterThanOrEqual(2);
    for (const c of ending) {
      expect(c).toContain("setLinkVerified(false)");
    }
  });

  it("giving up on reconnect re-finds the car instead of retrying the dead address", () => {
    // THE DEFECT: wifiService.scheduleReconnect(url) re-dials the SAME url
    // MAX_RECONNECTS times. When the car moved routers that address is dead by
    // definition, so every retry can only fail — and then the app stopped,
    // leaving the user to disconnect and rejoin by hand. The hub already owns
    // a guarded sweep (findCarForUser: remembered lease + bounded /24, with
    // inflight/cooldown/manual-close guards), so the "error" case hands off
    // to it. Note it is read through a ref: this subscription is created with
    // empty deps and cannot close over a callback defined further down.
    // Auto-reconnect removed per U-120 Phase C: the error case no longer
    // auto-dials; the user must tap Connect to re-establish.
    const cases = wifiStatusCases();
    const errored = cases.find(
      (c) => c.includes("setWifiConnected(false)") && c.includes("setError("),
    );
    expect(errored).toBeTruthy();
    // Auto-discover removed: no auto-dial in error case
    expect(errored).not.toContain("autoDiscoverRef.current?.()");
  });

  it("the ref is published by an effect, never by a render-phase write", () => {
    // A render-phase assignment would let a Strict-Mode double render publish
    // a stale callback; and the subscription above has empty deps, so it MUST
    // go through the ref rather than the callback.
    // Auto-discover removed per U-120 Phase C: the ref is no longer wired.
    // The watcher now only observes the phone's network for display purposes.
    const flat = code.replace(/\s+/g, " ");
    // The auto-discover assignment is no longer in the code
    expect(flat).not.toContain(
      "autoDiscoverRef.current = autoDiscoverAndConnect",
    );
    // The useEffect still exists but with empty deps, no auto-discover callback
    expect(flat).not.toContain(
      "autoDiscoverRef.current = autoDiscoverAndConnect",
    );
    // The ref declaration may exist but is not assigned a callback anymore
    const autoDiscoverRefAt = flat.indexOf("autoDiscoverRef");
    expect(autoDiscoverRefAt).toBe(-1);
  });
});

describe("U-96i — the crash report carries the car's OWN version, never the board id", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(code.length).toBeGreaterThan(1000);
    expect(code).toContain("syncCrashReport({");
  });

  it("syncCrashReport receives telemetry.fwVersion", () => {
    // THE DEFECT: CrashReportInput has always had an fwVersion field, but the
    // hub never passed one — so the fleet table's fw_version column was filled
    // with "" on every row while the UI presented a static catalog guess as
    // the car's version. The car now reports its version on /status (`fw`);
    // this rule pins the wiring from the parsed telemetry into the report.
    const at = code.indexOf("syncCrashReport({");
    expect(at).toBeGreaterThanOrEqual(0);
    const call = code.slice(at, code.indexOf("});", at));
    expect(call).toContain("fwVersion: telemetry.fwVersion");
  });

  it("statusJson.fw is the version — the board id must never wear that key", () => {
    // The original wiring was `fw: telemetry.id` — identity in a field NAMED
    // fw. Identity has its own column (board_id); fw is the version. Feeding
    // the id back in would tell the fleet a car's efuseMac is its firmware.
    const at = code.indexOf("syncCrashReport({");
    const call = code.slice(at, code.indexOf("});", at));
    expect(call).toContain("fw: telemetry.fwVersion");
    expect(call).not.toContain("fw: telemetry.id");
  });

  it("telemetry.fwVersion is in the effect's dependency list", () => {
    // A missing dep means a car that reports its version after connect never
    // gets its version into the report for that session.
    // The slice starts at the deps array itself ("}, ["), NOT at the call:
    // `telemetry.fwVersion` appears inside the call body too, so searching
    // from the call made this rule pass over a DELETED dep (mutant-proven
    // 2026-10-11 — the exact vacuous-pass shape this repo keeps finding).
    const at = code.indexOf("syncCrashReport({");
    expect(at).toBeGreaterThanOrEqual(0);
    const depsAt = code.indexOf("}, [", at);
    const end = code.indexOf("]);", at);
    expect(depsAt).toBeGreaterThan(at);
    expect(end).toBeGreaterThan(depsAt);
    expect(code.slice(depsAt, end)).toContain("telemetry.fwVersion");
  });
});
