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
  ESTOP_LINE,
  isAllowedDriveStatus,
  isCompleteJsonObject,
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
});

describe('isCompleteJsonObject', () => {
  it('detects complete newline-free JSON broadcasts', () => {
    expect(isCompleteJsonObject('{"status":"OK"}')).toBe(true);
    expect(isCompleteJsonObject('  {"a":1}  ')).toBe(true);
    expect(isCompleteJsonObject('{"a":1')).toBe(false);
    expect(isCompleteJsonObject('STATE;MODE=BT')).toBe(false);
  });
});
