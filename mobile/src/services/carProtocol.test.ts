import { describe, expect, it } from "vitest";

import { nextRemoteModeToken, sortRemoteModes } from "../config/roboCarCatalog";
import {
  SPEED_MAX,
  SPEED_MIN,
  SPEED_STEP,
  buildCalibration,
  buildSpd,
  buildSteer,
  buildServo,
  buildTrim,
  buildWifiConfigLine,
  buildRouterCommand,
  OWN_AP_NAME,
  OWN_AP_NAMES,
  isOwnApName,
  DEFAULT_AP_IP,
  DEFAULT_WS_URL,
  ESTOP_LINE,
  isAllowedDriveStatus,
  isCompleteJsonObject,
  canonicalCarToken,
  isTokenComingSoon,
  modeAvailStatus,
  parseTelemetryLine,
  parseCapsBody,
  quantizeSpeedToStep,
  REQ_STATE_LINE,
  statusToDirection,
} from "./carProtocol";

describe("speed grid parity (ESP remote config.h)", () => {
  it("exposes the ESP remote speed envelope", () => {
    expect(SPEED_MIN).toBe(100);
    expect(SPEED_MAX).toBe(255);
    expect(SPEED_STEP).toBe(5);
  });

  it("quantizes to the nearest step inside the envelope", () => {
    expect(quantizeSpeedToStep(122)).toBe(120);
    expect(quantizeSpeedToStep(123)).toBe(125);
    expect(quantizeSpeedToStep(100)).toBe(100);
    expect(quantizeSpeedToStep(255)).toBe(255);
  });

  it("clamps below the floor and above the ceiling (car never drives below SPEED_MIN)", () => {
    expect(quantizeSpeedToStep(0)).toBe(SPEED_MIN);
    expect(quantizeSpeedToStep(99)).toBe(SPEED_MIN);
    expect(quantizeSpeedToStep(256)).toBe(SPEED_MAX);
    expect(quantizeSpeedToStep(9999)).toBe(SPEED_MAX);
  });
});

describe("status whitelist + direction mapping", () => {
  it("accepts exactly the ESP remote whitelist (case-insensitive prefix)", () => {
    expect(isAllowedDriveStatus("Forward")).toBe(true);
    expect(isAllowedDriveStatus("FORWARD")).toBe(true);
    expect(isAllowedDriveStatus("Steer Left")).toBe(true);
    expect(isAllowedDriveStatus("EMERGENCY STOP")).toBe(true);
    expect(isAllowedDriveStatus("Speed set")).toBe(true);
  });

  it("rejects unknown / verbose car-internal statuses", () => {
    expect(isAllowedDriveStatus("")).toBe(false);
    expect(isAllowedDriveStatus(null)).toBe(false);
    expect(isAllowedDriveStatus(undefined)).toBe(false);
    expect(isAllowedDriveStatus("some verbose wifi json status")).toBe(false);
  });

  it("maps whitelisted statuses to d-pad directions", () => {
    expect(statusToDirection("Forward")).toBe("F");
    expect(statusToDirection("Backward")).toBe("B");
    expect(statusToDirection("Left")).toBe("L");
    expect(statusToDirection("Steer Right")).toBe("R");
    expect(statusToDirection("Stopped")).toBe("S");
    expect(statusToDirection("EMERGENCY STOP")).toBe("S");
  });

  it("maps non-directional statuses to null", () => {
    expect(statusToDirection("Speed set")).toBeNull();
    expect(statusToDirection("Trim updated")).toBeNull();
    expect(statusToDirection("garbage")).toBeNull();
    expect(statusToDirection(null)).toBeNull();
  });
});

