import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Interface } from 'readline';
import { createInteractiveMode, createScriptedMode } from '../../src/cli/input-modes.js';

// readline.Interface stub. Scripted mode only touches rl through askContinueAfterLimit
// (rl.resume / rl.pause / rl.question), exercised by the auto-confirm limit path.
function makeRl(answer = ''): Interface {
  return {
    resume: vi.fn(),
    pause: vi.fn(),
    question: vi.fn((_prompt: string, cb: (a: string) => void) => cb(answer)),
  } as unknown as Interface;
}

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
    const mode = createScriptedMode(writeScript(['hello', '', 'world']), dir, makeRl());
    expect(await mode.readInput(0)).toBe('hello');
    expect(await mode.readInput(0)).toBe('world');
    expect(await mode.readInput(0)).toBeNull();
  });

  it('decodes a JSON-encoded line as a single multiline message', async () => {
    const multiline = 'line one\nline two\nline three';
    const mode = createScriptedMode(writeScript([JSON.stringify(multiline)]), dir, makeRl());
    expect(await mode.readInput(0)).toBe(multiline);
    expect(await mode.readInput(0)).toBeNull();
  });

  it('approves a tool call when the next scripted line approves', async () => {
    const mode = createScriptedMode(writeScript(['approve']), dir, makeRl());
    expect(await mode.confirmToolCall({ name: 'read', args: {} })).toEqual({ approved: true });
  });

  it('denies and forwards the feedback message when the script denies', async () => {
    const mode = createScriptedMode(writeScript(['deny', 'do it differently']), dir, makeRl());
    expect(await mode.confirmToolCall({ name: 'create', args: {} })).toEqual({
      approved: false,
      message: 'do it differently',
    });
  });

  it('defaults to denial when no scripted choice follows', async () => {
    const mode = createScriptedMode(writeScript([]), dir, makeRl());
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
    const mode = createScriptedMode(writeScript([alias]), dir, makeRl());
    const result = await mode.confirmToolCall({ name: 'grep', args: {} });
    expect(result.approved).toBe(approved);
  });

  it('auto-approves every call when FREECODE_AUTO_CONFIRM=1', async () => {
    process.env['FREECODE_AUTO_CONFIRM'] = '1';
    const mode = createScriptedMode(writeScript([]), dir, makeRl());
    expect(await mode.confirmToolCall({ name: 'read', args: {} })).toEqual({ approved: true });
    expect(await mode.confirmToolCall({ name: 'read', args: {} })).toEqual({ approved: true });
  });

  it('stops auto-approving when the user declines at the tool-call limit', async () => {
    process.env['FREECODE_AUTO_CONFIRM'] = '1';
    process.env['FREECODE_MAX_TOOL_CALLS'] = '2';
    const rl = makeRl('n'); // decline the "continue?" prompt
    const mode = createScriptedMode(writeScript([]), dir, rl);

    expect(await mode.confirmToolCall({ name: 'read', args: {} })).toEqual({ approved: true });
    const second = await mode.confirmToolCall({ name: 'read', args: {} });
    expect(second.approved).toBe(false);
    expect(second.message).toContain('limit of 2');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(rl.question).toHaveBeenCalled();
  });

  it('continues auto-approving when the user accepts at the tool-call limit', async () => {
    process.env['FREECODE_AUTO_CONFIRM'] = '1';
    process.env['FREECODE_MAX_TOOL_CALLS'] = '2';
    const mode = createScriptedMode(writeScript([]), dir, makeRl('')); // empty answer = continue

    await mode.confirmToolCall({ name: 'read', args: {} });
    expect(await mode.confirmToolCall({ name: 'read', args: {} })).toEqual({ approved: true });
  });

  it('exposes current-only model listing and skips stray confirmations', () => {
    const mode = createScriptedMode(writeScript([]), dir, makeRl());
    expect(mode.modelListMode).toBe('current-only');
    expect(mode.skipStrayConfirmations).toBe(true);
  });

  it('announces goodbye when input is exhausted', async () => {
    const mode = createScriptedMode(writeScript([]), dir, makeRl());
    await mode.onInputExhausted?.();
    expect(logSpy.mock.calls.flat().join(' ')).toContain('Goodbye');
  });
});

describe('createInteractiveMode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a full session mode exposing the interactive capabilities', () => {
    const session = { getContextTokenCount: () => 0, messages: [] };
    const mode = createInteractiveMode(
      makeRl(),
      process.cwd(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      session as any,
      () => 'groq:test-model',
      () => {},
    );

    expect(mode.modelListMode).toBe('full');
    for (const method of [
      'readInput',
      'confirmToolCall',
      'beforeAgentCall',
      'afterAgentCall',
      'runConfig',
      'runModelMenu',
      'runEvalMenu',
      'onExit',
    ] as const) {
      expect(typeof mode[method]).toBe('function');
    }
  });
});
