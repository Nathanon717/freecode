# Agent docs automation

**Date:** 2026-05-19

## What was built

- Added generated-docs checks for reference docs and CI enforcement.
- Added a lightweight `docs/map/` structural checker for agent navigation coverage.
- Documented the agent workflow for using the map first and updating only affected map pages from `git diff --name-only`.

## Key decisions

- `docs/map/` is an agent navigation layer, not a polished manual or generated reference source.
- Map maintenance is incremental: agents update only pages tied to changed files when purpose, ownership, exports, dependencies, or read/use guidance changes.
- CI enforces cheap structural map freshness, while agents maintain semantic freshness during focused code changes.

## Files changed

- `.github/workflows/verify.yml`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/commands.md`
- `docs/docs.md`
- `docs/map/README.md`
- `docs/sessions/2026-05-19-agent-docs-automation.md`
- `package.json`
- `scripts/check-map.ts`

## How to verify

```powershell
cmd /c npm.cmd run docs:check
cmd /c npm.cmd run build
cmd /c npm.cmd run verify:fast
```
