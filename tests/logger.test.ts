import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

type LoggerModule = {
  log: (category: string, message: string, data?: unknown) => void;
  enableLog: () => void;
  logError: (category: string, message: string, err: unknown) => void;
};

let stderrOutput: string[] = [];
let stderrSpy: MockInstance;

beforeEach(() => {
  // vitest.config.ts sets FREECODE_SILENCE_ERRORS for the whole suite. Clear it here so
  // these tests see the real write path; the silencing itself is covered explicitly below.
  vi.stubEnv('FREECODE_SILENCE_ERRORS', undefined);
  stderrOutput = [];
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderrOutput.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  stderrSpy.mockRestore();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function freshLogger(): Promise<LoggerModule> {
  return import('../src/logger.js?t=' + Date.now()) as Promise<LoggerModule>;
}

describe('log', () => {
  it('is silent when not enabled', async () => {
    const { log } = await freshLogger();
    log('router', 'hello');
    expect(stderrOutput).toHaveLength(0);
  });

  it('writes to stderr after enableLog', async () => {
    const { log, enableLog } = await freshLogger();
    enableLog();
    log('router', 'hello');
    expect(stderrOutput).toHaveLength(1);
    expect(stderrOutput[0]).toContain('[router]');
    expect(stderrOutput[0]).toContain('hello');
  });

  it('includes JSON-serialized data when provided', async () => {
    const { log, enableLog } = await freshLogger();
    enableLog();
    log('tool', 'exec', { cmd: 'ls' });
    expect(stderrOutput[0]).toContain('{"cmd":"ls"}');
  });

  it('omits data section when data is undefined', async () => {
    const { log, enableLog } = await freshLogger();
    enableLog();
    log('tool', 'exec');
    expect(stderrOutput[0]).not.toContain('{');
  });

  it('falls back to white for unknown categories', async () => {
    const { log, enableLog } = await freshLogger();
    enableLog();
    log('unknown-cat', 'msg');
    expect(stderrOutput[0]).toContain('[unknown-cat]');
  });
});

describe('logError', () => {
  it('writes even when not enabled, so errors are never swallowed', async () => {
    const { logError } = await freshLogger();
    logError('router', 'bad', new Error('oops'));
    expect(stderrOutput[0]).toContain('[error]');
    expect(stderrOutput[0]).toContain('oops');
  });

  it('writes Error message to stderr', async () => {
    const { logError, enableLog } = await freshLogger();
    enableLog();
    logError('router', 'failed', new Error('boom'));
    expect(stderrOutput[0]).toContain('[error]');
    expect(stderrOutput[0]).toContain('[router]');
    expect(stderrOutput[0]).toContain('failed');
    expect(stderrOutput[0]).toContain('boom');
  });

  it('JSON-stringifies non-Error objects', async () => {
    const { logError, enableLog } = await freshLogger();
    enableLog();
    logError('db', 'oops', { code: 42 });
    expect(stderrOutput[0]).toContain('{"code":42}');
  });

  it('converts primitive errors to string', async () => {
    const { logError, enableLog } = await freshLogger();
    enableLog();
    logError('db', 'oops', 'string error');
    expect(stderrOutput[0]).toContain('string error');
  });

  it('includes stack trace for Error instances', async () => {
    const { logError, enableLog } = await freshLogger();
    enableLog();
    logError('db', 'oops', new Error('with stack'));
    expect(stderrOutput[0]).toContain('Error: with stack');
  });

  it('is silent when FREECODE_SILENCE_ERRORS is set, even after enableLog', async () => {
    vi.stubEnv('FREECODE_SILENCE_ERRORS', '1');
    const { logError, enableLog } = await freshLogger();
    enableLog();
    logError('db', 'oops', new Error('boom'));
    expect(stderrOutput).toHaveLength(0);
  });

  it('reads the env var per call, so unsetting it restores output', async () => {
    vi.stubEnv('FREECODE_SILENCE_ERRORS', '1');
    const { logError } = await freshLogger();
    logError('db', 'silenced', new Error('boom'));
    vi.stubEnv('FREECODE_SILENCE_ERRORS', undefined);
    logError('db', 'audible', new Error('boom'));
    expect(stderrOutput).toHaveLength(1);
    expect(stderrOutput[0]).toContain('audible');
  });
});
