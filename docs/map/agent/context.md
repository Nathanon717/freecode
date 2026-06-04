# src/agent/context.ts - Agent Tool Context

**Role:** Provides the current project root and per-root file read tracking to tool modules that are created outside a single request scope.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `projectRoot` | `string` | Mutable module-level root path, initialized to `process.cwd()`. |
| `setProjectRoot` | `(path: string) => void` | Resolves and updates `projectRoot` before a tool-enabled agent turn and clears read tracking. |
| `markFileRead` | `(path: string) => void` | Records that a relative path was successfully read. |
| `hasFileBeenRead` | `(path: string) => boolean` | Checks whether a relative path has been successfully read in the current root context. |
| `resolveProjectPath` | `(path: string) => ResolvedProjectPath` | Rejects absolute paths and `..` escapes, then returns the full path plus normalized relative path. |
| `resolveExistingProjectPath` | `(path: string) => Promise<ResolvedProjectPath>` | Resolves an existing target through `realpath` and rejects symlink/junction escapes. |
| `resolveWritableProjectPath` | `(path: string) => Promise<ResolvedProjectPath>` | Resolves the writable parent through `realpath` and rejects symlink/junction escapes before writes. |

## Used By

- `agent/loop.ts` calls `setProjectRoot(projectRoot)` at the start of each turn.
- Agent filesystem tools call the project path resolvers before reading, writing, listing, or searching paths.
- `read_file` marks files as read after successful reads; `edit_file` checks that state before editing.

## Important Behavior

This module is intentionally stateful. A single process can switch roots between CLI sessions, so callers must set the root before invoking tools. Read tracking is path-based and scoped to the current `projectRoot` by clearing it whenever the root changes. Path containment starts with lexical relative-path checks and existing/writable filesystem targets are also checked with `realpath`, so symlinks, junctions, and other reparse-point escapes do not bypass the project-root boundary.
