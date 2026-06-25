import chalk from 'chalk';
import {
  getEvalStatus,
  type EvalStatus,
  type EvalDotsData,
} from '../eval/history.js';

export function statusCircle(status: EvalStatus): string {
  switch (status) {
    case 'green': return chalk.green('●');
    case 'red': return chalk.red('●');
    case 'orange': return chalk.hex('#FFA500')('●');
    case 'grey': return chalk.gray('●');
  }
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
