# Dead-code sweep across nine Mistral models

Nine models, the full 111-file `src/` tree each, `--concurrency 4`, one process at a
time. `mistral-large-2512` was excluded by request. Per-model reports are the
`mistral-*.md` files beside this one.

All nine ids resolve as distinct models. `mistral-medium-latest` is **not** an alias of
`mistral-medium-2508` — the live models endpoint reports it as `mistral-medium-2604`, a
newer snapshot, so 2505 / 2508 / latest are three different models.

## The headline

**71 findings across the nine models are mechanically false** — no sampling, no judgement:
each one calls an export dead when the reference table the model was handed lists external
callers, or tells us to unexport something that is not exported.

**And of the beyond-table findings, 26 of 26 hand-checked are also false.** Not "low
precision" — zero correct.

The sweep's prompt already contains a reference table listing, for each export, the actual
lines where its name occurs across `src/`, `tests/`, `scripts/` and `docs/`. 54 of the 589
exports have no reference outside their own file. So a finding falls into one of two kinds:

- **Echoes the table** — flags one of those 54. Requires no reasoning; the answer was in
  the prompt.
- **Beyond the table** — a claim about a file-local symbol, which the table does not cover.
  This is the only place a model can add value, and it is where all the fabrication is.

## Results

Counts exclude `error` verdicts (failed calls, not claims about code).

| model | wall | findings | echoes table | of 54 | contradicts table | beyond table | terminal 429s |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ministral-3b-2512 | 1m25s | 27 | 3 | 3 | 0 | 19 | 0 |
| ministral-8b-2512 | 1m33s | 0 | 0 | 0 | 0 | 0 | 0 |
| codestral-2508 | 1m34s | 72 | 29 | 29 | 3 | 40 | 0 |
| ministral-14b-2512 | 3m01s | 205 | 52 | 52 | 24 | 126 | 3 |
| devstral-2512 | 3m03s | 61 | 54 | 54 | 7 | 0 | 0 |
| mistral-medium-2505 | 3m34s | 91 | 51 | 51 | 25 | 15 | 6 |
| mistral-medium-2508 | 3m48s | 58 | 52 | 52 | 6 | 0 | 3 |
| mistral-small-2603 | 4m11s | 63 | 43 | 43 | 3 | 17 | 0 |
| mistral-medium-latest | 9m02s | 58 | 54 | 54 | 3 | 1 | 0 |

**Contradicts table** is mechanically falsified, no judgement involved: the model called an
export dead when the table it was shown lists external callers, or told us to unexport
something that is not exported. `ministral-14b` did this 24 times, `mistral-medium-2505`
25 times.

> **Correction.** That rule has a blind spot, found while writing
> [comparison-zen.md](comparison-zen.md): a **re-export** entry whose only external
> "reference" is the re-exported symbol's own definition shows a non-zero count, so calling
> it dead is scored as a contradiction even when it is right. The three
> `transcript-renderer.ts` re-exports (`DiffEntry`, `formatParsedToolCallLine`,
> `formatRationaleLine`) are genuinely dead — nothing imports them from that file — and
> `devstral`, `medium-2508` and `medium-latest` were each wrongly charged for flagging them.
> The 71 figure is inflated by this class. The 0-of-26 hand-check result is unaffected.

Three models — devstral, medium-2508, medium-latest — flagged 54, 52 and 54 of the 54
zero-reference exports and produced 0, 0 and 1 findings beyond them. They are reading the
table back. That is a faithful summary of the precompute and nothing more; `grep` already
produced that list for free.

Why the 54 can be trusted as a baseline: `dead-code-index.ts` matches identifiers textually
and therefore *over-reports* references — an unrelated local sharing a name counts as a hit,
and two files exporting the same name share one entry. The bias is deliberately
one-directional (its header comment says so). So a zero-external-reference count that
survives an inflating index is solid, and agreeing with it costs the model nothing.

## The hand-check

Fixed rule, chosen before the last reports landed: the first five beyond-table findings per
model in report order. 26 findings across six models. Every one is false:

| claim | reality |
| --- | --- |
| `systemPromptLogged` never read (codestral, 14b, small) | read at `loop.ts:358` |
| `FAKE_NATIVE_PROVIDER_ID`, `FAKE_PROVIDER_ID`, `assertFakeFixtureComplete`, `createFakeNativeLanguageModel` imported but never used (14b) | used at `loop.ts:304`, `365`, `398`, `305` |
| `appendToolTrace` / `ToolTraceEvent` never used (codestral) | called at `tools/index.ts:135`, `157` |
| `EXPLORE_PROMPT` unused (codestral) | used at `registry.ts:37` |
| `hintRest` unused (codestral) | used at `toggles.ts:88`, `101` |
| `formatDuration`, `estimateBucket`, `padNumberText`, `padDurationText` unused (small) | used at `footer-status.ts:81`, `108`, `95`, `96` |
| `tableConfirmed`, `codeLang`, `codeLines`, `joinResults` dead (3b) | all live; cited line numbers do not match the file |
| `_overlayEpochStarted`, `_resizeDebounce`, `_onResizeCallback` set but never read (medium-2505) | read at `bottom-ui.ts:322`, `431`, `456` |
| `fuzzyMatch`, `getRawFilteredCommands` unused (medium-2505) | used at `slash-commands.ts:44`, `58`, `62` |
| `headerNum` never used (medium-latest) | used 9 times in `quota/headers.ts` |

The last one is the clearest tell: medium-latest's own justification names the two functions
that call `headerNum`, then concludes it is never used.

