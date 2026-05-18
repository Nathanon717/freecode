# CLI separation of concerns

**Date:** 2026-05-18

## What was built

- Split CLI terminal rendering, banner, slash command metadata, scenario menus, and session state out of `src/index.ts`.
- Added `docs/easy_to_think_about.md` as the ongoing refactoring ledger.
- Recorded the completed `src/index.ts` coordinator change in that ledger.

## Key decisions

- Kept `src/index.ts` as the process entry point and orchestration layer.
- Moved mutable terminal UI state into `src/cli/terminal-ui.ts`.
- Moved session persistence wiring into `SessionController` so chat state is not managed directly in the entry point.

## Files changed

- `docs/easy_to_think_about.md`
- `docs/sessions/2026-05-18-cli-separation-of-concerns.md`
- `src/index.ts`
- `src/cli/banner.ts`
- `src/cli/scenario-menu.ts`
- `src/cli/session-controller.ts`
- `src/cli/slash-commands.ts`
- `src/cli/terminal-ui.ts`

## How to verify

```powershell
npm run build
npm run verify:fast
```
