import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadEvalConfig,
  archiveEvalRun,
  resetEvalWorkDir,
  type EvalRunResult,
} from '../../src/cli/eval-runner.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'freecode-eval-runner-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function makeRunResult(over: Partial<EvalRunResult> = {}): EvalRunResult {
  return {
    exitCode: 0,
    stdout: '',
    stderr: '',
    toolCalls: [],
    tokens: { total: 0 },
    workDir: tempDir,
    quota: null,
    ...over,
  };
}

describe('loadEvalConfig', () => {
  it('returns empty object when no config file exists', () => {
    expect(loadEvalConfig(tempDir)).toEqual({});
  });

  it('reads maxToolCalls from config file', () => {
    writeFileSync(join(tempDir, 'eval.config.json'), JSON.stringify({ maxToolCalls: 5 }));
    expect(loadEvalConfig(tempDir)).toEqual({ maxToolCalls: 5 });
  });

  it('returns empty object on malformed JSON', () => {
    writeFileSync(join(tempDir, 'eval.config.json'), 'not json');
    expect(loadEvalConfig(tempDir)).toEqual({});
  });
});

describe('resetEvalWorkDir', () => {
  it('creates work and .run directories', () => {
    resetEvalWorkDir(tempDir);
    expect(existsSync(join(tempDir, 'work'))).toBe(true);
    expect(existsSync(join(tempDir, '.run'))).toBe(true);
  });

  it('clears an existing work directory', () => {
    const workDir = join(tempDir, 'work');
    mkdirSync(workDir);
    writeFileSync(join(workDir, 'old.txt'), 'stale');
    resetEvalWorkDir(tempDir);
    expect(existsSync(join(workDir, 'old.txt'))).toBe(false);
  });

  it('copies start files into work when start dir exists', () => {
    const startDir = join(tempDir, 'start');
    mkdirSync(startDir);
    writeFileSync(join(startDir, 'seed.txt'), 'seed content');
    resetEvalWorkDir(tempDir);
    expect(existsSync(join(tempDir, 'work', 'seed.txt'))).toBe(true);
  });

  it('skips .gitkeep when copying start files', () => {
    const startDir = join(tempDir, 'start');
    mkdirSync(startDir);
    writeFileSync(join(startDir, '.gitkeep'), '');
    resetEvalWorkDir(tempDir);
    expect(existsSync(join(tempDir, 'work', '.gitkeep'))).toBe(false);
  });
});

describe('archiveEvalRun', () => {
  it('creates artifacts directory with result.json', () => {
    const scenarioDir = join(tempDir, 'scenario');
    const workDir = join(scenarioDir, 'work');
    mkdirSync(workDir, { recursive: true });

    archiveEvalRun(scenarioDir, 'openai:gpt-4o', makeRunResult({ workDir }));

    const artifactsDir = join(scenarioDir, '.artifacts', 'openai--gpt-4o');
    expect(existsSync(join(artifactsDir, 'result.json'))).toBe(true);
  });

  it('copies work directory contents into artifacts', () => {
    const scenarioDir = join(tempDir, 'scenario');
    const workDir = join(scenarioDir, 'work');
    mkdirSync(workDir, { recursive: true });
    writeFileSync(join(workDir, 'output.txt'), 'done');

    archiveEvalRun(scenarioDir, 'openai:gpt-4o', makeRunResult({ workDir }));

    const artifactWork = join(scenarioDir, '.artifacts', 'openai--gpt-4o', 'work', 'output.txt');
    expect(existsSync(artifactWork)).toBe(true);
  });

  it('uses "default" slug when model is empty', () => {
    const scenarioDir = join(tempDir, 'scenario');
    const workDir = join(tempDir, 'work-empty');
    mkdirSync(workDir, { recursive: true });

    archiveEvalRun(scenarioDir, '', makeRunResult({ workDir }));

    expect(existsSync(join(scenarioDir, '.artifacts', 'default', 'result.json'))).toBe(true);
  });
});
