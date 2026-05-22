import type { CoreMessage, CoreTool } from 'ai';
import { createHash } from 'crypto';
import { loadConfig } from '../../config/index.js';
import { formatOpenAICompatHttpError, type CapturedProviderUsage } from './openai-compat.js';
import type { ProviderConfig } from '../types.js';
import type { ConfirmToolCall } from '../../agent/tools/index.js';

type JsonObject = Record<string, unknown>;

export interface OpenAIResponsesInputTokenResult {
  inputTokens: number;
  payloadHash: string;
}

export interface OpenAIResponsesGenerationResult {
  text: string;
  usage: { totalTokens: number; promptTokens?: number; outputTokens?: number };
  providerUsage: CapturedProviderUsage[];
}

export interface OpenAIResponsesPayloadOptions {
  modelId: string;
  systemPrompt: string;
  messages: CoreMessage[];
  tools?: Record<string, CoreTool>;
}

export interface OpenAIResponsesRequestPayload {
  model: string;
  instructions: string;
  input: JsonObject[];
  store: false;
  tools?: JsonObject[];
  parallel_tool_calls?: false;
}

type OpenAIResponsesInputTokenPayload = Omit<OpenAIResponsesRequestPayload, 'store'>;

interface OpenAIResponseBody {
  id?: string;
  model?: string;
  output?: JsonObject[];
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const OPENAI_INPUT_TOKENS_URL = 'https://api.openai.com/v1/responses/input_tokens';

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringifyContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (isRecord(part) && part.type === 'text' && typeof part.text === 'string') return part.text;
      if (isRecord(part) && part.type === 'tool-call') return JSON.stringify(part);
      if (isRecord(part) && part.type === 'tool-result') return JSON.stringify(part);
      return JSON.stringify(part);
    }).join('\n');
  }
  return String(content ?? '');
}

function contentBlock(type: 'input_text' | 'output_text', text: string): JsonObject {
  return { type, text };
}

function coreMessageToResponsesInput(message: CoreMessage): JsonObject[] {
  if (message.role === 'tool') {
    return message.content.map((part) => ({
      type: 'function_call_output',
      call_id: part.toolCallId,
      output: stringifyContent(part.result),
    }));
  }

  const role = message.role === 'system' ? 'developer' : message.role;
  const textType = role === 'assistant' ? 'output_text' : 'input_text';
  return [{
    role,
    content: [contentBlock(textType, stringifyContent(message.content))],
  }];
}

function maybeRationaleProperty(): JsonObject {
  return loadConfig().toolRationale
    ? { rationale: { type: 'string', description: 'One sentence: why you are calling this tool right now' } }
    : {};
}

function toolSchema(name: string): JsonObject {
  const rationale = maybeRationaleProperty();
  switch (name) {
    case 'read_file':
      return {
        type: 'object',
        properties: {
          ...rationale,
          path: { type: 'string', description: 'Relative path from project root' },
        },
        required: ['path'],
        additionalProperties: false,
      };
    case 'write_file':
      return {
        type: 'object',
        properties: {
          ...rationale,
          path: { type: 'string', description: 'Relative path from project root' },
          content: { type: 'string', description: 'The complete content to write to the file' },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      };
    case 'grep':
      return {
        type: 'object',
        properties: {
          ...rationale,
          pattern: { type: 'string', description: 'The regex pattern to search for' },
          path: { type: 'string', description: 'Directory to search in (default: current directory)' },
        },
        required: ['pattern'],
        additionalProperties: false,
      };
    case 'shell_exec':
      return {
        type: 'object',
        properties: {
          ...rationale,
          command: { type: 'string', description: 'The shell command to execute' },
          confirmDestructive: { type: 'boolean', description: 'Set to true only if user confirmed destructive command' },
        },
        required: ['command'],
        additionalProperties: false,
      };
    case 'list_dir':
      return {
        type: 'object',
        properties: {
          ...rationale,
          path: { type: 'string', description: 'Relative path from project root (default: .)' },
        },
        required: [],
        additionalProperties: false,
      };
    default:
      return { type: 'object', properties: rationale, required: [], additionalProperties: false };
  }
}

function responsesTools(tools: Record<string, CoreTool> | undefined): JsonObject[] | undefined {
  if (!tools) return undefined;
  const converted = Object.entries(tools).map(([name, tool]) => ({
    type: 'function',
    name,
    description: 'description' in tool && typeof tool.description === 'string' ? tool.description : '',
    parameters: toolSchema(name),
    strict: false,
  }));
  return converted.length > 0 ? converted : undefined;
}

export function buildOpenAIResponsesPayload(options: OpenAIResponsesPayloadOptions): OpenAIResponsesRequestPayload {
  const tools = responsesTools(options.tools);
  return {
    model: options.modelId,
    instructions: options.systemPrompt,
    input: options.messages.flatMap(coreMessageToResponsesInput),
    store: false,
    ...(tools ? { tools, parallel_tool_calls: false as const } : {}),
  };
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}

export function hashOpenAIResponsesPayload(payload: OpenAIResponsesRequestPayload): string {
  return createHash('sha256')
    .update(JSON.stringify(stable(payload)))
    .digest('hex');
}

function inputTokenPayload(payload: OpenAIResponsesRequestPayload): OpenAIResponsesInputTokenPayload {
  const { store: _store, ...countPayload } = payload;
  return countPayload;
}

export function getOpenAIApiKey(provider: ProviderConfig): string | null {
  const config = loadConfig();
  return process.env[provider.apiKeyEnvVar] || config.providers[provider.id]?.apiKey || null;
}

async function postOpenAIResponses(
  url: string,
  provider: ProviderConfig,
  payload: OpenAIResponsesRequestPayload | OpenAIResponsesInputTokenPayload,
  signal?: AbortSignal,
): Promise<Response> {
  const apiKey = getOpenAIApiKey(provider);
  if (!apiKey) throw new Error(`No API key configured for ${provider.name}. Use /keys to check.`);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  });
  const httpError = await formatOpenAICompatHttpError(provider.name, response);
  if (httpError) throw new Error(httpError);
  return response;
}

