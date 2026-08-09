# src/agent/workspace.ts - Agent Tool Context

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Provides the current project root and per-root file read tracking to tool modules that are created outside a single request scope.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
projectRoot: string

setProjectRoot(path: string): void

markFileRead(path: string): void

hasFileBeenRead(path: string): boolean

interface ResolvedProjectPath {
  fullPath: string;
  relativePath: string;
}

resolveProjectPath(path: string): ResolvedProjectPath

resolveExistingProjectPath(path: string): Promise<ResolvedProjectPath>

resolveWritableProjectPath(path: string): Promise<ResolvedProjectPath>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`agent/tools/read.ts`](tools/read.md) ×3, [`agent/system-prompt.ts`](system-prompt.md) ×2, [`agent/tools/create.ts`](tools/create.md) ×2, [`agent/tools/edit.ts`](tools/edit.md) ×2, [`agent/loop.ts`](loop.md) ×1, [`agent/tools/grep.ts`](tools/grep.md) ×1, [`agent/tools/list-dir.ts`](tools/list-dir.md) ×1, [`agent/tools/shell.ts`](tools/shell.md) ×1

## Tests

`tests/agent/workspace.test.ts`. 6 other test files reference it.

## Budget

71 / 500 lines (429 to spare).
<!-- END GENERATED MAP FACTS -->

## Export notes

- `projectRoot` is initialized to `process.cwd()` at module load.

## Used By

- `agent/loop.ts` calls `setProjectRoot(projectRoot)` at the start of each turn.
- Agent filesystem tools call the project path resolvers before reading, writing, listing, or searching paths.
- `read` marks files as read after successful reads; `edit` checks that state before editing.

## Important Behavior

This module is intentionally stateful. A single process can switch roots between CLI sessions, so callers must set the root before invoking tools. Read tracking is path-based and scoped to the current `projectRoot` by clearing it whenever the root changes. Path containment starts with lexical relative-path checks and existing/writable filesystem targets are also checked with `realpath`, so symlinks, junctions, and other reparse-point escapes do not bypass the project-root boundary.
