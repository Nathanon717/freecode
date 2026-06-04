import { existsSync, readFileSync, writeFileSync } from 'fs';
import type { CoreMessage, LanguageModel } from 'ai';

export const FAKE_PROVIDER_ID = 'mock';
export const FAKE_DEFAULT_MODEL_ID = 'gpt-freecode-test';
export const FAKE_MODEL_PREFIX = `${FAKE_PROVIDER_ID}:`;

export interface FakeUsage {
  totalTokens: number;
  promptTokens?: number;
  outputTokens?: number;
}

interface FakeStepMatch {
  turn?: number;
  messageCount?: number;
  mustContain?: string[];
  toolsAvailable?: string[];
  provider?: string;
  model?: string;
  systemPromptPresent?: boolean;
  toolRationale?: boolean;
  parallelTools?: boolean;
  nativeToolsSupplied?: boolean;
}

interface FakeStepResponse {
  chunks?: string[];
  text?: string;
  usage?: FakeUsage;
  error?: string;
  toolCalls?: FakeToolCall[];
}

interface FakeStep {
  match?: FakeStepMatch;
  response: FakeStepResponse;
}

interface FakeFixture {
  version: 1;
  model?: string;
  allowUnusedSteps?: boolean;
  steps: FakeStep[];
}

export interface FakeModelCall {
  providerId: string;
  modelId: string;
  systemPrompt: string;
  messages: CoreMessage[];
  toolNames: string[];
  toolRationale: boolean;
  parallelTools: boolean;
  nativeToolsSupplied: boolean;
}

export interface FakeModelResult {
  text: string;
  usage: FakeUsage;
  toolCalls: FakeToolCall[];
}

interface FakeTraceEntry {
  callIndex: number;
  providerId: string;
  modelId: string;
  executionPath: 'fake-direct';
  inputMessageCount: number;
  lastUserMessage: string;
  toolNames: string[];
  toolRationale: boolean;
  parallelTools: boolean;
  nativeToolsSupplied: boolean;
  responseStep: number;
  emittedChunks: string[];
  emittedToolCalls: FakeToolCall[];
  usage: FakeUsage;
}

let consumedSteps = 0;

export interface FakeToolCall {
  name: string;
  args: Record<string, unknown>;
}

export function isFakeLlmMode(): boolean {
  return process.env.FREECODE_FAKE_LLM === '1';
}

export function isFakeModelPreference(modelPreference: string): boolean {
  return modelPreference.startsWith(FAKE_MODEL_PREFIX);
}

export function createPlaceholderFakeLanguageModel(): LanguageModel {
  return {
    specificationVersion: 'v1',
    provider: FAKE_PROVIDER_ID,
    modelId: FAKE_DEFAULT_MODEL_ID,
  } as unknown as LanguageModel;
}

export function fakeModelSupportsTools(modelId: string): boolean {
  return !modelId.includes('no-tools');
}

export function resetFakeModelState(): void {
  consumedSteps = 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assertToolCall(value: unknown, stepNumber: number, callNumber: number): asserts value is FakeToolCall {
  if (!isRecord(value)) {
    throw new Error(`Fake LLM fixture step ${stepNumber} toolCalls[${callNumber}] must be an object`);
  }
  if (typeof value.name !== 'string' || value.name.trim().length === 0) {
    throw new Error(`Fake LLM fixture step ${stepNumber} toolCalls[${callNumber}].name must be a non-empty string`);
  }
  if (value.args !== undefined && !isRecord(value.args)) {
    throw new Error(`Fake LLM fixture step ${stepNumber} toolCalls[${callNumber}].args must be an object`);
  }
}

function readFixture(): FakeFixture {
  const fixturePath = process.env.FREECODE_FAKE_LLM_SCRIPT;
  if (!fixturePath) {
    throw new Error('FREECODE_FAKE_LLM_SCRIPT is required when FREECODE_FAKE_LLM=1');
  }
  if (!existsSync(fixturePath)) {
    throw new Error(`Fake LLM fixture not found: ${fixturePath}`);
  }

  const parsed = JSON.parse(readFileSync(fixturePath, 'utf-8')) as unknown;
  if (!parsed || typeof parsed !== 'object') throw new Error('Fake LLM fixture must be a JSON object');
  const fixture = parsed as Partial<FakeFixture>;
  if (fixture.version !== 1) throw new Error('Fake LLM fixture version must be 1');
  if (!Array.isArray(fixture.steps) || fixture.steps.length === 0) {
    throw new Error('Fake LLM fixture must include at least one step');
  }
  for (let i = 0; i < fixture.steps.length; i++) {
    const step = fixture.steps[i] as Partial<FakeStep>;
    if (!step || typeof step !== 'object' || !step.response) {
      throw new Error(`Fake LLM fixture step ${i + 1} must include response`);
    }
    if (step.response.toolCalls !== undefined) {
      if (!Array.isArray(step.response.toolCalls)) {
        throw new Error(`Fake LLM fixture step ${i + 1} response.toolCalls must be an array`);
      }
      step.response.toolCalls.forEach((toolCall, index) => assertToolCall(toolCall, i + 1, index));
    }
  }
  return fixture as FakeFixture;
}

function messageText(message: CoreMessage): string {
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content.map(part => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') return part.text;
      return '';
    }).join('');
  }
  return '';
}

