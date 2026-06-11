import type { CoreMessage, LanguageModel } from 'ai';
import { streamText } from 'ai';
import { getProvider, resolveModel } from '../providers/registry.js';
import { buildSystemPrompt } from './system-prompt.js';
import { createTools, type ConfirmToolCall } from './tools/index.js';
import {
  beginProviderUsageCapture,
  endProviderUsageCapture,
  getLastCapturedHeaders,
  type CapturedProviderUsage,
} from '../providers/adapters/openai-compat.js';
import {
  beginAnthropicUsageCapture,
  endAnthropicUsageCapture,
  getLastCapturedAnthropicHeaders,
} from '../providers/adapters/anthropic.js';
import {
  estimateAnthropicCostVerified,
  type CostEstimate,
} from '../providers/anthropic-cost.js';
import { beginTranscriptTurn, endTranscriptStep, notifyTranscriptChunk } from '../cli/transcript-renderer.js';
import { renderMarkdown, createMarkdownStreamRenderer } from '../cli/markdown-renderer.js';
import { getAnthropicVerifiedRates } from '../providers/pricing-verifier.js';
import type { RateLimitSnapshot } from '../providers/quota/headers.js';
import { log, logError } from '../logger.js';
import { setProjectRoot } from './context.js';
import { isContextOverflowError, isInvalidToolArgumentsError, isNoSuchToolError, isProviderToolUseFailed, isToolsNotSupportedError, isUserAbortError, invalidToolName, noSuchToolAvailableList, noSuchToolName, serializeError, toDetailedErrorMessage, toErrorMessage } from '../util/errors.js';
import { resolveModelSettings } from '../config/index.js';
import { setParallelToolsDisabled } from '../providers/adapters/openai-compat.js';
import { executeToolCalls, runPromptToolsLoop } from './prompt-tools.js';
import { isNativeToolsDisabled, setNativeTools } from '../providers/model-store.js';
import { FAKE_PROVIDER_ID, FAKE_NATIVE_PROVIDER_ID, assertFakeFixtureComplete, createFakeNativeLanguageModel, runFakeModel } from '../providers/fake.js';

let systemPromptLogged = false;

interface AgentLoopOptions {
  confirmToolCall?: ConfirmToolCall;
  readOnly?: boolean;
  onPartialResult?: (partial: { providerId: string; modelId: string; quota: RateLimitSnapshot | null }) => void;
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

type ModelSettings = ReturnType<typeof resolveModelSettings>;

async function runFakeLlm(
  providerId: string,
  modelId: string,
  supportsTools: boolean,
  systemPrompt: string,
  messages: CoreMessage[],
  options: AgentLoopOptions,
  modelSettings: ModelSettings,
): Promise<AgentLoopResult> {
  const tools = supportsTools ? createTools(options.confirmToolCall, modelSettings.toolRationale, false, options.readOnly) : undefined;
  const toolNames = tools ? Object.keys(tools) : [];
  let activeMessages = messages;
  let fullText = '';
  let totalTokens = 0;
  let promptTokens: number | undefined;
  let outputTokens: number | undefined;
  const result = (text: string): AgentLoopResult => ({
    text,
    usage: { totalTokens, promptTokens, outputTokens },
    providerId,
    modelId,
    quota: null,
  });

  try {
    beginTranscriptTurn();
    for (let step = 0; step < 10; step++) {
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
      // runFakeModel already wrote the text to stdout; update renderer state.
      if (generated.text) notifyTranscriptChunk(generated.text);

      if (generated.toolCalls.length === 0) {
        assertFakeFixtureComplete();
        endTranscriptStep(false);
        return result(fullText);
      }

      if (!tools) {
        throw new Error(`Fake LLM fixture emitted tool calls, but ${providerId}:${modelId} does not support tools`);
      }

      // writeTranscriptToolLeadIn is called inside withLogging (via toolFn.execute).
      const resultParts = await executeToolCalls(tools, generated.toolCalls, `fake-${step}`, activeMessages);

      endTranscriptStep(true); // close step, open next
      activeMessages = [
        ...activeMessages,
        { role: 'assistant' as const, content: generated.text },
        { role: 'user' as const, content: resultParts.join('\n\n') },
      ];
    }

    throw new Error('Fake LLM fixture exceeded max tool steps (10)');
  } catch (error) {
    endTranscriptStep(false);
    if (isUserAbortError(error)) return result(fullText);
    const errMsg = toDetailedErrorMessage(error);
    process.stdout.write(`Error: ${errMsg}\n`);
    return result(fullText ? `${fullText}\n\nError: ${errMsg}` : `Error: ${errMsg}`);
  }
}

interface StreamResult {
  fullText: string;
  totalTokens: number;
  promptTokens: number | undefined;
  outputTokens: number | undefined;
  usePromptToolsFallback: boolean;
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
  let usePromptToolsFallback = supportsTools && isNativeToolsDisabled(providerId, modelId);
  let fullText = '';
  let totalTokens = 0;
  let promptTokens: number | undefined;
  let outputTokens: number | undefined;

