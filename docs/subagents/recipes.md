# Verified Recipes

Prompts that have actually been run and checked. Each entry records the **exact prompt**,
the **pinned model**, **wall time**, and **how the output was verified** — without all
four it is not reproducible and does not belong here.

All timings from Windows, 2026-07-30, project root `C:\stuff\dev\freecode`.

---

## R1 — Cross-file flow trace (the flagship win)

**Model:** `zen:big-pickle` · **Time:** 27s cold / 42s map-primed · **Verified:** yes

```bash
freecode --model zen:big-pickle -p "Start by reading docs/map/README.md and the relevant map pages under docs/map/<area>/. Then trace what happens end to end when <event>. Name every file involved in order, and describe the flow in under 200 words."
```

Run against "a user types a slash command in the REPL". Returned an ordered 11-file
walkthrough with per-file responsibilities.

**Verification:** one `ls` of all claimed paths — every file existed. Cost: a single tool
call to check ~50k tokens of avoided reading.

**Use when:** you need to understand a subsystem you have not read yet. This is the
highest-value delegation found so far.

### Map-priming: it redirects focus, it does not add coverage

Prefixing the prompt with *"Start by reading `docs/map/README.md` and the relevant map
pages"* changes the result — but not in the direction first assumed. Same task, same
model, back to back:

| | Cold | Map-primed |
| --- | --- | --- |
| Wall time | 27s | 42s |
| Distinct files named | 11 | 11 |
| Shared between runs | \<- 6 -\> | |
| Unique to this run | 5 | 5 |
| Line numbers | **yes** (`session-modes.ts:194`) | no |
| Preamble leak | yes | **no** |

**Both runs returned the same breadth and covered different layers.**

- Map-primed only: `raw-picker.ts`, `input-buffer.ts`, `bottom-ui.ts`,
  `tool-invocation.ts`, `agent/loop.ts` — the *input/keystroke plumbing*.
- Cold only: `config.ts`, `model.ts`, `eval-menu.ts`, `status.ts`, `renderer.ts` — the
  *per-command handler layer*.

Map-priming pulled attention upstream to the input path; going cold kept it downstream on
dispatch targets. Neither run was complete, and the +15s bought a different slice rather
than a bigger one.

**Rule:** one trace call returns roughly **one layer's worth of detail**, whichever layer
the prompt steers it toward. So either name the layers you care about explicitly
("include both the input/keystroke path and the per-command handlers"), or run it twice
and union the results. Do not assume a single trace enumerated everything.

This was nearly recorded as "map-priming finds more files" — it does not. That conclusion
came from verifying only the files map-priming *added* and never checking what it
*dropped*. When comparing two subagent runs, diff both directions.

---

## R2 — Single-file summary

**Model:** `zen:deepseek-v4-flash-free` (default) · **Time:** 11s · **Verified:** yes

```bash
freecode -p "What does src/agent/loop.ts do? Answer in 2 sentences."
```

Correctly named the `agentLoop` export, the streaming/retry/fallback structure, and the
internal `streamWithRetry` helper.

**Verification:** claims named specific exports, checkable against the file's map page.

**Use when:** you need orientation on one file before deciding whether to read it. Fast
and cheap enough to be nearly free. Note the default model handles this fine — no need
to pin a stronger one.

---

## R3 — Symbol/usage lookup — **counter-example, do not delegate**

**Model:** `zen:deepseek-v4-flash-free` (default) · **Time:** 24s · **Verified:** yes, accurate

```bash
freecode -p "Find every place in src/ that reads the FREECODE_FREE_ONLY environment variable. List each as file_path:line_number with a 5-word note. Nothing else."
```

The answer was **correct** — 4 real read sites, correctly excluding imports, comments, and
the constant declaration. Genuinely good filtering that raw Grep does not do.

**But it is still the wrong call.** One `Grep` returns the same ground truth in under a
second, and the lead has to skim the results either way. 24s bought nothing.

Kept here deliberately as the calibration point for the other side of the delegation rule:
*a delegation can succeed and still be a mistake.*

---

## R4 — Single-file deep structural analysis

**Model:** `zen:big-pickle` · **Time:** 17s · **Verified:** yes
**Stats:** `ctx=12425 output=1121 total=15774 toolCalls=1`

```bash
freecode --stats --model zen:big-pickle -p "Read <file> and describe its structure: how it <does X>, how it <does Y>, and how it <does Z>. Cite file_path:line_number for each mechanism. Under 250 words."
```

Run against `scripts/diagnostics/map-drift.ts` (~650 lines). Returned a four-part
breakdown — work enumeration, per-item LLM call, concurrency/rate-limit handling,
reporting — with a line number on every claim.

**Verification:** line-number citations throughout, spot-checkable against the file.

**Economics — the key number.** 15,774 free tokens consumed, ~450 tokens returned to the
lead. **~35:1 compression.** The subagent read the whole file; the lead paid for a
summary. This is the ratio that makes fan-out viable — see [workloads.md](workloads.md).

**Use when:** you need to understand one substantial file's internals without spending
lead context on it. Better than R2 (which is orientation only) when you need mechanisms
rather than a one-liner.

---

## Prompt Patterns That Work

Distilled from the runs above:

- **Demand an output shape.** "List each as `file_path:line_number` with a 5-word note.
  Nothing else." — produces checkable, parseable output.
- **Cap the length.** "in under 200 words", "Answer in 2 sentences." Respected in all runs.
- **Name the layers you want.** A trace covers about one layer per call (R1). Spell out
  which ones ("both the keystroke path and the per-command handlers") rather than hoping.
- **Ask for order.** "Name every file involved in order" yields a walkthrough rather than
  an unordered pile.

## Untested Ideas

Not yet run — do not trust until they have an entry above.

- Map-primed trace *plus* an explicit line-number demand (map-priming lost them, per R1).
- A trace prompt naming both layers explicitly — does one call then match the union of the
  two R1 runs, or is ~one layer a hard ceiling per call?
- Fan-out: one `-p` call per file over a directory, in the style of `npm run map-drift`.
- "Which of these N files is relevant to X?" as a cheap pre-filter before the lead reads.
- Comparing `zen:big-pickle` against `zen:nemotron-3-ultra-free` on R1.
