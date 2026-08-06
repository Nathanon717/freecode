# Ideas — Freecode Changes That Would Improve Delegation

Ideas that graduate into **shipped code in `src/`**, not into a doc entry. That is the
whole scope of this file, and it is why this file exists at all: every other kind of
untested idea has a host file to be the tail of ([recipes.md](recipes.md) for prompts,
[../sweeps.md](../sweeps.md) for sweeps), and a change to freecode itself has none. See
the [README](README.md)'s Removing section for the rule this carves out of.

**The generating trigger: a subagent could not do something.** That is not a verdict on
delegation and not a reason to do the work yourself — it is a **capability gap**, and
freecode's source is editable. When a `-p` call fails, is awkward, needs babysitting, or
needs a wrapper script, the entry belongs here. Never conclude "the subagent can't do X"
without either writing the entry or fixing the source.

**Every entry names the observed failure that generated it.** An entry with no `Observed`
line is speculation and should be deleted on sight — this is the difference between a
request queue and a wishlist.

## Bounds

Ranked, and **capped at eight entries**. The list is ordered: top is most wanted, bottom
is least. Rank *is* the ordering, so entries carry no priority prose — to raise or lower a
request, move it.

The cap is the pull mechanism. **To add a ninth entry, ship or delete the bottom one
first.** A backlog with nothing pulling entries out only accretes.

Delete an entry when any of these is true:

- **It shipped.** Delete it — do not annotate it as done. A shipped feature is not a
  request. Its durable facts belong in [../commands.md](../commands.md) (the flag
  contract) and in the [README](README.md)'s Operating Facts (how delegation uses it).
- **Its premise is gone** — the observed failure no longer reproduces, or a recipe now
  works around it well enough that no code change is wanted.
- **It has sat at the bottom across two sessions without evidence being added.** If nobody
  hit the problem again, it was not a problem.

Entries are unnumbered on purpose — a number reads like a stable ID, and every position
here shifts as the list is reordered. Refer to an entry by its title.

---

## Parallel fan-out for `-p`

**Observed:** R5 ([recipes.md](recipes.md)) took 72s and 15 tool calls for one directory.
Any question asked of N directories is currently N serial invocations driven by a shell
loop the lead has to write, and the lead pays for writing it every time.

**Problem:** `scripts/sweep/` already does one-call-per-unit, but it is non-agentic — a
bare model call per file, no tools, no exploration ([../sweeps.md](../sweeps.md)). There
is no way to fan an *agentic* `-p` turn across a set of targets.

**Proposal:** `-p` accepts multiple targets (or a prompt template plus a glob) and runs
them concurrently, emitting one clearly delimited answer block per target.

**Why it matters for delegation:** it is the difference between delegation being a thing
the lead does occasionally and a thing it does by default. It also makes N-model consensus
(a standing untested idea in [recipes.md](recipes.md)) a single command instead of three.
Concurrency must be bounded — Zen's quota is per IP, so a wide fan-out can rate-limit the
interactive REPL ([failures.md](failures.md)).

---

## Model fallback chain for `-p`

**Observed:** not yet hit in a recorded run — this is the weakest-evidence entry here and
sits above only entries with none. Add the failing invocation when it bites.

**Problem:** if the pinned provider is rate-limited, the call fails and the lead must
notice, pick another model, and retry — spending lead tokens on plumbing.

**Proposal:** accept `--model a,b,c` and fall through on rate-limit or auth failure.

**Why it matters for delegation:** unattended delegation should not need lead-side
babysitting. Free providers rate-limit often; that should be freecode's problem, not the
caller's. It only bites at volume — once fan-out above exists it stops being optional and
should move to the top.

---

## Auto map-priming

**Observed:** R1 and the control run in [failures.md](failures.md) — every caller must
remember to write "read `docs/map/README.md` first", and must guess which map subdirectory
is relevant, even though `CLAUDE.md` already makes map-first the project's standing rule.

**Proposal:** a `--map` flag (or default-on behavior for `-p`) that injects the map README
into context before the turn starts. It is small and cached.

**Why it matters for delegation:** it should cut the subagent's own exploration tokens,
and removes a step callers forget.

**Evidence is weak, which is why it sits at the bottom.** The measured effect is *not*
better coverage — in the one back-to-back trial (R1) map-priming named the same number of
files as a cold run, just a different layer of them, at +15s. The demonstrated win came
from *demanding line numbers*, which is a prompt change and needs no feature. Worth
measuring on more than one task before building it; if the next measurement is also flat,
delete this.
