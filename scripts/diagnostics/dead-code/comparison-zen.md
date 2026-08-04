# Dead-code sweep across five Zen models

Five models, the full 111-file `src/` tree each, default `--concurrency 8`, one process at
a time (Zen's quota is per IP, so concurrent *models* would compete for one budget).
Per-model reports are the `zen-*.md` files beside this one.

`hy3-free` is in `src/providers/model-snapshot.json` but Zen no longer serves it:
`HTTP 401 Unauthorized: Model hy3-free is not supported`. Five of the six listed ids ran.

The reference index reports `589 exports across 111 files, 54 with no reference outside
their own file` — identical to the numbers in [comparison-mistral.md](comparison-mistral.md).
The codebase has not moved between the two sweeps, so the comparisons share a basis.

## The headline

**The Mistral result does not replicate.** That sweep found 71 mechanically false findings
and 0 of 26 hand-checked beyond-table findings correct. Here:

- **0 of 98 `[unexport]` findings contradict the table.** Every one names a member of the 54.
- **14 of 16 hand-checked `[dead]`/`[stale]` findings are true**, verified against the source.
- Three findings are correct in a way the precompute **structurally cannot be** — see below.

The failure mode also moved. Mistral's models fabricated; Zen's weakest model instead
*fails to answer at all* — `north-mini-code-free` lost 39 of 111 files to timeouts.

## Results

Counts exclude `error` and `unparsed` verdicts (failed or unreadable calls, not claims).

| model | wall | files answered | findings | `[unexport]` | echoes table | contradicts table | hand-check bucket |
| --- | --- | --- | --- | --- | --- | --- | --- |
| mimo-v2.5-free | 2m26s | 109 | 16 | 16 | 16 | 0 | 0 |
| big-pickle | 8m25s | 109 | 31 | 18 | 18 | 0 | 13 |
| nemotron-3-ultra-free | 10m23s | 107 | 25 | 22 | 22 | 0 | 3 |
| deepseek-v4-flash-free | 10m30s | 107 | 26 | 16 | 16 | 0 | 10 |
| north-mini-code-free | 38m29s | 63 | 29 | 26 | 26 | 0 | 3 |

**The mechanical rule is narrower than the Mistral doc's, deliberately.** Only `[unexport]`
has an unambiguous subject — the export it names. `[dead]` and `[stale]` findings are
usually about a branch, a local, or a comment *inside* an exported function, so scoring them
against the export table produces false "contradictions". A first pass that took the leading
symbol from every tag scored big-pickle's unreachable-timer-branch finding as a claim that
`setupFooterUI` is dead. It is not; that finding is true. Every `[dead]`/`[stale]` finding
here went to hand-check with no bucket assigned by script.

`mimo-v2.5-free` is the pure readback case: 16 findings, all 16 `[unexport]`, all 16 in the
54, nothing else. That is `grep`'s output restated — the devstral pattern from the Mistral
sweep, at a fifth of the wall time.

## The three re-export findings

`big-pickle` flagged three re-export lines in `src/cli/render/transcript-renderer.ts` as
dead: `DiffEntry` (line 23), `formatParsedToolCallLine` and `formatRationaleLine` (lines 41,
43). All three are **correct**, and all three are cases the index marks LIVE.

```
DiffEntry                 defined src/util/line-diff.ts:1 · re-exported here:23 · no importer · no self-use
formatParsedToolCallLine  defined src/cli/render/transcript-format.ts:68 · imported here:10 · re-exported here:41 · used here:303 via the import
formatRationaleLine       defined src/cli/render/transcript-format.ts:55 · imported here:11 · re-exported here:43 · used here:298 via the import
```

No file anywhere imports these names *from* `transcript-renderer`. The index counts the
symbol's own definition site as an external reference, so all three show a non-zero external
count — exactly the over-reporting that `dead-code-index.ts:11-20` documents and calls
one-directional. The model was shown the matching *lines*, discounted the bad match, and
reported the re-export dead. That is the header comment's stated design working.

**This corrects a count in [comparison-mistral.md](comparison-mistral.md).** Its
"contradicts table" rule — *calls an export dead when the table lists external callers* —
scores these three as mechanically false. They are true. `devstral`, `medium-2508` and
`medium-latest` each flagged the same three and were charged with contradictions for it. The
rule has a blind spot for re-export entries whose only external "reference" is the
re-exported symbol's own definition, and the 71 figure is inflated by that class. The other
component of that doc's conclusion — 0 of 26 hand-checked findings correct — is untouched.

## The hand-check

Fixed rule, declared before looking: **the first five `[dead]`/`[stale]` findings per model,
in report order.** `mimo` produced none, so 16 findings across four models.

**14 of 16 are true.**

| model | claim | verdict |
| --- | --- | --- |
| big-pickle | `wrap`'s comment says read-only tools skip confirmation | **true** — `wrapAll` (`index.ts:401`) omits `requiresConfirmation`, which defaults `true` at `:369`; only `spawn_agent` (`:424`) passes `false` |
| big-pickle | `size` in `list-dir.ts` is set and never read | **true** — assigned at `:29`, `:32`; no read anywhere |
| big-pickle | timer branch at `bottom-ui.ts:305` is unreachable | **true** — `neededCount = Math.max(2, …)` at `:81` and `maxRows = 2` when input is active at `:79` pin `footerRowCount` to 2, so it can never differ from `prevFooterRowCount` |
| big-pickle | `drawFooter`'s "two footer rows" comment is stale | **true** — `composeFooterOutput` emits up to 3 (`:79`) |
| big-pickle | `buildCustomEvalTab`'s comment says Run calls `choose(scenarios)` | **true** — `:97` calls `choose([scenarios[ctx.getSelected()]])`, one scenario |
| deepseek | `!useParsedToolsFallback` at `loop.ts:249` is always true | **true** — the known-real finding |
| deepseek | `textOf`'s string branch is dead | **true** — sole call site `:122` is guarded by `Array.isArray` at `:120` |
| deepseek | `getSelectedModel() ?? …` never falls back | **true** — declared `: string` at `command-dispatcher.ts:29`; `??` at `:105`, `:111` is unreachable |
| deepseek | `failedChecks.length > 0` is redundant | **true** — `:316`'s filter is the exact negation of `:303`'s `every`, so `!allPassed` implies it |
| deepseek | `(model \|\| "")` never changes the value | **true** — `model: string` at `:114` |
| nemotron | same `wrap` comment as big-pickle | **true** — concurring, independently |
| nemotron | `hintRest`'s "e.g. 'sk' for Ask" is stale | **true** — the three toggle labels are `show toggle names`, `auto-run tools`, `read-only`; no Ask toggle |
| nemotron | `endTranscriptStep`'s JSDoc says `hasMore=false` writes the divider | **true** — `:210` defers it and `:211`'s own comment says it may never be written |
| north-mini-code | `Conversation.projectRoot` is never read | **true** — assigned at `:9`, read nowhere on a `Conversation` |
| north-mini-code | `clearMessages` is never called | **false** — `command-dispatcher.ts:226`, plus two test files |
| north-mini-code | `InlineActionMenu.reset` is never referenced | **false** — `list-menu.ts:271`, `:358`, plus its test |

Both false findings are `north-mini-code-free`'s, and both are the Mistral failure mode
exactly: asserting a symbol is unreferenced when the reference table it was handed lists the
callers. Its third finding is true, so it is 1/3, against 5/5, 5/5 and 3/3 for the rest.

Note what the true findings are *about*. Unreachable branches, stale comments, and
`??`/`||` fallbacks that the declared types make dead — none of which
`@typescript-eslint/no-unused-vars` or `strict` can see. This is the class of defect the
sweep's header comment says it exists to find.

## Recall, and a reproducibility result

Two findings in `src/agent/loop.ts` are hand-verified real: the `!useParsedToolsFallback`
guard (now `:249`) and the `mdStream` initializer (`:113`, overwritten at `:141`). Both are
still present in the source.

The previous `zen-deepseek-v4-flash-free.md` was a 12-file `--limit` run and found **both**.
The full 111-file re-run of the *same model on the same prompt* found **one** — the guard,
not the initializer.

That is the cleanest evidence yet for the warning in [../../../docs/sweeps.md](../../../docs/sweeps.md)
that verdicts are not reproducible at `temperature: 0`. It also means a single sweep
under-reports: the finding did not stop being real.

No other Zen model scored on the pair. `big-pickle` returned an empty answer for `loop.ts`
(`UNPARSED`), `north-mini-code-free` timed out on it, and `mimo` and `nemotron` returned
`ok`. So the honest recall line is **1/2 for deepseek, 0/2 for mimo and nemotron, no
opportunity for big-pickle and north-mini-code** — not the 2/2 the old partial report
suggested.

The tuning confound from the Mistral doc still stands: `SYSTEM_PROMPT`'s `[dead]` definition
names both defect shapes abstractly, so deepseek rediscovering one is not independent
evidence of recall.

## north-mini-code-free, and two bugs it exposed

`46 ok · 17 dead · 39 error · 9 unparsed · 38m29s`. It answered 63 of 111 files.

**Why it timed out is undetermined.** It was the slowest of the five in pre-flight
(~86s/file), but that alone does not explain the pattern: four units started at 0.0s and all
died at exactly ~300.6s, which looks like requests that never returned rather than requests
that ran long. Zen's budget is per IP and shared with everything else on the connection
(`docs/sweeps.md`), so contention is a candidate too. The diagnostics as they stand cannot
separate these — which is the first bug below, not an incidental gap.

Its report's HTTP diagnostics say:

```
- requests: 111 for 111 files (200×111)
- 429 responses: 0 total, of which 39 were terminal (retries exhausted, surfaced as an error)
```

**That is self-contradictory, and it is a bug in the sweep engine.** All 111 requests
returned 200; there were no 429s. All 39 failures are `The operation was aborted due to
timeout`, ~300.6s each — the per-unit `AbortSignal.timeout(300_000)`.

The cause is `scripts/sweep/http-probe.ts:116`:

```ts
const rateLimited = attempts.filter(a => a.status === 429);
const failed = outcomes.filter(o => o.verdict === ERROR_VERDICT);
```

`failed` counts **every** error verdict regardless of cause, but `:123` renders it on the
429 line as "of which N were terminal". So the number is right about *something* — units
that ended in an error — and wrong about the only thing that line claims.

This defeats the stated purpose of the section. `docs/sweeps.md` says the diagnostics exist
so that "handled rate limiting (retried, then answered) can be told apart from terminal rate
limiting (retries exhausted, reported as an error)" — and here it reports rate limiting that
never happened. The same mislabelling inflates `deepseek`'s 3 and `nemotron`'s 3.

Second bug: `nemotron`'s three errors print `[object Object]` instead of a message. The
formatter is `error instanceof Error ? error.message : String(error)`
(`scripts/sweep/sweep.ts:54`) — correct for `Error`, but a thrown plain object falls to
`String(error)`, which is `"[object Object]"`. Those three failed in 0.6–1.7s, so they were
real, fast API errors, and unlike the timeouts nothing about them is recoverable from the
report.

Both live in `scripts/sweep/`, not `src/`. **Both are now fixed** — see
[../../../docs/bug log/04-08-2026.md](../../../docs/bug%20log/04-08-2026.md). Terminal 429s
are counted from each unit's last attempt status rather than its verdict, failures are split
by cause, and thrown plain objects are stringified. The five reports in this directory
predate the fix, so their diagnostics sections still show the miscount described above.

## Caveats

- Verdicts are not reproducible; the deepseek recall result above is a direct demonstration.
  Treat every count here as noisy. The robust results are the *zero* contradictions across
  98 `[unexport]` findings and the 14/16 hand-check rate.
- The hand-check covers 16 of the 29 `[dead]`/`[stale]` findings by the fixed rule, plus the
  3 `transcript-renderer` re-exports verified separately. **10 are unverified.**
- The "0 of 98" result depends on correctly extracting each `[unexport]` finding's subject.
  The extractor takes the leading token and falls back to the first backticked identifier;
  a fallback hit could name something other than the claim's subject. **Zero of the 98 used
  the fallback**, so every symbol scored is the one the finding leads with.
- `north-mini-code-free`'s numbers are on 63 answered files, not 111. It is not on the same
  opportunity set as the other four, and its finding count is correspondingly understated.
- "Echoes table" is not a criticism of correctness — those findings are right. They are just
  free: `grep` produced that list of 54 already.

## Conclusion

**`zen:big-pickle` is worth running; the rest mostly are not.** It produced 13 findings
beyond the precompute, 5 of 5 sampled were true, and 3 of them are correct in a way the
index cannot be. `deepseek-v4-flash-free` is the runner-up at 10 beyond-table findings and
5/5 — slower, and it dropped a known-real finding its own earlier run had caught.

`nemotron-3-ultra-free` is accurate but thin (3 beyond-table findings for 10m23s).
`mimo-v2.5-free` adds nothing to `grep`, but does it in 2m26s. `north-mini-code-free` should
not be used: 38m29s, 43% of files lost, and the only false findings in the sweep.

The broader result is that the Mistral conclusion — "none of these models is usable" — was a
fact about those models, not about the sweep. On the same prompt, the same tree and the same
reference table, Zen's models make claims that are overwhelmingly true.
