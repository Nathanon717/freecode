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

Map-priming also cost the line numbers: the cold run cited `session-modes.ts:194`, the
map-primed run cited none. If you need coverage *and* line numbers, ask for them
explicitly.

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

## R3 — Known-string lookup — the one narrow case where Grep wins

**Model:** `zen:deepseek-v4-flash-free` (default) · **Time:** 24s · **Verified:** yes, accurate

```bash
freecode -p "Find every place in src/ that reads the FREECODE_FREE_ONLY environment variable. List each as file_path:line_number with a 5-word note. Nothing else."
```

The answer was **correct** — 4 real read sites, correctly excluding imports, comments, and
the constant declaration. Genuinely good filtering that raw Grep does not do.

**It was still the wrong call, for one specific reason: the exact string to search for was
already known.** `FREECODE_FREE_ONLY` is a literal. One `Grep` returns the same ground
truth in under a second, and the lead skims the results either way. 24s bought nothing.

**Read the boundary narrowly.** This is *not* evidence against delegating
`file_path:line_number` work — [R5](#r5--enumerate-sites-by-behavior-line-numbers-demanded)
does exactly that and is one of the strongest wins measured. The difference is the input:

| | R3 (don't delegate) | R5 (delegate) |
| --- | --- | --- |
| Question | "where is `FREECODE_FREE_ONLY` read" | "where is the model for a turn decided" |
| Grep pattern | known, exact, one literal | none exists |
| What the call adds | filtering Grep's hits | finding what to look for |

**The test is whether you can already name the pattern.** If yes, Grep. If the question is
phrased in terms of *behavior* rather than a string — "where does X get decided", "which
files handle Y" — there is no pattern to type, and delegating is right even when the
output you want is a plain list of line numbers.

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

**Economics — the floor of the range.** 15,774 free tokens consumed, ~450 tokens of final
answer returned to the lead. **~35:1 compression.** The subagent read the whole file; the
lead paid for a summary. Beaten since, twice: the map-primed control run in
[failures.md](failures.md) measured ~165:1, and
[R5](#r5--enumerate-sites-by-behavior-line-numbers-demanded) measured ~680:1.

**Use when:** you need to understand one substantial file's internals without spending
lead context on it. Better than R2 (which is orientation only) when you need mechanisms
rather than a one-liner.

---

## R5 — Enumerate sites by behavior, line numbers demanded

**Model:** `zen:big-pickle` · **Time:** 76s · **Verified:** yes — **8/8 exact**
**Stats:** `ctx=33757 output=6090 total=135721 toolCalls=15 wallTimeMs=72568`

```bash
freecode --stats --model zen:big-pickle -p "In <dir>/, find every site that <does X>. For each, output one line: file_path:line_number — <=8 word note. Cite the exact line of the decision, not the import. Nothing else."
```

Run against "every site in `src/cli/` that decides which model a turn runs on". Returned 8
lines across 6 files — `command-dispatcher.ts:111/180`, `headless-prompt.ts:121`,
`eval-menu.ts:104/106`, `custom-eval-menu.ts:142`, `humaneval-menu.ts:184`,
`session-modes.ts:416`.

**Verification:** one `for` loop running `sed -n "${l}p"` over all 8 citations. Every line
was the claimed decision site — `agentLoop(..., getSelectedModel())`, `setSelectedModel`,
`startEvalScenario(..., model)`. Not one off-by-one. Cost: a single Bash call.

**Economics.** 135,721 free tokens consumed (`total`), against a final answer of 8 lines
≈ **~200 lead tokens** — that is the denominator, estimated from the returned text, *not*
`output=6090`, which is the model's cross-step total and never reaches the lead.
**~680:1 compression, the best measured in this directory.** The subagent made 15 tool
calls hunting through a directory the lead never opened.

**Use when:** you need exact line numbers for something you cannot name a Grep pattern
for. This is the recipe to reach for instead of reading a directory yourself — see
[R3](#r3--known-string-lookup--the-one-narrow-case-where-grep-wins) for the one case that
goes the other way.

**The two clauses that carry it:**

- `Cite the exact line of the decision, not the import.` Without it the model cites the
  import block, which is real but useless. This is the anti-off-by-one clause.
- `output one line: file_path:line_number — <=8 word note` — a mechanically checkable
  shape. The verification loop above is only writable because the shape was fixed.

---

## R6 — Adversarial self-review against our own rules

**Model:** `zen:big-pickle` · **Time:** 13s · **Verified:** yes
**Stats:** `ctx=10651 output=709 total=13459 toolCalls=4 wallTimeMs=12651`

```bash
freecode --stats --model zen:big-pickle -p "Read <the docs that govern this>. Question: which specific rule in <file>'s '<section>' section would <proposed change> violate? Quote the rule verbatim and cite file_path:line_number. Then state in one sentence whether <existing thing> already violates that same rule. Nothing else."
```

Run before restructuring this directory, against a proposal to add a `docs/subagents/ideas/`
folder. It quoted the Standalone-backlogs rule verbatim at `README.md:158-159` and then
volunteered that the existing backlog file *already violated it* — the second question is
what made the call worth making, because it turned "your change is bad" into "your
existing design is bad," which changed the deliverable. [ideas.md](ideas.md) is what came
out of that.

**Verification:** `sed -n '155,163p'` on the cited range. The rule starts exactly at 158.

**Use when:** you are about to make a change governed by written rules — docs conventions,
`CLAUDE.md`, a style guide — and want the strongest argument against it before committing.
13s and it costs the lead only the reading of the reply.

**Ask the second question.** "Does the existing thing already violate this?" is what
converts a veto into a redesign. A hostile prompt that can only say no is worth much less.

---

## R7 — Fan-out: draft authored metadata for every file in a list

**Model:** `zen:big-pickle` · **Time:** 452s wall for 42 files, 6 in parallel (median 54s
per call, worst 99s) · **Verified:** yes — 42/42, mechanically
**Stats:** 352,199 free tokens across the batch

```bash
xargs -a files.txt -P 6 -I{} freecode --stats --model zen:big-pickle -p "Read {}. Output 1-3 markdown bullets naming the concrete tasks that should make an agent open this file. Each bullet is one line, starts with '- ', begins with a gerund (Changing/Debugging/Adding/Extending), under 20 words, and names behaviour specific to THIS file — not generic advice. Do not describe what the file is; say when to read it. Output only the bullets, nothing else."
```

Run to author the 42 missing `@readwhen` tags when `Read When` became mandatory. One call
per file, output to one file per source file, then applied by script.

**Verification — the part that makes this recipe work.** A batch answer nobody can check
is 42 guesses. Every backticked identifier and every multi-digit number in all 42 drafts
was extracted and grepped against the file it described: **0 unverified**, one Python loop,
one Bash call. The same pass counted bullets, which caught 6 drafts that had run to 4.
Lead-side work was then a read of the drafts plus 7 judgment edits (6 bullets dropped to
the cap, 1 draft replaced as too generic for a 3-line barrel file) — 124 bullets applied.

**Use when:** an authored field is missing across N files and the content is derivable from
each file alone — `@role`/`@readwhen`, a JSDoc line, a test-file header. The unit is one
file, there is no cross-file reasoning, and N is the whole cost on a paid provider.

**What made it checkable:** *"names behaviour specific to THIS file"* is what produces the
backticked symbols and concrete numbers the verification pass greps for. A prompt that
allows generic phrasing produces text that is unfalsifiable, and unfalsifiable output
cannot be batch-verified at all. The negative clause — *"Do not describe what the file is;
say when to read it"* — is load-bearing too: without it the model restates `@role`.

**When to fan out with `xargs` and when to reach for a sweep.** This is one prompt asked of
every file in a tree, which is a [sweep](../sweeps.md)'s definition — but a sweep produces a
findings-only *report*, and this produces per-file *content* to apply. Fan-out is right when
you want every answer kept. If you only want the exceptions, write a sweep.

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
- **Exclude the near-miss.** "the exact line of the decision, not the import" (R5). Name
  the plausible wrong answer and rule it out; it is what makes citations land exactly.
- **Ask a second, self-implicating question.** R6's "does the existing thing already
  violate this?" is what turned a review into a redesign.

## Untested Ideas

Not yet run — do not trust until they have an entry above. Ideas that are *one call per
unit across a tree* are sweeps, not recipes; they belong in [../sweeps.md](../sweeps.md).
Ideas that need a **freecode source change** are neither — they belong in
[ideas.md](ideas.md).

- **R6 against a diff, not a doc.** The verified R6 reviews a proposal against written
  rules. The original form — pipe `git diff` in and ask for the strongest argument the
  change is wrong — is still unrun.
- **N-model consensus on risky judgments.** Same prompt to 3+ free models, compare. Where
  they agree, confidence is high; where they split, the lead investigates. Converts free
  quota directly into calibration. Best on questions with checkable answers (file paths,
  yes/no) so the lead can adjudicate cheaply. This is a modifier — it can wrap any recipe
  here, or any sweep.
- Map-primed trace *plus* an explicit line-number demand (map-priming lost them, per R1).
- A trace prompt naming both layers explicitly — does one call then match the union of the
  two R1 runs, or is ~one layer a hard ceiling per call?
- Fan-out: one `-p` call per file over a directory. Note this is *not* what `npm run
  map-drift` does — that is a sweep ([../sweeps.md](../sweeps.md)): a bare call per unit
  with no agent prompt and no tools. The open question is whether the agentic version
  earns its extra cost on exploratory per-file questions.
- "Which of these N files is relevant to X?" as a cheap pre-filter before the lead reads.
- Comparing `zen:big-pickle` against `zen:nemotron-3-ultra-free` on R1.
