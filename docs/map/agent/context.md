# src/agent/context.ts - Agent Tool Context

**Role:** Provides the current project root and per-root file read tracking to tool modules that are created outside a single request scope.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `projectRoot` | `string` | Mutable module-level root path, initialized to `process.cwd()`. |
| `setProjectRoot` | `(path: string) => void` | Updates `projectRoot` before a tool-enabled agent turn and clears read tracking. |
| `markFileRead` | `(path: string) => void` | Records that a relative path was successfully read. |
| `hasFileBeenRead` | `(path: string) => boolean` | Checks whether a relative path has been successfully read in the current root context. |

## Used By

- `agent/loop.ts` calls `setProjectRoot(projectRoot)` at the start of each turn.
- Agent tools import `projectRoot` and resolve relative paths against it.
- `read_file` marks files as read after successful reads; `edit_file` checks that state before editing.

## Important Behavior

This module is intentionally stateful. A single process can switch roots between CLI sessions, so callers must set the root before invoking tools. Read tracking is path-based and scoped to the current `projectRoot` by clearing it whenever the root changes.
