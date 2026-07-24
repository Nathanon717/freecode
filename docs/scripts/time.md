# Test Pipeline Timing

`npm run time` runs the same sections as `npm test` with per-section instrumentation so the slowest point is visible after a single run. The section list is shared with `npm test` (both read `scripts/pipeline/pipeline.ts`), so the two can never drift in what runs or in what order.

## Depth follows scope

The one principle: **the wider the scope, the shallower the breakdown.** Start coarse to find the slow section, then re-run that section — optionally with a filter — for the granular view.

| Scope | What you get |
| --- | --- |
| full run | section totals only — no per-file/per-test flood |
| one section (`unit`, `e2e`) | per-file / per-e2e-test breakdown |
| one section **+ filter** | deepest view: per-test, or per-phase for a single e2e test |

This mirrors how a profiler is used: sample coarsely, find the hot frame, then drill into just that frame.

## Usage

```
npm run time                       # full suite (build→lint→docs→e2e→unit)
npm run time -- test               # same
npm run time -- build              # just build
npm run time -- lint               # just lint
npm run time -- docs               # just docs
npm run time -- e2e                # per-e2e-test breakdown
npm run time -- e2e <name>         # one e2e test, per-phase breakdown
npm run time -- unit               # per-file breakdown (per-test for tests ≥ 1s)
npm run time -- unit <pattern>     # matching unit files, per-test breakdown
npm run time -- help               # usage
```

`help`, `--help`, and `-h` all print usage.

The full run executes each section's command **verbatim** — the identical command `npm test` runs — and times the wall clock. No process splits, no drift.

If a step fails in full-suite mode it bails early and still prints the report so timings up to the failure are visible.

## What each scope measures

| Scope | Command run | Sub-breakdown |
| --- | --- | --- |
| full / `test` | every section, verbatim | section totals only |
| `build` | `npm run build` | none |
| `lint` | `npm run lint` | none |
| `docs` | `npm run docs:generate` | none |
| `e2e` | `npm run test:e2e` | per-e2e-test wall-clock |
| `e2e <name>` | `npm run test:e2e -- --only=<name>` | per-e2e-test **+ per-phase** (TTY) |
| `unit` | vitest (JSON reporter) | per-file wall-clock; per-test duration for tests ≥ 1s |
| `unit <pattern>` | vitest, filtered to matching files | per-file **+ every test** (no ≥ 1s gate) |

Sub-breakdowns are free measurement data — they never change which tests run, their order, or their concurrency:

- **Unit:** vitest's JSON reporter exposes `startTime`/`endTime` per file and `duration` per assertion.
- **E2e:** `npm run test:e2e` is invoked byte-for-byte as `npm test` invokes it, plus the `E2E_TIMING_JSON` env var, which makes the runner write each e2e test's wall-clock duration to a JSON file. Because e2e tests run concurrently, per-test times overlap and sum to more than the `e2e` parent wall-clock.
- **Per-phase (single e2e test):** when you filter to one e2e test, `time.ts` additionally sets `TTY_TIMING=1`, which makes the TTY harness record one timing per phase (startup, each step, exit) and return them through the timing JSON. `time.ts` nests these as chronological children of the e2e test and reconciles the leftover wall clock into a `harness startup + teardown` sibling, so the children sum to the section total. `TTY_TIMING` is an internal mechanism — `time.ts` sets it for you; you do not type it.

`build`, `lint`, and `docs` run as a single process, so their times are wall-clock totals with no further split.

## Output

Progress is printed as each section runs. After everything finishes, the timing report is printed. A full run stays coarse:

```
══ Timing Report ════════════════════════════════════════

✓ build                                                  13.60s
✓ lint                                                   28.40s
✓ docs                                                   5.35s
✓ e2e                                                     6m 35.7s
✓ unit tests                                             8.65s

── Slowest leaves ───────────────────────────────────────
   1. 6m 35.7s  e2e
   2.   28.40s  lint
   ...

Total: 7m 31.3s
```

Scoping to a section adds its children; adding a filter adds the deepest level. The **Slowest leaves** list ranks every leaf section by duration and is omitted when only one leaf exists.

## Implementation

`scripts/pipeline/pipeline.ts` is the shared source of truth: an ordered list of sections (`{ key, label, cmd, args }`) plus the shared `useShell` flag and PTY exclude list. `scripts/pipeline/test.ts` runs each section verbatim, silent on success. `scripts/pipeline/time.ts` iterates the same list, timing each with `Date.now()` bookends, and swaps in instrumentation when a single section is scoped.

Vitest is run with `--reporter=json --outputFile=<tmp>` to capture per-file timing data; using both `--reporter=json` and `--reporter=dot` simultaneously triggers a vitest 4.x crash, so the JSON reporter is used alone and a compact per-file summary is printed instead.

For e2e, `time.ts` sets `E2E_TIMING_JSON=<tmp>` (and, when filtered, `TTY_TIMING=1` plus `--only=<name>`) when invoking `npm run test:e2e`. `tests/harness/run-e2e.ts` honors `E2E_TIMING_JSON` by recording each e2e test's wall-clock duration and writing `{ tests: [{ name, type, ms, ok, phases? }] }` to that path on exit (`phases` present only for TTY e2e tests under `TTY_TIMING`). Both vars are purely additive — when unset (i.e. under plain `npm test`) the runner behaves exactly as before.