describe("command builders (wire format)", () => {
  it("builds newline-terminated-free command lines the car parses", () => {
    expect(buildSpd(120.4)).toBe("SPD120");
    expect(buildServo(90)).toBe("SERVO90");
    // R-20: STEER is the steering travel LIMIT (max |servo − 90|, 10..90),
    // not direct degrees — always positive.
    expect(buildSteer(45.6)).toBe("STEER46");
    expect(buildSteer(90)).toBe("STEER90");
    expect(buildTrim(2)).toBe("TRIM2");
    expect(
      buildCalibration({ kp: 12.3, ki: 0.5, kd: 3.1, out: 50, off: 0.75 }),
    ).toBe("CFG;Kp:12.30;Ki:0.500;Kd:3.100;OUT:50;OFF:0.75");
  });

  it("exposes the fixed safety lines", () => {
    expect(ESTOP_LINE).toBe("ESTOP");
    expect(REQ_STATE_LINE).toBe("REQ_STATE");
  });
});

describe("router-registry commands + protected own network (A-40/A-46)", () => {
  it("builds the T-48 registry lines the car dispatches in every mode", () => {
    expect(buildRouterCommand("LIST", "")).toBe("ROUTERS;LIST");
    expect(buildRouterCommand("ADD", "HomeNet", "s3cret")).toBe(
      "ROUTERS;ADD;HomeNet;s3cret",
    );
    expect(buildRouterCommand("USE", "HomeNet")).toBe("ROUTERS;USE;HomeNet");
    expect(buildRouterCommand("DEL", "HomeNet")).toBe("ROUTERS;DEL;HomeNet");
  });

  it("strips semicolons from SSID/password (protocol splits on ;)", () => {
    expect(buildRouterCommand("ADD", "A;B", "pa;ss")).toBe(
      "ROUTERS;ADD;AB;pass",
    );
  });

  it("A-40: CLEAR wipes everything and ignores the ssid/pass args", () => {
    expect(buildRouterCommand("CLEAR", "any")).toBe("ROUTERS;CLEAR");
    expect(buildRouterCommand("CLEAR", "any", "secret")).toBe("ROUTERS;CLEAR");
  });

  it("A-46: exports the car OWN network the UI pins as its protected default", () => {
    expect(OWN_AP_NAME).toBe("WirelessCar_Wifi");
    expect(buildRouterCommand("DEL", OWN_AP_NAME)).toBe(
      "ROUTERS;DEL;WirelessCar_Wifi",
    );
  });

  // v2 (Genum_4WD4M_CAR, owner plan 2026-09-28): unique on-air names per car
  // + per-car AP subnets. The own-AP registry + helpers are the contract.
  it("v2: own-AP registry covers both car generations and trims input", () => {
    expect(OWN_AP_NAMES).toContain("WirelessCar_Wifi");
    expect(OWN_AP_NAMES).toContain("4WDCar_Wifi");
    expect(isOwnApName("WirelessCar_Wifi")).toBe(true);
    expect(isOwnApName(" 4WDCar_Wifi ")).toBe(true);
    expect(isOwnApName("HomeNet")).toBe(false);
    expect(isOwnApName("")).toBe(false);
  });

  it("v2: AP defaults point at the NEW car subnet (.245), never .4.x or .244", () => {
    expect(DEFAULT_AP_IP).toBe("192.168.245.1");
    expect(DEFAULT_WS_URL).toBe("ws://192.168.245.1:81");
    expect(DEFAULT_AP_IP.startsWith("192.168.4.")).toBe(false);
  });

  it("v2: WIFICFG line grammar unchanged (compat with donor firmware)", () => {
    expect(buildWifiConfigLine("HomeNet", "secret")).toBe(
      "WIFICFG;HomeNet;secret",
    );
  });
});

