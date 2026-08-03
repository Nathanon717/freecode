/**
 * Parser for the answer shape every sweep so far asks for: one token on the
 * first line — `OK`, or the sweep's finding token — optionally followed by
 * detail lines.
 *
 * Weak models comply in spirit but not in shape: they wrap the answer in a code
 * fence, prepend a sentence of preamble, or leak a reasoning block first.
 * Recovering those is the job here. Two rules keep recovery from corrupting
 * results:
 *
 * 1. Matches are LINE-ANCHORED, never substring-anywhere. A scan for `DRIFT`
 *    anywhere in the text misreads `No drift found`; a scan for `OK` anywhere
 *    misreads `Looks OK at first glance, but:\nDRIFT\n- ...`. Only the first
 *    line that *starts* with a verdict token counts, whichever token that is.
 * 2. An unrecognized response is never coerced to `ok`. It stays `unparsed` with
 *    its raw text intact, because a silently-clean-by-default verdict
 *    under-reports findings — the exact failure this parser was written to fix.
 *
 * Parameterised by the finding token so a sweep does not have to re-derive the
 * recovery rules. `map-drift-classify.ts` binds it to `DRIFT`,
 * `dead-code-classify.ts` to `DEAD`; both are exercised by
 * tests/scripts/map-drift-classify.test.ts, which predates the generalization
 * and is the regression suite for it.
 */

export interface VerdictSpec<Finding extends string> {
  /** The token the prompt demands when there is something to report. Uppercase. */
  finding: Finding;
  /**
   * Extra words that, after a negation opener, still mean "clean": map-drift
   * accepts `No divergence`, dead-code accepts `No findings`. Written as regex
   * source and always alternated with the finding token itself, so `No dead`
   * needs no entry here. Uppercase.
   */
  negations?: string[];
}

export interface ParsedVerdict<Finding extends string> {
  verdict: Finding | 'ok' | 'unparsed';
  detail: string;
  /**
   * The verdict was only readable after normalizing away wrappers the answer
   * format forbids. Counted per run so format non-compliance stays a visible
   * measurement of the model instead of being laundered by the parser.
   */
  recovered: boolean;
}

/** A fence on its own line, with or without a language tag. */
const FENCE_LINE = /^\s*`{3,}\s*\w*\s*$/;

/**
 * Reasoning tags some OpenAI-compatible gateways inline into message content
 * instead of routing to a separate reasoning stream.
 */
const THINK_BLOCK = /<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi;
const THINK_OPENER = /<(think|thinking|reasoning)>[\s\S]*$/i;

/**
 * Emphasis, fence, heading, quote, and JSON punctuation stripped before
 * anchoring, so `**OK**`, `> OK`, `` `DRIFT` ``, and `{"verdict": "OK"}` all
 * reduce to something a prefix test can match.
 */
function normalizeLine(line: string): string {
  return line
    .replace(/[*_`#>"'{}]/g, '')
    .replace(/^\s*[-–—•]\s*/, '')
    .trim()
    .toUpperCase();
}

const LABEL = '(?:VERDICT|ANSWER|RESULT|CONCLUSION)\\s*[:\\-–—]?\\s*';
// Grouped: `/^OKAY?\b/` would parse as `OKA` plus an optional `Y` and reject a
// bare `OK` — the single most common compliant answer there is.
const OK_ANCHOR = /^OK(?:AY)?\b/;

interface Anchor<Finding extends string> {
  verdict: Finding | 'ok';
  /**
   * A negation phrase rather than a bare verdict token. `No drift is apparent in
   * the purpose statement.` reads as clean but is prose, and a real `DRIFT` may
   * follow it — so it is held, not returned, until the scan finishes.
   */
  tentative: boolean;
}

