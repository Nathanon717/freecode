import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { CoreMessage } from 'ai';
import type { AgentLoopResult } from '../../src/agent/loop.js';
import { runHeadlessPrompt } from '../../src/cli/headless-prompt.js';
import { getAskMode, isReadOnly } from '../../src/cli/chrome/toggles.js';
import { claimReviewLock, readReviewLock } from '../../src/snapshots/review-lock.js';
import type { SessionSnapshot } from '../../src/snapshots/auto.js';

const agentLoop = vi.hoisted(() => vi.fn());
vi.mock('../../src/agent/loop.js', () => ({ agentLoop }));

// The review lock is real state on disk. Mocking only the one question the
// release condition asks keeps the lock itself unmocked, so these tests exercise
// the file the running CLI would.
//
// This replaces the whole module, so `ensureSnapshot` is undefined here. Safe
// only because `agentLoop` is mocked too and snapshot-gate never runs — unmock
// the loop and this file needs the real export back.
const sessionSnapshot = vi.hoisted(() => vi.fn<() => Promise<SessionSnapshot>>());
vi.mock('../../src/snapshots/auto.js', () => ({ sessionSnapshot }));

function loopResult(over: Partial<AgentLoopResult> = {}): AgentLoopResult {
  return {
    text: '',
    usage: { totalTokens: 0 },
    providerId: 'zen',
    modelId: 'hy3-free',
    quota: null,
    turnMessages: [],
    ...over,
  };
}

