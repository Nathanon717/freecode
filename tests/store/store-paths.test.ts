import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getStoreDir, getDbUrl, getConfigMirrorPath, readDbConfig } from '../../src/store/store-paths.js';

const ENV_KEYS = ['FREECODE_STORE', 'FREECODE_HOME', 'FREECODE_DB_SYNC_URL', 'FREECODE_DB_AUTH_TOKEN'] as const;

describe('store-paths', () => {
  let saved: Record<string, string | undefined>;
  let tmp: string;

  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
    tmp = mkdtempSync(join(tmpdir(), 'store-paths-'));
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(tmp, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('FREECODE_STORE overrides the default store dir, and the db/mirror paths follow it', () => {
    process.env.FREECODE_STORE = tmp;
    expect(getStoreDir()).toBe(tmp);
    expect(getDbUrl()).toBe(`file:${join(tmp, 'freecode.db')}`);
    expect(getConfigMirrorPath()).toBe(join(tmp, 'config-cache.json'));
  });

  it('defaults the store dir to .freecode under the package root', () => {
    expect(getStoreDir().endsWith('.freecode')).toBe(true);
  });

  it('reads sync credentials from the environment first', () => {
    process.env.FREECODE_DB_SYNC_URL = 'libsql://env.example';
    process.env.FREECODE_DB_AUTH_TOKEN = 'env-token';
    expect(readDbConfig()).toEqual({ syncUrl: 'libsql://env.example', authToken: 'env-token' });
  });

  it('falls back to config.json when the env pair is absent', () => {
    const home = join(tmp, 'cfg');
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, 'config.json'), JSON.stringify({ db: { syncUrl: 'libsql://file.example', authToken: 'file-token' } }));
    process.env.FREECODE_HOME = home;
    expect(readDbConfig()).toEqual({ syncUrl: 'libsql://file.example', authToken: 'file-token' });
  });

  it('a half-set env pair still consults the config file', () => {
    const home = join(tmp, 'cfg');
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, 'config.json'), JSON.stringify({ db: { authToken: 'file-token' } }));
    process.env.FREECODE_HOME = home;
    process.env.FREECODE_DB_SYNC_URL = 'libsql://env.example';
    expect(readDbConfig()).toEqual({ syncUrl: 'libsql://env.example', authToken: 'file-token' });
  });

  it('a missing or corrupt config file falls back to the env values instead of throwing', () => {
    process.env.FREECODE_HOME = join(tmp, 'nonexistent');
    process.env.FREECODE_DB_SYNC_URL = 'libsql://env.example';
    expect(readDbConfig()).toEqual({ syncUrl: 'libsql://env.example', authToken: undefined });

    const home = join(tmp, 'corrupt');
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, 'config.json'), '{ not json');
    process.env.FREECODE_HOME = home;
    expect(readDbConfig()).toEqual({ syncUrl: 'libsql://env.example', authToken: undefined });
  });
});
