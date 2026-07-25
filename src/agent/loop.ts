import type { CoreMessage, LanguageModel } from 'ai';
import { streamText } from 'ai';
import { retireDeadModel, resolveModel } from '../providers/provider-registry.js';
import { buildSystemPrompt } from './system-prompt.js';
import { createTools, type ConfirmToolCall } from './tools/index.js';
import {
  beginProviderUsageCapture,
  getLastCapturedHeaders,
  type CapturedProviderUsage,
} from '../providers/adapters/openai-compat.js';
import {
  beginAnthropicUsageCapture,
  getLastCapturedAnthropicHeaders,
} from '../providers/adapters/anthropic.js';
import { type CostEstimate } from '../providers/anthropic-cost.js';
import { beginTranscriptTurn, endTranscriptStep, notifyTranscriptChunk, writeToolCallHeader, writeToolStepResult } from '../cli/render/transcript-renderer.js';
import { beginToolRenderGate, endToolRenderGate, releaseToolRenderGate } from './tool-render-gate.js';
import { createMarkdownStreamRenderer } from '../cli/render/markdown-renderer.js';
import type { RateLimitSnapshot } from '../providers/quota/headers.js';
import { log, logError } from '../logger.js';
import { setProjectRoot } from './workspace.js';
import { isContextOverflowError, isModelNotFoundError, isProviderToolUseFailed, isToolsNotSupportedError, isUserAbortError, rejectedToolCall, serializeError, toDetailedErrorMessage, toErrorMessage, MAX_REJECTED_TOOL_CALLS } from '../util/errors.js';
import { resolveModelSettings } from '../config/index.js';
import { setParallelToolsDisabled } from '../providers/adapters/openai-compat.js';
import { runParsedToolsLoop } from './parsed-tools.js';
import { runFakeLlm } from './fake-loop.js';
import { runSubAgent } from './subagents/run-subagent.js';
import { finalizeUsageCapture, type UsageOutcome } from './usage-finalize.js';
import { isNativeToolsDisabled, setNativeTools } from '../providers/model-data.js';
import { ensureStoreReady } from '../store/db.js';
import { FAKE_PROVIDER_ID, FAKE_NATIVE_PROVIDER_ID, assertFakeFixtureComplete, createFakeNativeLanguageModel } from '../providers/fake.js';

let systemPromptLogged = false;

export interface AgentLoopOptions {
  confirmToolCall?: ConfirmToolCall;
  readOnly?: boolean;
  onPartialResult?: (partial: { providerId: string; modelId: string; quota: RateLimitSnapshot | null }) => void;
  // Fires at every step boundary with that step's own prompt tokens, so the
  // footer's context size ticks up while a multi-step tool turn is still
  // running instead of jumping once at the end. Each step resends a longer
  // history, so the values climb; the last one equals the turn's final count.
  onStepUsage?: (info: { providerId: string; modelId: string; promptTokens: number }) => void;
}

export interface AgentLoopResult {
  text: string;
  usage: { totalTokens: number; promptTokens?: number; outputTokens?: number };
  providerId: string;
  modelId: string;
  quota: RateLimitSnapshot | null;
  providerUsage?: CapturedProviderUsage[];
  costEstimate?: CostEstimate;
}

export type ModelSettings = ReturnType<typeof resolveModelSettings>;

interface StreamResult {
  fullText: string;
  totalTokens: number;
  promptTokens: number | undefined;
  outputTokens: number | undefined;
  useParsedToolsFallback: boolean;
}