export function createVerdictParser<Finding extends string>(
  spec: VerdictSpec<Finding>,
): (text: string) => ParsedVerdict<Lowercase<Finding>> {
  const token = spec.finding;
  const found = token.toLowerCase() as Lowercase<Finding>;

  /** `Verdict: OK`, `Answer - DRIFT`, and the de-punctuated `{"verdict": "OK"}`. */
  const LABELLED = new RegExp(`^${LABEL}(OK(?:AY)?|${token}|NO\\s+${token})\\b`);
  /**
   * `No drift`, `No findings`, `None detected` — clean, despite containing the
   * finding word. Tested before the bare finding anchor. The gap is `[^A-Z]` so
   * only punctuation and spaces may sit between the two words: `No longer
   * matches — DRIFT` keeps its finding verdict because `LONGER` breaks the match.
   */
  const NEGATED = new RegExp(
    `^(?:NO|NOT|NONE|ZERO)\\b[^A-Z]{0,20}(?:${[`${token}\\w*`, ...(spec.negations ?? [])].join('|')})\\b`,
  );
  const FOUND_ANCHOR = new RegExp(`^${token}\\b`);
  /** Strips a leading (optionally labelled) finding token off the *original* line. */
  const FOUND_PREFIX = new RegExp(`^[\\s>*_\`#•–—-]*(?:${LABEL})?${token}\\b\\s*[:\\-–—]?\\s*`, 'i');

  const anchorOf = (normalized: string): Anchor<Lowercase<Finding>> | undefined => {
    const labelled = LABELLED.exec(normalized);
    if (labelled) return { verdict: labelled[1] === token ? found : 'ok', tentative: false };
    if (NEGATED.test(normalized)) return { verdict: 'ok', tentative: true };
    if (OK_ANCHOR.test(normalized)) return { verdict: 'ok', tentative: false };
    if (FOUND_ANCHOR.test(normalized)) return { verdict: found, tentative: false };
    return undefined;
  };

  return function parse(text: string): ParsedVerdict<Lowercase<Finding>> {
    const raw = text.trim();
    if (!raw) return { verdict: 'unparsed', detail: '(empty response)', recovered: false };

    // An unclosed opener means the response ended inside reasoning, so there is
    // no answer after it to keep. Dropping to end-of-text yields `unparsed`
    // rather than letting a stray reasoning line anchor a verdict; the raw text
    // survives in `detail` either way, so nothing is lost.
    const body = raw.replace(THINK_BLOCK, '').replace(THINK_OPENER, '').trim();

    // Fence lines are dropped wherever they appear, not just as an outer
    // wrapper — that is what stops a closing fence from riding along into detail.
    const lines = body.split('\n').filter(line => !FENCE_LINE.test(line));

    // Compliance is judged against the strict contract: verdict on the very
    // first line of the untouched response, no unwrapping required.
    const strict = anchorOf(normalizeLine(raw.split('\n')[0]));
    const wasRecovered = (index: number, verdict: Lowercase<Finding> | 'ok'): boolean =>
      index > 0 || strict?.verdict !== verdict;

    let held: number | undefined;

    for (let i = 0; i < lines.length; i++) {
      const anchor = anchorOf(normalizeLine(lines[i]));
      if (!anchor) continue;

      // A held negation loses to any later bare finding token. Ties break toward
      // reporting a finding, never toward the silent clean verdict.
      if (anchor.tentative) {
        held ??= i;
        continue;
      }

      if (anchor.verdict === 'ok') {
        return { verdict: 'ok', detail: '', recovered: wasRecovered(held ?? i, 'ok') };
      }

      // Sliced from the match index, not from a fixed offset. Slicing from line
      // 1 once the verdict can appear lower down would either drop the first
      // detail bullet or prepend the model's preamble into the finding.
      const sameLine = lines[i].replace(FOUND_PREFIX, '').trim();
      const after = lines.slice(i + 1).join('\n').trim();
      const detail = [sameLine, after].filter(Boolean).join('\n').trim();
      return { verdict: found, detail: detail || raw, recovered: wasRecovered(i, found) };
    }

    if (held !== undefined) return { verdict: 'ok', detail: '', recovered: wasRecovered(held, 'ok') };
    return { verdict: 'unparsed', detail: raw, recovered: false };
  };
}
