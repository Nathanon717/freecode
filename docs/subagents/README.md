# Freecode As A Subagent

How a **lead agent** — any capable paid model driving a session, whichever tool it runs
in — delegates work to free `freecode -p` subagents.

**This directory is the workshop, not the manual.** The rules for deciding and firing a
call live in the Subagents section of `AGENTS.md` / `CLAUDE.md` — kept identical, called
`AGENTS.md` below — which is in context on every task. This directory is what you read
when you are *improving delegation itself*: adding a recipe, closing a capability gap,
writing a sweep. It assumes that section is already loaded, so nothing here restates it.

The split is maintained by a matched pair of tests:

- **Up:** every line in the `AGENTS.md` section must change what you do on a task that has
  nothing to do with subagents. A line that doesn't is costing tokens on every turn.
- **Down:** every line here must be something you only need when you are editing the
  delegation system.

A line failing its test moves to the other file. When this directory starts restating the
behavior rules, it has drifted back into being a second copy of `AGENTS.md` and stops
earning the tokens it costs to open.

## Why This Exists

A paid plan is capped — by money, by rate limits, or both — and that cap is the real
constraint on how much can get done. Freecode's models are free. So the goal is not
"spend the fewest tokens overall"; it is **spend the fewest _lead_ tokens.**

A subagent that burns 100k tokens to produce 5k of signal is a **win**, even though it was
wildly inefficient, because the lead never paid for those 100k. Measured compression on
real calls runs from **~35:1 to ~680:1** — R4 at the low end, R5 at the high end, both in
[recipes.md](recipes.md), which is where every such number lives. Even where the lead
would have been far more efficient per token, delegation still wins on the only axis that
binds.

That inverts the usual instinct. Minimizing total tokens is calibrated for paid providers
and is the wrong objective here. Efficiency still matters — free quotas are finite and
shared — but it is the second priority, not the first.

## Evidence For The Delegation Rule

The rule and its one Grep-shaped exception are in `AGENTS.md`. This is what it was
calibrated against — the trials that set where the line falls (see [recipes.md](recipes.md)):

| Task | Verdict |
| --- | --- |
| "Trace the slash-command flow end to end, name every file" | **Delegate.** 27–42s, ~11 files. Would have cost the lead ~50k tokens of reading. (R1) |
| "Every site in `src/cli/` that decides which model a turn runs on, with line numbers" | **Delegate.** 8/8 exact citations, ~680:1 compression. No Grep pattern exists for it. (R5) |
| "Which rule does this proposed change violate?" | **Delegate.** 13s, and it found that our *existing* design already violated the rule. (R6) |
| "Find every place that reads `FREECODE_FREE_ONLY`" | **Don't.** The literal string was already known; one `Grep` matches it in under a second. (R3) |

Two excuses this evidence retires, both real, both used in past sessions to skip a call
that would have paid: **"I didn't need a summary"** — R5 produced no prose at all, eight
lines of `file:line`, and is the largest measured win here; output shape was never the
criterion. **"It was only a few files"** — the lead's cost is what it *reads*, not what it
reports.

The rule generalizes past delegation: **never read a generated reference whole.**
`docs/providers.md` tabulates every OpenAI and Anthropic model; reading it to learn which
free models exist costs thousands of lead tokens for one column of one row. Grep it.

Checkable output is the habit that makes all of this hold, and it is stated in `AGENTS.md`
because it applies to every call. The measured version: the entire 11-file list from the
trace trial (R1) was verified in a single call, because every claim was a path.

## Operating Facts

- **Bounded at 50 tool calls** (`FREECODE_MAX_TOOL_CALLS` overrides).
- **`--stats` reports cost on stderr**, leaving stdout clean. Use it on every delegated
  call — delegation economics cannot be improved while they are invisible.
- Full flag contract, including the `-p` / `--edit` capability split: the `-p` section of
  [commands.md](../commands.md).

## "The Subagent Can't Do That" Is A Bug Report

`AGENTS.md` carries the order of moves — fix the prompt, write the recipe, change `src/`.
What belongs here is why the first step is almost always the one that works: **most
apparent limits are missing output-shape clauses.** Every failure recorded in
[failures.md](failures.md) so far dissolved that way — the line-number loss, the preamble
leak. Neither was a model limitation; both were prompts that never asked.

**Never stop at step zero.** "The subagent couldn't, so I read it myself" is only a valid
report if it is followed by an entry in [ideas.md](ideas.md) naming what was missing.

## Two Kinds Of Win

Both matter, and the second is the bigger one:

- **Defensive** — do what the lead would have done anyway, more cheaply. That is
  [recipes.md](recipes.md).
- **Offensive** — do work that would *never be attempted* on a paid provider, because it
  is too wasteful to justify. That is mostly sweeps: [../sweeps.md](../sweeps.md).

It is easy to build only the defensive half and think the job is done. The second category
is the reason free providers change anything, and it is a change in kind, not degree.

**The unit economics invert.** On a paid provider, cost scales with N, so the craft is
*avoiding N*: grep smartly, sample a few files, infer the rest, and be right often enough.
Every design conversation starts with "can we do this without touching every file?" On a
free provider N is free, and the craft becomes *sweeping all of N* while accepting a low
hit rate. Exhaustiveness is now the cheap option — the one needing no cleverness, no
sampling strategy, and no argument before it runs.

