# Failures And Rough Edges

Things that went wrong, so they are not rediscovered. Each entry says what happened and
what to do instead.

---

## Preamble leaks into the final message

**Seen:** `zen:big-pickle`, cold run of R1.

The `-p` contract says stdout carries the model's *final* message. It does — but the final
message itself opened with running commentary:

```
Now I have all the pieces. Here is the end-to-end trace of a slash command in the REPL:
```

This is not a contract violation; the model simply wrote its narration into the answer.
It still breaks `answer=$(freecode -p "...")` for any caller expecting a bare value.

**Workaround:** demand an output shape ("Nothing else.", "answer with only the file path").
R3's strict formatting produced clean output; the unconstrained trace did not. Map-priming
also happened to avoid it.

**Fix:** see [feature-requests.md](feature-requests.md) #1.

---

## `groq:*` burns quota that is needed elsewhere

**Seen:** attempted `groq:openai/gpt-oss-120b` for R1; the user stopped it.

Groq's free limits are low enough that spending them on background subagent work starves
other uses. Groq is provider order 1 in the registry, so it is an easy accidental pick.

**Instead:** pin `zen:*`. OpenCode is keyless and works with no credentials at all.

**Caveat:** because Zen has no key, its **quota is per IP address, not per key**
(see [providers.md](../providers.md)). Parallel subagent fan-out shares one budget with
everything else on the connection — so a wide fan-out can rate-limit the interactive REPL.
Untested at scale; worth measuring before running a large batch.

---

## Map-priming costs line numbers

**Seen:** R1, both variants.

The cold run cited `session-modes.ts:194`, `command-dispatcher.ts:161–242`. The map-primed
run cited no line numbers at all — plausibly because the map pages describe files by
responsibility, not location, and the model anchored to that framing.

**Instead:** if you need both coverage and line numbers, ask for line numbers explicitly.
Untested.

---

## Non-Failures Worth Recording

Checked and found *not* to be problems:

- **Accuracy on file paths was 100%** across every run — 16 distinct claimed paths, all
  real. No hallucinated files yet. This is the main reason the file-path-anchored prompt
  style works.
- **Line numbers were accurate where checked, but that is a small sample.** R3's
  `paid-guard.ts:50` is exactly the env-read line (the function signature is 49, so the
  citation is precise, not off-by-one). R1's line numbers were never verified. Paths stay
  the cheap check — one `ls` covers a whole list; a line number needs the file opened.
- **Length caps are respected.** "under 200 words" and "in 2 sentences" both held.
- **Latency is workable.** 11–42s per call. Slower than a Grep, far faster than the lead
  reading a subsystem.
- **Docs are exempt from the 500-line limit.** `scripts/checks/check-line-limits.ts` walks
  `src/` only, so `recipes.md` may grow. Split it by task shape when it gets unwieldy —
  for readability, not because a check will fail.
