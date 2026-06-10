# editing.md + PreToolUse Hook

Idea: create `docs/editing.md` with a maintenance/codebase-hygiene section, and surface it automatically whenever an agent uses an edit mode.

## Approach

1. Write `docs/editing.md` with a standalone "maintenance" section (conventions, things to check before/after edits, etc.).
2. Add a `PreToolUse` hook in `~/.claude/settings.json` that fires on `Edit` and `Write` tool calls, injecting a reminder to read `editing.md` first.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Before editing: read docs/editing.md'"
          }
        ]
      }
    ]
  }
}
```

## Notes

- Hook output is injected as a message the agent sees before the tool call executes.
- Non-zero exit from the hook causes the tool call to fail, making it truly blocking if needed.
- `CLAUDE.md`/`AGENTS.md` would just need a short pointer to `editing.md`; the hook does the enforcement.
- Hook lives in user settings, not the repo — consider whether it should be documented in `docs/misc/` so other contributors know to set it up.
