# src/cli/command-dispatcher.ts - Command Dispatcher

**Role:** Handles slash commands and sends normal user input to the agent loop.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
type CommandDispatchResult = 'continue' | 'exit';

type ModelListMode = 'current-only' | 'full';

interface CommandRuntime {
  projectRoot: string;
  session: Conversation;
  getSelectedModel(): string;
  setSelectedModel(model: string): void;
  confirmToolCall: ConfirmToolCall;
  getReadOnly?(): boolean;
  modelListMode: ModelListMode;
  skipStrayConfirmations?: boolean;
  beforeAgentCall?(): void | Promise<void>;
  afterAgentCall?(): void | Promise<void>;
  onAgentResult?(result: AgentLoopResult): void | Promise<void>;
  onStepUsage?(this: void, info: { providerId: string; modelId: string; promptTokens: number }): void;
  beforeScreenClear?(): void | Promise<void>;
  afterScreenClear?(): void | Promise<void>;
  runConfig?(): Promise<void>;
  runModelMenu?(): Promise<void>;
  runEvalMenu(): Promise<void>;
}

dispatchCommand(input: string, runtime: CommandRuntime): Promise<CommandDispatchResult>
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `CommandRuntime` is the dependency bundle assembled and passed by `runCliSession()`.

## Slash Commands

| Command | Behavior |
|---------|----------|
| `/model [id]` | Without an arg, opens the interactive picker when available or shows status. With an arg, sets selected model. Replays the transcript after the picker. |
| `/models [id]` | Alias for `/model [id]`. |
| `/config` | Runs config editor if the current mode supplies `runConfig`; otherwise prints unavailable. Replays the transcript after the editor. |
| `/help` | Prints slash command help plus CLI flags. |
| `/eval` | Opens/renders eval scenario menu. Replays the transcript afterwards. |
| `/keys` | Prints API key status from env/config. |
| `/tools` | Lazily loads `cli/tools/tool-runner.ts` and prints the callable-tool list. |
| `/clear` | Clears in-memory history, redraws banner, and restores screen hooks. **The only command that empties history** — every other screen wipe preserves it. |

## Screen/history coherence

`/config`, `/model` and `/eval` all end in `redrawBanner()`, which clears the
screen *and* scrollback while leaving `Conversation.messages` untouched — the
session then looks fresh but still resends everything on the next turn. The
dispatcher is the seam that fixes this because it is also the only place that
mutates history: each of those three is followed by `replayTranscript()` (see
[render/transcript-replay.md](render/transcript-replay.md)). `/clear` is
deliberately *not* — it empties the history, so a bare banner is accurate, and
the replay is a no-op on empty history anyway.

Before falling back to `sendToAgent()`, non-command input is tried against `parseToolInvocation` (`cli/tools/tool-invocation.ts`); a match runs directly via `cli/tools/tool-runner.ts` (lazily imported) instead of the agent.

## Agent Turns

Non-command input is handled by `sendToAgent()`:

1. Build the turn's message list as a **copy** — the session's history plus the new
   user message. Nothing is committed yet.
2. Run `beforeAgentCall` (inside the try, so a throw there still reaches
   `afterAgentCall` rather than leaving the bottom UI torn down).
3. If `FREECODE_RESULT_JSON` is set, write a placeholder entry with provider/model info (tokens=0) so the footer reflects the correct model immediately.
4. Call `agentLoop(messages, projectRoot, selectedModel, { confirmToolCall, onPartialResult })`. `onPartialResult` updates the placeholder entry with quota headers as soon as the first API response arrives.
5. Run `onAgentResult`.
6. Replace the placeholder entry in `FREECODE_RESULT_JSON` with the full result (tokens, quota, model).
7. Commit the turn: `session.commitTurn(userMessage, result.turnMessages, result.text)`
   — the same user-message object that was sent to the model —
   appends the user message **and** the turn's output as one unit, or nothing at
   all when the turn produced neither (aborted approval, provider error, a throw
   from any step above). See [../agent/conversation.md](../agent/conversation.md)
   and `docs/bug log/28-07-2026.md`. A failed turn's error message rides on
   `result.error`, never in `result.text`, so it is reported but never persisted
   as something the assistant said — the same field gates the
   `(empty response from model)` line.
8. When provider usage was captured and `showProviderUsage` is on, print the raw provider usage JSON.
9. Run `afterAgentCall`.

Errors are logged and printed, not thrown through the session loop.
