# src/cli/tools/tool-runner.ts - Hand-Typed Tool Execution + /tools Listing

**Role:** Executes user-typed tool calls and renders the `/tools` list. Pulls in the tool registry (and transitively the `ai` SDK), so it is imported **lazily** from [command-dispatcher.md](../command-dispatcher.md) — never on the interactive boot path.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
printToolsList(): void

executeToolInvocation(name: "read" | "grep" | "list_dir" | "create" | "edit" | "shell_exec", args: Record<string, unknown>, confirmToolCall: ConfirmToolCall): Promise<void>
```
<!-- END GENERATED EXPORTS -->

## Read When

- Changing how a hand-typed tool call runs, or how `/tools` renders.

## How It Works

- `executeToolInvocation` runs the call through the same wrapped executor the agent uses (`createTools`): header, read-only precompute/preview, confirmation, and result all flow through the transcript renderer. `runtime.confirmToolCall` is reused unchanged, so write tools still prompt and read-only mode is enforced exactly as for the agent. Args are validated against the tool's zod schema (with clean error output) before execution.
- `printToolsList` derives each `name([optional] required)` signature from the tool's zod shape so it can never drift from the real parameters.

## Key Neighbors

- [tool-invocation.md](./tool-invocation.md) — pure parser that produces the `{name, args}` this runs; owns `TOOL_NAMES`.
- [../agent/tools/index.md](../../agent/tools/index.md) — `createTools` and the base tool schemas.
- [transcript-renderer.md](../render/transcript-renderer.md) — renders the tool header/preview/result.

## Update Triggers

Update when the execution pipeline, confirmation reuse, or `/tools` formatting change.
