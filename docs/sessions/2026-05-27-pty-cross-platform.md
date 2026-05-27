# PTY cross-platform support

**Date:** 2026-05-27

## What was done

Made `pty start` (and all other `pty` subcommands) work without a `./` prefix from both a Linux container and Windows local development.

The Linux container change (previous commit) had already added OS detection to the `pty` bash script and created `.devcontainer/devcontainer.json` — but left Windows Bash broken because Git Bash does not search the current directory for executables.

This session fixed the Windows side and unified the setup mechanism.

## Key decisions

**npm link over symlinking manually**: Added `"pty": "./pty"` to the `bin` field in `package.json` and run `npm link` once. npm creates persistent shims in the npm global prefix (`%APPDATA%\npm\` on Windows), which is already on PATH for both Git Bash and PowerShell. On Linux the same `npm link` call works via the devcontainer `postCreateCommand`. This replaces the previous hardcoded `ln -sf /workspaces/freecode/pty /home/codespace/.local/bin/pty` symlink which was Codespaces-specific.

**One-time manual setup, not postinstall**: Automating via `postinstall` was considered but rejected — calling `npm link` from inside a running `npm install` risks lock conflicts. Since `npm link` persists across sessions, documenting it once in `docs/pty-session.md` is sufficient.

**`--screen` flag on `start` in tests**: The `session.ts` change (previous commit) made `start` opt-in for screen output via `--screen`. The test was not updated to match and would have failed on `npm run test:pty`. Fixed by adding `--screen` to the `start` call in `session.test.ts`.

## Files changed (this session)

| File | Change |
|------|--------|
| `package.json` | Added `"pty": "./pty"` to `bin` field |
| `.devcontainer/devcontainer.json` | Replaced hardcoded `ln -sf` symlink with `npm link` |
| `tests/harness/pty/session.test.ts` | Fixed `start` test to pass `--screen` |
| `CLAUDE.md` | Removed setup note (moved to pty-session.md) |
| `docs/pty-session.md` | Added one-time `npm link` setup note under Windows notes |

## Verification

```bash
# After npm link, pty is on PATH in Git Bash:
which pty
# → /c/Users/.../AppData/Roaming/npm/pty

# Confirm basic invocation works:
pty --help

# Run the main test suite:
npm.cmd test
```

To run the PTY integration tests (requires built dist):

```bash
npm.cmd run build && npm.cmd run test:pty
```
