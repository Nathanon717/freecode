import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createScriptedMode } from '../../src/cli/scripted-mode.js';

describe('createScriptedMode', () => {
  let dir: string;
  let logSpy: MockInstance;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'freecode-scripted-'));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
    delete process.env['FREECODE_AUTO_CONFIRM'];
    delete process.env['FREECODE_MAX_TOOL_CALLS'];
  });

  function writeScript(lines: string[]): string {
    const path = join(dir, 'script.txt');
    writeFileSync(path, lines.join('\n'), 'utf-8');
    return path;
  }

  it('reads non-empty lines in order then returns null when exhausted', async () => {
    const mode = createScriptedMode(writeScript(['hello', '', 'world']));
    expect(await mode.readInput()).toBe('hello');
    expect(await mode.readInput()).toBe('world');
    expect(await mode.readInput()).toBeNull();
  });

  it('decodes a JSON-encoded line as a single multiline message', async () => {
    const multiline = 'line one\nline two\nline three';
    const mode = createScriptedMode(writeScript([JSON.stringify(multiline)]));
    expect(await mode.readInput()).toBe(multiline);
    expect(await mode.readInput()).toBeNull();
  });

  it('approves a tool call when the next scripted line approves', async () => {
    const mode = createScriptedMode(writeScript(['approve']));
    expect(await mode.confirmToolCall({ name: 'read', args: {} })).toEqual({ approved: true });
  });

  it('denies and forwards the feedback message when the script denies', async () => {
    const mode = createScriptedMode(writeScript(['deny', 'do it differently']));
    expect(await mode.confirmToolCall({ name: 'create', args: {} })).toEqual({
      approved: false,
      message: 'do it differently',
    });
  });

  it('defaults to denial when no scripted choice follows', async () => {
    const mode = createScriptedMode(writeScript([]));
    expect(await mode.confirmToolCall({ name: 'shell_exec', args: {} })).toEqual({ approved: false });
  });

  it.each([
    ['y', true],
    ['yes', true],
    ['a', true],
    ['n', false],
    ['no', false],
    ['d', false],
  ])('parses scripted choice alias %s', async (alias, approved) => {
    const mode = createScriptedMode(writeScript([alias]));
    const result = await mode.confirmToolCall({ name: 'grep', args: {} });
    expect(result.approved).toBe(approved);
  });

  it('auto-approves every call when FREECODE_AUTO_CONFIRM=1', async () => {
    process.env['FREECODE_AUTO_CONFIRM'] = '1';
    const mode = createScriptedMode(writeScript([]));
    expect(await mode.confirmToolCall({ name: 'read', args: {} })).toEqual({ approved: true });
    expect(await mode.confirmToolCall({ name: 'read', args: {} })).toEqual({ approved: true });
  });

  it('denies silently once past the tool-call limit', async () => {
    process.env['FREECODE_AUTO_CONFIRM'] = '1';
    process.env['FREECODE_MAX_TOOL_CALLS'] = '2';
    const mode = createScriptedMode(writeScript([]));

    expect(await mode.confirmToolCall({ name: 'read', args: {} })).toEqual({ approved: true });
    expect(await mode.confirmToolCall({ name: 'read', args: {} })).toEqual({ approved: true });
    const third = await mode.confirmToolCall({ name: 'read', args: {} });
    expect(third.approved).toBe(false);
    expect(third.message).toContain('limit of 2');
  });

  it('exposes current-only model listing and skips stray confirmations', () => {
    const mode = createScriptedMode(writeScript([]));
    expect(mode.modelListMode).toBe('current-only');
    expect(mode.skipStrayConfirmations).toBe(true);
  });

  it('runEvalMenu prints that /eval is not available in scripted mode', async () => {
    const mode = createScriptedMode(writeScript([]));
    await mode.runEvalMenu?.();
    expect(logSpy.mock.calls.flat().join(' ')).toContain('/eval is not available');
  });

  it('announces goodbye when input is exhausted', async () => {
    const mode = createScriptedMode(writeScript([]));
    await mode.onInputExhausted?.();
    expect(logSpy.mock.calls.flat().join(' ')).toContain('Goodbye');
  });

  it('skips the Goodbye message when FREECODE_AUTO_CONFIRM=1', async () => {
    process.env['FREECODE_AUTO_CONFIRM'] = '1';
    const mode = createScriptedMode(writeScript([]));
    await mode.onInputExhausted?.();
    expect(logSpy).not.toHaveBeenCalled();
  });
});
