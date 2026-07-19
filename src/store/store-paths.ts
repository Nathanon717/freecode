import { existsSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

/**
 * Where the local store lives and how its sync credentials are resolved. Pure
 * path/env reading — no libSQL client, no cache, nothing that can throw at import
 * time, so this stays safe to pull in from anywhere. See docs/map/store/store-paths.md.
 */

const _dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(_dirname, '..', '..');

export function getStoreDir(): string {
  return process.env.FREECODE_STORE ?? join(PACKAGE_ROOT, '.freecode');
}

export function getDbUrl(): string {
  return `file:${join(getStoreDir(), 'freecode.db')}`;
}

/** Path to the config file mirror. */
export function getConfigMirrorPath(): string {
  return join(getStoreDir(), 'config-cache.json');
}

/**
 * Sync credentials, env first then `~/.config/freecode/config.json`. Both halves
 * must be present for syncing to engage; a partial pair reads as local-only.
 */
export function readDbConfig(): { syncUrl?: string; authToken?: string } {
  const syncUrl = process.env.FREECODE_DB_SYNC_URL ?? undefined;
  const authToken = process.env.FREECODE_DB_AUTH_TOKEN ?? undefined;
  if (syncUrl && authToken) return { syncUrl, authToken };
  try {
    const configDir = process.env.FREECODE_HOME ?? join(homedir(), '.config', 'freecode');
    const configPath = join(configDir, 'config.json');
    if (!existsSync(configPath)) return { syncUrl, authToken };
    const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    const db = raw['db'] as Record<string, string> | undefined;
    return {
      syncUrl: db?.['syncUrl'] ?? syncUrl,
      authToken: db?.['authToken'] ?? authToken,
    };
  } catch {
    return { syncUrl, authToken };
  }
}