async function streamWithRetry(
  languageModel: LanguageModel,
  supportsTools: boolean,
  systemPrompt: string,
  messages: CoreMessage[],
  providerId: string,
  modelId: string,
  options: AgentLoopOptions,
  modelSettings: ModelSettings,
): Promise<StreamResult> {
  let activeMessages = messages;
  let toolUseFailureRetries = 0;
  let rejectedToolCalls = 0;
  let useParsedToolsFallback = supportsTools && (isNativeToolsDisabled(providerId, modelId) || modelSettings.parsedTools);
  let fullText = '';
  let totalTokens = 0;
  let promptTokens: number | undefined;
  let outputTokens: number | undefined;
  // Usage from streams that ended in a recovered tool-call rejection. The turn
  // continues in a fresh streamText call, so its usage has to be carried across.
  let carriedTotalTokens = 0;
  let carriedOutputTokens: number | undefined;

  while (true) {
    if (useParsedToolsFallback) {
      log('stream', `Skipping native tools for ${providerId}:${modelId} (saved trait)`);
      break;
    }
    try {
      beginTranscriptTurn();
      const mdStream = createMarkdownStreamRenderer();
      const writeRendered = (rendered: string): void => {
        if (rendered) {
          process.stdout.write(rendered);
          notifyTranscriptChunk(rendered);
        }
      };
      // When the model emits response text and then a tool call without a
      // trailing newline, that partial line stays in the markdown line buffer.
      // Across the step boundary it would otherwise be held and flushed glued
      // onto the next step's text ("…change.The script…"), printing in the
      // wrong place. Force the line out here so the preamble lands in its
      // correct position — after this step's text, before the tool calls.
      const flushPendingPreamble = (): void => {
        if (fullText.length > 0 && !fullText.endsWith('\n')) {
          writeRendered(mdStream.push('\n'));
          fullText += '\n';
        }
      };
      const result: unknown = await streamText({
        model: languageModel,
        system: systemPrompt,
        messages: activeMessages,
        ...(supportsTools ? {
          tools: createTools(options.confirmToolCall, modelSettings.toolRationale, false, options.readOnly, (agentType, prompt) =>
            runSubAgent(agentType, prompt, { kind: 'native', model: languageModel })),
          // A turn runs as many tool round trips as the model asks for. The SDK
          // defaults maxSteps to 1, so "no limit" has to be spelled out rather
          // than omitted; it is only read as `currentStep + 1 < maxSteps`.
          // The turn still ends on context overflow, a provider error, or ESC.
          maxSteps: Number.MAX_SAFE_INTEGER,
          onStepFinish: (event) => {
            // Intermediate steps (tool-calls finish reason) get a combined
            // close+open divider. The final step is closed after text normalisation.
            // Preamble flushing is handled on the `tool-call` part below (before the
            // tool's execute renders its header); here we only close the step.
            if (event.finishReason === 'tool-calls') {
              endTranscriptStep(true);
            }
            const stepQuota = getLastCapturedHeaders(providerId) ?? getLastCapturedAnthropicHeaders(providerId);
            if (stepQuota) options.onPartialResult?.({ providerId, modelId, quota: stepQuota });
            // `event.usage` is this step's own usage (unlike the awaited
            // `result.usage`, which is summed across steps — see below).
            const stepPromptTokens = event.usage?.promptTokens;
            if (stepPromptTokens !== undefined) {
              options.onStepUsage?.({ providerId, modelId, promptTokens: stepPromptTokens });
            }
          },
        } : {}),
      });

      const typedResult = result as {
        fullStream: AsyncIterable<{ type: string } & Record<string, unknown>>;
        usage: Promise<{ totalTokens: number; promptTokens?: number; completionTokens?: number; outputTokens?: number }>;
        // Resolved even when a step ended on an error part, and it holds only calls
        // that actually ran, each paired with its result — a rejected call never
        // reaches the stream. That makes it the history to continue the turn from.
        responseMessages: Promise<CoreMessage[]>;
      };

      let chunkCount = 0;
      let streamError: unknown;
      let streamHadError = false;
      // The AI SDK's final `result.usage.promptTokens` is SUMMED across every
      // step of a multi-step tool turn (ai@3.4 combinedUsage) — using it as the
      // context size would multiply it by the step count and blow past the
      // window. Each `step-finish` part instead carries that step's own usage;
      // the last one is the real context (the full history the final call sent).
      let lastStepPromptTokens: number | undefined;
      // Drive display from the ordered fullStream (text-delta → tool-call →
      // tool-result) instead of the text-only textStream, so a step's preamble text
      // can never render after the tool call it precedes. The gate lets each tool's
      // execute (which draws the header) wait until the consumer has reached that
      // call's tool-call part.
      beginToolRenderGate();
      try {
        for await (const part of typedResult.fullStream) {
          if (part.type === 'text-delta') {
            const delta = part.textDelta as string;
            writeRendered(mdStream.push(delta));
            fullText += delta;
            chunkCount++;
          } else if (part.type === 'tool-call') {
            // Flush the pending partial line, then release the tool's execute so its
            // header renders after this step's preamble text, never before it.
            flushPendingPreamble();
            releaseToolRenderGate();
          } else if (part.type === 'step-finish') {
            const stepUsage = part.usage as { promptTokens?: number } | undefined;
            if (stepUsage?.promptTokens !== undefined) lastStepPromptTokens = stepUsage.promptTokens;
          } else if (part.type === 'error') {
            // fullStream reports mid-stream failures as an error part rather than
            // throwing; re-throw after the loop so the retry/catch logic still runs.
            streamError = part.error;
            streamHadError = true;
            // Render a rejected call here, while the step is still open, so it lands
            // under this step's text like any other tool call rather than after the
            // step divider onStepFinish writes once the stream closes.
            const rejected = rejectedToolCall(part.error);
            if (rejected) {
              flushPendingPreamble();
              writeRendered(mdStream.flush());
              const { rationale, ...displayArgs } = rejected.args;
              writeToolCallHeader({
                name: rejected.name,
                displayArgs,
                rationale: typeof rationale === 'string' ? rationale : undefined,
              });
              writeToolStepResult(rejected.name, { kind: 'error', error: part.error });
            }
          }
        }
      } finally {
        endToolRenderGate();
      }
      if (streamHadError) {
        const rejected = rejectedToolCall(streamError);
        if (rejected && rejectedToolCalls < MAX_REJECTED_TOOL_CALLS) {
          rejectedToolCalls++;
          log('stream', `Tool call rejected before execution; feeding the error back and continuing the turn`, serializeError(streamError));
          const stepUsage = await typedResult.usage;
          carriedTotalTokens += stepUsage?.totalTokens ?? 0;
          const stepOutput = stepUsage?.completionTokens ?? stepUsage?.outputTokens;
          if (stepOutput !== undefined) carriedOutputTokens = (carriedOutputTokens ?? 0) + stepOutput;
          // Continue from what this stream actually did — its text and its completed
          // tool calls — so nothing already executed is replayed on the next call.
          activeMessages = [...activeMessages, ...(await typedResult.responseMessages), { role: 'user' as const, content: rejected.feedback }];
          continue;
        }
        throw streamError;
      }
      writeRendered(mdStream.flush());
      fullText = fullText.trimEnd();
      if (fullText && !fullText.endsWith('\n')) {
        process.stdout.write('\n');
      }
      endTranscriptStep(false); // close the final step after text is normalised
      const usage = await typedResult.usage;
      totalTokens = carriedTotalTokens + (usage?.totalTokens ?? 0);
      // Context size = the LAST step's prompt tokens (see lastStepPromptTokens),
      // not the SDK's step-summed total. Falls back to the aggregate only if no
      // step-finish was seen; for a single-step turn the two are identical.
      promptTokens = lastStepPromptTokens ?? usage?.promptTokens;
      const finalOutput = usage?.completionTokens ?? usage?.outputTokens;
      outputTokens = carriedOutputTokens === undefined ? finalOutput : carriedOutputTokens + (finalOutput ?? 0);
      log('stream', `Stream complete`, { chunks: chunkCount, textLength: fullText.length, totalTokens, promptTokens, outputTokens });
      break;
    } catch (error) {
      if (supportsTools && fullText.length === 0 && !useParsedToolsFallback && isToolsNotSupportedError(error)) {
        useParsedToolsFallback = true;
        setNativeTools(providerId, modelId, false);
        process.stdout.write(`Note: ${modelId} doesn't support native tool calling — saved. Using prompt-based tools now and automatically next time.\n`);
        log('stream', 'Tool calling rejected by provider; falling back to prompt-based tool protocol', serializeError(error));
        break;
      }
      // Rejected tool calls are recovered mid-turn above; this is a provider-level
      // rejection of the whole response, so there is nothing partial to keep and the
      // turn restarts from the original history.
      if (supportsTools && toolUseFailureRetries < 1 && fullText.length === 0 && isProviderToolUseFailed(error)) {
        toolUseFailureRetries++;
        log('stream', 'Retrying after provider rejected malformed tool call', serializeError(error));
        activeMessages = [...messages, {
          role: 'user' as const,
          content: 'The provider rejected your previous response because it contained an invalid tool/function call. Retry the same task. When calling a tool, call exactly one valid tool at a time, use the exact tool name, and provide arguments as valid JSON matching the tool schema. String arguments containing JSON or newlines must be escaped as JSON strings.',
        }];
        continue;
      }
      throw error;
    }
  }

  return { fullText, totalTokens, promptTokens, outputTokens, useParsedToolsFallback };
}


