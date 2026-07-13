import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolCallPreview } from '../../src/agent/tools/index.js';
import { printToolsList, executeToolInvocation } from '../../src/cli/tool-runner.js';

let logged: string[] = [];
const prevStream = process.env.FREECODE_TRANSCRIPT_STREAM;

beforeEach(() => {
  // Route the tool transcript (header/preview/result) to nowhere so only the
  // dispatcher-level messages this module emits reach the captured console.
  process.env.FREECODE_TRANSCRIPT_STREAM = 'null';
  logged = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logged.push(a.map(String).join(' '));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (prevStream === undefined) delete process.env.FREECODE_TRANSCRIPT_STREAM;
  else process.env.FREECODE_TRANSCRIPT_STREAM = prevStream;
});

describe('printToolsList', () => {
  it('lists every tool with a schema-derived signature', () => {
    printToolsList();
    const out = logged.join('\n');
    expect(out).toContain('Available tools');
    expect(out).toContain('read(path, [offset], [limit])');
    expect(out).toContain('grep(pattern, [path], [include])');
    expect(out).toContain('list_dir([path])');
    expect(out).toContain('shell_exec(command, [timeout_ms], [confirmDestructive])');
  });
});

describe('executeToolInvocation', () => {
  it('reports a schema validation error without invoking the tool', async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    await executeToolInvocation('read', {}, confirm);
    expect(logged.join('\n')).toContain('Invalid arguments for read()');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('runs a valid call through the wrapped executor and confirmation', async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    await executeToolInvocation('read', { path: 'package.json' }, confirm);
    expect(confirm).toHaveBeenCalledTimes(1);
    const preview = confirm.mock.calls[0][0] as ToolCallPreview;
    expect(preview.name).toBe('read');
    expect(preview.args).toMatchObject({ path: 'package.json' });
  });
});
