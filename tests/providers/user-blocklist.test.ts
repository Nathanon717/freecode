import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// $FREECODE_HOME is read per call (not at import time), but the module caches the
// parsed list, so each test gets a fresh home *and* an explicit cache reset.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let blocklist: typeof import('../../src/providers/user-blocklist.js');
let tempHome = '';
const previousHome = process.env.FREECODE_HOME;

function blocklistFile(): string {
  return join(tempHome, 'blocklist.json');
}

beforeEach(async () => {
  tempHome = mkdtempSync(join(tmpdir(), 'freecode-userblock-'));
  process.env.FREECODE_HOME = tempHome;
  blocklist = await import('../../src/providers/user-blocklist.js');
  blocklist.resetUserBlocklistCache();
});

afterEach(() => {
  blocklist.resetUserBlocklistCache();
  if (previousHome === undefined) delete process.env.FREECODE_HOME;
  else process.env.FREECODE_HOME = previousHome;
  try { rmSync(tempHome, { recursive: true, force: true }); } catch { /* OS will clean up */ }
});

describe('user-blocklist', () => {
  it('is empty when no file exists', () => {
    expect(blocklist.getUserBlocklist().size).toBe(0);
    expect(existsSync(blocklistFile())).toBe(false);
  });

  it('persists an added key and reads it back from disk', () => {
    blocklist.addToUserBlocklist('groq:whisper-large-v3');
    blocklist.resetUserBlocklistCache();
    expect(blocklist.isUserBlocklisted('groq', 'whisper-large-v3')).toBe(true);
    expect(JSON.parse(readFileSync(blocklistFile(), 'utf-8'))).toEqual([
      'groq:whisper-large-v3',
    ]);
  });

  it('writes a sorted flat list so the file stays hand-readable', () => {
    blocklist.addToUserBlocklist('zen:b-model');
    blocklist.addToUserBlocklist('groq:a-model');
    expect(JSON.parse(readFileSync(blocklistFile(), 'utf-8'))).toEqual([
      'groq:a-model',
      'zen:b-model',
    ]);
  });

  it('does not duplicate an already-blocklisted key', () => {
    blocklist.addToUserBlocklist('groq:dupe');
    blocklist.addToUserBlocklist('groq:dupe');
    expect(JSON.parse(readFileSync(blocklistFile(), 'utf-8'))).toEqual(['groq:dupe']);
  });

  it('keeps the well-formed entries of a hand-edited file and drops the rest', () => {
    writeFileSync(
      blocklistFile(),
      JSON.stringify(['groq:good', 'no-colon', 42, null, 'zen:also-good']),
      'utf-8',
    );
    expect([...blocklist.getUserBlocklist()].sort()).toEqual(['groq:good', 'zen:also-good'].sort());
  });

  it('treats an unparseable file as empty instead of throwing', () => {
    writeFileSync(blocklistFile(), '{ not json', 'utf-8');
    expect(blocklist.getUserBlocklist().size).toBe(0);
  });

  it('matches on the exact provider:modelId key, not a substring', () => {
    blocklist.addToUserBlocklist('groq:llama-3');
    expect(blocklist.isUserBlocklisted('groq', 'llama-3')).toBe(true);
    expect(blocklist.isUserBlocklisted('groq', 'llama-3-70b')).toBe(false);
    expect(blocklist.isUserBlocklisted('zen', 'llama-3')).toBe(false);
  });
});
