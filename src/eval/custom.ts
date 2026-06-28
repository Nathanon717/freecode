import { existsSync, readdirSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join, resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const _dirname = dirname(fileURLToPath(import.meta.url));
export const CUSTOM_EVAL_DIR = resolve(_dirname, '..', '..', 'evals', 'custom');

export interface CustomEval {
  id: string;
  firstLine: string;
}

export function modelSlug(model: string): string {
  return model.replace(/[:/]/g, '--');
}

export function discoverCustomEvals(): CustomEval[] {
  if (!existsSync(CUSTOM_EVAL_DIR)) return [];
  const dirs = readdirSync(CUSTOM_EVAL_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^(\d{3}-|\w)/.test(d.name) && d.name !== 'shared' && d.name !== 'results')
    .filter(d => {
      const dir = join(CUSTOM_EVAL_DIR, d.name);
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
    const promptPath = join(CUSTOM_EVAL_DIR, d.name, 'prompt.md');
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
