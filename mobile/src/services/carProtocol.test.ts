import { describe, expect, it } from 'vitest';

import { nextRemoteModeToken, sortRemoteModes } from '../config/roboCarCatalog';
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
  ESTOP_LINE,
  isAllowedDriveStatus,
  isCompleteJsonObject,
  canonicalCarToken,
  isTokenComingSoon,
  modeAvailStatus,
  parseTelemetryLine,
  quantizeSpeedToStep,
  REQ_STATE_LINE,
  statusToDirection,
} from './carProtocol';

describe('speed grid parity (ESP remote config.h)', () => {
  it('exposes the ESP remote speed envelope', () => {
    expect(SPEED_MIN).toBe(100);
    expect(SPEED_MAX).toBe(255);
    expect(SPEED_STEP).toBe(5);
  });

  it('quantizes to the nearest step inside the envelope', () => {
    expect(quantizeSpeedToStep(122)).toBe(120);
    expect(quantizeSpeedToStep(123)).toBe(125);
    expect(quantizeSpeedToStep(100)).toBe(100);
    expect(quantizeSpeedToStep(255)).toBe(255);
  });

  it('clamps below the floor and above the ceiling (car never drives below SPEED_MIN)', () => {
    expect(quantizeSpeedToStep(0)).toBe(SPEED_MIN);
    expect(quantizeSpeedToStep(99)).toBe(SPEED_MIN);
    expect(quantizeSpeedToStep(256)).toBe(SPEED_MAX);
    expect(quantizeSpeedToStep(9999)).toBe(SPEED_MAX);
  });
});

describe('status whitelist + direction mapping', () => {
  it('accepts exactly the ESP remote whitelist (case-insensitive prefix)', () => {
    expect(isAllowedDriveStatus('Forward')).toBe(true);
    expect(isAllowedDriveStatus('FORWARD')).toBe(true);
    expect(isAllowedDriveStatus('Steer Left')).toBe(true);
    expect(isAllowedDriveStatus('EMERGENCY STOP')).toBe(true);
    expect(isAllowedDriveStatus('Speed set')).toBe(true);
  });

  it('rejects unknown / verbose car-internal statuses', () => {
    expect(isAllowedDriveStatus('')).toBe(false);
    expect(isAllowedDriveStatus(null)).toBe(false);
    expect(isAllowedDriveStatus(undefined)).toBe(false);
    expect(isAllowedDriveStatus('some verbose wifi json status')).toBe(false);
  });

  it('maps whitelisted statuses to d-pad directions', () => {
    expect(statusToDirection('Forward')).toBe('F');
    expect(statusToDirection('Backward')).toBe('B');
    expect(statusToDirection('Left')).toBe('L');
    expect(statusToDirection('Steer Right')).toBe('R');
    expect(statusToDirection('Stopped')).toBe('S');
    expect(statusToDirection('EMERGENCY STOP')).toBe('S');
  });

  it('maps non-directional statuses to null', () => {
    expect(statusToDirection('Speed set')).toBeNull();
    expect(statusToDirection('Trim updated')).toBeNull();
    expect(statusToDirection('garbage')).toBeNull();
    expect(statusToDirection(null)).toBeNull();
  });
});

describe('command builders (wire format)', () => {
  it('builds newline-terminated-free command lines the car parses', () => {
    expect(buildSpd(120.4)).toBe('SPD120');
    expect(buildServo(90)).toBe('SERVO90');
    expect(buildSteer(-45.6)).toBe('STEER-46');
    expect(buildTrim(2)).toBe('TRIM2');
    expect(buildCalibration({ kp: 12.3, ki: 0.5, kd: 3.1, out: 50, off: 0.75 })).toBe(
      'CFG;Kp:12.30;Ki:0.500;Kd:3.100;OUT:50;OFF:0.75',
    );
  });

  it('exposes the fixed safety lines', () => {
    expect(ESTOP_LINE).toBe('ESTOP');
    expect(REQ_STATE_LINE).toBe('REQ_STATE');
  });
});

