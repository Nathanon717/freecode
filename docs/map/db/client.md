# src/db/client.ts - Session Storage

**Role:** JSON-file persistence for sessions and messages. Used by the CLI.

## Storage Location

```text
$FREECODE_HOME/sessions.json
```

or, if `FREECODE_HOME` is unset:

```text
~/.config/freecode/sessions.json
```

The containing directory is created at module load.

## Exports

### Types

```typescript
interface Session {
  id: string;
  project_root: string;
  last_activity_at: string;
}

interface SessionMessage {
  id: number;
  session_id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  token_count: number | null;
  created_at: string;
}
```

### Functions

| Symbol | Signature | Description |
|--------|-----------|-------------|
| `createSession` | `(projectRoot: string) => Session` | Creates and persists a new session with a UUID. |
| `getLastSession` | `(projectRoot: string) => Session \| undefined` | Returns the most recently active session for the project root. |
| `saveMessage` | `(sessionId, role, content, tokenCount) => SessionMessage` | Appends a message and updates session activity for assistant messages. |
| `getSessionMessages` | `(sessionId: string) => SessionMessage[]` | Returns messages sorted by numeric ID. |

## File Format

```json
{
  "sessions": [],
  "messages": []
}
```

The file is loaded and written on every operation. Load/save failures are logged and load failures fall back to empty arrays.
