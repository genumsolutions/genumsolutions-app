import { describe, expect, it } from 'vitest';

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
  isTokenComingSoon,
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
});

describe('A-7 car-truth coming-soon resolution', () => {
  it('falls back to the fleet table when the car reports nothing', () => {
    expect(isTokenComingSoon('PATH', {})).toBe(true);
    expect(isTokenComingSoon('BT', {})).toBe(false);
    expect(isTokenComingSoon('ESP_SER', {})).toBe(false);
  });

  it('car truth overrides the fallback per token', () => {
    // A car whose registry made 2WD1M live again:
    const map = { '2WD1M': false };
    expect(isTokenComingSoon('2WD1M', map)).toBe(false);
    // …while still-parked tokens stay parked via fallback:
    expect(isTokenComingSoon('PATH', map)).toBe(true);
  });

  it('car truth can PARK a fallback-live token', () => {
    const map = { BT: true };
    expect(isTokenComingSoon('BT', map)).toBe(true);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(isTokenComingSoon('  bt ', { BT: false })).toBe(false);
    expect(isTokenComingSoon('path', {})).toBe(true);
  });

  it('treats an unknown token as coming soon', () => {
    expect(isTokenComingSoon('MYSTERY_MODE', {})).toBe(true);
    expect(isTokenComingSoon(null, {})).toBe(true);
    expect(isTokenComingSoon('', {})).toBe(true);
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