describe('parseTelemetryLine', () => {
  it('parses STATE with = separators (car firmware)', () => {
    expect(parseTelemetryLine('STATE;MODE=2WD1M;SPD=120;TRIM=0;STATUS=Forward')).toEqual({
      mode: '2WD1M',
      speed: 120,
      trim: 0,
      status: 'Forward',
    });
  });

  it('parses STATE with : key separators (older remote firmware)', () => {
    expect(parseTelemetryLine('STATE;MODE:BT;SPD:150')).toEqual({
      mode: 'BT',
      speed: 150,
    });
  });

  it('parses AUTO PID telemetry (TEL)', () => {
    expect(parseTelemetryLine('TEL;Kp:12.30;Ki:0.50;Kd:3.10;OUT:050;OFF:+0.75;ANGLE:+12.34')).toEqual({
      kp: 12.3,
      ki: 0.5,
      kd: 3.1,
      out: 50,
      off: 0.75,
      angle: 12.34,
    });
  });

  it('parses simple positive speed echo, ignores SPD0 stop echo', () => {
    expect(parseTelemetryLine('SPD170')).toEqual({ speed: 170 });
    expect(parseTelemetryLine('SPD:170')).toEqual({ speed: 170 });
    expect(parseTelemetryLine('SPD0')).toEqual({});
    expect(parseTelemetryLine('SPD-5')).toEqual({});
  });

  it('parses the wireless-car JSON status broadcast', () => {
    const line = '{"status":"OK","mode":"ESP_SER","connected":true,"ip":"192.168.4.1","rssi":-45,"speed":170}';
    expect(parseTelemetryLine(line)).toEqual({
      status: 'OK',
      mode: 'ESP_SER',
      connected: true,
      ip: '192.168.4.1',
      rssi: -45,
      speed: 170,
    });
  });

  it('returns empty for noise / empty lines', () => {
    expect(parseTelemetryLine('')).toEqual({});
    expect(parseTelemetryLine('   ')).toEqual({});
    expect(parseTelemetryLine('OK')).toEqual({});
    expect(parseTelemetryLine('{not json')).toEqual({});
  });

  it('parses the v1.4.0 provisioning reply (REPLY=WIFICFG;…)', () => {
    expect(
      parseTelemetryLine('STATE;MODE=ESP_SER;SPD=170;STATUS=Stopped;REPLY=WIFICFG;STORED;HomeNet'),
    ).toEqual({
      mode: 'ESP_SER',
      speed: 170,
      status: 'Stopped',
      reply: 'WIFICFG;STORED;HomeNet',
    });
  });

  it('parses the v1.4.0 WiFi truth flags in JSON status (ssid/ap/stub)', () => {
    const line = '{"status":"OK","mode":"ESP_SER","stub":false,"ssid":"HomeNet","ap":"ESP32_Car_abc123"}';
    expect(parseTelemetryLine(line)).toEqual({
      status: 'OK',
      mode: 'ESP_SER',
      stub: false,
      ssid: 'HomeNet',
      ap: 'ESP32_Car_abc123',
    });
  });

  it('parses AP= / SSID= keys on STATE lines', () => {
    expect(parseTelemetryLine('STATE;MODE=ESP_SER;AP=ESP32_Car_1;SSID=HomeNet')).toEqual({
      mode: 'ESP_SER',
      ap: 'ESP32_Car_1',
      ssid: 'HomeNet',
    });
  });

  // ---- R-13: the car announces its live reachable IP ----

  it('parses the IP= key on STATE lines (v1.5.0 webserver mode)', () => {
    expect(parseTelemetryLine('STATE;MODE=ESP_SER;IP=192.168.1.42;SSID=HomeNet')).toEqual({
      mode: 'ESP_SER',
      ip: '192.168.1.42',
      ssid: 'HomeNet',
    });
  });

  it('parses signal / uptime_ms / free_heap from the WS JSON deck fields', () => {
    const line = '{"status":"OK","mode":"ESP_SER","ip":"192.168.4.1","rssi":-60,"signal":55,"uptime_ms":152000,"free_heap":1203456,"speed":170}';
    expect(parseTelemetryLine(line)).toEqual({
      status: 'OK',
      mode: 'ESP_SER',
      ip: '192.168.4.1',
      rssi: -60,
      signal: 55,
      uptimeMs: 152000,
      freeHeap: 1203456,
      speed: 170,
    });
  });

  // ---- A-7: per-token car-truth stub map ----

  it('parses CAP=STUB on STATE lines (bare token shape)', () => {
    expect(parseTelemetryLine('STATE;MODE=PATH;SPD=170;STATUS=Stopped;CAP=STUB')).toEqual({
      mode: 'PATH',
      speed: 170,
      status: 'Stopped',
      stub: true,
    });
  });

  it('ignores CAP values other than STUB', () => {
    expect(parseTelemetryLine('STATE;MODE=BT;CAP=LIVE')).toEqual({ mode: 'BT', stub: false });
  });

  it('parses CAP=STUB in the key=value shape with other trailing keys', () => {
    const t = parseTelemetryLine('STATE;MODE=2WD1M;SPD=0;CAP:STUB;STATUS=Stopped');
    expect(t.mode).toBe('2WD1M');
    expect(t.stub).toBe(true);
    expect(t.status).toBe('Stopped');
  });

  // ---- R-10: full per-token availability table (CAPS broadcast) ----

  it('parses the CAPS table (colon separators, device order)', () => {
    expect(
      parseTelemetryLine('CAPS;4WD4M:LIVE;ESP_SER:LIVE;PATH:CS;OBS_US:CS;OBS_IR:CS;MAN:CS;AUTO:CS;ESP_CLI:WIP;2WD1M:CS'),
    ).toEqual({
      caps: {
        '4WD4M': 'LIVE',
        ESP_SER: 'LIVE',
        PATH: 'CS',
        OBS_US: 'CS',
        OBS_IR: 'CS',
        MAN: 'CS',
        AUTO: 'CS',
        ESP_CLI: 'WIP',
        '2WD1M': 'CS',
      },
    });
  });

  it('parses the CAPS table tolerating = separators + trailing semicolon', () => {
    expect(parseTelemetryLine('CAPS;4WD4M=LIVE;ESP_CLI=WIP;2WD1M=CS;')).toEqual({
      caps: { '4WD4M': 'LIVE', ESP_CLI: 'WIP', '2WD1M': 'CS' },
    });
  });

  it('canonicalizes legacy CAPS keys (BT → 4WD4M)', () => {
    expect(parseTelemetryLine('CAPS;BT:LIVE;MAN=CS')).toEqual({
      caps: { '4WD4M': 'LIVE', MAN: 'CS' },
    });
  });

  it('ignores malformed CAPS lanes', () => {
    expect(parseTelemetryLine('CAPS;4WD4M:LIVE;JUNK;')).toEqual({
      caps: { '4WD4M': 'LIVE' },
    });
    expect(parseTelemetryLine('CAPS;')).toEqual({});
  });

  it('parses the caps table inside the WS JSON status', () => {
    const line = '{"status":"OK","mode":"ESP_SER","caps":{"4WD4M":"LIVE","MAN":"CS"}}';
    expect(parseTelemetryLine(line)).toEqual({
      status: 'OK',
      mode: 'ESP_SER',
      caps: { '4WD4M': 'LIVE', MAN: 'CS' },
    });
  });

  // ---- R-4 (app half): fleet NACK line from the car ----

  it('parses the fleet NACK with ; separators', () => {
    expect(parseTelemetryLine('NACK;E=UNKNOWN_MODE;ARG=2WD1M')).toEqual({
      nackError: 'UNKNOWN_MODE',
      nackArg: '2WD1M',
    });
  });

  it('parses the fleet NACK tolerating : separators (older remote shape)', () => {
    expect(parseTelemetryLine('NACK:E=UNKNOWN_MODE:ARG=PATH')).toEqual({
      nackError: 'UNKNOWN_MODE',
      nackArg: 'PATH',
    });
  });

  it('is case-insensitive and uppercases the error code (raw arg kept)', () => {
    expect(parseTelemetryLine('nack;e=unknown_mode;arg=auto')).toEqual({
      nackError: 'UNKNOWN_MODE',
      nackArg: 'auto',
    });
  });

  it('returns nothing when NACK has no ARG token', () => {
    expect(parseTelemetryLine('NACK;E=UNKNOWN_MODE')).toEqual({});
  });
});

