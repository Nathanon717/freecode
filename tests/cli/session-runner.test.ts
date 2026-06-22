import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../src/cli/command-dispatcher.js', () => ({
  dispatchCommand: vi.fn(),
}));

import { runCliSession, type CliSessionMode } from '../../src/cli/session-runner.js';
import { dispatchCommand } from '../../src/cli/command-dispatcher.js';

const mockDispatch = dispatchCommand as ReturnType<typeof vi.fn>;

function makeSession() {
  return { getContextTokenCount: vi.fn(() => 0) } as unknown as Parameters<typeof runCliSession>[0]['session'];
}

function makeMode(overrides: Partial<CliSessionMode> = {}): CliSessionMode {
  return {
    readInput: vi.fn(() => Promise.resolve(null)),
    confirmToolCall: vi.fn(() => Promise.resolve({ approved: true })),
    modelListMode: 'full',
    runEvalMenu: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runCliSession', () => {
  it('returns immediately when readInput returns null', async () => {
    const mode = makeMode({ readInput: vi.fn(() => Promise.resolve(null)) });
    await runCliSession({ projectRoot: '/', session: makeSession(), getSelectedModel: () => 'x', setSelectedModel: vi.fn(), mode });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('calls onInputExhausted when readInput returns null', async () => {
    const onInputExhausted = vi.fn(() => Promise.resolve());
    const mode = makeMode({ readInput: vi.fn(() => Promise.resolve(null)), onInputExhausted });
    await runCliSession({ projectRoot: '/', session: makeSession(), getSelectedModel: () => 'x', setSelectedModel: vi.fn(), mode });
    expect(onInputExhausted).toHaveBeenCalled();
  });

  it('passes input to dispatchCommand', async () => {
    mockDispatch.mockResolvedValueOnce(undefined);
    const readInput = vi.fn()
      .mockResolvedValueOnce('hello')
      .mockResolvedValueOnce(null);
    const mode = makeMode({ readInput });
    await runCliSession({ projectRoot: '/', session: makeSession(), getSelectedModel: () => 'x', setSelectedModel: vi.fn(), mode });
    expect(mockDispatch).toHaveBeenCalledWith('hello', expect.any(Object));
  });

  it('exits and calls onExit when dispatchCommand returns "exit"', async () => {
    mockDispatch.mockResolvedValueOnce('exit');
    const onExit = vi.fn(() => Promise.resolve());
    const readInput = vi.fn().mockResolvedValueOnce('quit');
    const mode = makeMode({ readInput, onExit });
    await runCliSession({ projectRoot: '/', session: makeSession(), getSelectedModel: () => 'x', setSelectedModel: vi.fn(), mode });
    expect(onExit).toHaveBeenCalled();
    expect(readInput).toHaveBeenCalledTimes(1);
  });

  it('calls beforeDispatch and afterDispatch around each command', async () => {
    mockDispatch.mockResolvedValueOnce(undefined);
    const calls: string[] = [];
    const readInput = vi.fn()
      .mockResolvedValueOnce('cmd')
      .mockResolvedValueOnce(null);
    const mode = makeMode({
      readInput,
      beforeDispatch: vi.fn(() => { calls.push('before'); return Promise.resolve(); }),
      afterDispatch: vi.fn(() => { calls.push('after'); return Promise.resolve(); }),
    });
    await runCliSession({ projectRoot: '/', session: makeSession(), getSelectedModel: () => 'x', setSelectedModel: vi.fn(), mode });
    expect(calls).toEqual(['before', 'after']);
  });

  it('calls afterDispatch even when dispatchCommand throws', async () => {
    mockDispatch.mockRejectedValueOnce(new Error('boom'));
    const afterDispatch = vi.fn(() => Promise.resolve());
    const readInput = vi.fn().mockResolvedValueOnce('cmd');
    const mode = makeMode({ readInput, afterDispatch });
    await expect(
      runCliSession({ projectRoot: '/', session: makeSession(), getSelectedModel: () => 'x', setSelectedModel: vi.fn(), mode })
    ).rejects.toThrow('boom');
    expect(afterDispatch).toHaveBeenCalled();
  });
});
