# Idea: Agency check — a self-orientation probe

**Status:** scoped, not implemented — parked thread.

## Problem

When an agent lands in an environment — a fresh repo, an unfamiliar container, a
sandbox with unknown boundaries — it doesn't actually know its own reach. It discovers
blast radius the bad way: try a command and watch it fail, or worse, watch it *succeed*
destructively. "Declared" capability and "real" capability drift apart constantly:
deferred tools that 401 on first call, MCP servers that claim to exist but aren't
connected, a `git remote` you can read but can't push to, a network that's egress-blocked.

The agent should be able to ask, on demand: **what can I do here, what can I affect, what
is my agency** — and get back an honest map instead of finding out by accident.

## The shape

A **general-purpose** subagent/tool you can invoke whenever you're uncertain about your
own reach. Not project-specific — reusable across any environment. You dispatch it, it
burns the 20–40 exploratory calls in *its* context (not yours), and returns a compact
**agency report**.

Two output modes, both available:

- **Schema** (default, generated programmatically): a rigid, machine-comparable
  structure — same fields every time, so reports can be diffed across environments or
  cached and compared session-to-session.
- **Prose** (opt-in via special instructions): a human-readable summary when you pass
  focusing instructions like *"just tell me if I can deploy"* or *"focus on network
  reach."*

The caller can pass optional special instructions to narrow the probe or request prose;
absent that, it does the full sweep and returns the schema.

## What "agency" decomposes into

The probe sweeps these axes — roughly ordered by how often they bite in practice:

- **Filesystem** — what's writable, where, quotas. (Only `/tmp`, or the repo too?)
- **Execution** — runtimes available, and the big one: **network egress yes/no**.
- **Tools: real vs. declared** — deferred tools, MCP servers that claim to exist but
  aren't connected, tools that 401 on first use. Declared ≠ functional.
- **External reach** — which credentials are actually present and live (gh auth? cloud
  creds? API keys in env?).
- **VCS / deploy** — can I commit, push, open a PR, or am I in detached read-only land?
- **Persistence** — what survives the session (memory dir? a branch? nothing?).
- **Identity & permission mode** — who am I running as, and is the human gating every write?

## The hard part: infer, don't trigger

This is where the idea lives or dies. A probe that *proves* agency by exercising it can
cause the very side effects it's trying to scope. You cannot learn "can I push?" by
pushing. So the discipline is **infer, don't trigger**:

- Read-mostly: `gh auth status`, not `gh pr create`; `git remote -v` + branch perms, not
  a test push.
- For write-gated things, the cheapest *reversible* touch (write+delete a tempfile to
  prove a dir is writable), and label the rest as inferred.
- Every finding is **graded**: `confirmed` / `inferred` / `unknown` — with a reason on
  the unknowns. An honest "couldn't safely determine X, because Y" beats a false positive.

That confirmed/inferred/unknown grading is the soul of the thing. The output is only as
trustworthy as its willingness to say "I don't know."

## Open question (parked)

**How aggressive should probing be?** Two ends of the dial:

- **Pure read-only** — safest, zero footprint, but lots of findings stuck at `inferred`.
- **Reversible-touches-allowed** — small, self-cleaning footprint, far more `confirmed`
  findings.

Not resolved — this is the main thing to decide if/when we pick it up. The grading scheme
above makes either choice survivable, since the report is honest about which findings were
actually exercised vs. merely inferred.

## Resolved so far

- **Scope:** general-purpose, not tuned to Freecode specifically.
- **Invocation:** on-demand subagent/tool, callable whenever, with optional special
  instructions.
- **Output:** schema by default (generated programmatically), prose on request.
