# 0001 CLI Coordinator Boundary

**Status:** Accepted
**Date:** 2026-05-19

## Context

`src/index.ts` had accumulated startup wiring, terminal UI behavior, slash-command metadata, scenario menus, session state, and persistence concerns. That made the CLI entry point hard to scan and raised the cost of changing one behavior without touching unrelated behavior.

## Decision

Keep `src/index.ts` as startup wiring and coordination. Move focused responsibilities into the CLI modules:

- `src/cli/terminal-ui.ts` owns bottom-pinned terminal rendering and input state.
- `src/cli/banner.ts` owns banner rendering and color persistence.
- `src/cli/slash-commands.ts` owns slash-command metadata, help, and autocomplete matching.
- `src/cli/scenario-menu.ts` owns `/test`, `/eval`, and scripted scenario listing UI.
- `src/cli/session-controller.ts` owns session id, message history, token count, and persistence calls.

## Consequences

CLI startup is easier to reason about because each module has a narrower reason to change. Future CLI changes should preserve the coordinator boundary unless the entry point is only wiring together already-owned behavior.
