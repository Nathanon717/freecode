import { existsSync, readFileSync, writeFileSync } from 'fs';
import { logError } from '../logger.js';

/**
 * Write an initial placeholder entry to the FREECODE_RESULT_JSON file so the
 * footer shows the correct model immediately rather than waiting for the full
 * agent loop to complete.
 */
export function writeResultPlaceholder(path: string, model: string): void {
  try {
    const colonIdx = model.indexOf(':');
    const placeholder = {
      providerId: colonIdx !== -1 ? model.slice(0, colonIdx) : '',
      modelId: colonIdx !== -1 ? model.slice(colonIdx + 1) : model,
      totalTokens: 0,
    };
    const existing: unknown[] = existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) as unknown[] : [];
    existing.push(placeholder);
    writeFileSync(path, JSON.stringify(existing, null, 2), 'utf-8');
  } catch (err) {
    logError('eval', 'Failed to write initial result JSON placeholder', err);
  }
}

/**
 * Returns an `onPartialResult` callback that updates the last entry in the
 * FREECODE_RESULT_JSON file with quota info as soon as the first API response
 * arrives.
 */
export function makePartialResultUpdater(path: string): (partial: Record<string, unknown>) => void {
  return (partial: Record<string, unknown>): void => {
    if (partial['quota'] === null) return;
    try {
      const entries = existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>[] : [];
      if (entries.length > 0) {
        entries[entries.length - 1] = { ...entries[entries.length - 1], ...partial, quota: partial['quota'] };
        writeFileSync(path, JSON.stringify(entries, null, 2), 'utf-8');
      }
    } catch (err) {
      logError('eval', 'Failed to update partial result JSON', err);
    }
  };
}

interface FinalResultEntry {
  totalTokens: number;
  promptTokens: number | undefined;
  outputTokens: number | undefined;
  providerId: string;
  modelId: string;
  quota: unknown;
}

/**
 * Replace the placeholder entry in the FREECODE_RESULT_JSON file with the
 * full result (tokens, quota, model) after the agent loop completes.
 */
export function writeFinalResult(path: string, result: FinalResultEntry): void {
  try {
    const entry = {
      totalTokens: result.totalTokens,
      promptTokens: result.promptTokens,
      outputTokens: result.outputTokens,
      providerId: result.providerId,
      modelId: result.modelId,
      quota: result.quota ?? undefined,
    };
    const existing: unknown[] = existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) as unknown[] : [];
    if (existing.length > 0) {
      existing[existing.length - 1] = entry;
    } else {
      existing.push(entry);
    }
    writeFileSync(path, JSON.stringify(existing, null, 2), 'utf-8');
  } catch (err) {
    logError('eval', `Failed to write result JSON to ${path}`, err);
  }
}