export async function countOpenAIResponsesInputTokens(
  provider: ProviderConfig,
  payload: OpenAIResponsesRequestPayload,
  signal?: AbortSignal,
): Promise<OpenAIResponsesInputTokenResult> {
  const countPayload = inputTokenPayload(payload);
  const payloadHash = createHash('sha256')
    .update(JSON.stringify(stable(countPayload)))
    .digest('hex');
  const response = await postOpenAIResponses(OPENAI_INPUT_TOKENS_URL, provider, countPayload, signal);
  const json = await response.json() as { input_tokens?: unknown };
  if (typeof json.input_tokens !== 'number') {
    throw new Error('OpenAI input token response did not include input_tokens');
  }
  return { inputTokens: json.input_tokens, payloadHash };
}

function extractOutputText(response: OpenAIResponseBody): string {
  if (typeof response.output_text === 'string') return response.output_text;
  const parts: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (isRecord(content) && content.type === 'output_text' && typeof content.text === 'string') {
        parts.push(content.text);
      }
    }
  }
  return parts.join('');
}

function extractFunctionCalls(response: OpenAIResponseBody): JsonObject[] {
  return (response.output ?? []).filter((item) => item.type === 'function_call');
}

function replayableResponseItem(item: JsonObject): JsonObject {
  const { id: _id, ...replayable } = item;
  return replayable;
}

function capturedUsage(providerId: string, response: OpenAIResponseBody): CapturedProviderUsage[] {
  return response.usage ? [{
    providerId,
    ...(response.id ? { responseId: response.id } : {}),
    ...(response.model ? { model: response.model } : {}),
    usage: response.usage,
    source: 'json',
    capturedAt: Date.now(),
  }] : [];
}

async function executeFunctionCall(
  item: JsonObject,
  tools: Record<string, CoreTool>,
  signal?: AbortSignal,
): Promise<JsonObject> {
  const name = typeof item.name === 'string' ? item.name : '';
  const callId = typeof item.call_id === 'string' ? item.call_id : '';
  const tool = tools[name];
  let args: unknown = {};
  if (typeof item.arguments === 'string' && item.arguments.trim()) {
    args = JSON.parse(item.arguments) as unknown;
  }
  if (!tool?.execute) {
    return { type: 'function_call_output', call_id: callId, output: `Tool call failed: unknown tool ${name}` };
  }
  try {
    const result = await tool.execute(args, { abortSignal: signal });
    return { type: 'function_call_output', call_id: callId, output: stringifyContent(result) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { type: 'function_call_output', call_id: callId, output: `Tool call failed: ${message}` };
  }
}

export async function generateOpenAIResponses(
  provider: ProviderConfig,
  payload: OpenAIResponsesRequestPayload,
  tools: Record<string, CoreTool> | undefined,
  _confirmToolCall?: ConfirmToolCall,
): Promise<OpenAIResponsesGenerationResult> {
  const input = [...payload.input];
  const providerUsage: CapturedProviderUsage[] = [];
  let finalText = '';
  let promptTokens: number | undefined;
  let outputTokens: number | undefined;
  let totalTokens = 0;

  for (let step = 0; step < 10; step++) {
    const response = await postOpenAIResponses(OPENAI_RESPONSES_URL, provider, { ...payload, input });
    const json = await response.json() as OpenAIResponseBody;
    providerUsage.push(...capturedUsage(provider.id, json));
    promptTokens = json.usage?.input_tokens ?? promptTokens;
    outputTokens = json.usage?.output_tokens ?? outputTokens;
    totalTokens = json.usage?.total_tokens ?? totalTokens;

    const functionCalls = extractFunctionCalls(json);
    if (functionCalls.length === 0) {
      finalText = extractOutputText(json);
      break;
    }

    input.push(...(json.output ?? []).map(replayableResponseItem));
    for (const item of functionCalls) {
      input.push(await executeFunctionCall(item, tools ?? {}));
    }
  }

  return {
    text: finalText,
    usage: { totalTokens, promptTokens, outputTokens },
    providerUsage,
  };
}