  while (true) {
    if (usePromptToolsFallback) {
      log('stream', `Skipping native tools for ${providerId}:${modelId} (saved trait)`);
      break;
    }
    try {
      beginTranscriptTurn();
      const result: unknown = await streamText({
        model: languageModel,
        system: systemPrompt,
        messages: activeMessages,
        ...(supportsTools ? {
          tools: createTools(options.confirmToolCall, modelSettings.toolRationale, false, options.readOnly),
          maxSteps: 10,
          onStepFinish: (event) => {
            // Intermediate steps (tool-calls finish reason) get a combined
            // close+open divider. The final step is closed after text normalisation.
            if (event.finishReason === 'tool-calls') endTranscriptStep(true);
            const stepQuota = getLastCapturedHeaders(providerId) ?? getLastCapturedAnthropicHeaders(providerId);
            if (stepQuota) options.onPartialResult?.({ providerId, modelId, quota: stepQuota });
          },
        } : {}),
      });

      const typedResult = result as {
        textStream: AsyncIterable<string>;
        usage: Promise<{ totalTokens: number; promptTokens?: number; completionTokens?: number; outputTokens?: number }>;
      };

      let chunkCount = 0;
      const mdStream = createMarkdownStreamRenderer();
      for await (const chunk of typedResult.textStream) {
        const rendered = mdStream.push(chunk);
        if (rendered) {
          process.stdout.write(rendered);
          notifyTranscriptChunk(rendered);
        }
        fullText += chunk;
        chunkCount++;
      }
      const mdTail = mdStream.flush();
      if (mdTail) {
        process.stdout.write(mdTail);
        notifyTranscriptChunk(mdTail);
      }
      fullText = fullText.trimEnd();
      if (fullText && !fullText.endsWith('\n')) {
        process.stdout.write('\n');
      }
      endTranscriptStep(false); // close the final step after text is normalised
      const usage = await typedResult.usage;
      totalTokens = usage?.totalTokens ?? 0;
      promptTokens = usage?.promptTokens;
      outputTokens = usage?.completionTokens ?? usage?.outputTokens;
      log('stream', `Stream complete`, { chunks: chunkCount, textLength: fullText.length, totalTokens, promptTokens, outputTokens });
      break;
    } catch (error) {
      if (supportsTools && fullText.length === 0 && !usePromptToolsFallback && isToolsNotSupportedError(error)) {
        usePromptToolsFallback = true;
        setNativeTools(providerId, modelId, false);
        process.stdout.write(`Note: ${modelId} doesn't support native tool calling — saved. Using prompt-based tools now and automatically next time.\n`);
        log('stream', 'Tool calling rejected by provider; falling back to prompt-based tool protocol', serializeError(error));
        break;
      }
      if (supportsTools && toolUseFailureRetries < 1) {
        let feedback: string | null = null;
        if (fullText.length === 0 && isProviderToolUseFailed(error)) {
          log('stream', 'Retrying after provider rejected malformed tool call', serializeError(error));
          feedback = 'The provider rejected your previous response because it contained an invalid tool/function call. Retry the same task. When calling a tool, call exactly one valid tool at a time, use the exact tool name, and provide arguments as valid JSON matching the tool schema. String arguments containing JSON or newlines must be escaped as JSON strings.';
        } else if (isNoSuchToolError(error)) {
          fullText = '';
          const available = noSuchToolAvailableList(error) ?? 'read, create, edit, grep, shell_exec, list_dir';
          const badName = noSuchToolName(error);
          const nameHint = badName
            ? ` You called "${badName}", which does not exist. Do not use namespace prefixes (e.g. "repo_browser.") — use the plain name only.`
            : '';
          log('stream', 'Retrying after model called non-existent tool', serializeError(error));
          feedback = `You called a tool that does not exist.${nameHint} The only available tools are: ${available}. Retry your task using only these exact tool names.`;
        } else if (isInvalidToolArgumentsError(error)) {
          fullText = '';
          log('stream', 'Retrying after model provided invalid tool arguments', serializeError(error));
          feedback = `Your call to "${invalidToolName(error) ?? 'unknown'}" was rejected because the arguments did not match the tool's parameter schema. Check the required parameter names and types, then retry.`;
        }
        if (feedback) {
          toolUseFailureRetries++;
          activeMessages = [...messages, { role: 'user' as const, content: feedback }];
          continue;
        }
      }
      throw error;
    }
  }

