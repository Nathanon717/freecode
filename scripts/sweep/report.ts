// Live progress and the written report. Both are findings-only by design: on a
// sweep where most units are clean, a per-unit "ok" line buries the hits it
// exists to surface. The `N ok` count in the summary is the whole signal a clean
// unit carries.

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { diagnosticsReport } from './http-probe.js';
import type { SweepOutcome } from './types.js';

export function formatElapsed(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m${String(Math.floor(seconds % 60)).padStart(2, '0')}s`;
}

export function countUnits(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/**
 * Verdict tallies in a stable order: the sweep's primary verdict first and
 * always, then every other verdict that actually occurred, alphabetically so two
 * runs of the same sweep line up when diffed.
 */
function verdictParts(counts: Map<string, number>, primaryVerdict: string): string[] {
  const parts = [`${counts.get(primaryVerdict) ?? 0} ${primaryVerdict}`];
  for (const verdict of [...counts.keys()].filter(v => v !== primaryVerdict).sort()) {
    const n = counts.get(verdict) ?? 0;
    if (n > 0) parts.push(`${n} ${verdict}`);
  }
  return parts;
}

export interface Reporter<Unit> {
  complete(outcome: SweepOutcome<Unit>): void;
  finish(): void;
}

/**
 * Liveness comes from a single in-place counter line, clipped to the terminal
 * width so it overwrites itself instead of wrapping into a new row per tick.
 * Non-TTY output drops the counter entirely and just logs findings.
 */
export function createReporter<Unit>(
  total: number,
  primaryVerdict: string,
  retryHoldSuffix: () => string,
): Reporter<Unit> {
  const isTTY = process.stdout.isTTY === true;
  const counts = new Map<string, number>([[primaryVerdict, 0]]);
  let done = 0;
  let recovered = 0;
  const startedAt = Date.now();

  const clip = (text: string): string => {
    const width = process.stdout.columns ?? 80;
    return text.length >= width ? `${text.slice(0, width - 2)}…` : text;
  };

  const statusLine = (): string => {
    const parts = verdictParts(counts, primaryVerdict);
    if (recovered > 0) parts.push(`recovered ${recovered}`);
    return `[${done}/${total}] ${parts.join(' · ')} · ${formatElapsed(Date.now() - startedAt)}${retryHoldSuffix()}`;
  };

  const render = (): void => {
    if (isTTY) process.stdout.write(`\r\x1b[K${clip(statusLine())}`);
  };
  const timer = isTTY ? setInterval(render, 1000) : undefined;
  render();

  const emit = (text: string): void => {
    if (isTTY) {
      process.stdout.write(`\r\x1b[K${text}\n`);
      render();
    } else {
      console.log(text);
    }
  };

  return {
    complete(outcome: SweepOutcome<Unit>): void {
      // Clean verdicts are never tallied by name — they are the silent majority,
      // and `done` already counts them.
      if (outcome.finding) counts.set(outcome.verdict, (counts.get(outcome.verdict) ?? 0) + 1);
      done++;
      if (outcome.recovered) recovered++;
      if (!outcome.finding) return;

      emit(`${outcome.verdict.toUpperCase()}  ${outcome.label}`);
      for (const line of outcome.detail.split('\n')) {
        if (line.trim()) emit(`       ${line.trim()}`);
      }
    },
    finish(): void {
      if (timer) clearInterval(timer);
      if (isTTY) process.stdout.write('\r\x1b[K');
    },
  };
}

export function summarize<Unit>(
  outcomes: SweepOutcome<Unit>[],
  unitNoun: string,
  primaryVerdict: string,
  elapsedMs: number,
): string {
  const counts = new Map<string, number>([[primaryVerdict, 0]]);
  for (const outcome of outcomes) {
    if (!outcome.finding) continue;
    counts.set(outcome.verdict, (counts.get(outcome.verdict) ?? 0) + 1);
  }
  const okCount = outcomes.filter(o => !o.finding).length;
  const parts = [countUnits(outcomes.length, unitNoun), `${okCount} ok`, ...verdictParts(counts, primaryVerdict)];
  const recovered = outcomes.filter(o => o.recovered).length;
  if (recovered > 0) parts.push(`${recovered} recovered`);
  return `${parts.join(' · ')} · ${formatElapsed(elapsedMs)}`;
}

export function writeReport<Unit>(
  options: {
    outDir: string;
    fileStem: string;
    title: string;
    modelPreference: string;
    unitNoun: string;
    primaryVerdict: string;
  },
  outcomes: SweepOutcome<Unit>[],
  elapsedMs: number,
): string {
  mkdirSync(options.outDir, { recursive: true });
  const path = join(options.outDir, `${options.fileStem}.md`);

  const lines = [
    `# ${options.title} — ${options.modelPreference}`,
    '',
    summarize(outcomes, options.unitNoun, options.primaryVerdict, elapsedMs),
    '',
  ];

  for (const outcome of outcomes) {
    if (!outcome.finding) continue;
    const suffix = outcome.verdict === options.primaryVerdict ? '' : ` — ${outcome.verdict.toUpperCase()}`;
    // Recovery is noted, not hidden: the verdict is trustworthy, the model's
    // format compliance is not, and that is worth seeing when comparing models.
    const note = outcome.recovered ? ' _(verdict recovered from a malformed answer)_' : '';
    lines.push(`## ${outcome.label}${suffix}${note}`, '', outcome.detail, '');
  }

  lines.push(...diagnosticsReport(outcomes, options.unitNoun), '');

  writeFileSync(path, lines.join('\n') + '\n');
  return path;
}