Three things become affordable that were not:

1. **Exhaustive sweeps.** One call per unit across the whole tree. `npm run map-drift` is
   the proof, `scripts/sweep/` is the engine, and [../sweeps.md](../sweeps.md) is how to
   write one.
2. **Redundancy.** Ask three models and take the consensus. Triple cost for a confidence
   bump is a hard sell on paid; here it converts one model's guess into something with an
   error signal — disagreement.
3. **Being wrong.** A scan with a 10% hit rate is a failure on paid and perfectly fine
   here. Speculative, low-yield, "probably nothing but let's look" work becomes rational.

## Index

- [recipes.md](recipes.md) — verified prompts, with model, wall time, and how each was checked.
- [failures.md](failures.md) — what didn't work, so it isn't retried.
- [ideas.md](ideas.md) — freecode source changes that would improve delegation, ranked most-wanted first, capped at eight.
- [../sweeps.md](../sweeps.md) — the other half: scripted one-call-per-unit runs over a whole tree, and the candidates not yet written.

## Maintaining This Directory

This directory only stays useful if it is both **fed and pruned.** Growth is the easy
half; a directory that only grows becomes a wall of text nobody reads, at which point it
costs lead tokens instead of saving them.

### Adding

Four triggers, all cheap:

1. **Before any read you would otherwise do yourself** — check [recipes.md](recipes.md)
   for a matching prompt. If none exists and the delegation works, add one. This is the
   main growth path.
2. **After any delegated call** — spend one line. It becomes a recipe (worked, verified),
   a failure entry (worked badly), or an [ideas.md](ideas.md) entry (couldn't work without
   a source change). A call that produces none of the three was wasted twice. Record the
   misses too: a log of successes only has stopped being useful.
3. **When a task feels too wasteful to bother with** — if it is the same question asked of
   every unit in a tree, it belongs in the candidate sweeps in [../sweeps.md](../sweeps.md);
   otherwise it is an untested idea in [recipes.md](recipes.md). Either way it gets filed,
   not dismissed.
4. **Whenever you catch yourself working around freecode rather than with it** — writing a
   shell loop to fan a call out, re-running something by hand because it half-failed,
   picking a model manually after a rate limit. Each of those is a capability gap; the
   next move is [ideas.md](ideas.md) or a source change, not a workaround you retype next
   session.

Add a recipe only after **actually running it and verifying the output.** An unverified
prompt is a guess and is worth less than nothing here, because it will be trusted later.
Record wall time, the exact model, and the `--stats` line.

When comparing two subagent runs, **diff both directions.** A near-miss in session 1: one
run was judged to have "found more files" after checking only what it added, never what it
dropped. It had dropped an entire layer. See R1 in [recipes.md](recipes.md).

### Removing

Deletion is a normal edit here, not an exception. Four things to delete on sight:

- **Entries whose premise is gone.** When a feature request ships, **delete the entry** —
  do not rewrite it to say "SHIPPED". A shipped feature is not a request, and the tendency
  to annotate rather than remove is how this directory rots. Same for a failure whose
  cause has been fixed, or an untested idea once it has a recipe.
- **Facts with two homes.** One fact, one file. Evidence lives where it was measured (a
  recipe); the rule derived from it lives in `AGENTS.md`; everything else links.
  A number restated in three files will drift in two of them.
- **Anything that restates `AGENTS.md`.** The same rule aimed at the boundary that matters
  most, and the one this directory has broken before: the behavior rules were drafted here
  and copied up, leaving two drifting copies of each. Apply the down-test from the top of
  this page — if a paragraph would change what you do on an unrelated task, it belongs up
  there, not here.
- **Standalone backlogs.** An unverified idea lives as a **bounded tail of the file it
  graduates into.** `recipes.md`'s Untested Ideas and the candidate sweeps in
  [../sweeps.md](../sweeps.md) sit next to the verified content that dwarfs them, and next
  to where an entry lands when it works. That adjacency is the whole mechanism: a backlog
  with nothing pulling entries out only accretes, and an accreting file of untried ideas
  is indistinguishable from a wishlist. If one appears, redistribute it.

  **Scope: this governs ideas that have a host file.** An idea that graduates into shipped
  `src/` code has none, which is the one case that gets its own file —
  [ideas.md](ideas.md). It does not get an exemption from the objection, only a different
  answer to it: a hard cap of eight entries, so adding a ninth forces shipping or deleting
  the bottom one. **Do not create a second such file, and never a folder.** One capped
  file is the entire allowance; the moment ideas are spread across a directory, nothing
  bounds them and the wishlist is back.

The test before deleting is not "was this true once?" but **"does the durable fact still
live somewhere it belongs?"** Move it first if not, then delete. Flag contracts belong in
[commands.md](../commands.md), not here.

Nothing here is generated. Do not add `BEGIN GENERATED` markers; the docs generator does
not own this directory. The 500-line limit does not apply either —
`scripts/checks/check-line-limits.ts` walks `src/` only. Split a file when it gets
unwieldy to read, not because a check will fail.
