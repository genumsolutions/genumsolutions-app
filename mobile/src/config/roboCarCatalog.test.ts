import { describe, expect, it } from 'vitest';

import {
  LOCAL_CAR_MODES,
  TOKEN_TO_MODE_ID,
  MODE_NAMES,
  REMOTE_MODE_ORDER,
  resolveModeByToken,
  resolveModeByIndex,
  nextMode,
  nextRemoteModeToken,
  sortRemoteModes,
  resolveModeForProduct,
  type CarModeId,
} from '../config/roboCarCatalog';

describe('TOKEN_TO_MODE_ID', () => {
  it('maps all 9 firmware tokens to a CarModeId', () => {
    const tokens = ['BT', 'ESP_SER', 'PATH', 'OBS_US', 'OBS_IR', 'MAN', 'AUTO', 'ESP_CLI', '2WD1M'];
    for (const t of tokens) {
      expect(TOKEN_TO_MODE_ID[t]).toBeDefined();
    }
  });

  it('maps BT to the canonical 4wd4m id', () => {
    expect(TOKEN_TO_MODE_ID['BT']).toBe('4wd4m');
  });

  it('maps ESP_SER to website-server', () => {
    expect(TOKEN_TO_MODE_ID['ESP_SER']).toBe('website-server');
  });
});

describe('MODE_NAMES', () => {
  it('maps legacy BT to the display name 4WD4M', () => {
    expect(MODE_NAMES['BT']).toBe('4WD4M');
  });

  it('maps ESP_CLI to EspWebClient', () => {
    expect(MODE_NAMES['ESP_CLI']).toBe('EspWebClient');
  });

  it('has a name for every token in TOKEN_TO_MODE_ID', () => {
    for (const token of Object.keys(TOKEN_TO_MODE_ID)) {
      expect(MODE_NAMES[token]).toBeDefined();
    }
  });
});

describe('LOCAL_CAR_MODES', () => {
  it('exposes exactly 9 modes', () => {
    expect(LOCAL_CAR_MODES).toHaveLength(9);
  });

  it('every mode has a unique id', () => {
    const ids = LOCAL_CAR_MODES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every mode has a non-empty name and blurb', () => {
    for (const m of LOCAL_CAR_MODES) {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.blurb.length).toBeGreaterThan(0);
    }
  });

  it('every mode has a deviceIndex in 0..8', () => {
    const idxs = LOCAL_CAR_MODES.map((m) => m.deviceIndex);
    expect(idxs.sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('resolveModeByToken', () => {
  it('resolves ESP_SER to website-server', () => {
    const m = resolveModeByToken('ESP_SER');
    expect(m).toBeDefined();
    expect(m!.id).toBe('website-server');
  });

  it('resolves legacy BT to 4wd4m', () => {
    const m = resolveModeByToken('BT');
    expect(m).toBeDefined();
    expect(m!.id).toBe('4wd4m');
  });

  it('returns undefined for unknown tokens', () => {
    expect(resolveModeByToken('bogus')).toBeUndefined();
  });

  it('does NOT lowercase the token (case-sensitive lookup)', () => {
    expect(resolveModeByToken('esp_ser')).toBeUndefined();
  });
});

describe('resolveModeByIndex', () => {
  it('resolves index 0 to 4wd4m', () => {
    const m = resolveModeByIndex(0);
    expect(m).toBeDefined();
    expect(m!.id).toBe('4wd4m');
  });

  it('resolves index 8 to 2wd1m', () => {
    const m = resolveModeByIndex(8);
    expect(m).toBeDefined();
    expect(m!.id).toBe('2wd1m');
  });

  it('returns undefined for out-of-range indexes', () => {
    expect(resolveModeByIndex(99)).toBeUndefined();
    expect(resolveModeByIndex(-1)).toBeUndefined();
  });
});

describe('nextMode', () => {
  it('wraps from the last mode back to the first', () => {
    const last = LOCAL_CAR_MODES[LOCAL_CAR_MODES.length - 1];
    expect(nextMode(last).id).toBe(LOCAL_CAR_MODES[0].id);
  });

  it('advances to the next mode in order', () => {
    const first = LOCAL_CAR_MODES[0];
    expect(nextMode(first).id).toBe(LOCAL_CAR_MODES[1].id);
  });

  it('returns the first mode for an unknown id', () => {
    const unknown = { ...LOCAL_CAR_MODES[0], id: 'bogus' as CarModeId };
    expect(nextMode(unknown).id).toBe(LOCAL_CAR_MODES[0].id);
  });
});

describe('REMOTE_MODE_ORDER', () => {
  it('has exactly 9 entries', () => {
    expect(REMOTE_MODE_ORDER).toHaveLength(9);
  });

  it('starts with 4WD4M and ends with 2WD1M', () => {
    expect(REMOTE_MODE_ORDER[0]).toBe('4WD4M');
    expect(REMOTE_MODE_ORDER[8]).toBe('2WD1M');
  });

  it('every entry has a name in MODE_NAMES', () => {
    for (const t of REMOTE_MODE_ORDER) {
      expect(MODE_NAMES[t]).toBeDefined();
    }
  });
});

describe('nextRemoteModeToken', () => {
  it('advances through the fleet order and wraps', () => {
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

  it('is case-insensitive', () => {
    expect(nextRemoteModeToken('4wd4m')).toBe('ESP_SER');
  });

  it('unknown tokens start from the head of the order', () => {
    expect(nextRemoteModeToken('bogus')).toBe('ESP_SER');
    expect(nextRemoteModeToken('')).toBe('ESP_SER');
  });
});

describe('sortRemoteModes', () => {
  it('sorts modes into fleet cycle order', () => {
    const shuffled = [
      { token: '2WD1M' },
      { token: '4WD4M' },
      { token: 'AUTO' },
      { token: 'ESP_SER' },
    ];
    const sorted = sortRemoteModes(shuffled);
    expect(sorted.map((m) => m.token)).toEqual(['4WD4M', 'ESP_SER', 'AUTO', '2WD1M']);
  });

  it('drops unknown tokens to the tail', () => {
    const list = [{ token: 'ESP_CLI' }, { token: 'MYSTERY' }, { token: 'MAN' }];
    expect(sortRemoteModes(list).map((m) => m.token)).toEqual(['MAN', 'ESP_CLI', 'MYSTERY']);
  });

  it('preserves a stable order for already-sorted lists', () => {
    const list = [{ token: '4WD4M' }, { token: 'ESP_SER' }];
    expect(sortRemoteModes(list)).toEqual(list);
  });
});

describe('resolveModeForProduct', () => {
  it('resolves by exact CarModeId match', () => {
    const m = resolveModeForProduct({ id: '2wd1m' });
    expect(m).toBeDefined();
    expect(m!.id).toBe('2wd1m');
  });

  it('resolves by mode token (case-insensitive)', () => {
    const m = resolveModeForProduct({ badge: 'AUTO' });
    expect(m).toBeDefined();
    expect(m!.id).toBe('self-balancing');
  });

  it('resolves by id prefix', () => {
    const m = resolveModeForProduct({ id: '2wd1m-basic' });
    expect(m).toBeDefined();
    expect(m!.id).toBe('2wd1m');
  });

  it('returns undefined for non-car products', () => {
    expect(resolveModeForProduct({ id: 'starter-kit' })).toBeUndefined();
    expect(resolveModeForProduct({ badge: 'materials' })).toBeUndefined();
  });

  it('returns undefined for empty input', () => {
    expect(resolveModeForProduct({})).toBeUndefined();
    expect(resolveModeForProduct({ id: '' })).toBeUndefined();
  });
});
