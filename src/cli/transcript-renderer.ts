import chalk from 'chalk';
import { Writable } from 'stream';

export type TranscriptStreamName = 'stdout' | 'stderr' | 'null';

const nullStream = new Writable({ write(_, __, cb) { cb(); } });

export interface TranscriptRenderOptions {
  maxResultLines?: number;
}

export interface TranscriptRuntimeOptions extends TranscriptRenderOptions {
  stream: TranscriptStreamName;
}

export const DEFAULT_TRANSCRIPT_MAX_RESULT_LINES = 30;
export const TRANSCRIPT_DIVIDER_WIDTH = 60;

export function formatArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(', ');
}

export function formatToolCallLine(name: string, args: Record<string, unknown>): string {
  return chalk.cyan(`${name}(${formatArgs(args)})`);
}

export function formatPromptToolCallLine(name: string, args: Record<string, unknown>): string {
  return chalk.blueBright(`~ ${name}(${formatArgs(args)})`);
}

export function formatToolErrorLine(name: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return chalk.red(`${name}() failed: ${msg}`);
}

export function formatToolResultPreview(result: unknown, options: TranscriptRenderOptions = {}): string {
  const raw = typeof result === 'string' ? result : JSON.stringify(result, null, 2) ?? '';
  const trimmed = raw.trimEnd();
  if (!trimmed) return '';

  const maxLines = options.maxResultLines ?? DEFAULT_TRANSCRIPT_MAX_RESULT_LINES;
  const lines = trimmed.split('\n');
  const shown = maxLines === Infinity ? lines : lines.slice(0, maxLines);
  const indented = shown.map(l => chalk.dim('  ' + l)).join('\n');

  return maxLines !== Infinity && lines.length > maxLines
    ? indented + chalk.dim(`\n  ... (${lines.length - maxLines} more lines)`)
    : indented;
}

export function formatTranscriptStepDivider(): string {
  return chalk.dim('─'.repeat(TRANSCRIPT_DIVIDER_WIDTH));
}

function parseMaxResultLines(raw: string | undefined): number {
  if (!raw) return DEFAULT_TRANSCRIPT_MAX_RESULT_LINES;
  if (raw.toLowerCase() === 'all' || raw.toLowerCase() === 'infinity') return Infinity;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.floor(parsed)
    : DEFAULT_TRANSCRIPT_MAX_RESULT_LINES;
}

export function getTranscriptRuntimeOptions(env: NodeJS.ProcessEnv = process.env): TranscriptRuntimeOptions {
  const raw = env['FREECODE_TRANSCRIPT_STREAM'];
  const stream: TranscriptStreamName = raw === 'stdout' ? 'stdout' : raw === 'null' ? 'null' : 'stderr';
  return {
    stream,
    maxResultLines: parseMaxResultLines(env['FREECODE_TRANSCRIPT_MAX_RESULT_LINES']),
  };
}

export function getTranscriptStream(options: TranscriptRuntimeOptions = getTranscriptRuntimeOptions()): NodeJS.WritableStream {
  if (options.stream === 'null') return nullStream;
  return options.stream === 'stdout' ? process.stdout : process.stderr;
}

export function writeTranscriptStepDivider(options: TranscriptRuntimeOptions = getTranscriptRuntimeOptions()): void {
  getTranscriptStream(options).write(formatTranscriptStepDivider() + '\n');
}
