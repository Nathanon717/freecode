import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it } from 'vitest';
import {
  assertFakeLlmTrace,
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

  it('checks fake LLM trace calls, tools, emitted text, and usage', () => {
    expect(assertFakeLlmTrace({
      callCount: 2,
      maxCalls: 1,
      calls: [{
        provider: 'mock',
        model: 'gpt-freecode-test',
        executionPath: 'fake-direct',
        inputMessageCount: 2,
        lastUserContains: ['missing'],
        toolsAvailable: ['write_file'],
        toolsAbsent: ['read_file'],
        toolRationale: true,
        parallelTools: false,
        nativeToolsSupplied: true,
        emittedTextContains: ['PONG'],
        emittedToolCalls: ['write_file'],
        usage: { promptTokens: 10, outputTokens: 1, totalTokens: 11 },
      }],
    }, [{
      callIndex: 1,
      providerId: 'mock',
      modelId: 'gpt-freecode-test',
      executionPath: 'fake-other',
      inputMessageCount: 1,
      lastUserMessage: 'Say PING',
      toolNames: ['read_file'],
      toolRationale: false,
      parallelTools: true,
      nativeToolsSupplied: false,
      responseStep: 1,
      emittedChunks: ['PING'],
      emittedToolCalls: [{ name: 'read_file', args: {} }],
      usage: { promptTokens: 9, outputTokens: 1, totalTokens: 10 },
    }])).toEqual([
      'fakeLlmTrace.callCount: expected 2, got 1',
      'fakeLlmTrace.calls[0].executionPath: expected fake-direct, got fake-other',
      'fakeLlmTrace.calls[0].inputMessageCount: expected 2, got 1',
      'fakeLlmTrace.calls[0].toolRationale: expected true, got false',
      'fakeLlmTrace.calls[0].parallelTools: expected false, got true',
      'fakeLlmTrace.calls[0].nativeToolsSupplied: expected true, got false',
      'fakeLlmTrace.calls[0].lastUserContains missing: "missing"',
      'fakeLlmTrace.calls[0].toolsAvailable missing: write_file (read_file)',
      'fakeLlmTrace.calls[0].toolsAbsent unexpected: read_file (read_file)',
      'fakeLlmTrace.calls[0].emittedTextContains missing: "PONG"',
      'fakeLlmTrace.calls[0].emittedToolCalls missing: write_file (read_file)',
      'fakeLlmTrace.calls[0].usage.totalTokens: expected 11, got 10',
      'fakeLlmTrace.calls[0].usage.promptTokens: expected 10, got 9',
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
      fakeLlmTrace: [],
      workspaceRoot: tmpdir(),
      workspace: 'repo',
    })).toEqual([
      'exitCode: expected 0, got 1',
      'toolTrace.sequence: expected (none), got list_dir',
    ]);
  });
});