export async function agentLoop(
  messages: CoreMessage[],
  projectRoot: string,
  modelPreference?: string,
  options: AgentLoopOptions = {}
): Promise<AgentLoopResult> {
  await ensureStoreReady();
  if (process.env.FREECODE_NO_LLM === '1') {
    const msg = 'LLM calls blocked (FREECODE_NO_LLM=1)';
    process.stdout.write(`Error: ${msg}\n`);
    return { text: `Error: ${msg}`, usage: { totalTokens: 0 }, providerId: 'none', modelId: 'none', quota: null };
  }

  let languageModel: LanguageModel;
  let providerId: string;
  let modelId: string;
  let supportsTools: boolean;

  setProjectRoot(projectRoot);
  log('stream', `agentLoop called`, { modelPreference: modelPreference ?? '(none)', historyLength: messages.length, projectRoot });
  const modelSettings = resolveModelSettings(modelPreference ?? '');

  try {
    const resolved = resolveModel(modelPreference ?? '');
    languageModel = resolved.model;
    providerId = resolved.providerId;
    modelId = resolved.modelId;
    supportsTools = resolved.supportsTools;
    if (providerId === FAKE_NATIVE_PROVIDER_ID) {
      languageModel = createFakeNativeLanguageModel(modelId, {
        toolRationale: modelSettings.toolRationale,
        parallelTools: modelSettings.parallelTools,
      });
    }
  } catch (error) {
    logError('stream', 'resolveModel failed', error);
    const errMsg = toErrorMessage(error);
    process.stdout.write(`Error: ${errMsg}\n`);
    return {
      text: `Error: ${errMsg}`,
      usage: { totalTokens: 0 },
      providerId: 'none',
      modelId: 'none',
      quota: null,
    };
  }

  options.onPartialResult?.({ providerId, modelId, quota: null });

  let fullText = '';
  let totalTokens = 0;
  let promptTokens: number | undefined;
  let outputTokens: number | undefined;
  let quota: RateLimitSnapshot | null = null;
  let providerUsage: CapturedProviderUsage[] | undefined;
  let costEstimate: CostEstimate | undefined;

  const finishResult = (text: string): AgentLoopResult => ({
    text,
    usage: { totalTokens, promptTokens, outputTokens },
    providerId,
    modelId,
    quota,
    providerUsage,
    costEstimate,
  });
  const applyUsageOutcome = (outcome: UsageOutcome): void => {
    providerUsage = outcome.providerUsage ?? providerUsage;
    costEstimate = outcome.costEstimate ?? costEstimate;
    promptTokens = outcome.promptTokens;
    outputTokens = outcome.outputTokens;
    quota = outcome.quota;
  };

  const systemPrompt = buildSystemPrompt(modelSettings.loadAgentsMd);
  if (!systemPromptLogged) {
    systemPromptLogged = true;
    log('stream', `System prompt:\n${systemPrompt}`);
  }

  log('stream', `Calling streamText`, { supportsTools, maxSteps: supportsTools ? 'unlimited' : undefined });

  if (providerId === FAKE_PROVIDER_ID) {
    return runFakeLlm(providerId, modelId, supportsTools, systemPrompt, messages, options, modelSettings);
  }

  if (!modelSettings.parallelTools && providerId !== 'anthropic') {
    setParallelToolsDisabled(providerId, true);
  }
  try {
    if (providerId === 'anthropic') {
      beginAnthropicUsageCapture(providerId);
    } else {
      beginProviderUsageCapture(providerId);
    }

    const streamed = await streamWithRetry(languageModel, supportsTools, systemPrompt, messages, providerId, modelId, options, modelSettings);
    fullText = streamed.fullText;
    totalTokens = streamed.totalTokens;
    promptTokens = streamed.promptTokens;
    outputTokens = streamed.outputTokens;

    if (streamed.useParsedToolsFallback) {
      const parsedToolsResult = await runParsedToolsLoop(messages, systemPrompt, languageModel, options.confirmToolCall, modelSettings.toolRationale, options.readOnly, (t) => options.onStepUsage?.({ providerId, modelId, promptTokens: t }));
      fullText = parsedToolsResult.text.trimEnd();
      totalTokens = parsedToolsResult.totalTokens;
      promptTokens = parsedToolsResult.promptTokens;
      outputTokens = parsedToolsResult.outputTokens;
    }

    if (providerId === FAKE_NATIVE_PROVIDER_ID && !streamed.useParsedToolsFallback) {
      assertFakeFixtureComplete();
    }

    applyUsageOutcome(await finalizeUsageCapture(providerId, modelId, promptTokens, outputTokens));
  } catch (error) {
    applyUsageOutcome(await finalizeUsageCapture(providerId, modelId, promptTokens, outputTokens));
    if (isUserAbortError(error)) {
      endTranscriptStep(false);
      return finishResult(fullText);
    }
    const isDeadModel = isModelNotFoundError(error) && providerId === 'nvidia';
    if (isDeadModel) retireDeadModel(providerId, modelId);
    logError('stream', `streamText failed (partial text: ${fullText.length} chars)`, error);
    log('stream', 'streamText error details', serializeError(error));
    const errMsg = toDetailedErrorMessage(error);
    if (fullText && !fullText.endsWith('\n')) process.stdout.write('\n');
    if (isContextOverflowError(error)) {
      process.stdout.write(
        `Error: Context window exceeded — the conversation history is too long for this model.\n` +
        `  • Start a new session to clear history, or\n` +
        `  • Switch to a model with a larger context window (e.g. /model).\n`,
      );
    } else if (isDeadModel) {
      process.stdout.write(`Error: Model "${modelId}" returned 404 and has been removed from the picker.\n`);
    } else {
      process.stdout.write(`Error: ${errMsg}\n`);
    }
    endTranscriptStep(false);
    const displayError = isContextOverflowError(error)
      ? 'Context window exceeded — start a new session or switch to a model with a larger context window.'
      : isDeadModel
        ? `Model "${modelId}" returned 404 and has been removed from the picker.`
        : errMsg;
    return finishResult(fullText + `\n\nError: ${displayError}`);
  } finally {
    setParallelToolsDisabled(providerId, false);
  }

  return finishResult(fullText);
}