describe('A-7 / R-10 car-truth availability resolution', () => {
  it('defaults unreported tokens to AVAILABLE except MAN (owner 2026-09-15)', () => {
    expect(isTokenComingSoon('PATH', {})).toBe(false);
    expect(isTokenComingSoon('MYSTERY_MODE', {})).toBe(false);
    expect(isTokenComingSoon('BT', {})).toBe(false);
    expect(isTokenComingSoon('ESP_SER', {})).toBe(false);
    // MAN is the only hard CS default (needs the RF handset).
    expect(isTokenComingSoon('MAN', {})).toBe(true);
    expect(modeAvailStatus('MAN', {})).toBe('CS');
  });

  it('car truth overrides the default per token (stub map)', () => {
    // A car whose registry parked PATH: CS.
    const map = { PATH: true };
    expect(isTokenComingSoon('PATH', map)).toBe(true);
    // Unreported tokens still default live.
    expect(isTokenComingSoon('OBS_US', map)).toBe(false);
  });

  it('car truth can PARK a default-live token', () => {
    const map = { '4WD4M': true };
    expect(isTokenComingSoon('4WD4M', map)).toBe(true);
    expect(isTokenComingSoon('BT', map)).toBe(true); // legacy alias resolves
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(isTokenComingSoon('  bt ', { BT: false })).toBe(false);
    expect(isTokenComingSoon('path', {})).toBe(false);
  });

  it('treats a missing/empty token as coming soon', () => {
    expect(isTokenComingSoon(null, {})).toBe(true);
    expect(isTokenComingSoon('', {})).toBe(true);
    expect(modeAvailStatus(null, {})).toBe('CS');
  });

  it('modeAvailStatus maps the CAPS table 3 states (LIVE/WIP/CS)', () => {
    const caps = { '4WD4M': 'LIVE', ESP_CLI: 'WIP', PATH: 'CS' };
    expect(modeAvailStatus('4WD4M', {}, caps)).toBe('LIVE');
    expect(modeAvailStatus('ESP_CLI', {}, caps)).toBe('WIP');
    expect(modeAvailStatus('PATH', {}, caps)).toBe('CS');
    // WIP/CS are both "not live" for isTokenComingSoon.
    expect(isTokenComingSoon('ESP_CLI', {}, caps)).toBe(true);
    expect(isTokenComingSoon('PATH', {}, caps)).toBe(true);
    expect(isTokenComingSoon('4WD4M', {}, caps)).toBe(false);
  });

  it('the CAPS table wins over the per-current-stub map', () => {
    const caps = { '2WD1M': 'LIVE' };
    const stub = { '2WD1M': true };
    expect(modeAvailStatus('2WD1M', stub, caps)).toBe('LIVE');
  });

  it('legacy BT resolves onto the canonical 4WD4M row in every source', () => {
    expect(modeAvailStatus('BT', {}, { '4WD4M': 'LIVE' })).toBe('LIVE');
    expect(modeAvailStatus('BT', { '4WD4M': true }, {})).toBe('CS');
  });

  // ---- X-8: legacy token canonicalization ----

  it('canonicalizes legacy BT to 4WD4M', () => {
    expect(canonicalCarToken('BT')).toBe('4WD4M');
    expect(canonicalCarToken('bt')).toBe('4WD4M');
    expect(canonicalCarToken(' 4wd4m ')).toBe('4WD4M');
    expect(canonicalCarToken('ESP_SER')).toBe('ESP_SER');
  });

  it('mirrors old-car STATE MODE=BT onto the 4WD4M row (legacy alias)', () => {
    const t = parseTelemetryLine('STATE;MODE=BT;SPD=170;STATUS=Forward');
    expect(t.mode).toBe('BT'); // parser preserves the wire truth
    // …and the canonical form resolves against the new-token catalog:
    expect(modeAvailStatus(canonicalCarToken(t.mode), {})).toBe('LIVE');
  });

  it('resolves the new 4WD4M token as live via the default', () => {
    expect(isTokenComingSoon('4WD4M', {})).toBe(false);
  });
});

