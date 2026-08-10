/**
 * Verdict parser for the two drift sweeps: map-drift.ts and intent-drift.ts.
 *
 * Lives in its own module for one reason: both callers invoke `runSweep()` at
 * module scope, so importing one from a test would launch a full sweep.
 * Everything here is pure, so tests/scripts/drift-classify.test.ts can
 * table-test it against real captured responses.
 *
 * The recovery rules — line-anchored matching, never coercing an unreadable
 * answer to `ok` — live in scripts/sweep/binary-verdict.ts, shared with every
 * other OK/<token> sweep. All that is drift's own is the token and the
 * synonym models reach for when they mean "no drift".
 */
import { createVerdictParser } from '../sweep/binary-verdict.js';

export type Verdict = 'ok' | 'drift' | 'error' | 'unparsed';

export interface Classification {
  verdict: Verdict;
  detail: string;
  /**
   * The verdict was only readable after normalizing away wrappers the answer
   * format forbids. Counted per run so format non-compliance stays a visible
   * measurement of the model instead of being laundered by the parser.
   */
  recovered: boolean;
}

export const classify: (text: string) => Classification = createVerdictParser({
  finding: 'DRIFT',
  negations: ['DIVERGEN\\w+'],
});
