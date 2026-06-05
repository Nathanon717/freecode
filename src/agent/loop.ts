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
import { estimateOpenAICostVerified } from '../providers/openai-cost.js';
import {
  buildOpenAIResponsesPayload,
  generateOpenAIResponses,
  getLastCapturedOpenAIHeaders,
} from '../providers/adapters/openai-responses.js';
import { writeTranscriptStepDivider } from '../cli/transcript-renderer.js';
import { getAnthropicVerifiedRates, getOpenAIVerifiedRates } from '../providers/pricing-verifier.js';
import type { RateLimitSnapshot } from '../providers/quota/headers.js';
import { log, logError } from '../logger.js';
import { setProjectRoot } from './context.js';
import { isContextOverflowError, isInvalidToolArgumentsError, isNoSuchToolError, isProviderToolUseFailed, isToolsNotSupportedError, isUserAbortError, invalidToolName, noSuchToolAvailableList, noSuchToolName, toDetailedErrorMessage, toErrorMessage } from '../util/errors.js';
import { resolveModelSettings } from '../config/index.js';
import { setParallelToolsDisabled } from '../providers/adapters/openai-compat.js';
import { runPromptToolsLoop } from './prompt-tools.js';
import { isModelNoNativeTools, markModelNoNativeTools } from '../providers/model-traits.js';
import { FAKE_PROVIDER_ID, FAKE_NATIVE_PROVIDER_ID, assertFakeFixtureComplete, createFakeNativeLanguageModel, runFakeModel } from '../providers/fake.js';

let systemPromptLogged = false;

interface AgentLoopOptions {
  confirmToolCall?: ConfirmToolCall;
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

function serializeError(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  const record: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
  for (const key of Object.getOwnPropertyNames(error)) {
    if (key in record) continue;
    record[key] = (error as unknown as Record<string, unknown>)[key];
  }
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause) record.cause = serializeError(cause);
  return record;
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

  let fullText = '';
  let totalTokens = 0;
  let promptTokens: number | undefined;
  let outputTokens: number | undefined;
  let quota: RateLimitSnapshot | null = null;
  let providerUsage: CapturedProviderUsage[] | undefined;
  let costEstimate: CostEstimate | undefined;

  const systemPrompt = buildSystemPrompt();
  if (!systemPromptLogged) {
    systemPromptLogged = true;
    log('stream', `System prompt:\n${systemPrompt}`);
  }

  log('stream', `Calling streamText`, { supportsTools, maxSteps: supportsTools ? 10 : undefined });
  if (providerId === FAKE_PROVIDER_ID) {
    const tools = supportsTools ? createTools(options.confirmToolCall, modelSettings.toolRationale) : undefined;
    const toolNames = tools ? Object.keys(tools) : [];
    let activeMessages = messages;
    try {
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

        if (generated.toolCalls.length === 0) {
          assertFakeFixtureComplete();
          return {
            text: fullText,
            usage: { totalTokens, promptTokens, outputTokens },
            providerId,
            modelId,
            quota: null,
          };
        }

        if (!tools) {
          throw new Error(`Fake LLM fixture emitted tool calls, but ${providerId}:${modelId} does not support tools`);
        }

        const resultParts: string[] = [];
        for (let i = 0; i < generated.toolCalls.length; i++) {
          const toolCall = generated.toolCalls[i];
          writeTranscriptStepDivider();
          const toolFn = tools[toolCall.name as keyof typeof tools];
          if (!toolFn?.execute) {
            resultParts.push(`Tool error: unknown tool "${toolCall.name}". Available tools: ${toolNames.join(', ')}`);
            continue;
          }
          const rawResult = await (toolFn.execute as (args: Record<string, unknown>, opts: unknown) => Promise<unknown>)(
            toolCall.args,
            { toolCallId: `fake-${step}-${i}`, messages: activeMessages },
          );
          const toolResult = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult, null, 2);
          resultParts.push(`<tool_result name="${toolCall.name}">\n${toolResult}\n</tool_result>`);
        }

        activeMessages = [
          ...activeMessages,
          { role: 'assistant' as const, content: generated.text },
          { role: 'user' as const, content: resultParts.join('\n\n') },
        ];
      }

