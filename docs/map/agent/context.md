# src/agent/context.ts - Mutable Project Root

**Role:** Provides the current project root to tool modules that are created outside a single request scope.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `projectRoot` | `string` | Mutable module-level root path, initialized to `process.cwd()`. |
| `setProjectRoot` | `(path: string) => void` | Updates `projectRoot` before a tool-enabled agent turn. |

## Used By

- `agent/loop.ts` calls `setProjectRoot(projectRoot)` at the start of each turn.
- Agent tools import `projectRoot` and resolve relative paths against it.

## Important Behavior

This module is intentionally stateful. A single process can switch roots between CLI sessions, so callers must set the root before invoking tools.
