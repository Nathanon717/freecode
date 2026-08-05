import { isRecord } from './guards.js';

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

/**
 * The raw arguments JSON the model sent for a call the SDK rejected as invalid.
 * Only AI_InvalidToolArgumentsError carries it — a call to a non-existent tool is
 * rejected on the name alone, before its arguments are looked at.
 */
function invalidToolArgs(error: unknown): Record<string, unknown> {
  const raw = (error as Error & { toolArgs?: string }).toolArgs;
  if (typeof raw !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * How many rejected tool calls one turn may recover from. The model is told what
 * went wrong and keeps going, so a bad call costs a step rather than the turn;
 * the cap stops a model that keeps reissuing the same broken call from looping.
 */
export const MAX_REJECTED_TOOL_CALLS = 8;

export interface RejectedToolCall {
  name: string;
  /** What the model sent, for rendering the call it attempted; empty for an unknown name. */
  args: Record<string, unknown>;
  /** The message to hand back so the model can correct itself and continue. */
  feedback: string;
}

/**
 * A tool call the AI SDK refused before it could run: an unknown name, or arguments
 * that failed the tool's schema. Neither ever reaches `execute`, so neither produces
 * a tool result — and the SDK then stops stepping, because it only continues when
 * every call has one. Recognising these lets a turn feed the failure back and carry
 * on instead of ending. Returns null when the error is something else.
 */
export function rejectedToolCall(error: unknown): RejectedToolCall | null {
  if (isNoSuchToolError(error)) {
    const name = noSuchToolName(error) ?? 'unknown';
    const available = noSuchToolAvailableList(error) ?? 'read, create, edit, grep, shell_exec, list_dir';
    return {
      name,
      args: {},
      feedback:
        `Your call to "${name}" was rejected: no such tool exists. Do not use namespace prefixes ` +
        `(e.g. "repo_browser.") — use the plain name only. The available tools are: ${available}. ` +
        `Continue the task using only these exact tool names.`,
    };
  }
  if (isInvalidToolArgumentsError(error)) {
    const name = invalidToolName(error) ?? 'unknown';
    return {
      name,
      args: invalidToolArgs(error),
      feedback:
        `Your call to "${name}" was rejected before it ran because the arguments did not match the ` +
        `tool's parameter schema: ${toErrorMessage(error)}. Check the required parameter names and ` +
        `types, then continue the task.`,
    };
  }
  return null;
}

/**
 * Thrown out of a tool's `execute` after the user pressed Esc at its approval
 * prompt, to end the turn without another model call.
 *
 * It is a throw rather than a returned result on purpose: the AI SDK only takes
 * another step when *every* tool call in the step produced a result, so an
 * execute that rejects is the one lever that stops the step loop while still
 * letting `streamText` finish gracefully (finishReason `error`, `responseMessages`
 * resolved). The call it stopped is therefore left unpaired in those messages —
 * `denialResult` is the result text that was already rendered for it, which
 * `agent/turn-messages.ts` `pairStoppedToolCalls` puts back so the turn commits
 * as a balanced call/result pair. See `docs/bug log/06-08-2026.md`.
 */
export class TurnStoppedError extends Error {
  readonly denialResult: string;

  constructor(denialResult: string) {
    super('Turn stopped by user');
    this.name = 'TurnStoppedError';
    this.denialResult = denialResult;
  }
}

export function isTurnStoppedError(error: unknown): error is TurnStoppedError {
  return error instanceof TurnStoppedError;
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
  /--enable-auto-tool-choice/i,           // vLLM/HuggingFace: server not configured for tool calling
];

export function isToolsNotSupportedError(error: unknown): boolean {
  const msg = toDetailedErrorMessage(error);
  return TOOLS_NOT_SUPPORTED_PATTERNS.some(p => p.test(msg));
}

function extractStatusCode(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  const sc = error['statusCode'] ?? error['status'];
  if (typeof sc === 'number') return sc;
  // RetryError stores original error in .lastError and .errors[], not .cause
  const nested = error['cause'] ?? error['lastError'] ?? (error['errors'] as unknown[])?.[0];
  if (nested !== undefined) return extractStatusCode(nested);
  return undefined;
}

export function isModelNotFoundError(error: unknown): boolean {
  return extractStatusCode(error) === 404;
}

export function serializeError(error: unknown): unknown {
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
