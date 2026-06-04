import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Interface as ReadlineInterface } from 'readline';

// Mock child_process before importing the module under test
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock('../../src/util/screen-buffer.js', () => ({
  getScreenBuffer: vi.fn(() => 'sample terminal output'),
}));

vi.mock('../../src/cli/raw-picker.js', () => ({
  runRawPicker: vi.fn(),
}));

vi.mock('../../src/cli/terminal-ui.js', () => ({
  teardownFooterUI: vi.fn(),
}));

function makeMockRl() {
  return {} as ReadlineInterface;
}

function makeSpawnChild(stdout: string, code: number = 0) {
  const child = {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
  };

  child.stdout.on.mockImplementation((event: string, cb: (d: Buffer) => void) => {
    if (event === 'data') cb(Buffer.from(stdout));
  });
  child.stderr.on.mockImplementation((_event: string, _cb: unknown) => {});
  child.on.mockImplementation((event: string, cb: (code: number | null) => void) => {
    if (event === 'close') cb(code);
  });

  return child;
}

describe('runClaudeHelpCommand', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('prints "only available in interactive mode" when stdin is not a TTY', async () => {
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });

    const { runClaudeHelpCommand } = await import('../../src/commands/claude-help.js');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runClaudeHelpCommand(makeMockRl(), '');

    expect(consoleSpy.mock.calls.flat().join(' ')).toContain('only available in interactive mode');

    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
    consoleSpy.mockRestore();
  });

  it('calls claude CLI with a prompt containing the screen buffer content', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    const { spawn } = await import('child_process');
    const { runRawPicker } = await import('../../src/cli/raw-picker.js');

    vi.mocked(spawn).mockReturnValue(makeSpawnChild('All looks fine.') as never);
    vi.mocked(runRawPicker).mockResolvedValue('dismiss');

    const { runClaudeHelpCommand } = await import('../../src/commands/claude-help.js');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runClaudeHelpCommand(makeMockRl(), '');

    const [cmd, args] = vi.mocked(spawn).mock.calls[0] as [string, string[]];
    expect(cmd).toBe('claude');
    expect(args[0]).toBe('-p');
    expect(args[1]).toContain('sample terminal output');

    consoleSpy.mockRestore();
  });

  it('includes userMessage in the diagnosis prompt when provided', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    const { spawn } = await import('child_process');
    const { runRawPicker } = await import('../../src/cli/raw-picker.js');

    vi.mocked(spawn).mockReturnValue(makeSpawnChild('Looks like a timeout.') as never);
    vi.mocked(runRawPicker).mockResolvedValue('dismiss');

    const { runClaudeHelpCommand } = await import('../../src/commands/claude-help.js');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runClaudeHelpCommand(makeMockRl(), 'it crashed on startup');

    const prompt = vi.mocked(spawn).mock.calls[0][1][1];
    expect(prompt).toContain('it crashed on startup');

    consoleSpy.mockRestore();
  });

  it('displays the diagnosis returned by Claude', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    const { spawn } = await import('child_process');
    const { runRawPicker } = await import('../../src/cli/raw-picker.js');

    vi.mocked(spawn).mockReturnValue(makeSpawnChild('Check your API key.') as never);
    vi.mocked(runRawPicker).mockResolvedValue('dismiss');

    const { runClaudeHelpCommand } = await import('../../src/commands/claude-help.js');
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });

    await runClaudeHelpCommand(makeMockRl(), '');

    const output = logs.join('\n');
    expect(output).toContain('Check your API key.');

    vi.restoreAllMocks();
  });

  it('prints an error message when the Claude CLI fails', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    const { spawn } = await import('child_process');

    const child = makeSpawnChild('', 1);
    child.stderr.on.mockImplementation((event: string, cb: (d: Buffer) => void) => {
      if (event === 'data') cb(Buffer.from('auth error'));
    });
    vi.mocked(spawn).mockReturnValue(child as never);

    const { runClaudeHelpCommand } = await import('../../src/commands/claude-help.js');
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });

    await runClaudeHelpCommand(makeMockRl(), '');

    expect(logs.join('\n')).toContain('Failed to contact Claude');

    vi.restoreAllMocks();
  });

  it('does not show the action picker when Claude CLI fails', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    const { spawn } = await import('child_process');
    const { runRawPicker } = await import('../../src/cli/raw-picker.js');

    vi.mocked(spawn).mockReturnValue(makeSpawnChild('', 1) as never);

    const { runClaudeHelpCommand } = await import('../../src/commands/claude-help.js');
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runClaudeHelpCommand(makeMockRl(), '');

    expect(vi.mocked(runRawPicker)).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('returns without launching fix when the user dismisses', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    const { spawn, spawnSync } = await import('child_process');
    const { runRawPicker } = await import('../../src/cli/raw-picker.js');

    vi.mocked(spawn).mockReturnValue(makeSpawnChild('The fix is X.') as never);
    vi.mocked(runRawPicker).mockResolvedValue('dismiss');

    const { runClaudeHelpCommand } = await import('../../src/commands/claude-help.js');
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runClaudeHelpCommand(makeMockRl(), '');

    expect(vi.mocked(spawnSync)).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('launches spawnSync with the diagnosis when the user chooses fix', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    const { spawn, spawnSync } = await import('child_process');
    const { runRawPicker } = await import('../../src/cli/raw-picker.js');

    vi.mocked(spawn).mockReturnValue(makeSpawnChild('The API key is missing.') as never);
    vi.mocked(runRawPicker).mockResolvedValue('fix');
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as never);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number) => { throw new Error('process.exit'); });

    const { runClaudeHelpCommand } = await import('../../src/commands/claude-help.js');
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(runClaudeHelpCommand(makeMockRl(), '')).rejects.toThrow('process.exit');

    const [cmd, args] = vi.mocked(spawnSync).mock.calls[0] as [string, string[]];
    expect(cmd).toBe('claude');
    expect(args[0]).toContain('The API key is missing.');

    exitSpy.mockRestore();
    vi.restoreAllMocks();
  });
});