describe('runHeadlessPrompt', () => {
  let stdout: MockInstance;
  let stderr: MockInstance;

  const written = (spy: MockInstance): string =>
    spy.mock.calls.map(c => String(c[0])).join('');

  let home = '';

  beforeEach(() => {
    agentLoop.mockReset();
    // A run that wrote nothing, which is what every pre-existing test here is.
    sessionSnapshot.mockReset();
    sessionSnapshot.mockResolvedValue({ status: 'none' });
    // Isolated so an `--edit` test cannot leave a review lock in the real
    // snapshot store, where the next real delegation would trip over it.
    home = mkdtempSync(join(tmpdir(), 'freecode-headless-'));
    vi.stubEnv('FREECODE_HOME', home);
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdout.mockRestore();
    stderr.mockRestore();
    vi.unstubAllEnvs();
    rmSync(home, { recursive: true, force: true });
  });

  it('refuses without a model instead of letting resolveModel explain it', async () => {
    const code = await runHeadlessPrompt({ projectRoot: '.', prompt: 'hi', model: '' });

    expect(code).toBe(1);
    expect(agentLoop).not.toHaveBeenCalled();
    expect(written(stderr)).toContain('--model');
    expect(written(stdout)).toBe('');
  });

  it('runs read-only, auto-approving, with the transcript silenced', async () => {
    agentLoop.mockResolvedValue(loopResult({ text: 'answer' }));

    await runHeadlessPrompt({ projectRoot: '.', prompt: 'hi', model: 'zen:hy3-free' });

    // The same toggles the TUI uses (Ctrl+R / Ctrl+A), not a parallel set of flags.
    expect(isReadOnly()).toBe(true);
    expect(getAskMode()).toBe('auto');
    expect(process.env.FREECODE_TRANSCRIPT_STREAM).toBe('null');
    const options = agentLoop.mock.calls[0][3] as { readOnly: boolean; spawnAgent: boolean };
    expect(options.readOnly).toBe(true);
    expect(options.spawnAgent).toBe(false);
  });

  it('offers the write tools under edit, still without spawn_agent', async () => {
    agentLoop.mockResolvedValue(loopResult({ text: 'answer' }));

    await runHeadlessPrompt({ projectRoot: '.', prompt: 'hi', model: 'zen:hy3-free', edit: true });

    expect(isReadOnly()).toBe(false);
    // Editing is not fan-out: an unattended turn must not spend whole sub-turns.
    const options = agentLoop.mock.calls[0][3] as { readOnly: boolean; spawnAgent: boolean };
    expect(options.readOnly).toBe(false);
    expect(options.spawnAgent).toBe(false);
  });

  // Serialising delegated edits is what makes "the newest snapshot" a safe thing
  // for a review command to key on.
  it('refuses a second --edit run while the first one is unreviewed', async () => {
    agentLoop.mockResolvedValue(loopResult({ text: 'answer' }));
    expect(claimReviewLock('.', 'the first delegation').status).toBe('claimed');

    const code = await runHeadlessPrompt({ projectRoot: '.', prompt: 'go', model: 'zen:hy3-free', edit: true });

    expect(code).toBe(1);
    // Refused before the turn, so a refusal costs no tokens.
    expect(agentLoop).not.toHaveBeenCalled();
    expect(written(stderr)).toContain('the first delegation');
    expect(written(stderr)).toContain('freecode checkpoint diff');
  });

  // An unwritable snapshot store used to read as a free project (finding B11):
  // the exclusive write failed, the readback failed, and the run started anyway
  // with mutual exclusion silently off. Refusing is only useful if it says which
  // file to look at.
  it('refuses an --edit run when the lock can be neither claimed nor read', async () => {
    agentLoop.mockResolvedValue(loopResult({ text: 'answer' }));
    // A file where the snapshots directory belongs: nothing can be created under it.
    writeFileSync(join(home, 'snapshots'), 'not a directory', 'utf-8');

    const code = await runHeadlessPrompt({ projectRoot: '.', prompt: 'go', model: 'zen:hy3-free', edit: true });

    expect(code).toBe(1);
    expect(agentLoop).not.toHaveBeenCalled();
    expect(written(stderr)).toContain('could not be claimed or read');
    expect(written(stderr)).toContain('cannot be written');
    // Not the delete-the-lock-file instruction: there is no lock file here, and
    // `checkpoint accept` cannot clear this one either — it needs the same store.
    expect(written(stderr)).not.toContain('Delete it');
  });

  it('leaves read-only -p unaffected by an outstanding review', async () => {
    agentLoop.mockResolvedValue(loopResult({ text: 'answer' }));
    claimReviewLock('.', 'the first delegation');

    // Nothing to review means nothing to wait for.
    const code = await runHeadlessPrompt({ projectRoot: '.', prompt: 'go', model: 'zen:hy3-free' });

    expect(code).toBe(0);
    expect(agentLoop).toHaveBeenCalled();
  });

  it('frees the project again when the run wrote nothing', async () => {
    agentLoop.mockResolvedValue(loopResult({ text: 'answer' }));

    await runHeadlessPrompt({ projectRoot: '.', prompt: 'go', model: 'zen:hy3-free', edit: true });

    expect(readReviewLock('.')).toBeUndefined();
  });

  it('holds the lock when the run wrote and then errored', async () => {
    // The writes happened either way: an errored turn's changes are exactly the
    // ones most worth looking at before anything else touches the project.
    sessionSnapshot.mockResolvedValue({ status: 'taken', id: '20260812T000000-1' });
    agentLoop.mockResolvedValue(loopResult({ text: 'partial', error: 'rate limited' }));

    const code = await runHeadlessPrompt({ projectRoot: '.', prompt: 'go', model: 'zen:hy3-free', edit: true });

    expect(code).toBe(1);
    expect(readReviewLock('.')?.task).toBe('go');
  });

  it('records the snapshot id in the lock, so review is not a guess from timestamps', async () => {
    // Without this, `checkpoint diff` picks its target by comparing `takenAt`
    // against the claim, and cannot tell this run's snapshot from one an
    // interactive session took in the same window (cli/checkpoint.ts, outstanding).
    sessionSnapshot.mockResolvedValue({ status: 'taken', id: '20260812T000000-1' });
    agentLoop.mockResolvedValue(loopResult({ text: 'answer' }));

    await runHeadlessPrompt({ projectRoot: '.', prompt: 'go', model: 'zen:hy3-free', edit: true });

    expect(readReviewLock('.')?.snapshotId).toBe('20260812T000000-1');
    expect(readReviewLock('.')?.snapshotFailed).toBeUndefined();
  });

  it('keeps the lock and reports it when the run wrote but its snapshot failed', async () => {
    // The case R4 exists for. This used to be indistinguishable from "wrote
    // nothing": the lock was released over changes that no snapshot covers, and
    // the only record of the failure went to a log `-p` silences.
    sessionSnapshot.mockResolvedValue({ status: 'failed', reason: 'ENOSPC: no space left' });
    agentLoop.mockResolvedValue(loopResult({ text: 'answer' }));

    const code = await runHeadlessPrompt({ projectRoot: '.', prompt: 'go', model: 'zen:hy3-free', edit: true });

    // The turn itself succeeded, and stdout still carries only its answer.
    expect(code).toBe(0);
    expect(written(stdout)).toBe('answer\n');
    expect(readReviewLock('.')?.snapshotFailed).toBe(true);
    expect(written(stderr)).toContain('ENOSPC: no space left');
    expect(written(stderr)).toContain('checkpoint accept');
  });

  it('prints the final assistant message, not every step of narration', async () => {
    // A turn that narrates before a tool call: result.text holds both, but the
    // caller asked for an answer. See finalResponse in cli/headless-prompt.ts.
    const turnMessages: CoreMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me look at it.' },
          { type: 'tool-call', toolCallId: '1', toolName: 'read', args: { path: 'p' } },
        ],
      },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: '1', toolName: 'read', result: 'body' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'The answer is 42.' }] },
    ];
    agentLoop.mockResolvedValue(
      loopResult({ text: 'Let me look at it.The answer is 42.', turnMessages }),
    );

    const code = await runHeadlessPrompt({ projectRoot: '.', prompt: 'hi', model: 'zen:hy3-free' });

    expect(code).toBe(0);
    expect(written(stdout)).toBe('The answer is 42.\n');
  });

  it('skips a trailing tool-call-only message to find the last text', async () => {
    const turnMessages: CoreMessage[] = [
      { role: 'assistant', content: [{ type: 'text', text: 'Findings so far.' }] },
      {
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: '2', toolName: 'grep', args: {} }],
      },
    ];
    agentLoop.mockResolvedValue(loopResult({ text: 'Findings so far.', turnMessages }));

    await runHeadlessPrompt({ projectRoot: '.', prompt: 'hi', model: 'zen:hy3-free' });

    expect(written(stdout)).toBe('Findings so far.\n');
  });

  it('falls back to result.text when the turn contributed no messages', async () => {
    // An errored or aborted turn carries none — whatever it managed to say is all
    // there is, and it is still worth printing.
    agentLoop.mockResolvedValue(loopResult({ text: 'partial thought', error: 'stream died' }));

    const code = await runHeadlessPrompt({ projectRoot: '.', prompt: 'hi', model: 'zen:hy3-free' });

    expect(code).toBe(1);
    expect(written(stdout)).toBe('partial thought\n');
    expect(written(stderr)).toContain('stream died');
  });

  it('prints nothing to stdout when the model said nothing', async () => {
    agentLoop.mockResolvedValue(loopResult({ text: '' }));

    const code = await runHeadlessPrompt({ projectRoot: '.', prompt: 'hi', model: 'zen:hy3-free' });

    expect(code).toBe(0);
    expect(written(stdout)).toBe('');
  });

  describe('tool call budget', () => {
    it('approves up to the budget and denies past it', async () => {
      vi.stubEnv('FREECODE_MAX_TOOL_CALLS', '2');
      let confirm: () => Promise<{ approved: boolean; message?: string }> = () =>
        Promise.resolve({ approved: false });
      agentLoop.mockImplementation((_m, _r, _model, options: { confirmToolCall: typeof confirm }) => {
        confirm = options.confirmToolCall;
        return Promise.resolve(loopResult({ text: 'done' }));
      });

      await runHeadlessPrompt({ projectRoot: '.', prompt: 'hi', model: 'zen:hy3-free' });

      expect(await confirm()).toEqual({ approved: true });
      expect(await confirm()).toEqual({ approved: true });
      const third = await confirm();
      expect(third.approved).toBe(false);
      expect(third.message).toContain('tool call limit of 2');
    });
  });
});
