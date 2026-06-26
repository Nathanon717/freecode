# src/agent/context.ts - Agent Tool Context

**Role:** Provides the current project root and per-root file read tracking to tool modules that are created outside a single request scope.

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

## Export notes

- `projectRoot` is initialized to `process.cwd()` at module load.

## Used By

- `agent/loop.ts` calls `setProjectRoot(projectRoot)` at the start of each turn.
- Agent filesystem tools call the project path resolvers before reading, writing, listing, or searching paths.
- `read` marks files as read after successful reads; `edit` checks that state before editing.

## Important Behavior

This module is intentionally stateful. A single process can switch roots between CLI sessions, so callers must set the root before invoking tools. Read tracking is path-based and scoped to the current `projectRoot` by clearing it whenever the root changes. Path containment starts with lexical relative-path checks and existing/writable filesystem targets are also checked with `realpath`, so symlinks, junctions, and other reparse-point escapes do not bypass the project-root boundary.
