// updateService.test.ts — R-20a regression tests for the APK updater.
//
// The original bug (owner: "the app is showing the old version even when
// downloading the new version"): the cache target was a FIXED filename
// downloaded with `idempotent: true`, so the first download poisoned every
// later one — the installer kept receiving the ORIGINAL cached APK forever.
// These tests pin the fixed contract:
//   1. the cache filename is derived from the APK URL (per-release targets),
//   2. any stale file is DELETED before downloading (no idempotent skip),
//   3. the download ALWAYS re-runs, even when the target already exists.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── native module mocks ────────────────────────────────────────────
// expo-file-system gets a tiny in-memory FS: constructors re-attach the
// existence of a same-named file, delete()/download() append to `events`
// so the delete-before-download ORDER is assertable.
vi.mock('expo-file-system', () => {
  const events: string[] = [];
  const instances: any[] = [];
  class File {
    url: unknown;
    name: string;
    exists = false;
    deleted = false;
    contentUri = 'file:///mock/genum-update.apk';
    constructor(dir: unknown, name: string) {
      this.url = dir;
      this.name = name;
      const prior = instances.find((i) => i.url === dir && i.name === name);
      this.exists = prior ? prior.exists : false;
      instances.push(this);
    }
    delete() {
      this.deleted = true;
      this.exists = false;
      events.push('delete');
    }
    static downloadFileAsync = vi.fn(async (_url: string, target: File) => {
      target.exists = true;
      events.push('download');
      return target;
    });
  }
  return { File, Paths: { cache: 'cache-dir://' }, __events: events, __instances: instances };
});

vi.mock('expo-intent-launcher', () => ({
  startActivityAsync: vi.fn(async () => 'ok'),
}));
vi.mock('expo-updates', () => ({
  checkForUpdateAsync: vi.fn(async () => ({ isAvailable: false })),
  fetchUpdateAsync: vi.fn(async () => ({})),
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '3.2.3', android: { versionCode: 56 } } },
}));
vi.mock('../config/site', () => ({ APP_VERSION: '3.2.3' }));
vi.mock('../config/update', () => ({
  APK_URL: 'https://storage.example.com/app-releases/genum-solutions-3.2.3.apk',
  RELEASE_MANIFEST_URL: 'https://storage.example.com/app-releases/release.json',
}));

import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { cacheFileNameFor, compareVersions, downloadAndInstall } from './updateService';

const { File, Paths, __events, __instances } = FileSystem as unknown as {
  File: any;
  Paths: { cache: string };
  __events: string[];
  __instances: any[];
};

const URL_323 = 'https://storage.example.com/app-releases/genum-solutions-3.2.3.apk';
const URL_321 = 'https://storage.example.com/app-releases/genum-solutions-3.2.1.apk';

beforeEach(() => {
  (__instances as any[]).length = 0;
  (__events as string[]).length = 0;
  vi.mocked(IntentLauncher.startActivityAsync).mockClear();
  vi.mocked(File.downloadFileAsync).mockClear();
});

describe('cacheFileNameFor (R-20a: per-release cache targets)', () => {
  it('derives the filename from the APK URL so each release gets its own cache entry', () => {
    expect(cacheFileNameFor(URL_323)).toBe('genum-solutions-3.2.3.apk');
    expect(cacheFileNameFor(URL_321)).toBe('genum-solutions-3.2.1.apk');
    // The poisoning regression guard: two releases must NEVER share a target.
    expect(cacheFileNameFor(URL_323)).not.toBe(cacheFileNameFor(URL_321));
  });

  it('flattens URL-unsafe characters for the filesystem', () => {
    expect(cacheFileNameFor('https://x.test/a/genum.apk?alt=media')).toBe('genum.apk_alt_media');
  });

  it('falls back to a stable name when the URL has no filename', () => {
    expect(cacheFileNameFor('')).toBe('genum-update.apk');
  });
});

describe('downloadAndInstall (R-20a cache-target behavior)', () => {
  it('never reuses a previous release cache entry — the installer gets the NEW release', async () => {
    await downloadAndInstall(URL_321); // the "old" release poisons its own entry
    await downloadAndInstall(URL_323); // a newer release must not touch it

    expect(__instances.map((f) => f.name)).toEqual([
      'genum-solutions-3.2.1.apk',
      'genum-solutions-3.2.3.apk',
    ]);
  });

  it('deletes the stale target before re-downloading (no idempotent skip)', async () => {
    await downloadAndInstall(URL_323); // first download creates the entry
    await downloadAndInstall(URL_323); // second run must delete-then-download

    const [first, second] = __instances;
    expect(second).not.toBe(first); // a fresh File is constructed
    expect(first.deleted).toBe(false); // first run: nothing stale to delete
    expect(second.deleted).toBe(true); // stale file removed
    // THE order contract: delete strictly before the fresh download.
    expect(__events).toEqual(['download', 'delete', 'download']);
    expect(File.downloadFileAsync).toHaveBeenCalledTimes(2);
  });

  it('launches the Android installer with the APK mime type + read-grant flag', async () => {
    await downloadAndInstall(URL_323);

    expect(IntentLauncher.startActivityAsync).toHaveBeenCalledWith('android.intent.action.VIEW', {
      data: 'file:///mock/genum-update.apk',
      type: 'application/vnd.android.package-archive',
      flags: 1,
    });
  });

  it('surfaces a download-prefixed error and never opens the installer', async () => {
    vi.mocked(File.downloadFileAsync).mockRejectedValueOnce(new Error('network down'));

    await expect(downloadAndInstall(URL_323)).rejects.toThrow(/download:.*network down/);
    expect(IntentLauncher.startActivityAsync).not.toHaveBeenCalled();
  });

  it('surfaces an install-prefixed error when the installer cannot open', async () => {
    vi.mocked(IntentLauncher.startActivityAsync).mockRejectedValueOnce(new Error('no intent handler'));

    await expect(downloadAndInstall(URL_323)).rejects.toThrow(/install:.*no intent handler/);
  });
});

describe('compareVersions (updater version contract)', () => {
  it('orders dotted numeric versions correctly', () => {
    expect(compareVersions('3.2.1', '3.2.3')).toBe(-1);
    expect(compareVersions('3.2.3', '3.2.3')).toBe(0);
    expect(compareVersions('3.10.0', '3.9.3')).toBe(1);
  });
});
