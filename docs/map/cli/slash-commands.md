# src/cli/slash-commands.ts - Slash Commands

**Role:** Defines slash command names, fuzzy filtering, inline completion, and help text.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface SlashCommandInfo {
  command: string;
  description: string;
}

SLASH_COMMANDS: SlashCommandInfo[]

isSlashCommand(input: string): boolean

getCommandCompletion(input: string): string | null

getFilteredCommands(input: string): string[]

showHelp(): void
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `isSlashCommand(input)` — the single predicate for "the dispatcher will handle this, the model will never see it". Any `/`-prefixed input qualifies, including an unknown one (rejected with `No command: …`). Used by [command-dispatcher.md](command-dispatcher.md) for its fallthrough and by [session-modes.md](session-modes.md) to keep slash commands out of the transcript record; keep those two sharing it rather than re-testing the prefix, or the record and the dispatcher can disagree about what a turn is.

## Commands

```text
/clear
/config
/eval
/help
/status
/model
/tools
/renderer
```

## Matching

The matcher first checks prefix completion, then falls back to ordered fuzzy matching where query characters must appear in order.
