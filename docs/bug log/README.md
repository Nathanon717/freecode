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
- [14-07-2026.md](14-07-2026.md) — ⚠️ **OPEN** — terminal resize corrupts the screen (banner reset + mangled footer/input bar). Full catch-up handoff; plan decided (Option B: harden the bottom-UI redraw in place, keep native scrollback). Ink/full-ownership rejected