describe("parseTelemetryLine", () => {
  it("parses STATE with = separators (car firmware)", () => {
    expect(
      parseTelemetryLine("STATE;MODE=2WD1M;SPD=120;TRIM=0;STATUS=Forward"),
    ).toEqual({
      mode: "2WD1M",
      speed: 120,
      trim: 0,
      status: "Forward",
    });
  });

  it("parses STATE TRIP=/MSTEER= (R-19, 2WD1M family extras)", () => {
    expect(
      parseTelemetryLine(
        "STATE;MODE=2WD1M;SPD=150;TRIM=-5;TRIP=173;MSTEER=34;STATUS=Right",
      ),
    ).toEqual({
      mode: "2WD1M",
      speed: 150,
      trim: -5,
      trip: 173,
      maxSteer: 34,
      status: "Right",
    });
  });

  it("parses STATE STEER= (R-20, steering travel limit mirror)", () => {
    expect(
      parseTelemetryLine(
        "STATE;MODE=2WD1M;SPD=150;TRIM=0;STEER=45;TRIP=0;MSTEER=0;STATUS=Forward",
      ),
    ).toEqual({
      mode: "2WD1M",
      speed: 150,
      trim: 0,
      steerLimit: 45,
      trip: 0,
      maxSteer: 0,
      status: "Forward",
    });
  });

  it("parses STATE with : key separators (older remote firmware)", () => {
    expect(parseTelemetryLine("STATE;MODE:BT;SPD:150")).toEqual({
      mode: "BT",
      speed: 150,
    });
  });

  it("parses AUTO PID telemetry (TEL)", () => {
    expect(
      parseTelemetryLine(
        "TEL;Kp:12.30;Ki:0.50;Kd:3.10;OUT:050;OFF:+0.75;ANGLE:+12.34",
      ),
    ).toEqual({
      kp: 12.3,
      ki: 0.5,
      kd: 3.1,
      out: 50,
      off: 0.75,
      angle: 12.34,
    });
  });

  it("parses simple positive speed echo, ignores SPD0 stop echo", () => {
    expect(parseTelemetryLine("SPD170")).toEqual({ speed: 170 });
    expect(parseTelemetryLine("SPD:170")).toEqual({ speed: 170 });
    expect(parseTelemetryLine("SPD0")).toEqual({});
    expect(parseTelemetryLine("SPD-5")).toEqual({});
  });

  it("parses the wireless-car JSON status broadcast", () => {
    const line =
      '{"status":"OK","mode":"ESP_SER","connected":true,"ip":"192.168.4.1","rssi":-45,"speed":170}';
    expect(parseTelemetryLine(line)).toEqual({
      status: "OK",
      mode: "ESP_SER",
      connected: true,
      ip: "192.168.4.1",
      rssi: -45,
      speed: 170,
    });
  });

  it("returns empty for noise / empty lines", () => {
    expect(parseTelemetryLine("")).toEqual({});
    expect(parseTelemetryLine("   ")).toEqual({});
    expect(parseTelemetryLine("OK")).toEqual({});
    expect(parseTelemetryLine("{not json")).toEqual({});
  });

  it("parses the v1.4.0 provisioning reply (REPLY=WIFICFG;…)", () => {
    expect(
      parseTelemetryLine(
        "STATE;MODE=ESP_SER;SPD=170;STATUS=Stopped;REPLY=WIFICFG;STORED;HomeNet",
      ),
    ).toEqual({
      mode: "ESP_SER",
      speed: 170,
      status: "Stopped",
      reply: "WIFICFG;STORED;HomeNet",
    });
  });

  it("parses the v1.4.0 WiFi truth flags in JSON status (ssid/ap/stub)", () => {
    const line =
      '{"status":"OK","mode":"ESP_SER","stub":false,"ssid":"HomeNet","ap":"ESP32_Car_abc123"}';
    expect(parseTelemetryLine(line)).toEqual({
      status: "OK",
      mode: "ESP_SER",
      stub: false,
      ssid: "HomeNet",
      ap: "ESP32_Car_abc123",
    });
  });

  it("parses AP= / SSID= keys on STATE lines", () => {
    expect(
      parseTelemetryLine("STATE;MODE=ESP_SER;AP=ESP32_Car_1;SSID=HomeNet"),
    ).toEqual({
      mode: "ESP_SER",
      ap: "ESP32_Car_1",
      ssid: "HomeNet",
    });
  });

  // ---- R-13: the car announces its live reachable IP ----

  it("parses the IP= key on STATE lines (v1.5.0 webserver mode)", () => {
    expect(
      parseTelemetryLine("STATE;MODE=ESP_SER;IP=192.168.1.42;SSID=HomeNet"),
    ).toEqual({
      mode: "ESP_SER",
      ip: "192.168.1.42",
      ssid: "HomeNet",
    });
  });

  it("parses signal / uptime_ms / free_heap from the WS JSON deck fields", () => {
    const line =
      '{"status":"OK","mode":"ESP_SER","ip":"192.168.4.1","rssi":-60,"signal":55,"uptime_ms":152000,"free_heap":1203456,"speed":170}';
    expect(parseTelemetryLine(line)).toEqual({
      status: "OK",
      mode: "ESP_SER",
      ip: "192.168.4.1",
      rssi: -60,
      signal: 55,
      uptimeMs: 152000,
      freeHeap: 1203456,
      speed: 170,
    });
  });

  // ---- A-7: per-token car-truth stub map ----

  it("parses CAP=STUB on STATE lines (bare token shape)", () => {
    expect(
      parseTelemetryLine("STATE;MODE=PATH;SPD=170;STATUS=Stopped;CAP=STUB"),
    ).toEqual({
      mode: "PATH",
      speed: 170,
      status: "Stopped",
      stub: true,
    });
  });

  it("ignores CAP values other than STUB", () => {
    expect(parseTelemetryLine("STATE;MODE=BT;CAP=LIVE")).toEqual({
      mode: "BT",
      stub: false,
    });
  });

  it("parses CAP=STUB in the key=value shape with other trailing keys", () => {
    const t = parseTelemetryLine(
      "STATE;MODE=2WD1M;SPD=0;CAP:STUB;STATUS=Stopped",
    );
    expect(t.mode).toBe("2WD1M");
    expect(t.stub).toBe(true);
    expect(t.status).toBe("Stopped");
  });

  // ---- R-10: full per-token availability table (CAPS broadcast) ----

  it("parses the CAPS table (colon separators, device order)", () => {
    expect(
      parseTelemetryLine(
        "CAPS;4WD4M:LIVE;ESP_SER:LIVE;PATH:CS;OBS_US:CS;OBS_IR:CS;MAN:CS;AUTO:CS;ESP_CLI:WIP;2WD1M:CS",
      ),
    ).toEqual({
      caps: {
        "4WD4M": "LIVE",
        ESP_SER: "LIVE",
        PATH: "CS",
        OBS_US: "CS",
        OBS_IR: "CS",
        MAN: "CS",
        AUTO: "CS",
        ESP_CLI: "WIP",
        "2WD1M": "CS",
      },
    });
  });

  it("parses the CAPS table tolerating = separators + trailing semicolon", () => {
    expect(parseTelemetryLine("CAPS;4WD4M=LIVE;ESP_CLI=WIP;2WD1M=CS;")).toEqual(
      {
        caps: { "4WD4M": "LIVE", ESP_CLI: "WIP", "2WD1M": "CS" },
      },
    );
  });

  it("canonicalizes legacy CAPS keys (BT → 4WD4M)", () => {
    expect(parseTelemetryLine("CAPS;BT:LIVE;MAN=CS")).toEqual({
      caps: { "4WD4M": "LIVE", MAN: "CS" },
    });
  });

  it("ignores malformed CAPS lanes", () => {
    expect(parseTelemetryLine("CAPS;4WD4M:LIVE;JUNK;")).toEqual({
      caps: { "4WD4M": "LIVE" },
    });
    expect(parseTelemetryLine("CAPS;")).toEqual({});
  });

  it("parses the caps table inside the WS JSON status (object form)", () => {
    // The donor car (Genum_WIRELESS_CAR) emits the object form.
    const line =
      '{"status":"OK","mode":"ESP_SER","caps":{"4WD4M":"LIVE","MAN":"CS"}}';
    expect(parseTelemetryLine(line)).toEqual({
      status: "OK",
      mode: "ESP_SER",
      caps: { "4WD4M": "LIVE", MAN: "CS" },
    });
  });

  it("parses the caps table from the 4WD4M car's REAL string payload", () => {
    // REGRESSION (the bug this test now pins): Genum_4WD4M_CAR's
    // WebServerComm::buildStatusJson emits `caps` as a `;`-delimited STRING,
    // not an object. The old test only fed the object form, so it passed
    // while the car on the bench produced NO availability table — which made
    // every mode look available over WiFi and let the chooser send a `CS`
    // token the car accepts AND persists to NVS.
    const line =
      '{"status":"OK","mode":"4WD4M","caps":"4WD4M:LIVE;ESP_SER:CS;PATH:CS;OBS_US:CS;OBS_IR:CS;MAN:CS;AUTO:CS;ESP_CLI:CS;2WD1M:CS"}';
    const t = parseTelemetryLine(line);
    expect(t.status).toBe("OK");
    expect(t.mode).toBe("4WD4M");
    expect(t.caps).toEqual({
      "4WD4M": "LIVE",
      ESP_SER: "CS",
      PATH: "CS",
      OBS_US: "CS",
      OBS_IR: "CS",
      MAN: "CS",
      AUTO: "CS",
      ESP_CLI: "CS",
      "2WD1M": "CS",
    });
    // The safety-relevant assertion: a Coming-Soon token is now detectable,
    // so the mode chooser can mark it instead of silently offering it.
    expect(isTokenComingSoon("2WD1M", {}, t.caps!)).toBe(true);
    expect(isTokenComingSoon("ESP_SER", {}, t.caps!)).toBe(true);
    expect(isTokenComingSoon("4WD4M", {}, t.caps!)).toBe(false);
  });

  it("tolerates a string caps body with = separators and a trailing ;", () => {
    const t = parseTelemetryLine('{"caps":"4WD4M=LIVE;ESP_CLI=CS;"}');
    expect(t.caps).toEqual({ "4WD4M": "LIVE", ESP_CLI: "CS" });
  });

  it("parses a string caps body that still carries a leading CAPS element", () => {
    const t = parseTelemetryLine('{"caps":"CAPS;4WD4M:LIVE;MAN:CS"}');
    expect(t.caps).toEqual({ "4WD4M": "LIVE", MAN: "CS" });
  });

  it("parseCapsBody is shared by both carriers (same grammar)", () => {
    const body = "4WD4M:LIVE;MAN:CS";
    // The text carrier and the JSON string carrier must agree exactly.
    expect(parseCapsBody(body)).toEqual(
      parseTelemetryLine(`CAPS;${body}`).caps,
    );
  });

  // ---- R-4 (app half): fleet NACK line from the car ----

  it("parses the fleet NACK with ; separators", () => {
    expect(parseTelemetryLine("NACK;E=UNKNOWN_MODE;ARG=2WD1M")).toEqual({
      nackError: "UNKNOWN_MODE",
      nackArg: "2WD1M",
    });
  });

  it("parses the fleet NACK tolerating : separators (older remote shape)", () => {
    expect(parseTelemetryLine("NACK:E=UNKNOWN_MODE:ARG=PATH")).toEqual({
      nackError: "UNKNOWN_MODE",
      nackArg: "PATH",
    });
  });

  it("is case-insensitive and uppercases the error code (raw arg kept)", () => {
    expect(parseTelemetryLine("nack;e=unknown_mode;arg=auto")).toEqual({
      nackError: "UNKNOWN_MODE",
      nackArg: "auto",
    });
  });

  it("returns nothing when NACK has no ARG token", () => {
    expect(parseTelemetryLine("NACK;E=UNKNOWN_MODE")).toEqual({});
  });
});

