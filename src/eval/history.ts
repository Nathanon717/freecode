import { join } from 'path';
import { getCache } from '../providers/db.js';
import {
  PLAYGROUND_EVAL_DIR,
  discoverPlaygroundScenarios,
  computeRunHash,
  computeScenarioHash,
  type PlaygroundScenario,
} from './playground.js';

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

export interface ScenarioHashes { runHash: string; fullHash: string; }

export interface EvalDotsData {
  scenarios: PlaygroundScenario[];
  hashes: Map<string, ScenarioHashes>;
  history: EvalHistoryEntry[];
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
