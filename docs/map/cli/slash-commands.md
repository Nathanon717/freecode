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

getCommandCompletion(input: string): string | null

getFilteredCommands(input: string): string[]

showHelp(): void
```
<!-- END GENERATED EXPORTS -->

## Commands

```text
/clear
/config
/eval
/help
/keys
/model
/renderer
/test
```

## Matching

The matcher first checks prefix completion, then falls back to ordered fuzzy matching where query characters must appear in order.