      throw new Error('Fake LLM fixture exceeded max tool steps (10)');
    } catch (error) {
      if (isUserAbortError(error)) {
        return {
          text: fullText,
          usage: { totalTokens, promptTokens, outputTokens },
          providerId,
          modelId,
          quota: null,
        };
      }
      const errMsg = toDetailedErrorMessage(error);
      process.stdout.write(`Error: ${errMsg}\n`);
      return {
        text: fullText ? `${fullText}\n\nError: ${errMsg}` : `Error: ${errMsg}`,
        usage: { totalTokens, promptTokens, outputTokens },
        providerId,
        modelId,
        quota: null,
      };
    }
  }

  if (!modelSettings.parallelTools && providerId !== 'openai' && providerId !== 'anthropic') {
    setParallelToolsDisabled(providerId, true);
  }
  try {
    if (providerId === 'openai') {
      const provider = getProvider(providerId);
      if (!provider) throw new Error(`Unknown provider: "${providerId}"`);
      const tools = supportsTools ? createTools(options.confirmToolCall) : undefined;
      const payload = buildOpenAIResponsesPayload({
        modelId,
        systemPrompt,
        messages,
        ...(tools ? { tools } : {}),
        toolRationale: modelSettings.toolRationale,
        parallelTools: modelSettings.parallelTools,
      });
      const generated = await generateOpenAIResponses(provider, payload, tools, options.confirmToolCall);
      fullText = generated.text;
      if (fullText) process.stdout.write(fullText);
      if (fullText && !fullText.endsWith('\n')) process.stdout.write('\n');
      totalTokens = generated.usage.totalTokens;
      promptTokens = generated.usage.promptTokens;
      outputTokens = generated.usage.outputTokens;
      providerUsage = generated.providerUsage;
      const rates = await getOpenAIVerifiedRates(modelId);
      costEstimate = estimateOpenAICostVerified(modelId, promptTokens, outputTokens, rates);
      log('stream', 'OpenAI Responses complete', { textLength: fullText.length, totalTokens, promptTokens, outputTokens });
      log('stream', 'OpenAI cost estimate', costEstimate);
    } else if (providerId === 'anthropic') {
      beginAnthropicUsageCapture(providerId);
    } else {
      beginProviderUsageCapture(providerId);
    }
    if (providerId !== 'openai') {
      let activeMessages = messages;
      let toolUseFailureRetries = 0;
      let usePromptToolsFallback = supportsTools && isModelNoNativeTools(providerId, modelId);

      while (true) {
        if (usePromptToolsFallback) {
          log('stream', `Skipping native tools for ${providerId}:${modelId} (saved trait)`);
          break;
        }
        try {
          const result: unknown = await streamText({
            model: languageModel,
            system: systemPrompt,
            messages: activeMessages,
            ...(supportsTools ? {
              tools: createTools(options.confirmToolCall, modelSettings.toolRationale),
              maxSteps: 10,
              onStepFinish: (event) => {
                if (event.toolCalls.length > 0) writeTranscriptStepDivider();
              },
            } : {}),
          });

          const typedResult = result as {
            textStream: AsyncIterable<string>;
            usage: Promise<{ totalTokens: number; promptTokens?: number; completionTokens?: number; outputTokens?: number }>;
          };

          let chunkCount = 0;
          for await (const chunk of typedResult.textStream) {
            process.stdout.write(chunk);
            fullText += chunk;
            chunkCount++;
          }
          if (fullText && !fullText.endsWith('\n')) {
            process.stdout.write('\n');
          }
          const usage = await typedResult.usage;
          totalTokens = usage?.totalTokens ?? 0;
          promptTokens = usage?.promptTokens;
          outputTokens = usage?.completionTokens ?? usage?.outputTokens;
          log('stream', `Stream complete`, { chunks: chunkCount, textLength: fullText.length, totalTokens, promptTokens, outputTokens });
          break;
        } catch (error) {
          if (supportsTools && fullText.length === 0 && !usePromptToolsFallback && isToolsNotSupportedError(error)) {
            usePromptToolsFallback = true;
            markModelNoNativeTools(providerId, modelId);
            process.stdout.write(`Note: ${modelId} doesn't support native tool calling — saved. Using prompt-based tools now and automatically next time.\n`);
            log('stream', 'Tool calling rejected by provider; falling back to prompt-based tool protocol', serializeError(error));
            break;
          }
          if (supportsTools && toolUseFailureRetries < 1) {
            if (fullText.length === 0 && isProviderToolUseFailed(error)) {
              toolUseFailureRetries++;
              log('stream', 'Retrying after provider rejected malformed tool call', serializeError(error));
              activeMessages = [
                ...messages,
                {
                  role: 'user',
                  content: 'The provider rejected your previous response because it contained an invalid tool/function call. Retry the same task. When calling a tool, call exactly one valid tool at a time, use the exact tool name, and provide arguments as valid JSON matching the tool schema. String arguments containing JSON or newlines must be escaped as JSON strings.',
                },
              ];
              continue;
            }
            if (isNoSuchToolError(error)) {
              toolUseFailureRetries++;
              fullText = '';
              const available = noSuchToolAvailableList(error) ?? 'read_file, write_file, edit_file, grep, shell_exec, list_dir';
              const badName = noSuchToolName(error);
              const nameHint = badName
                ? ` You called "${badName}", which does not exist. Do not use namespace prefixes (e.g. "repo_browser.") — use the plain name only.`
                : '';
              log('stream', 'Retrying after model called non-existent tool', serializeError(error));
              activeMessages = [
                ...messages,
                {
                  role: 'user',
                  content: `You called a tool that does not exist.${nameHint} The only available tools are: ${available}. Retry your task using only these exact tool names.`,
                },
              ];
              continue;
            }
            if (isInvalidToolArgumentsError(error)) {
              toolUseFailureRetries++;
              fullText = '';
              const name = invalidToolName(error) ?? 'unknown';
              log('stream', 'Retrying after model provided invalid tool arguments', serializeError(error));
              activeMessages = [
                ...messages,
                {
                  role: 'user',
                  content: `Your call to "${name}" was rejected because the arguments did not match the tool's parameter schema. Check the required parameter names and types, then retry.`,
                },
              ];
              continue;
            }
          }
          throw error;
        }
      }

      if (usePromptToolsFallback) {
        const ptResult = await runPromptToolsLoop(messages, systemPrompt, languageModel, options.confirmToolCall, modelSettings.toolRationale);
        fullText = ptResult.text;
        totalTokens = ptResult.totalTokens;
        promptTokens = ptResult.promptTokens;
        outputTokens = ptResult.outputTokens;
      }

      if (providerId === FAKE_NATIVE_PROVIDER_ID && !usePromptToolsFallback) {
        assertFakeFixtureComplete();
      }
    }

    if (providerId === 'anthropic') {
      const [anthropicUsage, rates] = await Promise.all([
        endAnthropicUsageCapture(providerId),
        getAnthropicVerifiedRates(modelId),
      ]);
      costEstimate = estimateAnthropicCostVerified(modelId, anthropicUsage, rates);
      promptTokens = anthropicUsage?.inputTokens ?? promptTokens;
      outputTokens = anthropicUsage?.outputTokens ?? outputTokens;
      if (anthropicUsage) {
        providerUsage = [{
          providerId,
          model: modelId,
          source: 'sse',
          usage: anthropicUsage,
          capturedAt: Date.now(),
        }];
      }
      log('stream', 'Anthropic cost estimate', costEstimate);
    } else if (providerId !== 'openai') {
      providerUsage = await endProviderUsageCapture(providerId);
      if (providerUsage.length > 0) {
        log('stream', 'Provider usage captured', providerUsage);
      }
    }

    if (process.env['DEBUG_QUOTA'] !== '0') {
      const headers = getLastCapturedHeaders(providerId) ?? getLastCapturedAnthropicHeaders(providerId) ?? getLastCapturedOpenAIHeaders(providerId);
      if (headers) {
        quota = headers;
        log('quota', `Rate limit headers captured`, headers);
      } else {
        log('quota', `No rate limit headers captured for ${providerId}`);
      }
    }
  } catch (error) {
    if (providerId === 'anthropic') {
      const anthropicUsage = await endAnthropicUsageCapture(providerId);
      if (anthropicUsage) {
        providerUsage = [{
          providerId,
          model: modelId,
          source: 'sse',
          usage: anthropicUsage,
          capturedAt: Date.now(),
        }];
        const rates = await getAnthropicVerifiedRates(modelId);
        costEstimate = estimateAnthropicCostVerified(modelId, anthropicUsage, rates);
      }
    } else if (providerId === 'openai') {
      providerUsage = await endProviderUsageCapture(providerId);
      if (promptTokens !== undefined || outputTokens !== undefined) {
        const rates = await getOpenAIVerifiedRates(modelId);
        costEstimate = estimateOpenAICostVerified(modelId, promptTokens, outputTokens, rates);
      }
      if (process.env['DEBUG_QUOTA'] !== '0') {
        const headers = getLastCapturedOpenAIHeaders(providerId);
        if (headers) quota = headers;
      }
    } else {
      providerUsage = await endProviderUsageCapture(providerId);
      if (process.env['DEBUG_QUOTA'] !== '0') {
        const headers = getLastCapturedHeaders(providerId);
        if (headers) quota = headers;
      }
    }
    if (isUserAbortError(error)) {
      return {
        text: fullText,
        usage: { totalTokens, promptTokens, outputTokens },
        providerId,
        modelId,
        quota,
        providerUsage,
        costEstimate,
      };
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
    const displayError = isContextOverflowError(error)
      ? 'Context window exceeded — start a new session or switch to a model with a larger context window.'
      : errMsg;
    return {
      text: fullText + `\n\nError: ${displayError}`,
      usage: { totalTokens, promptTokens, outputTokens },
      providerId,
      modelId,
      quota,
      providerUsage,
      costEstimate,
    };
  } finally {
    setParallelToolsDisabled(providerId, false);
  }

  return {
    text: fullText,
    usage: { totalTokens, promptTokens, outputTokens },
    providerId,
    modelId,
    quota,
    providerUsage,
    costEstimate,
  };
}