describe("A-7 / R-10 car-truth availability resolution", () => {
  it("defaults unreported tokens to AVAILABLE except MAN (owner 2026-09-15)", () => {
    expect(isTokenComingSoon("PATH", {})).toBe(false);
    expect(isTokenComingSoon("MYSTERY_MODE", {})).toBe(false);
    expect(isTokenComingSoon("BT", {})).toBe(false);
    expect(isTokenComingSoon("ESP_SER", {})).toBe(false);
    // MAN is the only hard CS default (needs the RF handset).
    expect(isTokenComingSoon("MAN", {})).toBe(true);
    expect(modeAvailStatus("MAN", {})).toBe("CS");
  });

  it("car truth overrides the default per token (stub map)", () => {
    // A car whose registry parked PATH: CS.
    const map = { PATH: true };
    expect(isTokenComingSoon("PATH", map)).toBe(true);
    // Unreported tokens still default live.
    expect(isTokenComingSoon("OBS_US", map)).toBe(false);
  });

  it("car truth can PARK a default-live token", () => {
    const map = { "4WD4M": true };
    expect(isTokenComingSoon("4WD4M", map)).toBe(true);
    expect(isTokenComingSoon("BT", map)).toBe(true); // legacy alias resolves
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(isTokenComingSoon("  bt ", { BT: false })).toBe(false);
    expect(isTokenComingSoon("path", {})).toBe(false);
  });

  it("treats a missing/empty token as coming soon", () => {
    expect(isTokenComingSoon(null, {})).toBe(true);
    expect(isTokenComingSoon("", {})).toBe(true);
    expect(modeAvailStatus(null, {})).toBe("CS");
  });

  it("modeAvailStatus maps the CAPS table 3 states (LIVE/WIP/CS)", () => {
    const caps = { "4WD4M": "LIVE", ESP_CLI: "WIP", PATH: "CS" };
    expect(modeAvailStatus("4WD4M", {}, caps)).toBe("LIVE");
    expect(modeAvailStatus("ESP_CLI", {}, caps)).toBe("WIP");
    expect(modeAvailStatus("PATH", {}, caps)).toBe("CS");
    // WIP/CS are both "not live" for isTokenComingSoon.
    expect(isTokenComingSoon("ESP_CLI", {}, caps)).toBe(true);
    expect(isTokenComingSoon("PATH", {}, caps)).toBe(true);
    expect(isTokenComingSoon("4WD4M", {}, caps)).toBe(false);
  });

  it("the CAPS table wins over the per-current-stub map", () => {
    const caps = { "2WD1M": "LIVE" };
    const stub = { "2WD1M": true };
    expect(modeAvailStatus("2WD1M", stub, caps)).toBe("LIVE");
  });

  it("legacy BT resolves onto the canonical 4WD4M row in every source", () => {
    expect(modeAvailStatus("BT", {}, { "4WD4M": "LIVE" })).toBe("LIVE");
    expect(modeAvailStatus("BT", { "4WD4M": true }, {})).toBe("CS");
  });

  // ---- X-8: legacy token canonicalization ----

  it("canonicalizes legacy BT to 4WD4M", () => {
    expect(canonicalCarToken("BT")).toBe("4WD4M");
    expect(canonicalCarToken("bt")).toBe("4WD4M");
    expect(canonicalCarToken(" 4wd4m ")).toBe("4WD4M");
    expect(canonicalCarToken("ESP_SER")).toBe("ESP_SER");
  });

  it("mirrors old-car STATE MODE=BT onto the 4WD4M row (legacy alias)", () => {
    const t = parseTelemetryLine("STATE;MODE=BT;SPD=170;STATUS=Forward");
    expect(t.mode).toBe("BT"); // parser preserves the wire truth
    // …and the canonical form resolves against the new-token catalog:
    expect(modeAvailStatus(canonicalCarToken(t.mode), {})).toBe("LIVE");
  });

  it("resolves the new 4WD4M token as live via the default", () => {
    expect(isTokenComingSoon("4WD4M", {})).toBe(false);
  });
});

