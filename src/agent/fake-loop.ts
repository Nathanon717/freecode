import type { CoreMessage } from 'ai';
import { createTools } from './tools/index.js';
import { beginTranscriptTurn, endTranscriptStep, notifyTranscriptChunk, writeTranscriptText } from '../cli/render/transcript-renderer.js';
import { toDetailedErrorMessage } from '../util/errors.js';
import { executeToolCalls } from './parsed-tools.js';
import { runSubAgent } from './subagents/run-subagent.js';
import { assertFakeFixtureComplete, runFakeModel } from '../providers/fake.js';
import { flattenToolMessagesToText } from './turn-messages.js';
// Type-only, so the cycle with loop.ts (which imports runFakeLlm) is erased at runtime.
import type { AgentLoopOptions, AgentLoopResult, ModelSettings } from './loop.js';

/**
 * The `mock:*` fixture turn. It never touches the AI SDK: `runFakeModel` replays
 * ordered fixture steps against the real system prompt, message history, and tool
 * list, and this loop executes any scripted tool calls through the real
 * `createTools()` wrappers, feeding results back as user messages.
 */
export async function runFakeLlm(
  providerId: string,
  modelId: string,
  supportsTools: boolean,
  systemPrompt: string,
  messages: CoreMessage[],
  options: AgentLoopOptions,
  modelSettings: ModelSettings,
): Promise<AgentLoopResult> {
  const spawnAgent = (agentType: string, prompt: string): Promise<string> =>
    runSubAgent(agentType, prompt, {
      kind: 'fake',
      providerId,
      modelId,
      toolRationale: modelSettings.toolRationale,
      parallelTools: modelSettings.parallelTools,
    });
  const tools = supportsTools ? createTools(options.confirmToolCall, modelSettings.toolRationale, false, options.readOnly, options.spawnAgent === false ? undefined : spawnAgent) : undefined;
  const toolNames = tools ? Object.keys(tools) : [];
  // runFakeModel speaks the text protocol, so native tool messages persisted by
  // an earlier turn are flattened for the same reason as in parsed-tools.ts.
  const baseMessages = flattenToolMessagesToText(messages);
  let activeMessages = baseMessages;
  let fullText = '';
  let totalTokens = 0;
  let promptTokens: number | undefined;
  let outputTokens: number | undefined;
  const result = (text: string, turnMessages: CoreMessage[] = [], error?: string, stopped = false): AgentLoopResult => ({
    text,
    usage: { totalTokens, promptTokens, outputTokens },
    providerId,
    modelId,
    quota: null,
    turnMessages,
    stopped,
    ...(error === undefined ? {} : { error }),
  });

  try {
    beginTranscriptTurn();
    // Unbounded like the real paths; the fixture itself terminates the loop by
    // running out of steps (runFakeModel throws) or emitting no tool calls.
    for (let step = 0; ; step++) {
      const generated = await runFakeModel({
        providerId,
        modelId,
        systemPrompt,
        messages: activeMessages,
        toolNames,
        toolRationale: modelSettings.toolRationale,
        parallelTools: modelSettings.parallelTools,
        nativeToolsSupplied: Boolean(tools),
      });
      fullText += generated.text;
      totalTokens += generated.usage.totalTokens;
      promptTokens = generated.usage.promptTokens;
      outputTokens = generated.usage.outputTokens;
      if (promptTokens !== undefined) {
        options.onStepUsage?.({ providerId, modelId, promptTokens });
      }
      // runFakeModel already wrote the text to stdout; update renderer state with
      // what it actually wrote (newline-terminated), not the model's raw text —
      // the step machine keys the tool lead-in off that trailing newline.
      if (generated.writtenText) notifyTranscriptChunk(generated.writtenText);

      if (generated.toolCalls.length === 0) {
        assertFakeFixtureComplete();
        endTranscriptStep(false);
        // The final answer is the one message the loop never appends itself.
        const finalMessages = generated.text.trim()
          ? [...activeMessages, { role: 'assistant' as const, content: generated.text }]
          : activeMessages;
        return result(fullText, finalMessages.slice(baseMessages.length));
      }

      if (!tools) {
        throw new Error(`Fake LLM fixture emitted tool calls, but ${providerId}:${modelId} does not support tools`);
      }

      // writeTranscriptToolLeadIn is called inside withToolRendering (via toolFn.execute).
      const executed = await executeToolCalls(tools, generated.toolCalls, `fake-${step}`, activeMessages);

      // Keep this step's preamble from gluing onto the next step's text in the
      // accumulated result (runFakeModel emits the matching stdout newline).
      // Added only after the tool resolves — a call that threw has no next step,
      // matching the native path where onStepFinish fires only on completion.
      if (generated.text && !generated.text.endsWith('\n')) fullText += '\n';

      // Esc: close the step for good and commit what this one did, without
      // asking the fixture for another response.
      endTranscriptStep(!executed.stopped);
      activeMessages = [
        ...activeMessages,
        { role: 'assistant' as const, content: generated.text },
        { role: 'user' as const, content: executed.parts.join('\n\n') },
      ];
      // No assertFakeFixtureComplete here: a stopped turn leaves the fixture's
      // later steps unused by design, which is what the assertion complains about.
      // Trimmed because nothing follows it: the preamble newline added above is
      // there to separate this step's text from the next step's, and there is no
      // next step.
      if (executed.stopped) return result(fullText.trimEnd(), activeMessages.slice(baseMessages.length), undefined, true);
    }
  } catch (error) {
    endTranscriptStep(false);
    const errMsg = toDetailedErrorMessage(error);
    writeTranscriptText(`Error: ${errMsg}\n`);
    // The error is reported through `error`, never folded into `text` — the
    // session must not persist it as something the assistant said (loop.ts).
    return result(fullText, [], errMsg);
  }
}
