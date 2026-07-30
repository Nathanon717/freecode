# Feature Requests From The Lead Agent

Freecode changes that would make it a better subagent. Written by the delegating agent,
prioritized by how much lead-side token or latency cost each would remove.

Each entry states the problem observed, the proposed change, and why it matters for
delegation specifically. These are proposals, not decisions.

---

## 1. Strict output mode (`--raw` / `--only`)

**Problem:** the final message can open with narration — "Now I have all the pieces. Here
is..." (see [failures.md](failures.md)). `$(freecode -p "...")` then captures prose the
caller has to strip.

**Proposal:** a flag that post-processes the final message to emit only the substantive
answer, or a system-prompt override for `-p` that forbids preamble outright. The
prompt-level fix is probably enough and much cheaper than parsing.

**Why it matters:** it makes `-p` composable in scripts. Right now every caller must
defensively re-prompt with "Nothing else."

**Priority: high.** Cheapest fix, most immediate benefit.

---

## 2. Auto map-priming

**Problem:** every caller must remember to write "read `docs/map/README.md` first", and
must guess which map subdirectory is relevant — even though `CLAUDE.md` already makes
map-first the project's standing rule for agents.

**Proposal:** a `--map` flag (or default-on behavior for `-p`) that injects the map README
into context before the turn starts. It is small and cached.

**Why it matters:** it should cut the subagent's own exploration tokens, which is where
its quota actually goes, and removes a step callers forget.

**Priority: medium.** Note the measured effect is *not* better coverage — in the one
back-to-back trial (R1) map-priming named the same number of files as a cold run, just a
different layer of them, at +15s. It also suppressed a preamble leak. So the case for
this rests on convenience and consistency, not on a demonstrated accuracy win. Worth
measuring properly on more than one task before building it.

---

## 3. Token/cost reporting on stderr — **SHIPPED 2026-07-30**

Implemented as `--stats`. Output:

```
stats: model=zen:big-pickle ctx=12425 output=1121 total=15774 toolCalls=1 wallTimeMs=17260
```

Verified: goes to stderr, stdout stays clean — `answer=$(freecode --stats -p "...")`
captures only the answer.

**Impact:** immediately paid for itself. It produced the ~35:1 compression measurement in
R4 that justifies fan-out (#4) — a number that was previously unobtainable. Every recipe
should now carry its stats line.

---

## 4. Batch / fan-out mode

**Problem:** the map-drift script already does per-file LLM calls, but there is no general
way for the lead to say "run this prompt against each of these 30 files." Doing it from
the lead means 30 shell calls and 30 result blocks in expensive context.

**Proposal:** `freecode -p "<prompt>" --each <glob>` — runs the prompt per matching file
and emits one consolidated result. Concurrency capped and configurable.

**Why it matters:** this is the archetypal "too wasteful to justify on a paid provider"
workload that free providers unlock. Note the per-IP quota caveat in
[failures.md](failures.md) before building it.

**Priority: medium.** Highest ceiling, most design work.

---

## 5. Model fallback chain for `-p`

**Problem:** if the pinned provider is rate-limited, the call fails and the lead must
notice, pick another model, and retry — spending lead tokens on plumbing.

**Proposal:** accept `--model a,b,c` and fall through on rate-limit or auth failure.

**Why it matters:** unattended delegation should not need lead-side babysitting. Free
providers rate-limit often; that should be freecode's problem, not the caller's.

**Priority: low** until fan-out (#4) exists, then it becomes necessary.
