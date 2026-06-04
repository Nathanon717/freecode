import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { classifyScenario } from '../scenario-classification.js';
import { logError } from '../logger.js';

const require = createRequire(import.meta.url);

export interface TestScenarioSummary {
  name: string;
  description: string;
  requiresLlm: boolean;
  file: string;
  workspace?: 'repo' | 'temp';
  checks: string[];
}

export interface ScenarioRunResult {
  status: number;
  output: string;
}

export function getScenarioSummaries(projectRoot: string): TestScenarioSummary[] {
  const scenariosDir = join(projectRoot, 'tests', 'scenarios');
  if (!existsSync(scenariosDir)) return [];

  return readdirSync(scenariosDir)
    .filter(file => file.endsWith('.scenario.json'))
    .sort()
    .flatMap(file => {
      let raw: {
        name?: string;
        description?: string;
        requiresLlm?: unknown;
        workspace?: 'repo' | 'temp';
        turns?: Array<{ input?: unknown }>;
        expect?: {
          stdoutContains?: string[];
          stdoutAbsent?: string[];
          exitCode?: number;
          files?: unknown[];
          toolTrace?: unknown;
          fakeLlmTrace?: unknown;
        };
      };
      try {
        raw = JSON.parse(readFileSync(join(scenariosDir, file), 'utf-8')) as typeof raw;
      } catch (err) {
        logError('scenario', `Failed to parse ${file} — skipping`, err);
        return [];
      }
      const checks: string[] = [];
      if (raw.expect?.exitCode !== undefined) checks.push(`exit ${raw.expect.exitCode}`);
      if (raw.expect?.stdoutContains?.length) checks.push(`${raw.expect.stdoutContains.length} output contains`);
      if (raw.expect?.stdoutAbsent?.length) checks.push(`${raw.expect.stdoutAbsent.length} output absent`);
      if (raw.expect?.files?.length) checks.push(`${raw.expect.files.length} file check${raw.expect.files.length === 1 ? '' : 's'}`);
      if (raw.expect?.toolTrace) checks.push('tool trace');
      if (raw.expect?.fakeLlmTrace) checks.push('fake LLM trace');
      const classification = classifyScenario(raw);
      if (classification.errors.length > 0) checks.push(`classification error: ${classification.errors.join('; ')}`);
      return [{
        name: raw.name ?? file.replace(/\.scenario\.json$/, ''),
        description: raw.description ?? '',
        requiresLlm: classification.inferredRequiresLlm,
        file,
        workspace: raw.workspace ?? 'repo',
        checks,
      }];
    });
}

export function runScenario(projectRoot: string, name: string, details = false): ScenarioRunResult {
  const tsxCli = require.resolve('tsx/cli');
  const args = [tsxCli, 'tests/harness/run-scenarios.ts', '--no-build', `--only=${name}`];
  if (details) args.push('--details');
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    stdio: 'pipe',
    shell: false,
    env: {
      ...process.env,
      FORCE_COLOR: process.env.FORCE_COLOR ?? '1',
      VERBOSE: process.env.VERBOSE ?? '1',
    },
    encoding: 'utf-8',
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `\nScenario runner error: ${result.error.message}` : ''}`,
  };
}

export function findScenario(scenarios: TestScenarioSummary[], choice: string): TestScenarioSummary | undefined {
  return /^\d+$/.test(choice)
    ? scenarios[Number(choice) - 1]
    : scenarios.find(s => s.name === choice || s.file === choice || s.file === `${choice}.scenario.json`);
}

export function parseScenarioSelection(input: string, scenarios: TestScenarioSummary[]): TestScenarioSummary[] {
  const selected: TestScenarioSummary[] = [];
  const seen = new Set<string>();
  for (const rawPart of input.split(/[,\s]+/)) {
    const part = rawPart.trim();
    if (!part) continue;
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      const low = Math.min(start, end);
      const high = Math.max(start, end);
      for (let idx = low; idx <= high; idx++) {
        const scenario = scenarios[idx - 1];
        if (scenario && !seen.has(scenario.name)) {
          selected.push(scenario);
          seen.add(scenario.name);
        }
      }
      continue;
    }
    const scenario = findScenario(scenarios, part);
    if (scenario && !seen.has(scenario.name)) {
      selected.push(scenario);
      seen.add(scenario.name);
    }
  }
  return selected;
}
