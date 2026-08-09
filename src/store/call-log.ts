/**
 * @role Defines the `llm_calls` row shape, normalizes provider-reported token counts, and hands rows to `db.ts` for persistence. Called from the adapter fetch wrapper — the only path that makes completion calls — so no LLM call can complete without producing a row.
 *
 * @readwhen
 * Adding a second adapter (it must call `recordLlmCall` on all three paths), changing which fields are logged, or querying the log to infer rate limits.
 */

import { isRecord } from '../util/guards.js';
import { persistCallLogAsync } from './db.js';

/**
 * One LLM HTTP call. Token fields are populated only from a usage object the
 * provider actually returned — never estimated, never counted locally. A null
 * token field means "the provider did not tell us", which is information.
 */
export interface LlmCallRow {
  /** `"provider:modelId"`, matching the `models` table key format. */
  modelKey: string;
  /** ISO-8601 UTC. */
  timestamp: string;
  /** HTTP status, or null if the request never produced a response. */
  status?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  /** Full error text when the call failed. */
  error?: string | null;
}

function intOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null;
}

/**
 * Pull token counts out of a raw provider usage payload: the OpenAI-compatible
 * shape (`prompt_tokens`/`completion_tokens`/`total_tokens`). A payload missing
 * `total_tokens` gets it summed; anything unrecognised yields all-null.
 */
export function tokensFromUsagePayload(usage: unknown): Pick<LlmCallRow, 'inputTokens' | 'outputTokens' | 'totalTokens'> {
  if (!isRecord(usage)) return { inputTokens: null, outputTokens: null, totalTokens: null };

  const inputTokens = intOrNull(usage['prompt_tokens']);
  const outputTokens = intOrNull(usage['completion_tokens']);
  const reportedTotal = intOrNull(usage['total_tokens']);
  const totalTokens = reportedTotal ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);

  return { inputTokens, outputTokens, totalTokens };
}

/**
 * Record one LLM call. Fire-and-forget and never throws — a logging failure
 * must never break the call it is describing.
 */
export function recordLlmCall(row: Omit<LlmCallRow, 'timestamp'> & { timestamp?: string }): void {
  try {
    persistCallLogAsync({ ...row, timestamp: row.timestamp ?? new Date().toISOString() });
  } catch { /* never throws */ }
}