function lastUserMessage(messages: CoreMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messageText(messages[i]);
  }
  return '';
}

function failMatch(stepNumber: number, reason: string): never {
  throw new Error(`Fake LLM fixture step ${stepNumber} did not match: ${reason}`);
}

function assertStepMatches(step: FakeStep, stepNumber: number, call: FakeModelCall): void {
  const match = step.match;
  if (!match) return;

  if (match.provider !== undefined && match.provider !== call.providerId) {
    failMatch(stepNumber, `expected provider ${match.provider}, got ${call.providerId}`);
  }
  if (match.model !== undefined && match.model !== call.modelId) {
    failMatch(stepNumber, `expected model ${match.model}, got ${call.modelId}`);
  }
  if (match.turn !== undefined && match.turn !== consumedSteps + 1) {
    failMatch(stepNumber, `expected turn ${match.turn}, got ${consumedSteps + 1}`);
  }
  if (match.messageCount !== undefined && match.messageCount !== call.messages.length) {
    failMatch(stepNumber, `expected ${match.messageCount} message(s), got ${call.messages.length}`);
  }
  if (match.systemPromptPresent === true && call.systemPrompt.trim().length === 0) {
    failMatch(stepNumber, 'expected a non-empty system prompt');
  }
  if (match.toolRationale !== undefined && match.toolRationale !== call.toolRationale) {
    failMatch(stepNumber, `expected toolRationale ${match.toolRationale}, got ${call.toolRationale}`);
  }
  if (match.parallelTools !== undefined && match.parallelTools !== call.parallelTools) {
    failMatch(stepNumber, `expected parallelTools ${match.parallelTools}, got ${call.parallelTools}`);
  }
  if (match.nativeToolsSupplied !== undefined && match.nativeToolsSupplied !== call.nativeToolsSupplied) {
    failMatch(stepNumber, `expected nativeToolsSupplied ${match.nativeToolsSupplied}, got ${call.nativeToolsSupplied}`);
  }
  const lastUser = lastUserMessage(call.messages);
  for (const text of match.mustContain ?? []) {
    if (!lastUser.includes(text)) failMatch(stepNumber, `last user message does not contain ${JSON.stringify(text)}`);
  }
  for (const toolName of match.toolsAvailable ?? []) {
    if (!call.toolNames.includes(toolName)) failMatch(stepNumber, `tool ${toolName} was not available`);
  }
}

export function assertFakeFixtureComplete(): void {
  const fixture = readFixture();
  if (fixture.allowUnusedSteps) return;
  if (consumedSteps !== fixture.steps.length) {
    throw new Error(`Fake LLM fixture ended with ${fixture.steps.length - consumedSteps} unused step(s)`);
  }
}

function appendTrace(entry: FakeTraceEntry): void {
  const tracePath = process.env.FREECODE_FAKE_LLM_TRACE;
  if (!tracePath) return;
  const existing = existsSync(tracePath)
    ? JSON.parse(readFileSync(tracePath, 'utf-8')) as FakeTraceEntry[]
    : [];
  existing.push(entry);
  writeFileSync(tracePath, JSON.stringify(existing, null, 2), 'utf-8');
}

export async function runFakeModel(call: FakeModelCall): Promise<FakeModelResult> {
  const fixture = readFixture();
  if (fixture.model && fixture.model !== `${call.providerId}:${call.modelId}`) {
    throw new Error(`Fake LLM fixture model ${fixture.model} does not match selected model ${call.providerId}:${call.modelId}`);
  }

  const step = fixture.steps[consumedSteps];
  if (!step) {
    throw new Error(`Fake LLM fixture exhausted before model call ${consumedSteps + 1}`);
  }

  const stepNumber = consumedSteps + 1;
  assertStepMatches(step, stepNumber, call);
  consumedSteps++;

  if (step.response.error) throw new Error(step.response.error);

  const chunks = step.response.chunks ?? (step.response.text !== undefined ? [step.response.text] : []);
  const usage = step.response.usage ?? { totalTokens: 0 };
  const toolCalls = step.response.toolCalls ?? [];
  for (const chunk of chunks) process.stdout.write(chunk);
  if (chunks.length > 0 && toolCalls.length === 0 && !chunks[chunks.length - 1].endsWith('\n')) process.stdout.write('\n');

  appendTrace({
    callIndex: stepNumber,
    providerId: call.providerId,
    modelId: call.modelId,
    executionPath: 'fake-direct',
    inputMessageCount: call.messages.length,
    lastUserMessage: lastUserMessage(call.messages),
    toolNames: call.toolNames,
    toolRationale: call.toolRationale,
    parallelTools: call.parallelTools,
    nativeToolsSupplied: call.nativeToolsSupplied,
    responseStep: stepNumber,
    emittedChunks: chunks,
    emittedToolCalls: toolCalls,
    usage,
  });

  return {
    text: chunks.join(''),
    usage,
    toolCalls,
  };
}
