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
} from '../providers/adapters/openai-responses.js';
import { writeTranscriptStepDivider } from '../cli/transcript-renderer.js';
import { getAnthropicVerifiedRates, getOpenAIVerifiedRates } from '../providers/pricing-verifier.js';
import type { RateLimitSnapshot } from '../providers/quota/headers.js';
import { log, logError } from '../logger.js';
import { setProjectRoot } from './context.js';
import { isProviderToolUseFailed, toDetailedErrorMessage, toErrorMessage } from '../util/errors.js';

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
  let languageModel: LanguageModel;
  let providerId: string;
  let modelId: string;
  let supportsTools: boolean;

  setProjectRoot(projectRoot);
  log('stream', `agentLoop called`, { modelPreference: modelPreference ?? '(none)', historyLength: messages.length, projectRoot });
  try {
    const resolved = resolveModel(modelPreference ?? '');
    languageModel = resolved.model;
    providerId = resolved.providerId;
    modelId = resolved.modelId;
    supportsTools = resolved.supportsTools;
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
  try {
    if (providerId === 'openai') {
      const provider = getProvider(providerId);
      if (!provider) throw new Error(`Unknown provider: "${providerId}"`);
      const tools = supportsTools ? createTools(options.confirmToolCall) : undefined;
      if (tools) writeTranscriptStepDivider();
      const payload = buildOpenAIResponsesPayload({
        modelId,
        systemPrompt,
        messages,
        ...(tools ? { tools } : {}),
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
      if (supportsTools) writeTranscriptStepDivider();
      let activeMessages = messages;
      let toolUseFailureRetries = 0;

      while (true) {
        try {
          const result: unknown = await streamText({
            model: languageModel,
            system: systemPrompt,
            messages: activeMessages,
            ...(supportsTools ? {
              tools: createTools(options.confirmToolCall),
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
          if (supportsTools && fullText.length === 0 && toolUseFailureRetries < 1 && isProviderToolUseFailed(error)) {
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
          throw error;
        }
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
      const headers = getLastCapturedHeaders(providerId) ?? getLastCapturedAnthropicHeaders(providerId);
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
    } else {
      providerUsage = await endProviderUsageCapture(providerId);
    }
    logError('stream', `streamText failed (partial text: ${fullText.length} chars)`, error);
    log('stream', 'streamText error details', serializeError(error));
    const errMsg = toDetailedErrorMessage(error);
    if (fullText && !fullText.endsWith('\n')) process.stdout.write('\n');
    process.stdout.write(`Error: ${errMsg}\n`);
    return {
      text: fullText + `\n\nError: ${errMsg}`,
      usage: { totalTokens, promptTokens, outputTokens },
      providerId,
      modelId,
      quota,
      providerUsage,
      costEstimate,
    };
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
