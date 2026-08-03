import type { SweepOptions } from './args.js';

/**
 * What a sweep's `classify` makes of one answer. `verdict` is a free-form tag —
 * the framework only ever compares it for equality and prints it — so a sweep
 * picks whatever vocabulary it reasons in (`drift`, `unparsed`, `stale`).
 */
export interface SweepVerdict {
  verdict: string;
  /**
   * Whether this outcome is worth a line in the report. Clean units are silent:
   * on a sweep where most units pass, listing them buries the hits.
   */
  finding: boolean;
  detail: string;
  /** Verdict read only after unwrapping a non-compliant answer, if the sweep tracks that. */
  recovered?: boolean;
}

/** The verdict the framework assigns itself when a call throws. */
export const ERROR_VERDICT = 'error';

export interface SweepOutcome<Unit> {
  unit: Unit;
  /** `definition.label(unit)` — the identity a report line and a 429 timeline use. */
  label: string;
  verdict: string;
  finding: boolean;
  detail: string;
  recovered: boolean;
  durationMs: number;
  /** Run-relative start, so failures can be checked for clustering in one window. */
  startedAtMs: number;
  /** Physical HTTP requests this unit made, retries included. See installFetchProbe. */
  requests: number;
}

export interface SweepDefinition<Unit> {
  /** Report title and default output filename stem. */
  name: string;
  /** Singular noun for one unit, pluralized with `s` in counts: "pair" -> "7 pairs". */
  unitNoun: string;
  /**
   * Every unit the sweep could examine, in report order. `--only` and `--limit`
   * are applied by the framework afterwards, against `label`, so a sweep that
   * validates its whole input set (map-drift warns about unpaired source files)
   * still sees everything here regardless of the filters.
   */
  collect(): Unit[];
  label(unit: Unit): string;
  /**
   * One `--dry-run` line. Defaults to `label`; a sweep whose unit spans several
   * files overrides it to show the whole unit, since dry-run exists to check the
   * unit rule and a label alone would hide half of what each call will send.
   */
  describe?(unit: Unit): string;
  /**
   * The verdict this sweep exists to find (map-drift: `drift`). Always shown in
   * the live counter even at zero — on a sweep where almost every unit is clean,
   * a visible `drift 0` is the difference between "working, found nothing" and
   * "silently broken". Other verdicts appear only once they occur.
   */
  primaryVerdict: string;
  /** Sent as the system prompt verbatim. No freecode agent prompt, no tools. */
  system: string;
  user(unit: Unit): string;
  classify(text: string): SweepVerdict;
  /** Per-unit ceiling. Long by default: the biggest units are slow, not stuck. */
  timeoutMs?: number;
  temperature?: number;
}

export type { SweepOptions };
