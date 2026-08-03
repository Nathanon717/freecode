# Feature Requests From The Lead Agent

Freecode changes that would make it a better subagent. Written by the delegating agent.

**This list is ordered. The entry at the top is the one most wanted; the entry at the
bottom is the one least wanted.** Rank is the ordering, so entries carry no priority
prose — to raise or lower a request, move it. Each entry states only the problem
observed, the proposed change, and why it matters for delegation specifically. These are
proposals, not decisions.

Entries are unnumbered on purpose — a number reads like a stable ID, and every position
here shifts as the list is reordered. Refer to an entry by its title.

**When one ships, delete the entry.** Do not annotate it as done — a shipped feature is
not a request. Its durable facts belong in `commands.md` (the flag contract) and in this
directory's [README](README.md) Operating Facts (how delegation should use it).

---

## Auto map-priming

**Problem:** every caller must remember to write "read `docs/map/README.md` first", and
must guess which map subdirectory is relevant — even though `CLAUDE.md` already makes
map-first the project's standing rule for agents.

**Proposal:** a `--map` flag (or default-on behavior for `-p`) that injects the map README
into context before the turn starts. It is small and cached.

**Why it matters:** it should cut the subagent's own exploration tokens, which is where
its quota actually goes, and removes a step callers forget.

**Evidence is weak, which is why it sits here and not higher.** The measured effect is
*not* better coverage — in the one back-to-back trial (R1) map-priming named the same
number of files as a cold run, just a different layer of them, at +15s. It also
suppressed a preamble leak. So the case rests on convenience and consistency, not on a
demonstrated accuracy win. Worth measuring properly on more than one task before building
it.

---

## Model fallback chain for `-p`

**Problem:** if the pinned provider is rate-limited, the call fails and the lead must
notice, pick another model, and retry — spending lead tokens on plumbing.

**Proposal:** accept `--model a,b,c` and fall through on rate-limit or auth failure.

**Why it matters:** unattended delegation should not need lead-side babysitting. Free
providers rate-limit often; that should be freecode's problem, not the caller's. Last for
now because it only bites at volume — once batch / fan-out mode exists it stops being
optional and should move up.
