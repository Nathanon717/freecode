import { existsSync, readdirSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join, resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { getCache } from '../providers/db.js';

const _dirname = dirname(fileURLToPath(import.meta.url));
export const PLAYGROUND_EVAL_DIR = resolve(_dirname, '..', '..', 'playground', 'eval');

export type EvalStatus = 'grey' | 'green' | 'red' | 'orange';

export interface EvalCheckResult {
  name: string;
  kind: 'assertion' | 'stat' | 'warning';
  pass?: boolean;
  message?: string;
  value?: string | number;
  note?: string;
}

export interface EvalHistoryEntry {
  timestamp: string;
  scenarioId: string;
  model: string;
  pass: boolean;
  warnings?: boolean;
  tokens: { total: number; prompt?: number; output?: number };
  scenarioHash?: string;
  checks?: EvalCheckResult[];
}

export interface PlaygroundScenario {
  id: string;
  firstLine: string;
}

export function modelSlug(model: string): string {
  return model.replace(/[:/]/g, '--');
}

export function loadEvalHistory(): EvalHistoryEntry[] {
  const cache = getCache();
  if (!cache) return [];
  const all: EvalHistoryEntry[] = [];
  for (const [modelKey, entry] of Object.entries(cache)) {
    for (const summary of entry.evals?.['custom'] ?? []) {
      all.push({
        timestamp: summary.timestamp,
        scenarioId: summary.taskId,
        model: modelKey || 'default',
        pass: summary.pass,
        warnings: summary.warnings,
        tokens: {
          total: summary.totalTokens ?? ((summary.tokenUsage.input ?? 0) + (summary.tokenUsage.output ?? 0)),
          prompt: summary.tokenUsage.input,
          output: summary.tokenUsage.output,
        },
        scenarioHash: summary.scenarioHash,
        checks: summary.checks as EvalCheckResult[] | undefined,
      });
    }
  }
  return all;
}

export function discoverPlaygroundScenarios(): PlaygroundScenario[] {
  if (!existsSync(PLAYGROUND_EVAL_DIR)) return [];
  const dirs = readdirSync(PLAYGROUND_EVAL_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^(\d{3}-|\w)/.test(d.name) && d.name !== 'shared' && d.name !== 'results')
    .filter(d => {
      const dir = join(PLAYGROUND_EVAL_DIR, d.name);
      return existsSync(join(dir, 'prompt.md')) && existsSync(join(dir, 'eval', 'check.ts'));
    });
  // Non-numbered dirs sort before numbered ones
  dirs.sort((a, b) => {
    const aNum = /^\d{3}-/.test(a.name);
    const bNum = /^\d{3}-/.test(b.name);
    if (!aNum && bNum) return -1;
    if (aNum && !bNum) return 1;
    return a.name.localeCompare(b.name);
  });
  return dirs.map(d => {
    const promptPath = join(PLAYGROUND_EVAL_DIR, d.name, 'prompt.md');
    const firstLine = readFileSync(promptPath, 'utf-8').trim().split('\n')[0].slice(0, 80);
    return { id: d.name, firstLine };
  });
}

function collectFilesRecursive(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === '.gitkeep') continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...collectFilesRecursive(fullPath));
    else result.push(fullPath);
  }
  return result;
}

function stripCarriageReturns(content: Buffer): Buffer {
  const out = Buffer.allocUnsafe(content.length);
  let len = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === 0x0d && content[i + 1] === 0x0a) continue;
    out[len++] = content[i];
  }
  return out.subarray(0, len);
}

function hashFiles(scenarioDir: string, files: string[]): string {
  const hash = createHash('sha256');
  for (const filePath of files) {
    if (existsSync(filePath)) {
      hash.update(relative(scenarioDir, filePath).replace(/\\/g, '/'));
      hash.update('\0');
      hash.update(stripCarriageReturns(readFileSync(filePath)));
      hash.update('\0');
    }
  }
  return hash.digest('hex');
}

// Hash of what the agent sees and does (prompt, config, start files).
// Scoring changes (eval/check.ts edits) do NOT invalidate run-hash matches.
export function computeRunHash(scenarioDir: string): string {
  return hashFiles(scenarioDir, [
    join(scenarioDir, 'prompt.md'),
    join(scenarioDir, 'eval.config.json'),
    ...collectFilesRecursive(join(scenarioDir, 'start')),
  ]);
}

// Full hash including eval/ — retained for grandfathering entries written before run-hash split.
export function computeScenarioHash(scenarioDir: string): string {
  return hashFiles(scenarioDir, [
    join(scenarioDir, 'prompt.md'),
    join(scenarioDir, 'eval.config.json'),
    ...collectFilesRecursive(join(scenarioDir, 'eval')),
    ...collectFilesRecursive(join(scenarioDir, 'start')),
  ]);
}

function matchesHash(entry: EvalHistoryEntry, runHash: string, legacyFullHash?: string): boolean {
  return entry.scenarioHash === runHash || (!!legacyFullHash && entry.scenarioHash === legacyFullHash);
}

export function getEvalStatus(
  scenarioId: string,
  runHash: string,
  model: string,
  history: EvalHistoryEntry[],
  legacyFullHash?: string,
): EvalStatus {
  const modelKey = model || 'default';
  const relevant = history.filter(
    e => e.scenarioId === scenarioId && e.model === modelKey && matchesHash(e, runHash, legacyFullHash),
  );
  if (relevant.length === 0) return 'grey';
  const latest = relevant.reduce((newest, entry) =>
    entry.timestamp > newest.timestamp ? entry : newest,
  );
  if (!latest.pass) return 'red';
  return latest.warnings ? 'orange' : 'green';
}

export function getLatestEvalEntry(
  scenarioId: string,
  runHash: string,
  model: string,
  history: EvalHistoryEntry[],
  legacyFullHash?: string,
): EvalHistoryEntry | null {
  const modelKey = model || 'default';
  const relevant = history.filter(
    e => e.scenarioId === scenarioId && e.model === modelKey && matchesHash(e, runHash, legacyFullHash),
  );
  if (relevant.length === 0) return null;
  return relevant.reduce((newest, entry) => entry.timestamp > newest.timestamp ? entry : newest);
}

export function statusCircle(status: EvalStatus): string {
  switch (status) {
    case 'green': return chalk.green('●');
    case 'red': return chalk.red('●');
    case 'orange': return chalk.hex('#FFA500')('●');
    case 'grey': return chalk.gray('●');
  }
}

export interface ScenarioHashes { runHash: string; fullHash: string; }

export interface EvalDotsData {
  scenarios: PlaygroundScenario[];
  hashes: Map<string, ScenarioHashes>;
  history: EvalHistoryEntry[];
}

export function loadEvalDotsData(): EvalDotsData {
  const scenarios = discoverPlaygroundScenarios();
  const hashes = new Map<string, ScenarioHashes>();
  for (const s of scenarios) {
    const dir = join(PLAYGROUND_EVAL_DIR, s.id);
    hashes.set(s.id, { runHash: computeRunHash(dir), fullHash: computeScenarioHash(dir) });
  }
  const history = loadEvalHistory();
  return { scenarios, hashes, history };
}

export function buildEvalDots(
  model: string,
  data: EvalDotsData,
): string {
  return data.scenarios.map(s => {
    const h = data.hashes.get(s.id);
    const runHash = h?.runHash ?? '';
    const fullHash = h?.fullHash;
    return statusCircle(getEvalStatus(s.id, runHash, model, data.history, fullHash));
  }).join('');
}
