# src/cli/command-dispatcher.ts - Command Dispatcher

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Handles slash commands and sends normal user input to the agent loop.

## Read When

- Adding or rewiring slash commands like /model, /clear, or /eval dispatch.
- Changing how user turns are committed to session history or agentLoop.
- Modifying model-selection output, provider usage display, or FREECODE_RESULT_JSON handling.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
type CommandDispatchResult = 'continue' | 'exit';

type ModelListMode = 'current-only' | 'full';

/**
 * The dependency bundle `runCliSession()` assembles and passes to every command.
 */
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

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`logger.ts`](../logger.md) ×21, [`cli/render/transcript-replay.ts`](render/transcript-replay.md) ×3, [`eval/result-sink.ts`](../eval/result-sink.md) ×3, [`cli/slash-commands.ts`](slash-commands.md) ×2, [`config/index.ts`](../config/index.md) ×2, [`util/errors.ts`](../util/errors.md) ×2, [`agent/conversation.ts`](../agent/conversation.md) ×1, [`agent/loop.ts`](../agent/loop.md) ×1, [`agent/tools/index.ts`](../agent/tools/index.md) ×1, [`cli/render/banner.ts`](render/banner.md) ×1, [`cli/render/transcript-record.ts`](render/transcript-record.md) ×1, [`cli/tools/tool-invocation.ts`](tools/tool-invocation.md) ×1, +3 more
- **Imported by:** [`cli/session-runner.ts`](session-runner.md) ×3

## Tests

`tests/cli/command-dispatcher.test.ts`. 1 other test file references it.

## Budget

260 / 500 lines (240 to spare).

## Env

`FREECODE_RESULT_JSON`
<!-- END GENERATED MAP FACTS -->

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
   all when the turn produced neither (a model turn with no text and no tool
   calls, a provider error, a throw from any step above). A tool call denied via
   the approval prompt is not this case — it resolves like any other tool
   result, so the step and turn it belongs to still commit normally. Nor is an
   Esc, which additionally *ends* the turn: its denial is re-paired in
   `agent/loop.ts` so the stopped turn commits balanced like any other.
   See [../agent/conversation.md](../agent/conversation.md)
   and `docs/bug log/28-07-2026.md`. A failed turn's error message rides on
   `result.error`, never in `result.text`, so it is reported but never persisted
   as something the assistant said — the same field gates the
   `(empty response from model)` line. `result.stopped` gates it too, and
   replaces it with `Stopped. Send a message to continue.`: a turn the user
   ended with Esc is *expected* to have no closing answer, because the model was
   never asked for one.
8. When provider usage was captured and `showProviderUsage` is on, print the raw provider usage JSON.
9. Run `afterAgentCall`.

Errors are logged and printed, not thrown through the session loop.
