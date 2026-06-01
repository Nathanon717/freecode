import { isRecord } from './guards.js';

export class UserAbortError extends Error {
  constructor() {
    super('Aborted by user');
    this.name = 'UserAbortError';
  }
}

export function isUserAbortError(error: unknown): boolean {
  return error instanceof UserAbortError;
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface ApiErrorDetails {
  message?: string;
  type?: string;
  code?: string | number;
  param?: string;
  failedGeneration?: string;
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function codeField(record: Record<string, unknown>): string | number | undefined {
  const value = record['code'];
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

function apiErrorDetailsFromObject(value: unknown): ApiErrorDetails | null {
  if (!isRecord(value)) return null;
  const error = isRecord(value['error']) ? value['error'] : value;
  const details: ApiErrorDetails = {
    message: stringField(error, 'message'),
    type: stringField(error, 'type'),
    code: codeField(error),
    param: stringField(error, 'param'),
    failedGeneration: stringField(error, 'failed_generation') ?? stringField(value, 'failed_generation'),
  };
  return Object.values(details).some(v => v !== undefined) ? details : null;
}

function apiErrorDetailsFromUnknown(value: unknown): ApiErrorDetails | null {
  if (typeof value === 'string') {
    return apiErrorDetailsFromObject(parseJsonObject(value));
  }
  return apiErrorDetailsFromObject(value);
}

function apiErrorDetailsFromError(error: Error): ApiErrorDetails | null {
  const body = responseBodyFromError(error);
  const bodyDetails = body ? apiErrorDetailsFromUnknown(body) : null;
  return bodyDetails ?? apiErrorDetailsFromUnknown(dataFromError(error));
}

function responseBodyFromError(error: Error): string | undefined {
  const value = (error as Error & { responseBody?: unknown }).responseBody;
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function dataFromError(error: Error): unknown {
  return (error as Error & { data?: unknown }).data;
}

function formatApiErrorDetails(details: ApiErrorDetails, baseMessage: string): string[] {
  const lines: string[] = [];
  if (details.message && details.message !== baseMessage) lines.push(`provider message: ${details.message}`);
  if (details.code !== undefined) lines.push(`code: ${details.code}`);
  if (details.type) lines.push(`type: ${details.type}`);
  if (details.param) lines.push(`param: ${details.param}`);
  if (details.failedGeneration) lines.push(`failed_generation: ${details.failedGeneration}`);
  if (
    details.code === 'tool_use_failed' &&
    !details.failedGeneration &&
    details.message?.includes('failed_generation')
  ) {
    lines.push('diagnosis: provider rejected the model output as an invalid tool/function call before Freecode could run a tool. The provider response did not include the referenced failed_generation payload.');
  }
  return lines;
}

function detailedBaseMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error['message'] === 'string') return error['message'];
  if (typeof error === 'object' && error !== null) return JSON.stringify(error);
  return String(error);
}

export function toDetailedErrorMessage(error: unknown): string {
  const baseMessage = detailedBaseMessage(error);
  const detailLines: string[] = [];

  if (error instanceof Error) {
    const body = responseBodyFromError(error);
    const details = apiErrorDetailsFromError(error);
    if (details) detailLines.push(...formatApiErrorDetails(details, baseMessage));
    if (body && body.trimStart().startsWith('<')) {
      detailLines.push('response body is HTML — likely a gateway/proxy error (check API key or network config)');
    } else if (body && !details && body !== baseMessage) {
      detailLines.push(`response body: ${body}`);
    }
  } else {
    const details = apiErrorDetailsFromUnknown(error);
    if (details) detailLines.push(...formatApiErrorDetails(details, baseMessage));
  }

  return detailLines.length === 0
    ? baseMessage
    : `${baseMessage}\nDetails:\n${detailLines.map(line => `  ${line}`).join('\n')}`;
}

// Adapted from https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/utils/overflow.ts
// and opencode packages/opencode/src/provider/error.ts
const OVERFLOW_PATTERNS = [
  /prompt is too long/i,                                           // Anthropic
  /input is too long for requested model/i,                        // Amazon Bedrock
  /exceeds the context window/i,                                   // OpenAI
  /input token count.*exceeds the maximum/i,                       // Google Gemini
  /maximum prompt length is \d+/i,                                 // xAI Grok
  /reduce the length of the messages/i,                            // Groq
  /maximum context length is \d+ tokens/i,                         // OpenRouter / DeepSeek / vLLM
  /exceeds the limit of \d+/i,                                     // GitHub Copilot
  /exceeds the available context size/i,                           // llama.cpp
  /greater than the context length/i,                              // LM Studio
  /context window exceeds limit/i,                                 // MiniMax
  /exceeded model token limit/i,                                   // Kimi / Moonshot
  /context[_ ]length[_ ]exceeded/i,                                // generic
  /request entity too large/i,                                     // HTTP 413
  /context length is only \d+ tokens/i,                            // vLLM
  /input length.*exceeds.*context length/i,                        // vLLM
  /prompt too long; exceeded (?:max )?context length/i,            // Ollama
  /too large for model with \d+ maximum context length/i,          // Mistral
  /model_context_window_exceeded/i,                                // z.ai
  /^4(00|13)\s*(status code)?\s*\(no body\)/i,                     // Cerebras / Mistral bare 400/413
];

export function isContextOverflowError(error: unknown): boolean {
  const msg = toDetailedErrorMessage(error);
  return OVERFLOW_PATTERNS.some(p => p.test(msg));
}

export function isProviderToolUseFailed(error: unknown): boolean {
  const details = error instanceof Error
    ? apiErrorDetailsFromError(error)
    : apiErrorDetailsFromUnknown(error);
  return details?.code === 'tool_use_failed';
}

export function isNoSuchToolError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AI_NoSuchToolError';
}

export function noSuchToolName(error: unknown): string | null {
  const name = (error as Error & { toolName?: string }).toolName;
  return typeof name === 'string' ? name : null;
}

export function noSuchToolAvailableList(error: unknown): string | null {
  const tools = (error as Error & { availableTools?: string[] }).availableTools;
  return Array.isArray(tools) && tools.length > 0 ? tools.join(', ') : null;
}

export function isInvalidToolArgumentsError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AI_InvalidToolArgumentsError';
}

export function invalidToolName(error: unknown): string | null {
  const name = (error as Error & { toolName?: string }).toolName;
  return typeof name === 'string' ? name : null;
}

const TOOLS_NOT_SUPPORTED_PATTERNS = [
  /does not support tool/i,
  /does not support function/i,
  /tool_choice is not supported/i,
  /tools? (is|are) not supported/i,
  /tool calling.*not supported/i,         // Groq: `tool calling` is not supported with this model
  /function calling is not supported/i,
  /tool use is not supported/i,
  /tool_use is not supported/i,
  /tool_calls? not supported/i,
  /doesn'?t support tools/i,
  /not support.*function call/i,
];

export function isToolsNotSupportedError(error: unknown): boolean {
  const msg = toDetailedErrorMessage(error);
  return TOOLS_NOT_SUPPORTED_PATTERNS.some(p => p.test(msg));
}
