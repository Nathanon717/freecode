/**
 * @role Owns the HumanEval dataset concern for the `/eval` HumanEval tab: resolving the dataset path (`humanEvalDatasetPath`), downloading it if missing (`ensureHumanEvalDataset`/`downloadFile`), and parsing it into `HumanEvalProblem[]` (`loadHumanEvalProblems`). Defines the `HumanEvalProblem`/`HumanEvalResultMap` types consumed by the tab/run loop. Counterpart of `eval/custom.ts` (scenario discovery for the Custom tab).
 *
 * @readwhen
 * Changing dataset location/format, download/redirect behavior, the example-problem prepend, or the `HUMANEVAL_DATA` / `HUMANEVAL_EXAMPLE_DATA` env overrides (test fixtures).
 */

import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { gunzipSync } from 'zlib';
import https from 'https';
import chalk from 'chalk';
import { stripBom, readTextFile } from '../util/text-encoding.js';

const _dirname = dirname(fileURLToPath(import.meta.url));
const HUMANEVAL_DATA_DEFAULT = resolve(_dirname, '..', '..', 'evals', 'humaneval', 'data', 'HumanEval.jsonl.gz');
const HUMANEVAL_EXAMPLE_DATA_DEFAULT = resolve(_dirname, '..', '..', 'evals', 'humaneval', 'data', 'example_problem.jsonl');

const HUMANEVAL_DOWNLOAD_URL = 'https://github.com/openai/human-eval/raw/master/data/HumanEval.jsonl.gz';

/** Follows 301/302 redirects; rejects on a non-200 status or a stream error. */
export function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    mkdirSync(dirname(dest), { recursive: true });
    const file = createWriteStream(dest);
    const follow = (u: string) => {
      https.get(u, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          follow(res.headers.location!);
          return;
        }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}

export type HumanEvalResultMap = Record<string, 'pass' | 'fail'>;

export interface HumanEvalProblem {
  task_id: string;
  prompt: string;
  canonical_solution: string;
  test: string;
  entry_point: string;
}

function readProblems(): HumanEvalProblem[] {
  const dataPath = process.env['HUMANEVAL_DATA'] ?? HUMANEVAL_DATA_DEFAULT;
  const exampleDataPath = process.env['HUMANEVAL_EXAMPLE_DATA'] ?? HUMANEVAL_EXAMPLE_DATA_DEFAULT;
  const compressed = readFileSync(dataPath);
  const text = stripBom(gunzipSync(compressed).toString('utf-8'));
  const main = text.split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line) as HumanEvalProblem);

  let example: HumanEvalProblem[] = [];
  if (existsSync(exampleDataPath)) {
    example = readTextFile(exampleDataPath)
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line) as HumanEvalProblem);
  }

  return [...example, ...main];
}

/** Resolved dataset path: the `HUMANEVAL_DATA` override, else the bundled default. */
export function humanEvalDatasetPath(): string {
  return process.env['HUMANEVAL_DATA'] ?? HUMANEVAL_DATA_DEFAULT;
}

/**
 * Download the HumanEval dataset if it is missing, printing progress. Returns
 * false (after printing an error) when the download was needed and failed.
 * `downloadFn` is injectable so tests can stub the network.
 */
export async function ensureHumanEvalDataset(
  downloadFn: (url: string, dest: string) => Promise<void> = downloadFile,
): Promise<boolean> {
  const dataPath = humanEvalDatasetPath();
  if (existsSync(dataPath)) return true;
  process.stdout.write(chalk.cyan('Downloading HumanEval dataset...'));
  try {
    await downloadFn(HUMANEVAL_DOWNLOAD_URL, dataPath);
    process.stdout.write(chalk.green(' done\n'));
    return true;
  } catch (err) {
    process.stdout.write(chalk.red(` failed\n`));
    console.log(chalk.red(`Could not download dataset: ${err instanceof Error ? err.message : String(err)}`));
    return false;
  }
}

/**
 * Load and parse the HumanEval problems. Returns null (after printing an error)
 * when the dataset cannot be read or parsed. Also honours `HUMANEVAL_EXAMPLE_DATA`,
 * prepending the example problem when it is present.
 */
export function loadHumanEvalProblems(): HumanEvalProblem[] | null {
  try {
    return readProblems();
  } catch (err) {
    console.log(chalk.red(`Failed to load HumanEval dataset: ${err instanceof Error ? err.message : String(err)}`));
    return null;
  }
}