describe('buildWifiConfigLine (v1.4.0 provisioning)', () => {
  it('builds the WIFICFG;ssid;pass line', () => {
    expect(buildWifiConfigLine('HomeNet', 'secret123')).toBe('WIFICFG;HomeNet;secret123');
  });

  it('allows an empty password (open network)', () => {
    expect(buildWifiConfigLine('OpenNet', '')).toBe('WIFICFG;OpenNet;');
  });
});

describe('isCompleteJsonObject', () => {
  it('detects complete newline-free JSON broadcasts', () => {
    expect(isCompleteJsonObject('{"status":"OK"}')).toBe(true);
    expect(isCompleteJsonObject('  {"a":1}  ')).toBe(true);
    expect(isCompleteJsonObject('{"a":1')).toBe(false);
    expect(isCompleteJsonObject('STATE;MODE=BT')).toBe(false);
  });
});

describe('fleet mode-cycle order (roboCarCatalog REMOTE_MODE_ORDER)', () => {
  it('advances through the 9 firmware modes in remote scroll order and wraps', () => {
    expect(nextRemoteModeToken('4WD4M')).toBe('ESP_SER');
    expect(nextRemoteModeToken('ESP_SER')).toBe('PATH');
    expect(nextRemoteModeToken('PATH')).toBe('OBS_US');
    expect(nextRemoteModeToken('OBS_US')).toBe('OBS_IR');
    expect(nextRemoteModeToken('OBS_IR')).toBe('MAN');
    expect(nextRemoteModeToken('MAN')).toBe('AUTO');
    expect(nextRemoteModeToken('AUTO')).toBe('ESP_CLI');
    expect(nextRemoteModeToken('ESP_CLI')).toBe('2WD1M');
    expect(nextRemoteModeToken('2WD1M')).toBe('4WD4M');
  });

  it('is canonical-token based: unknown tokens roll forward from the head', () => {
    expect(nextRemoteModeToken('BT')).toBe('ESP_SER');
    expect(nextRemoteModeToken('bogus-token')).toBe('ESP_SER');
    expect(nextRemoteModeToken('')).toBe('ESP_SER');
  });

  it('sorts DB/bundled mode lists into the fleet cycle order', () => {
    const shuffled = [
      { token: '2WD1M' },
      { token: '4WD4M' },
      { token: 'AUTO' },
      { token: 'ESP_SER' },
    ];
    expect(sortRemoteModes(shuffled).map((m) => m.token)).toEqual(['4WD4M', 'ESP_SER', 'AUTO', '2WD1M']);
  });

  it('drops unknown tokens to the tail and never reorders the head', () => {
    const list = [{ token: 'ESP_CLI' }, { token: 'MYSTERY' }, { token: 'MAN' }];
    expect(sortRemoteModes(list).map((m) => m.token)).toEqual(['MAN', 'ESP_CLI', 'MYSTERY']);
  });
});
