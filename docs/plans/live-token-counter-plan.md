# Live Composer Token Counter Plan

Add a footer readout that updates **live as you type** and shows how many tokens you would send by
pressing enter: system prompt + committed conversation history + the current input draft, counted
with the real per-model tokenizer. This replaces the old `ctx` slot that was ripped out — see the
"Why the old footer path is deleted" note in `docs/plans/tokenizer-registry-plan.md`.

## Depends on

The **tokenizer engine** (`docs/plans/tokenizer-registry-plan.md`) must land first. This task is its
only interactive consumer. It uses:

- `countTokens(messages, modelId): number` — synchronous, non-blocking, never throws, falls back to
  the tiktoken estimate when the exact family encoder isn't cached yet.
- `preloadTokenizerFor(modelId): Promise<void>` — background resolve/download/compile of a family's
  encoder, wired here into the active-model-change flow (the engine task exposes it but leaves it
  uncalled).

Do not start this task until `npm.cmd test` is green on the engine task.

## Why

The valuable thing the old estimate gestured at — "how full is my context" — was never actually
delivered: it was a snapshot of committed history only (frozen while typing, so it never counted the
message you were about to send), and the real post-turn number was overwritten before it rendered.
The genuinely useful version is forward-looking and live: as you type (or paste a big block, or add
context), the number tells you what pressing enter will actually cost. That requires (a) an accurate
synchronous tokenizer — now available from the engine task — and (b) recounting on the keystroke
path, which the old code never did.

## Decisions (locked)

- **What it counts:** `buildSystemPrompt()` + `session.messages` (committed history) + the current
  input buffer (`getInputBuffer()`). It is the size of the request that pressing enter would send,
  not the size of history alone. An empty draft shows just the base context size.
- **Where it hooks:** `readLineWithAutocomplete` in `src/cli/session-modes.ts` — recompute + redraw
  in `refresh()` (line ~112, the per-keystroke handler that currently redraws but never recounts),
  and set the initial value on the first draw before the raw-key loop starts. Also recompute on the
  paths that already redraw the prompt (`resetBottomPromptState`, `afterDispatch`) so the base
  reflects new history after each turn.
- **Performance — cache the base, recount only the draft.** Counting the full context on every
  keystroke is wasteful for long sessions. Compute `base = countTokens(systemPrompt + committed
  history, modelId)` once and cache it; invalidate/recompute it only when the message history
  changes (after a turn) or the active model changes. On each keystroke, live value =
  `base + countTokens(draftAsSingleUserMessage, modelId)`. BPE merges don't cross the
  message boundary in practice (messages are serialized with separators), so summing is close enough
  for a "what you'd send" indicator — exactness to the token at the seam is not a goal. Document this
  approximation where the base cache lives.
- **Model awareness:** the counter needs the active model ID (for family resolution). Thread the
  selected model string (already available as `getSelectedModel()` / tracked as `lastModelStatus` in
  `footer-status.ts`) into the count call. Wire `preloadTokenizerFor(model)` into the existing
  `applyModelChange` path in `session-modes.ts` so switching models kicks off the background compile;
  until it's ready the count uses the fallback estimate (no block, no stall).
- **Rendering:** re-introduce a single footer slot in `footer-status.ts` (the engine task removed
  `lastTokenCount`/`setTokenCount`/the `ctx` string). New setter + render. It occupies the same
  footer real estate the old `ctx` slot did, so the `layoutFooterRightRows` drop/priority logic
  gets the token string threaded back in — mirror the structure the engine task removed rather than
  inventing a new layout.
- **Label — open decision, ask the user.** Candidates: keep `"{n} ctx"`, or make the "would send"
  meaning explicit, e.g. `"{n} tok"`, `"→{n}"`, `"{n} ↵"`. Recommend against reusing `ctx`
  unqualified since the number now includes the unsent draft (different meaning than before). Pick
  with the user during this task.
- **Exact vs. estimated marker — open decision.** The engine returns exact counts for known
  families and a tiktoken estimate otherwise. Whether to show a marker (e.g. `~` prefix when
  estimated) is this task's call since it owns the surface. Recommend a subtle `~` when the active
  family is unresolved/not-yet-loaded; confirm with the user.
- **Out of scope:** the real post-turn `promptTokens` (still goes to `FREECODE_RESULT_JSON` and the
  Anthropic cost line only) is not re-surfaced in the footer. The counter is purely forward-looking;
  mixing in a post-turn ground-truth number would recreate the old two-writers-one-slot confusion.

## Phases

Follow the same phase discipline as the engine plan: after each phase mark it `✅ COMPLETE`, add a
**Notes** entry for anything that diverged, and leave `npm.cmd test` green.

### Phase 1 — Footer slot + static count

- Re-add a footer token slot to `footer-status.ts`: a module value, a setter, and rendering wired
  back into `layoutFooterRightRows` (restore the drop/priority branches the engine task removed,
  now fed by the live value). Restore/adjust `tests/cli/footer-status.test.ts` layout cases.
- Compute and set the value from committed context only (base, no draft yet) at the existing
  prompt-draw / `resetBottomPromptState` / `afterDispatch` points, using `countTokens` +
  `getSelectedModel()`. This restores a (better, real-tokenizer) number in the footer without the
  keystroke path yet.
- Wire `preloadTokenizerFor(getSelectedModel())` into `applyModelChange`.
- Map/docs: update the footer-status / terminal-ui map pages and any scenario asserting footer
  contents. Ends `npm.cmd test` green.

### Phase 2 — Live draft counting

- Add the base-count cache (invalidated on history change and model change) and recompute the footer
  value inside `refresh()` on each keystroke as `base + countTokens(draft)`.
- Confirm it updates as characters are typed, on paste, and on multi-line (Ctrl+J) input; resets
  correctly after submit and after `/clear`.
- `pty` session check (`docs/pty-session.md`): open a real session, type and watch the number climb,
  paste a large block, switch models across two families and confirm the count re-bases without
  stalling or throwing, and confirm the fallback path (brand-new/unmapped family) still shows a
  number.
- Scenario coverage for the live counter if feasible in the TTY scenario harness; otherwise document
  the behavior in the terminal-ui docs and note the pty verification. Ends `npm.cmd test` green.

### Phase 3 — Label + marker polish

- Resolve the label and exact-vs-estimated marker decisions with the user; apply.
- Update `docs/scenarios.md` / terminal-ui docs if the footer format string changed; re-run
  `npm.cmd run docs:generate`.
- Final `npm.cmd test` green, `git diff --name-only` reviewed for map pages needing updates.