  return { fullText, totalTokens, promptTokens, outputTokens, usePromptToolsFallback };
}

interface UsageOutcome {
  providerUsage?: CapturedProviderUsage[];
  costEstimate?: CostEstimate;
  promptTokens?: number;
  outputTokens?: number;
  quota: RateLimitSnapshot | null;
}

/**
 * End any active usage capture for the provider, estimate turn cost, and read
 * captured rate-limit headers. Shared by the success and error paths of
 * agentLoop so partial cost/quota metadata survives stream failures.
 */
async function finalizeUsageCapture(
  providerId: string,
  modelId: string,
  promptTokens: number | undefined,
  outputTokens: number | undefined,
): Promise<UsageOutcome> {
  let providerUsage: CapturedProviderUsage[] | undefined;
  let costEstimate: CostEstimate | undefined;
  let quota: RateLimitSnapshot | null = null;

  if (providerId === 'anthropic') {
    const [anthropicUsage, rates] = await Promise.all([
      endAnthropicUsageCapture(providerId),
      getAnthropicVerifiedRates(modelId),
    ]);
    costEstimate = estimateAnthropicCostVerified(modelId, anthropicUsage, rates);
    promptTokens = anthropicUsage?.inputTokens ?? promptTokens;
    outputTokens = anthropicUsage?.outputTokens ?? outputTokens;
    if (anthropicUsage) {
      providerUsage = [{ providerId, model: modelId, source: 'sse', usage: anthropicUsage, capturedAt: Date.now() }];
    }
    log('stream', 'Anthropic cost estimate', costEstimate);
  } else {
    providerUsage = await endProviderUsageCapture(providerId);
    if (providerUsage.length > 0) {
      log('stream', 'Provider usage captured', providerUsage);
    }
  }

  if (process.env['DEBUG_QUOTA'] !== '0') {
    quota = getLastCapturedHeaders(providerId) ?? getLastCapturedAnthropicHeaders(providerId);
    if (quota) log('quota', `Rate limit headers captured`, quota);
    else log('quota', `No rate limit headers captured for ${providerId}`);
  }

  return { providerUsage, costEstimate, promptTokens, outputTokens, quota };
}

export async function agentLoop(
  messages: CoreMessage[],
  projectRoot: string,
  modelPreference?: string,
  options: AgentLoopOptions = {}
): Promise<AgentLoopResult> {
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

  const systemPrompt = buildSystemPrompt();
  if (!systemPromptLogged) {
    systemPromptLogged = true;
    log('stream', `System prompt:\n${systemPrompt}`);
  }

  log('stream', `Calling streamText`, { supportsTools, maxSteps: supportsTools ? 10 : undefined });

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

    if (streamed.usePromptToolsFallback) {
      const ptResult = await runPromptToolsLoop(messages, systemPrompt, languageModel, options.confirmToolCall, modelSettings.toolRationale, options.readOnly);
      fullText = ptResult.text.trimEnd();
      totalTokens = ptResult.totalTokens;
      promptTokens = ptResult.promptTokens;
      outputTokens = ptResult.outputTokens;
    }

    if (providerId === FAKE_NATIVE_PROVIDER_ID && !streamed.usePromptToolsFallback) {
      assertFakeFixtureComplete();
    }

    applyUsageOutcome(await finalizeUsageCapture(providerId, modelId, promptTokens, outputTokens));
  } catch (error) {
    applyUsageOutcome(await finalizeUsageCapture(providerId, modelId, promptTokens, outputTokens));
    if (isUserAbortError(error)) {
      endTranscriptStep(false);
      return finishResult(fullText);
    }
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
    } else {
      process.stdout.write(`Error: ${errMsg}\n`);
    }
    endTranscriptStep(false);
    const displayError = isContextOverflowError(error)
      ? 'Context window exceeded — start a new session or switch to a model with a larger context window.'
      : errMsg;
    return finishResult(fullText + `\n\nError: ${displayError}`);
  } finally {
    setParallelToolsDisabled(providerId, false);
  }

  return finishResult(fullText);
}
