import type { CoreMessage, LanguageModel } from 'ai';
import { streamText } from 'ai';
import { route } from '../providers/router.js';
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
import { getAnthropicVerifiedRates, getOpenAIVerifiedRates } from '../providers/pricing-verifier.js';
import type { RateLimitSnapshot } from '../providers/quota/headers.js';
import { log, logError } from '../logger.js';
import { setProjectRoot } from './context.js';

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
  log('stream', `agentLoop called`, { modelPreference: modelPreference ?? '(auto)', historyLength: messages.length, projectRoot });
  try {
    const routed = await route(modelPreference);
    languageModel = routed.model;
    providerId = routed.providerId;
    modelId = routed.modelId;
    supportsTools = routed.supportsTools;
  } catch (error) {
    logError('stream', 'Route failed', error);
    const errMsg = error instanceof Error ? error.message : 'Failed to route to provider';
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
    if (providerId === 'anthropic') {
      beginAnthropicUsageCapture(providerId);
    } else {
      beginProviderUsageCapture(providerId);
    }
    const result: unknown = await streamText({
      model: languageModel,
      system: systemPrompt,
      messages,
      ...(supportsTools ? { tools: createTools(options.confirmToolCall), maxSteps: 10 } : {}),
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
    } else if (providerId === 'openai') {
      providerUsage = await endProviderUsageCapture(providerId);
      if (providerUsage.length > 0) {
        log('stream', 'Provider usage captured', providerUsage);
      }
      const rates = await getOpenAIVerifiedRates(modelId);
      costEstimate = estimateOpenAICostVerified(modelId, promptTokens, outputTokens, rates);
      log('stream', 'OpenAI cost estimate', costEstimate);
    } else {
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
    const errMsg = error instanceof Error ? error.message : (typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error));
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
