import type { CoreMessage, LanguageModel } from 'ai';
import { streamText } from 'ai';
import { route } from '../providers/router.js';
import { buildSystemPrompt } from './system-prompt.js';
import { createTools, type ConfirmToolCall } from './tools/index.js';
import { getLastCapturedHeaders } from '../providers/adapters/openai-compat.js';
import type { GroqRateLimitHeaders } from '../providers/quota/headers.js';
import { log, logError } from '../logger.js';
import { setProjectRoot } from './context.js';

let systemPromptLogged = false;

interface AgentLoopOptions {
  confirmToolCall?: ConfirmToolCall;
}

export interface AgentLoopResult {
  text: string;
  usage: { totalTokens: number };
  providerId: string;
  modelId: string;
  quota: GroqRateLimitHeaders | null;
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
    const routed = await route([], modelPreference);
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
  let quota: GroqRateLimitHeaders | null = null;

  const systemPrompt = buildSystemPrompt();
  if (!systemPromptLogged) {
    systemPromptLogged = true;
    log('stream', `System prompt:\n${systemPrompt}`);
  }

  log('stream', `Calling streamText`, { supportsTools, maxSteps: supportsTools ? 10 : undefined });
  try {
    const result: unknown = await streamText({
      model: languageModel,
      system: systemPrompt,
      messages,
      ...(supportsTools ? { tools: createTools(options.confirmToolCall), maxSteps: 10 } : {}),
    });

    const typedResult = result as { textStream: AsyncIterable<string>; usage: Promise<{ totalTokens: number }> };

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
    log('stream', `Stream complete`, { chunks: chunkCount, textLength: fullText.length, totalTokens });

    if (process.env['DEBUG_QUOTA'] !== '0') {
      const headers = getLastCapturedHeaders(providerId);
      if (headers) {
        quota = headers;
        log('quota', `Rate limit headers captured`, headers);
      } else {
        log('quota', `No rate limit headers captured for ${providerId}`);
      }
    }
  } catch (error) {
    logError('stream', `streamText failed (partial text: ${fullText.length} chars)`, error);
    log('stream', 'streamText error details', serializeError(error));
    const errMsg = error instanceof Error ? error.message : (typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error));
    if (fullText && !fullText.endsWith('\n')) process.stdout.write('\n');
    process.stdout.write(`Error: ${errMsg}\n`);
    return {
      text: fullText + `\n\nError: ${errMsg}`,
      usage: { totalTokens },
      providerId,
      modelId,
      quota,
    };
  }

  return {
    text: fullText,
    usage: { totalTokens },
    providerId,
    modelId,
    quota,
  };
}
