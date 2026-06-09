---
file: src/commands/humaneval.ts
---

# humaneval.ts

Implements the `/humaneval` slash command.

**Purpose:** Reads the HumanEval benchmark (`playground/humaneval/data/HumanEval.jsonl.gz`), shows an interactive picker of the 164 code-completion problems, runs selected problems against the current model via `startEvalScenario`, and checks results by spawning Python.

**Read when:** Modifying the `/humaneval` picker or runner, changing how solutions are prompted or checked, or changing per-problem result tracking.

**Exports:** `runHumanEvalMenu(rl, projectRoot, getSelectedModel)`

**Key neighbors:**
- `src/cli/eval-runner.ts` — `startEvalScenario`, `resetEvalWorkDir`
- `src/cli/eval-screen.ts` — `printEvalHeader` (shared header/prompt rendering)
- `src/cli/raw-picker.ts` — `runRawPicker`, `countWrappedLines`
- `src/cli/terminal-ui.ts` — bottom UI lifecycle, eval-running indicator
- `src/cli/eval-dots.ts` — `modelSlug` (filename sanitisation) and `statusCircle` (colored dot renderer) reused for picker dots
- `playground/humaneval/` — cloned openai/human-eval repo (not tracked in git; gitignored under `playground/*`)
- `playground/humaneval/.runs/.results/` — per-model pass/fail JSON files written after each run (keyed by `modelSlug(model).json`)
- `tests/scenarios/tty-humaneval-fake.scenario.json` — end-to-end fake-LLM TTY test; uses `tests/scenarios/humaneval-mini.jsonl.gz` as bundled single-problem dataset via `HUMANEVAL_DATA` env var

**Update triggers:** Prompt wording changes, Python check logic, viewport size, run-dir layout, dot rendering, result persistence format, or `HUMANEVAL_DATA` env var override (used in tests to point at the bundled mini fixture).
