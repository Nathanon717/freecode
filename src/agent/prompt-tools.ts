import { streamText } from 'ai';
import type { CoreMessage, LanguageModel } from 'ai';
import chalk from 'chalk';
import { createTools, type ConfirmToolCall } from './tools/index.js';
import { beginTranscriptTurn, endTranscriptStep, notifyTranscriptChunk } from '../cli/transcript-renderer.js';
import { renderMarkdown } from '../cli/markdown-renderer.js';
import { log, logError } from '../logger.js';
import { isUserAbortError } from '../util/errors.js';

const PROMPT_TOOLS_ADDENDUM = `

## Prompt-Based Tool Protocol

This model does not support native function calling. Use text-based tool calls instead.

To call a tool, output exactly this block and then stop — do not write anything after the closing tag:

<tool_call>
{"name": "TOOL_NAME", "args": {ARGS_AS_JSON}}
</tool_call>

The result will be provided before you continue. You may then call another tool or write your final answer.

### Tool Reference

**read_file** — Read file contents.
  args: { "path": string, "offset"?: number, "limit"?: number }

**write_file** — Create a new file (fails if file already exists).
  args: { "path": string, "content": string }

**edit_file** — Replace text in an existing file (read it first).
  args: { "path": string, "old_text": string, "new_text": string }

**grep** — Regex-search file contents.
  args: { "pattern": string, "path"?: string, "include"?: string }

**shell_exec** — Execute a shell command.
  args: { "command": string, "timeout_ms"?: number, "confirmDestructive"?: boolean }

**list_dir** — List directory contents.
  args: { "path"?: string }`;

export function buildPromptToolsSystemPrompt(base: string): string {
  return base + PROMPT_TOOLS_ADDENDUM;
}

interface ParsedToolCall {
  name: string;
  args: Record<string, unknown>;
  fullMatch: string;
  startIdx: number;
}

export function parseToolCalls(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  const regex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    try {
      const inner = match[1].trim();
      const parsed = JSON.parse(inner) as unknown;
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'name' in parsed &&
        typeof (parsed as Record<string, unknown>).name === 'string'
      ) {
        const p = parsed as Record<string, unknown>;
        calls.push({
          name: p.name as string,
          args: (typeof p.args === 'object' && p.args !== null ? p.args : {}) as Record<string, unknown>,
          fullMatch: match[0],
          startIdx: match.index,
        });
      }
    } catch (err) {
      logError('prompt-tools', `Malformed JSON in <tool_call> block (offset ${match.index})`, err);
    }
  }
  return calls;
}

export interface PromptToolsResult {
  text: string;
  totalTokens: number;
  promptTokens?: number;
  outputTokens?: number;
}

export async function runPromptToolsLoop(
  messages: CoreMessage[],
  systemPrompt: string,
  model: LanguageModel,
  confirmToolCall?: ConfirmToolCall,
  toolRationale?: boolean,
  readOnly?: boolean,
): Promise<PromptToolsResult> {
  const augSystem = buildPromptToolsSystemPrompt(systemPrompt);
  const tools = createTools(confirmToolCall, toolRationale, true, readOnly);
  let activeMessages: CoreMessage[] = [...messages];

  beginTranscriptTurn(); // idempotent if already opened by the loop.ts fallback path
  process.stdout.write(chalk.blueBright('~ using prompt-based tools\n'));
  notifyTranscriptChunk('~ using prompt-based tools\n'); // counts as content so lead-in adds blank line
  let accText = '';
  let totalTokens = 0;
  let promptTokens: number | undefined;
  let outputTokens: number | undefined;

  for (let step = 0; step < 10; step++) {
    log('prompt-tools', `Step ${step + 1}: calling model (${activeMessages.length} messages)`);

    const raw: unknown = await streamText({
      model,
      system: augSystem,
      messages: activeMessages,
    });

    const result = raw as {
      textStream: AsyncIterable<string>;
      usage: Promise<{
        totalTokens: number;
        promptTokens?: number;
        completionTokens?: number;
        outputTokens?: number;
      }>;
    };

    let stepText = '';
    for await (const chunk of result.textStream) {
      stepText += chunk;
    }

    const usage = await result.usage;
    totalTokens += usage?.totalTokens ?? 0;
    promptTokens = usage?.promptTokens;
    outputTokens = usage?.completionTokens ?? usage?.outputTokens;

    const calls = parseToolCalls(stepText);

    if (calls.length === 0) {
      // Final (or only) response — stream it to the user.
      if (stepText) {
        const rendered = renderMarkdown(stepText);
        process.stdout.write(rendered.endsWith('\n') ? rendered : rendered + '\n');
      }
      notifyTranscriptChunk(stepText || '\n');
      accText += stepText;
      log('prompt-tools', `Step ${step + 1}: no tool calls, done`);
      endTranscriptStep(false);
      break;
    }

    // Print any text that appears before the first tool call.
    const textBefore = stepText.slice(0, calls[0].startIdx).trimEnd();
    if (textBefore) {
      process.stdout.write(renderMarkdown(textBefore) + '\n');
      notifyTranscriptChunk(textBefore + '\n');
    }

    log('prompt-tools', `Step ${step + 1}: ${calls.length} tool call(s): ${calls.map(c => c.name).join(', ')}`);

    const resultParts: string[] = [];

    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      const toolFn = tools[call.name as keyof typeof tools];
      let toolResultStr: string;

      if (!toolFn?.execute) {
        toolResultStr = `Unknown tool: "${call.name}". Do not use namespace prefixes (e.g. "repo_browser."). Available tools: ${Object.keys(tools).join(', ')}`;
        process.stdout.write(`[tool error] ${toolResultStr}\n`);
      } else {
        try {
          // Calls the wrapped execute — handles logging (prints call line + result
          // preview) and user confirmation automatically.
          const rawResult = await (toolFn.execute as (args: unknown, opts: unknown) => Promise<unknown>)(
            call.args,
            { toolCallId: `pt-${step}-${i}`, messages: activeMessages },
          );
          toolResultStr = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult, null, 2);
        } catch (err) {
          if (isUserAbortError(err)) throw err;
          toolResultStr = `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      resultParts.push(`<tool_result name="${call.name}">\n${toolResultStr}\n</tool_result>`);
    }

    endTranscriptStep(true); // close step, open next
    // Append the assistant turn and all tool results for the next iteration.
    activeMessages = [
      ...activeMessages,
      { role: 'assistant' as const, content: stepText },
      { role: 'user' as const, content: resultParts.join('\n\n') },
    ];
    accText += stepText;
  }

  endTranscriptStep(false); // close if loop exhausted without hitting the break
  return { text: accText.trimEnd(), totalTokens, promptTokens, outputTokens };
}
