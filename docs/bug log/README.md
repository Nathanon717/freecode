# Bug Log

- [26-06-2026.md](26-06-2026.md) — WalConflict crash on every menu open; raw control bytes in scenario JSON; pre-tool preamble printed in wrong place
- [27-06-2026.md](27-06-2026.md) — `/models` stall from synced/plain replica ping-pong corrupting `-info` metadata
- [27-06-2026b.md](27-06-2026b.md) — Eval menu artifacts visible above first eval output
- [02-07-2026.md](02-07-2026.md) — PTY test harness flaky on Windows: bare `/` auto-submitted; first keystroke dropped before ConPTY ready
- [02-07-2026b.md](02-07-2026b.md) — Re-bootstrap fix from 27-06 never landed; implemented for real with coverage
- [03-07-2026.md](03-07-2026.md) — No shared text-encoding layer; BOM and duplicated backspace-check bugs kept recurring
- [05-07-2026.md](05-07-2026.md) — Tokenizer families silently using fallback estimate due to 0-byte cache files from missed 307 redirects
- [11-07-2026.md](11-07-2026.md) — Pre-tool preamble rendered after the tool call; fixed by driving the transcript from the ordered `fullStream` + a tool-render rendezvous gate
- [18-07-2026b.md](18-07-2026b.md) — Every Mistral model 400s mid-session: an empty assistant turn stored in history has neither content nor `tool_calls`
- [18-07-2026c.md](18-07-2026c.md) — Empty store when launched outside the repo: unpinned `doppler run` resolves its project from cwd, and the wrapper existed only as a PowerShell function
- [14-07-2026.md](14-07-2026.md) — ✅ **RESOLVED** — terminal resize corrupts the screen (banner reset + mangled footer/input bar). Shipped Option B: resize now reflows the transcript in place (fresh screen redraws the banner responsively); readline's stray resize `>` stripped. See the Resolution section.
- [21-07-2026.md](21-07-2026.md) — Blocklist-purge prompt returns every launch: live init re-wrote catalog rows for blocklisted models because blocklist filtering wasn't centralized before `saveProviderCatalog`
- [22-07-2026.md](22-07-2026.md) — Ghost input frame after narrowing with a transcript up: the reflowed bottom UI was scrubbed only when an overlay was open; broadened the buffer repaint to all transcript-path resizes and made it wrap (not truncate) over-wide lines. Adds the `screenCounts` scenario primitive
- [24-07-2026.md](24-07-2026.md) — Blocklist-purge prompt STILL returned every launch: a stale row the API no longer serves, whose delete was applied to the local replica and swallowed on push, then conflict-wiped back from the primary. `deleteModelRows` now deletes straight against the primary on a synced store
- [24-07-2026b.md](24-07-2026b.md) — PTY test harness on Windows: resize test skipped (nested ConPTY never delivers a `process.stdout` resize event to the grandchild); session `start` deadline widened as hardening (never reproduced in the act)
- [24-07-2026c.md](24-07-2026c.md) — Turso still not enabled outside the repo: corrects 18-07-2026c — the real cause was `tryInjectDoppler()` in `src/index.ts` calling unpinned `doppler secrets download`, cwd-scoped just like `doppler run`; pinned `--project freecode --config dev`
- [24-07-2026d.md](24-07-2026d.md) — Root-directory grep died with an opaque `Command failed` while a subfolder search succeeded: the 10s `execFile` timeout SIGTERMs `rg`, and a signalled child has `code === null`, falling past the exit-1/exit-2 ladder into a rethrow that `--no-messages` had stripped of all detail. Timeout and maxBuffer kills now return actionable messages
- [24-07-2026e.md](24-07-2026e.md) — `npm test` crashed ~50% of runs with "Projects have different 'maxWorkers'" despite a single-project config, but never standalone: vitest 4 re-reads `os.availableParallelism()` once per spec file while grouping, and this phone's kernel isolates CPU cores under load. `vitest.config.ts` now pins `maxWorkers` from a one-shot sample
