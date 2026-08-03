# Sweeps

A **sweep** is one bare LLM call per unit across a whole tree, with the per-unit verdicts
collected into a findings-only report. `npm run map-drift` is the original;
`scripts/sweep/` is the engine every other sweep should be built on.

Sweeps exist because free providers invert the unit economics — see
[subagents/README.md](subagents/README.md) for why exhaustive, low-hit-rate work becomes
rational when N is free. Sweeps worth writing but not yet written are at the bottom of
this file.

## A sweep is not `freecode -p`

This is the distinction that decides which tool to reach for.

| | `freecode -p` | a sweep |
| --- | --- | --- |
| System prompt | freecode's coding-agent prompt, tool roster, `AGENTS.md` | **the sweep's own, verbatim** |
| Tools | `read`, `grep`, `list_dir` | **none** |
| Turns | agent loop, up to 50 tool calls | **one call, one answer** |
| Input | the model explores and finds it | **inlined by the sweep** |

The model running a sweep does not know what freecode is, and should not. It sees a task
and its inputs. A sweep asking "does this page still describe this code?" needs the two
files and an auditor prompt — hand it a coding-agent identity and project instructions and
every verdict is contaminated by context the unit prompt never asked for.

Reach for `-p` when you want an agent to *investigate*. Reach for a sweep when you want the
same narrow question asked of every unit in a tree.

## Writing one

A sweep script supplies what makes it that sweep, and nothing else:

```ts
import { runSweep, type SweepVerdict } from '../sweep/sweep.js';

runSweep<Unit>(
  {
    name: 'Map drift',        // report title
    unitNoun: 'pair',         // "7 pairs"
    primaryVerdict: 'drift',  // always shown in the live counter, even at zero
    collect: collectPairs,    // every candidate unit, in report order
    label: unit => unit.sourceRelative,
    describe: unit => `${unit.sourceRelative} -> ${unit.mapRelative}`,  // optional, --dry-run only
    system: SYSTEM_PROMPT,
    user: buildUserPrompt,
    classify,                 // answer text -> { verdict, finding, detail, recovered? }
  },
  process.argv.slice(2),
  { outDir: join(__dirname, 'map-drift') },
).then(code => { process.exitCode = code; })
 .catch(error => { console.error(error); process.exitCode = 1; });
```

Everything else — flags, concurrency, retries, the report, HTTP diagnostics, credentials —
comes from the engine. `scripts/diagnostics/map-drift.ts` is the worked example.

### The three decisions that are yours

**`collect`** returns *every* candidate unit, unfiltered. `--only` and `--limit` are applied
by the engine afterwards, against `label`. That ordering is deliberate: a sweep that
validates its own input set (map-drift warns about source files with no map page) must see
the whole set even on a `--limit 2` iteration run.

**`user`** inlines what the unit is about. Do not write a prompt that names a path and hopes
the model reads it — it has no tools. A unit's prompt is complete or the verdict is a guess.

**`classify`** turns answer text into a verdict. `finding: false` means "clean" — clean units
are silent in both the live output and the report, because on a sweep where most units pass,
listing them buries the hits. The engine assigns `error` itself when a call throws; pick any
other vocabulary you like.

## Flags

Every sweep takes the same set:

| Flag | Effect |
| --- | --- |
| `--model <provider:model>` | Free models only. Defaults to the configured `defaultModel`. Given twice, it errors. |
| `--only <substring>` | Keep units whose label contains this. |
| `--limit <n>` | Stop after n units, applied after `--only`. |
| `--concurrency <n>` | In-flight requests (default 8). |
| `--out <dir>` | Report directory. |
| `--dry-run` | List the units and exit. Touches no provider and spends nothing. |

An unknown flag, a missing value, or a non-positive `--limit`/`--concurrency` stops the run.
A sweep is long and spends real quota; a typo that silently reverts to a default wastes the
whole thing.

`--only agent/ --limit 5` is the prompt-iteration loop — cheap enough to run repeatedly
while tuning a system prompt.

## Free models only, always

A sweep sets `FREECODE_FREE_ONLY=1` before loading any credential, so paid keys are never in
the process and a paid `--model` is refused by name. Same rule as `freecode -p`, for a
sharper reason: a sweep is one call per unit across a tree, which is exactly where an
accidental paid model stops being one mistake and becomes a hundred. See
[providers.md](providers.md) for which providers are free.

The refusal happens once, before any unit runs — not once per unit.

## Concurrency and rate limits

Concurrent units share the per-provider retry gate in
`src/providers/adapters/adapter-http-retry.ts`: one worker meeting a 429 parks the rest for
the same window instead of each rediscovering the limit alone. That gate is why a sweep runs
in one process rather than as N spawned CLI calls.

Note that keyless providers (Zen) are rate-limited **per IP, not per key**, so a wide sweep
shares one budget with everything else on the connection, including an interactive REPL.

Every report ends with an HTTP diagnostics section: one line per physical request the run
made, so handled rate limiting (retried, then answered) can be told apart from terminal rate
limiting (retries exhausted, reported as an error). A verdict alone cannot distinguish them —
a unit that ate five 429s and then answered looks identical to one that never saw a limit.

## Reading a report

```
# Map drift — zen:big-pickle

107 pairs · 104 ok · 2 drift · 1 unparsed · 1 recovered · 14m12s
```

Findings only: clean units never get a section. `recovered` counts verdicts read out of a
malformed answer — the verdict is trustworthy, the model's format compliance is not, and
that gap is worth seeing when comparing models.

**Verdicts are not reproducible.** Free providers are nondeterministic at `temperature: 0`;
the same pair can come back `ok` on one run and `drift` on the next. Treat a single sweep as
a list of things to look at, not as a measurement. If you need to compare two *code* states,
compare the prompts, not the verdicts.

## Candidate sweeps

Not written yet. A sweep on this engine is tens of lines, so an entry here is an
afternoon's work away from being real — **write it or delete it, do not curate it.** Keep
this list at five or fewer: adding a sixth means running one first. Once a sweep exists,
it is a script in `scripts/diagnostics/`, and its entry here goes away.

Roughly ordered by expected value.

**Pre-read triage.** Unit = one file, prompt = *"Is this file relevant to \<task\>?
yes/no plus 10 words of why."* The lead then reads only the yes-list. Attacks the lead's
single largest cost — reading files that turn out to be irrelevant. Needs the task
inlined per run, so the user prompt is parameterised in a way map-drift's is not.

**Doc-drift generalized.** `map-drift` proves the shape for map pages; the same unit
prompt applies to any doc that describes code — does `providers.md` still match the
registry, does `e2e-inventory.md` match the tests, does each `docs/bug log/` entry still
describe live behavior. Closest to shipping: it is map-drift with a different `collect`.

**Exhaustive enumeration instead of grep-guessing.** Unit = one file, prompt = *"list
every environment variable this file reads."* Grep needs the pattern in advance and misses
indirection — a var read through a helper, or a computed key. A per-file sweep does not.
Slower, free, and finds what grep structurally cannot.

**Dead-code and staleness sweep.** Unit = one file, prompt = *"is anything here
unreachable or unused?"* Low hit rate by design — exactly the speculative scan that only
makes sense when it is free. `CLAUDE.md` bans "fallback"-justified dead code, so hits are
actionable rather than debatable.

**Post-refactor regression sweep.** Unit = one changed file's diff, prompt = *"describe
any behavior change, not style change, in this diff."* Wildly redundant with the test
suite on purpose: it is looking for what the tests do not cover. Unlike the others this is
run once after a wide change, not on a schedule.
