# src/cli/slash-commands.ts - Slash Commands

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Defines slash command names, fuzzy filtering, inline completion, and help text.

## Read When

- Adding a new slash command to the SLASH_COMMANDS list with its description.
- Changing fuzzy matching or inline completion logic for typed slash inputs.
- Debugging why an input starting with / is treated as a command instead of sent to the model.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface SlashCommandInfo {
  command: string;
  description: string;
}

SLASH_COMMANDS: SlashCommandInfo[]

/**
 * Whether `dispatchCommand` will handle this input as a command rather than
 * send it to the model. Anything starting with `/` is a command — an unknown
 * one is rejected with "No command: …", never forwarded. Shared with the
 * dispatcher so callers that must agree with it (the transcript record, which
 * holds the conversation only) cannot drift from what it actually does.
 */
isSlashCommand(input: string): boolean

getCommandCompletion(input: string): string | null

getFilteredCommands(input: string): string[]

showHelp(): void
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`cli/session-modes.ts`](session-modes.md) ×7, [`cli/command-dispatcher.ts`](command-dispatcher.md) ×2

## Tests

`tests/cli/slash-commands.test.ts`. 2 other test files reference it.

## Budget

75 / 500 lines (425 to spare).
<!-- END GENERATED MAP FACTS -->

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
