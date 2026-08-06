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
wildly inefficient, because the lead never paid for those 100k. Measured compression on
real calls runs from **~35:1 to ~680:1** — R4 at the low end, R5 at the high end, both in
[recipes.md](recipes.md), which is where every such number lives. Even where the lead
would have been far more efficient per token, delegation still wins on the only axis that
binds.

That inverts the usual instinct. Minimizing total tokens is calibrated for paid providers
and is the wrong objective here. Efficiency still matters — free quotas are finite and
shared — but it is the second priority, not the first.

## The Delegation Rule

**Delegate by default. The one exception is a question whose exact search pattern you can
already name — that is what Grep is for.**

The test is a single question: *can I write the Grep right now?* If the question is
phrased in terms of a literal — an env var name, an export, a filename — write it. If it
is phrased in terms of *behavior* ("where does X get decided", "which files handle Y",
"what happens when Z"), there is no pattern to type, and the call is worth making.

Evidence from real trials (see [recipes.md](recipes.md)):

| Task | Verdict |
| --- | --- |
| "Trace the slash-command flow end to end, name every file" | **Delegate.** 27–42s, ~11 files. Would have cost the lead ~50k tokens of reading. (R1) |
| "Every site in `src/cli/` that decides which model a turn runs on, with line numbers" | **Delegate.** 8/8 exact citations, ~680:1 compression. No Grep pattern exists for it. (R5) |
| "Which rule does this proposed change violate?" | **Delegate.** 13s, and it found that our *existing* design already violated the rule. (R6) |
| "Find every place that reads `FREECODE_FREE_ONLY`" | **Don't.** The literal string was already known; one `Grep` matches it in under a second. (R3) |

### Two excuses this rule has been used to manufacture

Both were real, both are wrong, and both are why this section is worded as it is:

- **"I didn't need a summary."** Summarizing is not the criterion and never was. R5
  produced no prose at all — eight lines of `file:line` — and is the largest measured win
  in this directory. The output shape is irrelevant; what matters is whether the lead
  would otherwise have opened the files.
- **"It was only a few files."** The lead's cost is what it *reads*, not what it reports.
  Three files it would have opened is three files' worth of lead context spent on
  something a free model reads for nothing.

The rule generalizes past delegation: **never read a generated reference whole.**
`docs/providers.md` tabulates every OpenAI and Anthropic model; reading it to learn which
free models exist costs thousands of lead tokens for one column of one row. Grep it.

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
- **`-p` is read-only by default** (`read`, `grep`, `list_dir`) and hard-blocked to free
  models, so it is safe for the lead to call unattended. No sub-agents in either mode.
- **`--edit` adds the write half** (`create`, `edit`, `shell_exec`) — and there is no
  confirmation channel, so those run unattended in the cwd. Delegation recipes here are
  read-only; reach for `--edit` only for a scoped change you are willing to `git diff`.
- **Bounded at 50 tool calls** (`FREECODE_MAX_TOOL_CALLS` overrides).
- **`--stats` reports cost on stderr**, leaving stdout clean. Use it on every delegated
  call — delegation economics cannot be improved while they are invisible.
- Full flag contract: the `-p` section of [commands.md](../commands.md).

## "The Subagent Can't Do That" Is A Bug Report

You are working inside freecode's own source tree. When a delegated call fails, is
awkward, needs a wrapper script, or needs the lead to babysit it, that is a **capability
gap in a program you can edit** — not a fact about delegation and not a license to do the
work by hand.

The order of moves when a call does not work:

1. **Fix the prompt.** Most apparent limits are missing output-shape clauses. Every
   failure recorded in [failures.md](failures.md) so far dissolved this way — the
   line-number loss, the preamble leak. Try this before concluding anything.
2. **Write the recipe.** If the fixed prompt works, it is a recipe, and the next session
   should not have to rediscover it. This is where "I need exact line numbers" ends: R5,
   not a hand-read.
3. **Change `src/`.** If no prompt gets there, the gap is in freecode. File it in
   [ideas.md](ideas.md) with the invocation that failed, or just build it.

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
3. **When a task feels too wasteful to bother with** — that instinct is calibrated for
   paid providers and is now wrong. If it is the same question asked of every unit in a
   tree, add it to the candidate sweeps in [../sweeps.md](../sweeps.md) instead of
   dismissing it; otherwise it is an untested idea in [recipes.md](recipes.md).
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

Deletion is a normal edit here, not an exception. Two things to delete on sight:

- **Entries whose premise is gone.** When a feature request ships, **delete the entry** —
  do not rewrite it to say "SHIPPED". A shipped feature is not a request, and the tendency
  to annotate rather than remove is how this directory rots. Same for a failure whose
  cause has been fixed, or an untested idea once it has a recipe.
- **Facts with two homes.** One fact, one file. Evidence lives where it was measured (a
  recipe); the rule derived from it lives here in the README; everything else links.
  A number restated in three files will drift in two of them.
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
