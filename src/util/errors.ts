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
    if (body && !details && body !== baseMessage) detailLines.push(`response body: ${body}`);
  } else {
    const details = apiErrorDetailsFromUnknown(error);
    if (details) detailLines.push(...formatApiErrorDetails(details, baseMessage));
  }

  return detailLines.length === 0
    ? baseMessage
    : `${baseMessage}\nDetails:\n${detailLines.map(line => `  ${line}`).join('\n')}`;
}

export function isProviderToolUseFailed(error: unknown): boolean {
  const details = error instanceof Error
    ? apiErrorDetailsFromError(error)
    : apiErrorDetailsFromUnknown(error);
  return details?.code === 'tool_use_failed';
}