describe("buildWifiConfigLine (v1.4.0 provisioning)", () => {
  it("builds the WIFICFG;ssid;pass line", () => {
    expect(buildWifiConfigLine("HomeNet", "secret123")).toBe(
      "WIFICFG;HomeNet;secret123",
    );
  });

  it("allows an empty password (open network)", () => {
    expect(buildWifiConfigLine("OpenNet", "")).toBe("WIFICFG;OpenNet;");
  });
});

describe("isCompleteJsonObject", () => {
  it("detects complete newline-free JSON broadcasts", () => {
    expect(isCompleteJsonObject('{"status":"OK"}')).toBe(true);
    expect(isCompleteJsonObject('  {"a":1}  ')).toBe(true);
    expect(isCompleteJsonObject('{"a":1')).toBe(false);
    expect(isCompleteJsonObject("STATE;MODE=BT")).toBe(false);
  });
});

describe("fleet mode-cycle order (roboCarCatalog REMOTE_MODE_ORDER)", () => {
  it("advances through the 9 firmware modes in remote scroll order and wraps", () => {
    expect(nextRemoteModeToken("4WD4M")).toBe("ESP_SER");
    expect(nextRemoteModeToken("ESP_SER")).toBe("PATH");
    expect(nextRemoteModeToken("PATH")).toBe("OBS_US");
    expect(nextRemoteModeToken("OBS_US")).toBe("OBS_IR");
    expect(nextRemoteModeToken("OBS_IR")).toBe("MAN");
    expect(nextRemoteModeToken("MAN")).toBe("AUTO");
    expect(nextRemoteModeToken("AUTO")).toBe("ESP_CLI");
    expect(nextRemoteModeToken("ESP_CLI")).toBe("2WD1M");
    expect(nextRemoteModeToken("2WD1M")).toBe("4WD4M");
  });

  it("is canonical-token based: unknown tokens roll forward from the head", () => {
    expect(nextRemoteModeToken("BT")).toBe("ESP_SER");
    expect(nextRemoteModeToken("bogus-token")).toBe("ESP_SER");
    expect(nextRemoteModeToken("")).toBe("ESP_SER");
  });

  it("sorts DB/bundled mode lists into the fleet cycle order", () => {
    const shuffled = [
      { token: "2WD1M" },
      { token: "4WD4M" },
      { token: "AUTO" },
      { token: "ESP_SER" },
    ];
    expect(sortRemoteModes(shuffled).map((m) => m.token)).toEqual([
      "4WD4M",
      "ESP_SER",
      "AUTO",
      "2WD1M",
    ]);
  });

  it("drops unknown tokens to the tail and never reorders the head", () => {
    const list = [{ token: "ESP_CLI" }, { token: "MYSTERY" }, { token: "MAN" }];
    expect(sortRemoteModes(list).map((m) => m.token)).toEqual([
      "MAN",
      "ESP_CLI",
      "MYSTERY",
    ]);
  });
});

// D6 / F-66 (U-68): the car broadcasts the saved-router registry as its own
// `NETW;` line after every STATE, on EVERY transport. Before this branch
// existed the line matched nothing, so over Bluetooth the app fell back to a
// stale local mirror - the router feature existed on WiFi only.
describe("parseTelemetryLine - the NETW saved-router line (all transports)", () => {
  it("parses the registry, own AP first, names only", () => {
    const t = parseTelemetryLine("NETW;4WDCar_Wifi;HomeNet;OfficeNet");
    expect(t.networks).toEqual(["4WDCar_Wifi", "HomeNet", "OfficeNet"]);
  });

  it("accepts the ':' separator and stray spacing", () => {
    expect(parseTelemetryLine("NETW: 4WDCar_Wifi ; HomeNet ").networks).toEqual(
      ["4WDCar_Wifi", "HomeNet"],
    );
  });

  it("an empty registry is an empty list, not a missing field", () => {
    expect(parseTelemetryLine("NETW;").networks).toEqual([]);
    expect(parseTelemetryLine("NETW").networks).toEqual([]);
  });

  it("a non-NETW line does not invent a list", () => {
    expect(parseTelemetryLine("STATE;MODE=BT").networks).toBeUndefined();
  });
});
