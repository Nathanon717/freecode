import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it } from 'vitest';
import {
  assertFiles,
  assertOutput,
  assertScenarioExpectations,
  assertToolTrace,
} from './assertions/index.js';

describe('scenario expectation assertions', () => {
  it('checks required and forbidden output text', () => {
    expect(assertOutput({
      stdoutContains: ['hello', 'missing'],
      stdoutAbsent: ['error', 'hello'],
    }, 'hello world')).toEqual([
      'missing: "missing"',
      'unexpected: "hello"',
    ]);
  });

  it('checks exact file content relative to the scenario workspace', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'freecode-assertions-'));
    try {
      writeFileSync(join(workspace, 'hello.txt'), 'hello\n', 'utf-8');

      expect(assertFiles([
        { path: 'hello.txt', contentExact: 'hello\n' },
        { path: 'missing.txt' },
      ], workspace, 'temp')).toEqual([
        'file missing: missing.txt',
        '          actual files: hello.txt',
      ]);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('checks tool trace limits, sequence, presence, and absence', () => {
    const trace = [
      { tool: 'read_file', args: {} },
      { tool: 'shell_exec', args: {} },
    ];

    expect(assertToolTrace({
      maxCalls: 1,
      sequence: ['read_file'],
      present: ['write_file'],
      absent: ['shell_exec'],
    }, trace)).toEqual([
      'toolTrace.maxCalls: expected <= 1, got 2 (read_file -> shell_exec)',
      'toolTrace.sequence: expected read_file, got read_file -> shell_exec',
      'toolTrace missing: write_file (read_file -> shell_exec)',
      'toolTrace unexpected: shell_exec (read_file -> shell_exec)',
    ]);
  });

  it('combines all assertion types for the scenario runner', () => {
    expect(assertScenarioExpectations({
      expect: {
        exitCode: 0,
        stdoutContains: ['ok'],
        toolTrace: { sequence: [] },
      },
      stdout: 'not ok',
      stderr: '',
      exitCode: 1,
      trace: [{ tool: 'list_dir', args: {} }],
      workspaceRoot: tmpdir(),
      workspace: 'repo',
    })).toEqual([
      'exitCode: expected 0, got 1',
      'toolTrace.sequence: expected (none), got list_dir',
    ]);
  });
});

