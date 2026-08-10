/**
 * @role Chalk-based renderers for eval status circles. The domain logic (history loading, status computation, hashing, types) has been extracted to `src/eval/history.ts` and `src/eval/custom.ts`. This file keeps only the visual rendering functions.
 */

import chalk from 'chalk';
import { theme } from '../theme.js';
import {
  getEvalStatus,
  type EvalStatus,
  type EvalDotsData,
} from '../../eval/history.js';

/** A chalk-coloured `●` for one `EvalStatus`. */
export function statusCircle(status: EvalStatus): string {
  switch (status) {
    case 'green': return chalk.green('●');
    case 'red': return chalk.red('●');
    case 'orange': return theme.warning('●');
    case 'grey': return chalk.gray('●');
  }
}

/** A compact string of coloured circles, one per scenario in discovery order. */
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
