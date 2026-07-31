# Wasteful-But-Valuable Workloads

The generative half of this directory. [recipes.md](recipes.md) is *defensive* — doing
cheaper what the lead would have done anyway. This file is *offensive*: *work that would
never be attempted at all on a paid provider.*

That distinction is the whole point of free providers, and it is easy to miss. Cheaper
versions of existing habits are the small win. The large win is that entire categories of
work stop being unjustifiable.

## The Unit Economics Invert

On a paid provider, cost scales with N, so the craft is **avoiding N**: grep smartly,
sample a few files, infer the rest, and be right often enough. Every design conversation
starts with "can we do this without touching every file?"

On a free provider, N is free. The craft becomes **sweeping all of N** and accepting a low
hit rate. Exhaustiveness is now the *cheap* option — the one that needs no cleverness, no
sampling strategy, and no argument before it runs.

Three things become affordable that previously were not:

1. **Exhaustive sweeps.** One call per file across the entire tree. `npm run map-drift`
   is the existing proof: it reads every `src/**/*.ts` and its map page, one LLM call per
   pair, to find documentation drift. As a paid job that is a budget conversation. As a
   free job it is a script you write on a whim and iterate on the same afternoon.
2. **Redundancy.** Ask the same question of three models and take the consensus. On a paid
   provider, triple cost for a confidence bump is a hard sell. Here it is free, and it
   converts "one model's guess" into something with an actual error signal — disagreement.
3. **Being wrong.** A scan with a 10% hit rate is a failure on paid and perfectly fine
   here. Speculative, low-yield, "probably nothing but let's look" work becomes rational.

## The Measured Case For Fan-Out

R4 in [recipes.md](recipes.md) measured **~35:1 compression** on a single-file analysis.
That ratio is the engine: the lead can afford roughly 35 delegated file-analyses per unit
of context it would have spent reading one file itself. Fan-out is not a
micro-optimization; it is a different order of magnitude.

## Candidate Workloads

Untested unless linked to a recipe. Roughly ordered by expected value.

### Pre-read triage
One call per file in a directory: *"Is this file relevant to \<task\>? Answer yes/no plus
10 words of why."* The lead then reads only the yes-list. Directly attacks the lead's
single largest cost — reading files that turn out to be irrelevant. This is the
100k-tokens-to-find-5k case, and the sweep itself is free.

### Exhaustive enumeration instead of grep-guessing
*"Read every file under `src/providers/` and list every environment variable it reads."*
Grep needs to know the pattern in advance and misses indirection (a var read through a
helper, or a computed key). A per-file sweep does not. Slower, free, and finds what grep
structurally cannot.

### N-model consensus on risky judgments
Same prompt to 3+ free models; compare. Where they agree, confidence is high; where they
split, the lead investigates. Converts free quota directly into calibration. Best used on
questions with checkable answers (file paths, yes/no), so the lead can adjudicate cheaply.

### Doc-drift generalized
`map-drift` proves the pattern for map pages. The same shape applies to every doc that
describes code: does `providers.md` still match the registry, does `e2e.md` match the
tests, does each `docs/bug log/` entry still describe live behavior.

### Post-refactor regression sweep
After a wide change: one call per changed file, *"Describe any behavior change, not style
change, in this diff."* Wildly redundant with the test suite by design — it is looking for
what tests do not cover.

### Dead-code and staleness sweep
One call per file: *"Is anything here unreachable or unused?"* Low hit rate, exactly the
kind of speculative scan that only makes sense when it is free. Note `CLAUDE.md` bans
"fallback"-justified dead code, so hits are actionable.

### Adversarial self-review
Before the lead reports work done, run the diff past a subagent with a hostile prompt:
*"Find the strongest argument this change is wrong."* Cheap second opinion that costs the
lead only the reading of the reply.

## Adding To This File

A candidate belongs here if it is **useful and too wasteful to justify on a paid model.**
If it would be worth doing on a paid provider too, it is a recipe, not a workload.

When a candidate is actually run and verified, add it to [recipes.md](recipes.md) with
timings and link it from here. Candidates that fail go to [failures.md](failures.md) —
a workload that sounds great and does not work is the most valuable thing to record,
because it will sound great again in six months.
