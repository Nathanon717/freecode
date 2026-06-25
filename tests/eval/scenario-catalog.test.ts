import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  findScenario,
  parseScenarioSelection,
  getScenarioSummaries,
  type TestScenarioSummary,
} from '../../src/eval/scenario-catalog.js';

function makeScenario(over: Partial<TestScenarioSummary> = {}): TestScenarioSummary {
  return {
    name: 'test-scenario',
    description: 'A test',
    requiresLlm: false,
    file: 'test-scenario.scenario.json',
    checks: [],
    ...over,
  };
}

describe('findScenario', () => {
  const scenarios = [
    makeScenario({ name: 'alpha', file: 'alpha.scenario.json' }),
    makeScenario({ name: 'beta', file: 'beta.scenario.json' }),
    makeScenario({ name: 'gamma', file: 'gamma.scenario.json' }),
  ];

  it('finds by 1-based numeric index', () => {
    expect(findScenario(scenarios, '1')?.name).toBe('alpha');
    expect(findScenario(scenarios, '3')?.name).toBe('gamma');
  });

  it('finds by name', () => {
    expect(findScenario(scenarios, 'beta')?.name).toBe('beta');
  });

  it('finds by exact file name', () => {
    expect(findScenario(scenarios, 'alpha.scenario.json')?.name).toBe('alpha');
  });

  it('finds by file name without extension', () => {
    const special = makeScenario({ name: 'x-special-case', file: 'x-special-case.scenario.json' });
    expect(findScenario([special], 'x-special-case')?.name).toBe('x-special-case');
  });

  it('returns undefined for unknown name', () => {
    expect(findScenario(scenarios, 'unknown')).toBeUndefined();
  });

  it('returns undefined for out-of-range index', () => {
    expect(findScenario(scenarios, '99')).toBeUndefined();
  });
});

describe('parseScenarioSelection', () => {
  const scenarios = [
    makeScenario({ name: 'one' }),
    makeScenario({ name: 'two' }),
    makeScenario({ name: 'three' }),
    makeScenario({ name: 'four' }),
    makeScenario({ name: 'five' }),
  ];

  it('parses a single numeric index', () => {
    const result = parseScenarioSelection('2', scenarios);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('two');
  });

  it('parses comma-separated indices', () => {
    const result = parseScenarioSelection('1,3', scenarios);
    expect(result.map(s => s.name)).toEqual(['one', 'three']);
  });

  it('parses space-separated indices', () => {
    const result = parseScenarioSelection('1 3', scenarios);
    expect(result.map(s => s.name)).toEqual(['one', 'three']);
  });

  it('parses a numeric range', () => {
    const result = parseScenarioSelection('2-4', scenarios);
    expect(result.map(s => s.name)).toEqual(['two', 'three', 'four']);
  });

  it('handles reversed ranges', () => {
    const result = parseScenarioSelection('4-2', scenarios);
    expect(result.map(s => s.name)).toEqual(['two', 'three', 'four']);
  });

  it('deduplicates repeated selections', () => {
    const result = parseScenarioSelection('1 1 1', scenarios);
    expect(result).toHaveLength(1);
  });

  it('parses by name', () => {
    const result = parseScenarioSelection('five', scenarios);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('five');
  });

  it('returns empty array for empty input', () => {
    expect(parseScenarioSelection('', scenarios)).toEqual([]);
  });

  it('ignores unknown names', () => {
    const result = parseScenarioSelection('unknown', scenarios);
    expect(result).toEqual([]);
  });
});

describe('getScenarioSummaries', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'freecode-scenario-catalog-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty array when scenarios directory does not exist', () => {
    expect(getScenarioSummaries(tempDir)).toEqual([]);
  });

  it('parses a valid scenario file', () => {
    const scenDir = join(tempDir, 'tests', 'scenarios');
    mkdirSync(scenDir, { recursive: true });
    writeFileSync(join(scenDir, 'my-test.scenario.json'), JSON.stringify({
      name: 'my-test',
      description: 'A basic test',
      expect: { exitCode: 0, stdoutContains: ['hello'] },
    }));
    const summaries = getScenarioSummaries(tempDir);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].name).toBe('my-test');
    expect(summaries[0].description).toBe('A basic test');
    expect(summaries[0].checks).toContain('exit 0');
    expect(summaries[0].checks).toContain('1 output contains');
  });

  it('uses filename as name when name field is absent', () => {
    const scenDir = join(tempDir, 'tests', 'scenarios');
    mkdirSync(scenDir, { recursive: true });
    writeFileSync(join(scenDir, 'unnamed.scenario.json'), JSON.stringify({
      expect: { exitCode: 0 },
    }));
    const summaries = getScenarioSummaries(tempDir);
    expect(summaries[0].name).toBe('unnamed');
  });

  it('skips files with invalid JSON', () => {
    const scenDir = join(tempDir, 'tests', 'scenarios');
    mkdirSync(scenDir, { recursive: true });
    writeFileSync(join(scenDir, 'broken.scenario.json'), 'not json');
    expect(getScenarioSummaries(tempDir)).toEqual([]);
  });

  it('includes tool trace and fake LLM trace in checks', () => {
    const scenDir = join(tempDir, 'tests', 'scenarios');
    mkdirSync(scenDir, { recursive: true });
    writeFileSync(join(scenDir, 'traced.scenario.json'), JSON.stringify({
      name: 'traced',
      expect: {
        toolTrace: { calls: [] },
        fakeLlmTrace: { steps: [] },
      },
    }));
    const summaries = getScenarioSummaries(tempDir);
    expect(summaries[0].checks).toContain('tool trace');
    expect(summaries[0].checks).toContain('fake LLM trace');
  });
});
