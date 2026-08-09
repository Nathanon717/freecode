# src/agent/system-prompt.ts - System Prompt

**Role:** Builds the static string injected as the `system` message for every agent turn.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
buildSystemPrompt(loadAgentsMd?: boolean, toolNames?: readonly string[]): string
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`agent/tools/tool-names.ts`](tools/tool-names.md) ×2, [`agent/workspace.ts`](workspace.md) ×2, [`util/text-encoding.ts`](../util/text-encoding.md) ×1
- **Imported by:** [`agent/loop.ts`](loop.md) ×2, [`cli/eval/custom-eval-menu.ts`](../cli/eval/custom-eval-menu.md) ×1, [`cli/eval/humaneval-menu.ts`](../cli/eval/humaneval-menu.md) ×1, [`tokenizers/chat-format.ts`](../tokenizers/chat-format.md) ×1

## Tests

`tests/agent/system-prompt.test.ts`. 6 other test files reference it.

## Budget

68 / 500 lines (432 to spare).
<!-- END GENERATED MAP FACTS -->

## Export notes

- `loadAgentsMd` defaults to `false`. When `true`, appends the project's instruction file under a `# Project Instructions (<file>)` header; silently omitted if neither file exists. See [Project instructions](#project-instructions) for file choice and caller-only stripping.
- `toolNames` **must be exactly what the caller put in the tool set** — build it with `offeredToolNames` ([tools/tool-names.md](tools/tool-names.md)) from the same flags passed to `createTools`. It defaults to the full set plus `spawn_agent`. Advertising an absent tool sends the model calling something that is not there, and there are two ways to get it wrong: [parsed-tools.md](parsed-tools.md) builds its tools without a `spawnAgent` runner, and a read-only session (the Ctrl+R toggle, `freecode -p`) has no `create`/`edit`/`shell_exec`. [loop.md](loop.md) passes the right list on both paths.

## Behavior

Mostly static, with three things derived from `toolNames`:

- the `Available tools:` line;
- the editing rules, replaced by a "this session is read-only" statement when the set
  contains no write tool — otherwise the prompt instructs a read-only agent to use
  tools it does not have;
- the `HANDY TIPS` section, whose tips are each about a specific tool and are dropped
  with it. "Running broken code often gives you a helpful error message" contradicts
  a session with no `shell_exec`, so an all-read-only set drops the section entirely.

## Project instructions

When `loadAgentsMd` is `true`, the prompt gains the project's instruction file, read from
`projectRoot` at call time.

- **File choice:** `AGENTS.md` first, then `CLAUDE.md`. Repos carry one or the other, and
  without the fallback a sub-agent launched in a `CLAUDE.md`-only repo would get no
  project context at all. The header names whichever file was used.
- **Caller-only stripping:** regions fenced by `<!-- caller-only:start -->` and
  `<!-- caller-only:end -->` are removed before injection. These files have two kinds of
  reader — agents that *call* freecode (Claude Code, Codex) read them off disk and see
  everything; freecode itself only ever sees them through this function. Fenced content
  is caller-side guidance a sub-agent cannot act on: delegating to a `freecode -p` it
  cannot spawn, and appending delegation reports to the stdout its caller captures with
  `$(freecode -p "...")`. This is the same principle as the `hasSpawnAgent` tip gating
  above — withhold what the reader cannot use — applied to project instructions.
- **Unterminated fence:** strips to end of file. Losing project context is cheaper than
  leaking the instructions the fence exists to withhold.
- If stripping empties the file, no header is added.

This repo's own `CLAUDE.md`/`AGENTS.md` fences its `## Subagents` section. The two files
must stay identical, so the fence markers have to be edited in both.