Note that most of these claims are about *imports* and *locals* — exactly what
`@typescript-eslint/no-unused-vars` and `strict` already zero out. The models are
confidently reporting a class of defect the build would not compile with.

## Recall

Two findings in `src/agent/loop.ts` were hand-verified as real (the `!useParsedToolsFallback`
guard at line 249 is unreachable-true; the `mdStream` initializer at 113 is overwritten by
`openAttempt` before any read). `zen:deepseek-v4-flash-free` found both.

**Read zen's 2/2 as a tuning artifact, not a baseline.** (It was also not stable: the later
full 111-file run of the same model found one of the two. See
[comparison-zen.md](comparison-zen.md).) The `[dead]` enumeration in
`SYSTEM_PROMPT` includes "a guard for a state an earlier check already excluded" and "a value
computed and never read" — those two clauses are these two findings stated abstractly. The
zen report is a 12-file run whose only findings section is `loop.ts`, written 27 minutes
before the prompt was committed and never committed itself: the `--only … --limit` iteration
loop from `docs/sweeps.md`. The prompt was fit to those findings, so zen rediscovering them
is not independent evidence of recall.

**All nine Mistral models found neither** — and that is the part the confound does not
excuse. Every model was handed the same primed prompt, with both defect shapes spelled out in
the tag definition, and none produced either. `ministral-14b` produced 11 findings on that
exact file and hit neither, all 11 false.

What this measures honestly: not "zen is better at recall," but "these two defect shapes are
described verbatim in the prompt and nine models still missed them." A clean recall
comparison would need probe findings chosen independently of the prompt text.

## Format compliance

`recovered` counts verdicts salvaged from a malformed answer — the verdict was readable, the
format was not. `ministral-3b` needed salvaging on **86 of 111** answers, `ministral-14b` on
48, `devstral` on 15, `medium-2508` on 20. The rest were clean. `createVerdictParser` in
`scripts/sweep/binary-verdict.ts` absorbed all of it without a single unparsed verdict, which
is the parser doing its job.

## ministral-8b

`111 ok · 0 dead`. It never made a claim. Probed directly against `footer-status.ts` — the
file where `mistral-small` produced four false findings — it still returned `ok`.

Read against the rest of this table, that is not obviously the worst result. Every claim
every other model made and that could be checked was wrong, so a model that says nothing
costs nothing to verify. But it is silence, not detection: there is no evidence 8b would
report a real finding either, and it missed both known-real ones.

## Rate limits

Mistral's free tier reports `x-ratelimit-limit-req-minute: 30` with `remaining 0` on every
429, and **none of the 429s carried a `retry-after` header** — so backoff was entirely the
adapter's self-computed `2^attempt`, capped by `maxWaitMs`.

Three ceilings bound the wait, so it is never arbitrarily long:

1. `fetchWithRetry` retries 429/503 at most **5 times**, then returns the last response as-is
   (`src/providers/adapters/adapter-http-retry.ts`). Max 6 requests per file, visible in the
   reports' `Requests per file: max 6`.
2. Every wait is abortable and bounded by the per-unit `AbortSignal.timeout(300_000)` in
   `scripts/sweep/sweep.ts`. A server `retry-after` is honored in full *only up to* that
   5-minute ceiling — this is the real bound, and the one that would matter against a
   provider that does send day-scale `retry-after`.
3. `streamText` adds its own `maxRetries: 2`.

When exhausted, the unit becomes an `error` verdict with the HTTP detail and the run
continues. One file dies, not the sweep.

Handled vs terminal throttling is the distinction that matters, and the reports separate
them. `mistral-small` absorbed **131** 429s and `mistral-medium-latest` **350**, both with
zero terminal — the per-provider gate parked workers and every file eventually answered.
`medium-latest`'s 9m02s wall time is almost entirely that parking; its median latency was
1.3s, the fastest of the nine.

`ministral-14b` (3), `medium-2505` (6) and `medium-2508` (3) lost files to terminal 429s.
Those models answered 108, 105 and 108 files respectively, not 111 — their counts above are
not on the same opportunity set as the rest.

## Caveats

- `docs/sweeps.md` is explicit that verdicts are not reproducible at `temperature: 0`. A
  single sweep is a list of things to look at, not a measurement. Treat the finding *counts*
  as noisy; the 26/26 falsification rate and the 0/9 recall are the robust results.
- The hand-check is a fixed-rule sample, not exhaustive. 26 of 218 beyond-table findings were
  checked. The rate was 100%, but the remaining 192 are unverified.
- `zen-deepseek-v4-flash-free.md` in this directory has since been replaced by a full
  111-file run; the 12-file report this section was written against no longer exists. See
  [comparison-zen.md](comparison-zen.md) — on the full run the same model found only *one*
  of the two `loop.ts` findings, so the 2/2 cited below was not reproducible.

## Conclusion

For this sweep, on this codebase, none of these nine models is usable. The best of them
restate a table `grep` already produced; the rest add fabrications at a rate that would cost
more to triage than the sweep saves.

What was actually established, across 987 answered files:

- **71 findings mechanically falsified** against the model's own input, all nine models —
  minus the re-export class noted in the correction above, which inflates this figure.
- **26 of 26 hand-checked beyond-table findings false**, six models, fixed-rule sample.
- **0 of 2 recall** on the known-real pair in `src/agent/loop.ts`, all nine models, despite
  both defect shapes being spelled out in the prompt's own `[dead]` definition.

Not established: that the 192 unchecked beyond-table findings are all false. The sample rate
was 100%, but they are unverified.
