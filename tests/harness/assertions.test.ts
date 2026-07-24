// check-tests: orphan

import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it } from 'vitest';
import {
  assertFakeLlmTrace,
  assertFiles,
  assertOutput,
  assertE2eExpectations,
  assertToolTrace,
} from './assertions/index.js';

describe('e2e expectation assertions', () => {
  it('checks required and forbidden output text', () => {
    expect(assertOutput({
      stdoutContains: ['hello', 'missing'],
      stdoutAbsent: ['error', 'hello'],
    }, 'hello world')).toEqual([
      'missing: "missing"',
      'unexpected: "hello"',
    ]);
  });

  it('passes stdoutOrder when substrings appear in order', () => {
    expect(assertOutput({
      stdoutOrder: ['preamble', 'read(x)', 'done'],
    }, 'preamble\nread(x)\n  result\ndone')).toEqual([]);
  });

  it('flags stdoutOrder when a present substring is out of order', () => {
    // The tool call "read(x)" is present but prints before the preamble it should
    // follow — the classic out-of-order bug. "preamble" matches at its late
    // position, so "read(x)" can no longer be found after it.
    expect(assertOutput({
      stdoutOrder: ['preamble', 'read(x)'],
    }, 'read(x)\n  result\npreamble')).toEqual([
      'out of order: "read(x)" appears before an earlier expected item',
    ]);
  });

  it('flags stdoutOrder when an ordered substring is absent', () => {
    expect(assertOutput({
      stdoutOrder: ['preamble', 'nope'],
    }, 'preamble only')).toEqual([
      'missing (ordered): "nope"',
    ]);
  });

  it('checks exact file content relative to the e2e test workspace', () => {
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
      { tool: 'read', args: {} },
      { tool: 'shell_exec', args: {} },
    ];

    expect(assertToolTrace({
      maxCalls: 1,
      sequence: ['read'],
      present: ['create'],
      absent: ['shell_exec'],
    }, trace)).toEqual([
      'toolTrace.maxCalls: expected <= 1, got 2 (read -> shell_exec)',
      'toolTrace.sequence: expected read, got read -> shell_exec',
      'toolTrace missing: create (read -> shell_exec)',
      'toolTrace unexpected: shell_exec (read -> shell_exec)',
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
        toolsAvailable: ['create'],
        toolsAbsent: ['read'],
        toolRationale: true,
        parallelTools: false,
        nativeToolsSupplied: true,
        emittedTextContains: ['PONG'],
        emittedToolCalls: ['create'],
        usage: { promptTokens: 10, outputTokens: 1, totalTokens: 11 },
      }],
    }, [{
      callIndex: 1,
      providerId: 'mock',
      modelId: 'gpt-freecode-test',
      executionPath: 'fake-other',
      inputMessageCount: 1,
      lastUserMessage: 'Say PING',
      toolNames: ['read'],
      toolRationale: false,
      parallelTools: true,
      nativeToolsSupplied: false,
      responseStep: 1,
      emittedChunks: ['PING'],
      emittedToolCalls: [{ name: 'read', args: {} }],
      usage: { promptTokens: 9, outputTokens: 1, totalTokens: 10 },
    }])).toEqual([
      'fakeLlmTrace.callCount: expected 2, got 1',
      'fakeLlmTrace.calls[0].executionPath: expected fake-direct, got fake-other',
      'fakeLlmTrace.calls[0].inputMessageCount: expected 2, got 1',
      'fakeLlmTrace.calls[0].toolRationale: expected true, got false',
      'fakeLlmTrace.calls[0].parallelTools: expected false, got true',
      'fakeLlmTrace.calls[0].nativeToolsSupplied: expected true, got false',
      'fakeLlmTrace.calls[0].lastUserContains missing: "missing"',
      'fakeLlmTrace.calls[0].toolsAvailable missing: create (read)',
      'fakeLlmTrace.calls[0].toolsAbsent unexpected: read (read)',
      'fakeLlmTrace.calls[0].emittedTextContains missing: "PONG"',
      'fakeLlmTrace.calls[0].emittedToolCalls missing: create (read)',
      'fakeLlmTrace.calls[0].usage.totalTokens: expected 11, got 10',
      'fakeLlmTrace.calls[0].usage.promptTokens: expected 10, got 9',
    ]);
  });

  it('combines all assertion types for the e2e runner', () => {
    expect(assertE2eExpectations({
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

