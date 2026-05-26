# Shell Destructive Detection

## What Changed

Updated the `shell_exec` destructive-command guard to use word-boundary regular expressions instead of substring matching.

This prevents benign commands whose names contain destructive substrings from being flagged, such as `remark --help`, while keeping protection for known destructive commands.

## Key Decisions

- Kept the lightweight matcher in `src/agent/tools/shell.ts` instead of introducing shell AST parsing.
- Matched command words case-insensitively so PowerShell casing such as `Remove-Item` is still detected.
- Narrowed `del` detection to `del /f`, matching the practical destructive case currently covered by the guard.
- Updated the shell tool map page because the documented detection strategy changed.

## Files Changed

- `src/agent/tools/shell.ts`
- `tests/agent.test.ts`
- `docs/map/agent/tools/shell.md`

## Verification

- `npm.cmd run build`
- `npm.cmd test`

