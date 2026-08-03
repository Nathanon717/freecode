/**
 * Verdict parser for scripts/diagnostics/dead-code.ts.
 *
 * Own module because dead-code.ts calls `runSweep()` at module scope — see
 * dead-code-index.ts for the same note. The recovery rules are shared with every
 * other OK/<token> sweep in scripts/sweep/binary-verdict.ts; all that is this
 * sweep's own is the token and the phrasings models reach for when they mean
 * "nothing to delete here".
 */
import { createVerdictParser } from '../sweep/binary-verdict.js';

export type Verdict = 'ok' | 'dead' | 'error' | 'unparsed';

export interface Classification {
  verdict: Verdict;
  detail: string;
  recovered: boolean;
}

export const classify: (text: string) => Classification = createVerdictParser({
  finding: 'DEAD',
  // `No dead`/`No dead code` need no entry — the token itself is alternated in.
  // These are the ways a model says clean without using the word at all.
  negations: ['FINDINGS?', 'ISSUES?', 'UNREACHABLE\\w*', 'UNUSED\\w*', 'CRUFT', 'STALE\\w*'],
});
