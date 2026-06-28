import { readFileSync } from 'fs';
import { pathToFileURL } from 'url';
import type { EvalRunResult, EvalReport } from './shared/types.js';

const [, , checkPath, resultPath] = process.argv;
const result: EvalRunResult = JSON.parse(readFileSync(resultPath, 'utf-8'));
const { check } = await import(pathToFileURL(checkPath).href) as { check: (r: EvalRunResult) => EvalReport };
const report = check(result);
process.stdout.write(JSON.stringify(report));
