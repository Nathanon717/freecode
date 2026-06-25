export interface ApiError {
  message: string;
  code?: string;
  type?: string;
  param?: string;
  failedGeneration?: string;
  diagnosis?: string;
}

function parseJsonAt(text: string, start: number): { json: Record<string, unknown>; end: number } | null {
  if (text[start] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) { escaped = false; }
      else if (ch === '\\') { escaped = true; }
      else if (ch === '"') { inString = false; }
      continue;
    }
    if (ch === '"') { inString = true; }
    else if (ch === '{') { depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(text.slice(start, i + 1)) as unknown;
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? { json: parsed as Record<string, unknown>, end: i + 1 }
            : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function extractApiErrors(stdout: string): ApiError[] {
  const plain = stdout.replace(/\x1b\[[0-9;]*m/g, '');
  const errors: ApiError[] = [];
  const pattern = /Error:\s*(\{)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(plain)) !== null) {
    const parsed = parseJsonAt(plain, match.index + match[0].lastIndexOf('{'));
    if (!parsed) continue;
    const source = parsed.json['error'] && typeof parsed.json['error'] === 'object' && !Array.isArray(parsed.json['error'])
      ? parsed.json['error'] as Record<string, unknown>
      : parsed.json;
    const message = stringField(source, 'message');
    if (message) {
      const code = stringField(source, 'code');
      const failedGeneration = stringField(source, 'failed_generation') ?? stringField(parsed.json, 'failed_generation');
      errors.push({
        message,
        code,
        type: stringField(source, 'type'),
        param: stringField(source, 'param'),
        failedGeneration,
        diagnosis: code === 'tool_use_failed' && !failedGeneration && message.includes('failed_generation')
          ? 'provider rejected an invalid model tool/function call before Freecode could run a tool, and did not include the referenced failed_generation payload'
          : undefined,
      });
    }
    pattern.lastIndex = parsed.end;
  }
  return errors;
}
