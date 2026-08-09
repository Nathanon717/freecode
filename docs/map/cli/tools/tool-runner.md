# src/cli/tools/tool-runner.ts - Hand-Typed Tool Execution + /tools Listing

**Role:** Executes user-typed tool calls and renders the `/tools` list. Pulls in the tool registry (and transitively the `ai` SDK), so it is imported **lazily** from [command-dispatcher.md](../command-dispatcher.md) — never on the interactive boot path.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
printToolsList(): void

executeToolInvocation(name: "create" | "edit" | "shell_exec" | "read" | "grep" | "list_dir", args: Record<string, unknown>, confirmToolCall: ConfirmToolCall): Promise<void>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`agent/tools/index.ts`](../../agent/tools/index.md) ×8, [`cli/tools/tool-invocation.ts`](tool-invocation.md) ×4, [`util/errors.ts`](../../util/errors.md) ×1

## Tests

`tests/cli/tools/tool-runner.test.ts`.

## Budget

103 / 500 lines (397 to spare).
<!-- END GENERATED MAP FACTS -->

## Read When

- Changing how a hand-typed tool call runs, or how `/tools` renders.

## How It Works

- `executeToolInvocation` runs the call through the same wrapped executor the agent uses (`createTools`): header, read-only precompute/preview, confirmation, and result all flow through the transcript renderer. `runtime.confirmToolCall` is reused unchanged, so write tools still prompt and read-only mode is enforced exactly as for the agent. Args are validated against the tool's zod schema (with clean error output) before execution. The `execute` call is wrapped in a `try/catch` that prints a red `Error: …`: the wrapper already converts a failing tool into an `Error: ...` *result*, but the rendering it does before that (render gate, call header) sits outside its own try, and nothing between here and `cli/session-runner.ts` catches — so an escaping throw would end the REPL over a single hand-typed call.
- `printToolsList` derives each `name([optional] required)` signature from the tool's zod shape so it can never drift from the real parameters.

## Key Neighbors

- [tool-invocation.md](./tool-invocation.md) — pure parser that produces the `{name, args}` this runs; owns `TOOL_NAMES`.
- [../agent/tools/index.md](../../agent/tools/index.md) — `createTools` and the base tool schemas.
- [transcript-renderer.md](../render/transcript-renderer.md) — renders the tool header/preview/result.

## Update Triggers

Update when the execution pipeline, confirmation reuse, or `/tools` formatting change.
