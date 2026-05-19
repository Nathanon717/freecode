# 0004 Shared Session Runner

**Status:** Accepted
**Date:** 2026-05-19

## Context

Interactive and scripted input had overlapping loop behavior: read input, dispatch commands, handle exit, maintain shared session/model state, and run scenario or eval menus. Duplication made mode-specific details harder to separate from common session behavior.

## Decision

`src/cli/session-runner.ts` owns the shared loop. `src/cli/input-modes.ts` owns mode-specific input behavior:

- Interactive mode reads terminal input with autocomplete, manages bottom UI restore points, opens `/config`, `/test`, and `/eval` menus, and asks for tool confirmations.
- Scripted mode reads the script file, echoes scripted turns, consumes scripted tool approvals, and prints non-interactive `/test` and `/eval` scenario lists.

`src/cli/scenario-catalog.ts` owns scenario discovery, selection parsing, and scenario execution. `src/cli/scenario-menu.ts` only renders menus and prompts.

## Consequences

The CLI has one session loop and narrower mode adapters. Future changes to common turn handling belong in `session-runner`; changes to terminal or scripted behavior belong in the relevant input mode.
