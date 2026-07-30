# Freecode As A Subagent

How a **lead agent** — any capable paid model driving a session, whichever tool it runs
in — delegates work to free `freecode -p` subagents. This directory is written by lead
agents, for lead agents. Read it before starting work; add to it whenever you learn
something.

## The Standing Rule

**Before every action, consider whether delegating would have been cheaper.** Especially
before any broad read. The aim is to operate as a *team lead over free subagents* rather
than as a low-level doer: dispatch, review, and synthesize instead of reading everything
first-hand.

## Why This Exists

A paid plan is capped — by money, by rate limits, or both — and that cap is the real
constraint on how much can get done. Freecode's models are free. So the goal is not
"spend the fewest tokens overall"; it is **spend the fewest _lead_ tokens.**

A subagent that burns 100k tokens to produce 5k of signal is a **win**, even though it was
wildly inefficient, because the lead never paid for those 100k. Measured compression on a
real call is ~35:1 (see R4 in [recipes.md](recipes.md)). Even where the lead would have
been far more efficient per token, delegation still wins on the only axis that binds.

That inverts the usual instinct. Minimizing total tokens is calibrated for paid providers
and is the wrong objective here. Efficiency still matters — free quotas are finite and
shared — but it is the second priority, not the first.

## The Delegation Rule

**Delegate when the answer requires reading and synthesizing across many files.
Don't delegate what a single Grep, Glob, or `ls` already answers.**

Both halves are evidence-backed from real trials (see [recipes.md](recipes.md)):

| Task | Verdict |
| --- | --- |
| "Trace the slash-command flow end to end, name every file" | **Delegate.** 27–42s, ~11 files synthesized. Would have cost the lead ~50k tokens of reading. |
| "Find every place that reads `FREECODE_FREE_ONLY`" | **Don't.** 24s for what one `Grep` call answers in under a second, with the same accuracy. |

The dividing line is *synthesis*, not *search*. Pattern-matching is what Grep is for.
Reading many files and forming a narrative across them is what the subagent is for.

## Verification Cost Is The Tax On Delegation

Every delegated answer needs some lead-side checking, and that checking eats the savings.
So the aim is not just accurate answers — it is **answers that are cheap to check.**

**Prefer prompts that force checkable output.** Ask for `file_path:line_number`, exported
names, or "answer with the path". A claim anchored to a file path is confirmed by one
`ls` or Glob; the entire 11-file list from the trace trial was verified in a single call.
An unanchored architectural assertion ("the retry logic is layered") has no cheap check
and must be either trusted or re-derived — which defeats the point.

This is the single highest-leverage habit in this doc.

## Operating Facts

- **The bare default is `zen:deepseek-v4-flash-free`.** Verified via `freecode -log -p`.
  It is competent for short lookups but weaker at multi-file synthesis.
- **Pin the model in every recipe.** An unpinned recipe is not reproducible, and the
  default can change.
- **Avoid `groq:*` for delegation.** Its rate limits are too low to spend on subagent
  work; save that quota. Prefer `zen:*` — OpenCode is keyless (quota is per IP).
- **`-p` is read-only** (`read`, `grep`, `list_dir`) and hard-blocked to free models, so
  it is always safe for the lead to call unattended. No writes, no shell, no sub-agents.
- **Bounded at 50 tool calls** (`FREECODE_MAX_TOOL_CALLS` overrides).
- **`--stats` reports cost on stderr**, leaving stdout clean. Use it on every delegated
  call — delegation economics cannot be improved while they are invisible.
- Full flag contract: the `-p` section of [commands.md](../commands.md).

## Two Kinds Of Win

Both matter, and the second is the bigger one:

- **Defensive** — do what the lead would have done anyway, more cheaply. That is
  [recipes.md](recipes.md).
- **Offensive** — do work that would *never be attempted* on a paid provider, because it
  is too wasteful to justify. That is [workloads.md](workloads.md).

It is easy to build only the defensive half and think the job is done. The reason free
providers change anything is that they unlock the second category: exhaustive sweeps,
redundant cross-checks, and speculative low-yield scans all become rational when N is free.

## Index

- [recipes.md](recipes.md) — verified prompts, with model, wall time, and how each was checked.
- [workloads.md](workloads.md) — wasteful-but-valuable work that free providers unlock.
- [failures.md](failures.md) — what didn't work, so it isn't retried.
- [feature-requests.md](feature-requests.md) — freecode changes that would improve delegation.

## The Process

This directory only gets good if it is fed. Three triggers, all cheap:

1. **Before a broad read** — more than ~3 files, or any "how does X work" question — stop
   and check [recipes.md](recipes.md) for a matching prompt. If none exists and the
   delegation works, add one. This is the main growth path.
2. **After any delegated call** — spend one line. It either becomes a recipe (worked,
   verified) or a failure entry (didn't). A call that produces neither was wasted twice.
3. **When a task feels too wasteful to bother with** — that instinct is calibrated for
   paid providers and is now wrong. Write it in [workloads.md](workloads.md) instead of
   dismissing it.

**Run with `--stats`.** It reports model, context, output, tool calls, and wall time on
stderr while leaving stdout clean, so `$(...)` is unaffected. Paste the numbers into the
recipe — delegation economics cannot be improved while they are invisible.

## Self-Audit

Scoring the standing rule honestly means recording the misses, not just the wins. A log of
successes only is a log that has stopped being useful.

**Session 1 (2026-07-30) — one clear miss.** While researching this directory the lead
read all of `docs/providers.md` to learn which free models exist. That file's generated
tables include every OpenAI and Anthropic model — several thousand tokens of paid context
for one column of one row. A targeted `Grep` for `:free` (or a subagent call) would have
cost a fraction. The rule caught the *delegation* decisions correctly and missed a plain
*over-reading* one; both count.

## Maintaining This Directory

Add a recipe only after **actually running it and verifying the output.** An unverified
prompt is a guess and is worth less than nothing here, because it will be trusted later.
Record wall time and the exact model — a recipe without both is not reproducible.

When comparing two subagent runs, **diff both directions.** A near-miss in session 1: one
run was judged to have "found more files" after checking only what it added, never what it
dropped. It had dropped an entire layer. See R1 in [recipes.md](recipes.md).

Nothing here is generated. Do not add `BEGIN GENERATED` markers; the docs generator does
not own this directory.
