# src/cli/slash-commands.ts - Slash Commands

**Role:** Defines slash command names, fuzzy filtering, inline completion, and help text.

## Exports

| Symbol | Signature | Description |
|--------|-----------|-------------|
| `getCommandCompletion` | `(input: string) => string \| null` | Returns an exact prefix/fuzzy completion for slash input, excluding already complete commands. |
| `getFilteredCommands` | `(input: string) => string[]` | Returns matching command suggestions, excluding the inline completion. |
| `showHelp` | `() => void` | Prints command descriptions. |

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
