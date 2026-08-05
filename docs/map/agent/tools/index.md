# src/agent/tools/index.ts - Tool Registry

**Role:** Declares which tools exist and which of them a given turn is offered, and assembles them through the wrapper stack. What happens *around* each call — rationale, confirmation, rendering, turn stop, serialization — moved to [wrappers.md](wrappers.md) at the 500-line limit; the confirmation types are defined there and re-exported here, so the rest of the codebase keeps importing them from `agent/tools/index.js`.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
export type {
  ConfirmToolCall,
  ToolCallConfirmation,
  ToolCallPreview,
} from "./wrappers.js"

READ_ONLY_TOOL_DEFS: Record<'read' | 'grep' | 'list_dir', AnyCoreTool>

WRITE_TOOL_DEFS: Record<'create' | 'edit' | 'shell_exec', AnyCoreTool>

createTools(confirmToolCall?: ConfirmToolCall | undefined, toolRationale?: boolean | undefined, parsedTools?: boolean, readOnly?: boolean, spawnAgent?: SpawnAgentFn | undefined): Record<...>

readFileTool: CoreTool<ZodObject<{ path: ZodString; offset: ZodOptional<ZodNumber>; limit: ZodOptional<ZodNumber>; }, "strip", ZodTypeAny, { ...; }, { ...; }>, string> & { ...; }

createFileTool: CoreTool<ZodObject<{ path: ZodString; content: ZodString; }, "strip", ZodTypeAny, { path: string; content: string; }, { path: string; content: string; }>, string> & { ...; }

editTool: CoreTool<ZodObject<{ path: ZodString; old_text: ZodString; new_text: ZodString; }, "strip", ZodTypeAny, { path: string; old_text: string; new_text: string; }, { ...; }>, string> & { ...; }

grepTool: CoreTool<ZodObject<{ pattern: ZodString; path: ZodOptional<ZodString>; include: ZodOptional<ZodString>; output_mode: ZodOptional<ZodEnum<["content", "files_with_matches", "count"]>>; case_insensitive: ZodOptional<...>; context_lines: ZodOptional<...>; multiline: ZodOptional<...>; head_limit: ZodOptional<...>; }, "st...

shellTool: CoreTool<ZodObject<{ command: ZodString; timeout_ms: ZodOptional<ZodNumber>; confirmDestructive: ZodOptional<ZodBoolean>; }, "strip", ZodTypeAny, { ...; }, { ...; }>, string> & { ...; }

listDirTool: CoreTool<ZodObject<{ path: ZodOptional<ZodString>; }, "strip", ZodTypeAny, { path?: string | undefined; }, { path?: string | undefined; }>, string> & { ...; }
```
<!-- END GENERATED EXPORTS -->

## Tool Keys

| Key | Tool | Source | Half |
|-----|------|--------|------|
| `read` | `readFileTool` | `./read` | read-only |
| `grep` | `grepTool` | `./grep` | read-only |
| `list_dir` | `listDirTool` | `./list-dir` | read-only |
| `create` | `createFileTool` | `./create` | write |
| `edit` | `editTool` | `./edit` | write |
| `shell_exec` | `shellTool` | `./shell` | write |

`READ_ONLY_TOOL_DEFS` / `WRITE_TOOL_DEFS` are the name → tool maps for those two
halves; the names themselves live in [tool-names.md](tool-names.md) (a leaf module
with no imports, so the boot path can read them without loading the `ai` SDK).
`createTools` wraps whichever halves apply, and `withConfirmation` decides what is
safe to precompute with `isReadOnlyTool` rather than a second list.

**`readOnly` returns the read-only half alone — including no `spawn_agent`.** A
sub-agent is itself read-only, but a call spends a whole LLM sub-turn, which is more
than reading, and the headless `-p` mode ([../../cli/headless-prompt.md](../../cli/headless-prompt.md))
must not be able to fan out. `spawn_agent` is otherwise present only when the caller
injects a model-bound runner (`agent/loop.ts` does — unless `options.spawnAgent` is
false, which is how `-p --edit` writes files without fanning out; the hand-typed and
parsed-tools paths never do).

## One Tool Set Per Turn

`createTools` builds a fresh execution queue **and a fresh `TurnStopState`** on every
call, and `agent/loop.ts` calls it per `streamText` attempt. That scoping is what
makes the Esc stop per-turn without any flag kept in the CLI session:
the box is discarded with the tool set it belongs to. See
[wrappers.md](wrappers.md#turn-stop-esc).
