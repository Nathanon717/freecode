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
was once thought to avoid it — it does not; the map-primed control run below opened with
`Here is the end-to-end flow when a user types a slash command in the REPL:`. Only an
explicit output-shape demand suppresses this.

**No fix is planned.** A strict-output flag was proposed and dropped: the workaround above
costs one clause in the prompt, which is cheaper than a flag that would have to parse
narration out of prose. Write the output shape into every `-p` prompt whose result you
intend to capture.

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

## Map-priming costs line numbers — unless you demand them

**Seen:** R1, both variants. **Resolved:** control run, `zen:big-pickle`, 2026-07-30.

The cold run cited `session-modes.ts:194`, `command-dispatcher.ts:161–242`. The map-primed
run cited no line numbers at all.

**Instead:** append `cite file_path:line_number for each step` to the map-primed prompt.
This is now tested and it works. Same model, same task:

| | Cold (R1) | Map-primed (R1) | Map-primed + line demand |
| --- | --- | --- | --- |
| Wall time | 27s | 42s | **33s** |
| Line numbers | yes | **no** | yes — **11/11 exact** |
| Layers covered | handlers only | input path only | **both** |

`ctx=28752 output=2499 total=99028 toolCalls=11 wallTimeMs=33027` — ~600 tokens back to the
lead, **~165:1 compression**, the best measured so far.

**Two R1 conclusions are therefore wrong and should not be reused:**

- Map-priming does not *inherently* cost line numbers. It costs them by default.
- **"One trace call returns roughly one layer's worth of detail" is not a ceiling.** This
  run covered both layers R1 split across two runs — the input/keystroke path
  (`session-modes.ts`, `raw-picker.ts`) *and* the per-command handlers (`status.ts`,
  `renderer.ts`, `tool-runner.ts`).

**The mechanism, which does survive.** Map pages describe files by responsibility, not
location, so a model given map prose can answer without opening any source — and then has
no line numbers to give. Demanding them forces real reads (11 tool calls here), which is
also why coverage widened. The line numbers were never the point; they are a
**proof-of-read**. Ask for them even when you do not need them, precisely because a
map-primed answer that cannot produce them was paraphrase, not analysis.

That cuts wider than delegation. Map prose is a good enough substitute for reading that a
reader stops at it — the lead included. Measured against `docs/map/README.md`'s own
criterion (*"prose that costs more tokens than it saves defeats the purpose"*), the
hand-written per-file prose is **41.6% of `src/` by bytes** with generated blocks stripped,
87 of 111 pages sit at ≥30% of their source file, and 12 pages are larger than the file
they describe. The index tier is the opposite: all of `docs/map/README.md` is 11.5KB
against 643KB of source, ~56:1.

---

## Non-Failures Worth Recording

Checked and found *not* to be problems:

- **Accuracy on file paths was 100%** across every run — 25 distinct claimed paths, all
  real. No hallucinated files yet. This is the main reason the file-path-anchored prompt
  style works.
- **Line numbers are accurate, on a sample that is no longer small.** R3's
  `paid-guard.ts:50` is exactly the env-read line (the function signature is 49, so the
  citation is precise, not off-by-one). The map-primed control run added **11/11 exact**,
  spot-checked with `sed` across six files — `index.ts:207`, `session-runner.ts:39`,
  `session-modes.ts:194`, `slash-commands.ts:28/47/69`, `command-dispatcher.ts:161/225/238`.
  R1's own line numbers were never verified. Paths are still the *cheaper* check — one `ls`
  covers a whole list; a line number needs the file opened — but line numbers now look
  trustworthy enough to demand routinely, and they double as a proof-of-read.
- **Length caps are respected.** "under 200 words" and "in 2 sentences" both held.
- **Latency is workable.** 11–42s per call. Slower than a Grep, far faster than the lead
  reading a subsystem.
