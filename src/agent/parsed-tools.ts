/**
 * @role Fallback agentic loop for models that reject native function calling. Augments the system prompt with a text-based `<tool_call>` protocol and drives a ReAct-style loop by injecting tool results as user messages.
 *
 * @readwhen
 * - Understanding the parsed-tools fallback path.
 * - Changing how tool calls are formatted or parsed in text-only mode.
 * - Debugging tool execution when the model doesn't support native function calling.
 */

import { streamText } from "ai";
import type { CoreMessage, LanguageModel } from "ai";
import chalk from "chalk";
import { createTools, type ConfirmToolCall } from "./tools/index.js";
import {
  beginTranscriptTurn,
  endTranscriptStep,
  notifyTranscriptChunk,
  writeTranscriptText,
} from "../cli/render/transcript-renderer.js";
import { renderMarkdown } from "../cli/render/markdown-renderer.js";
import { isTurnStoppedError } from "../util/errors.js";
import { log, logError } from "../logger.js";
import { flattenToolMessagesToText } from "./turn-messages.js";

const PARSED_TOOLS_ADDENDUM = `

## Prompt-Based Tool Protocol

This model does not support native function calling. Use text-based tool calls instead.

To call a tool, output exactly this block and then stop — do not write anything after the closing tag:

<tool_call>
{"name": "TOOL_NAME", "args": {ARGS_AS_JSON}}
</tool_call>

The result will be provided before you continue. You may then call another tool or write your final answer.

### Tool Reference

**list_dir** — List directory contents.
  args: { "path"?: string }

**read** — Read file contents.
  args: { "path": string, "offset"?: number, "limit"?: number }

**create** — Create a new file (fails if file already exists).
  args: { "path": string, "content": string }

**edit** — Replace text in an existing file (read it first).
  args: { "path": string, "old_text": string, "new_text": string }

**grep** — Regex-search file contents.
  args: { "pattern": string, "path"?: string, "include"?: string, "output_mode"?: "content" | "files_with_matches" | "count", "case_insensitive"?: boolean, "context_lines"?: number, "multiline"?: boolean, "head_limit"?: number }

**shell_exec** — Execute a shell command.
  args: { "command": string, "timeout_ms"?: number, "confirmDestructive"?: boolean }`;

export function buildParsedToolsSystemPrompt(base: string): string {
  return base + PARSED_TOOLS_ADDENDUM;
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
        typeof parsed === "object" &&
        parsed !== null &&
        "name" in parsed &&
        typeof (parsed as Record<string, unknown>).name === "string"
      ) {
        const p = parsed as Record<string, unknown>;
        calls.push({
          name: p.name as string,
          args: (typeof p.args === "object" && p.args !== null
            ? p.args
            : {}) as Record<string, unknown>,
          fullMatch: match[0],
          startIdx: match.index,
        });
      }
    } catch (err) {
      logError(
        "parsed-tools",
        `Malformed JSON in <tool_call> block (offset ${match.index})`,
        err,
      );
    }
  }
  return calls;
}

export interface ParsedToolsResult {
  text: string;
  totalTokens: number;
  promptTokens?: number;
  outputTokens?: number;
  /** What this turn added on top of `messages` — see agent/turn-messages.ts. */
  turnMessages: CoreMessage[];
  /** The user pressed Esc at an approval, so the turn ended without a further model call. */
  stopped: boolean;
}

export interface ExecutedToolCalls {
  /** `<tool_result>` blocks to feed back to the model, in call order. */
  parts: string[];
  /**
   * The user pressed Esc: the last block is that call's denial and no further
   * model call may be made this turn. The text loops end the turn here.
   */
  stopped: boolean;
}

/**
 * Execute a batch of text-protocol tool calls through the wrapped tools and
 * return the `<tool_result>` blocks to feed back to the model. Shared by the
 * parsed-tools loop and the fake-LLM loop in loop.ts.
 */
export async function executeToolCalls(
  tools: ReturnType<typeof createTools>,
  calls: ReadonlyArray<{ name: string; args: Record<string, unknown> }>,
  idPrefix: string,
  messages: CoreMessage[],
): Promise<ExecutedToolCalls> {
  const resultParts: string[] = [];
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    const toolFn = tools[call.name];
    let toolResultStr: string;
    let stopped = false;

    if (!toolFn?.execute) {
      toolResultStr = `Unknown tool: "${call.name}". Do not use namespace prefixes (e.g. "repo_browser."). Available tools: ${Object.keys(tools).join(", ")}`;
      writeTranscriptText(`[tool error] ${toolResultStr}\n`);
    } else {
      // Calls the wrapped execute — handles logging (prints call line + result
      // preview) and user confirmation automatically. It resolves an "Error"/
      // "denied" result string rather than throwing for every failure except
      // one: Esc rejects with TurnStoppedError to end the turn (the native path
      // needs a missing tool result to stop the SDK stepping — see
      // agent/tools/wrappers.ts). Here the denial text just becomes the last result.
      try {
        const rawResult = await (
          toolFn.execute as (args: unknown, opts: unknown) => Promise<unknown>
        )(call.args, { toolCallId: `${idPrefix}-${i}`, messages });
        toolResultStr =
          typeof rawResult === "string"
            ? rawResult
            : JSON.stringify(rawResult, null, 2);
      } catch (error) {
        if (!isTurnStoppedError(error)) throw error;
        toolResultStr = error.denialResult;
        stopped = true;
      }
    }

    resultParts.push(
      `<tool_result name="${call.name}">\n${toolResultStr}\n</tool_result>`,
    );
    if (stopped) return { parts: resultParts, stopped: true };
  }
  return { parts: resultParts, stopped: false };
}

export async function runParsedToolsLoop(
  messages: CoreMessage[],
  systemPrompt: string,
  model: LanguageModel,
  confirmToolCall?: ConfirmToolCall,
  toolRationale?: boolean,
  readOnly?: boolean,
  onStepUsage?: (promptTokens: number) => void,
): Promise<ParsedToolsResult> {
  const augSystem = buildParsedToolsSystemPrompt(systemPrompt);
  const tools = createTools(confirmToolCall, toolRationale, true, readOnly);
  // streamText below is called with no `tools`, so a native `role: 'tool'`
  // message left in the history by an earlier turn on a native model would be a
  // request referencing tools it never declared — a 400 on OpenAI and several
  // compat providers. Reachable via `/model` mid-session, so flatten it to the
  // same text protocol this loop speaks.
  const baseMessages = flattenToolMessagesToText(messages);
  let activeMessages: CoreMessage[] = [...baseMessages];

  beginTranscriptTurn(); // idempotent if already opened by the loop.ts fallback path
  writeTranscriptText(chalk.blueBright("~ using prompt-based tools\n")); // counts as content so lead-in adds blank line
  let accText = "";
  let totalTokens = 0;
  let promptTokens: number | undefined;
  let outputTokens: number | undefined;

  let stopped = false;

  // Unbounded, like the native path: the turn ends when the model stops
  // emitting tool calls, or on a provider error / context overflow / Esc.
  for (let step = 0; ; step++) {
    log(
      "parsed-tools",
      `Step ${step + 1}: calling model (${activeMessages.length} messages)`,
    );

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

    let stepText = "";
    for await (const chunk of result.textStream) {
      stepText += chunk;
    }

    const usage = await result.usage;
    totalTokens += usage?.totalTokens ?? 0;
    promptTokens = usage?.promptTokens;
    outputTokens = usage?.completionTokens ?? usage?.outputTokens;
    if (promptTokens !== undefined) onStepUsage?.(promptTokens);

    const calls = parseToolCalls(stepText);

    if (calls.length === 0) {
      // Final (or only) response — stream it to the user.
      if (stepText) {
        const rendered = renderMarkdown(stepText);
        writeTranscriptText(rendered.endsWith("\n") ? rendered : rendered + "\n");
      } else {
        // Nothing was written, but the step still counts as having produced text
        // for lead-in spacing — state machine only, so nothing is recorded.
        notifyTranscriptChunk("\n");
      }
      accText += stepText;
      // The final answer is the one turn message the loop never appends for
      // itself — every earlier step added its own pair before iterating.
      if (stepText.trim()) {
        activeMessages = [...activeMessages, { role: "assistant" as const, content: stepText }];
      }
      log("parsed-tools", `Step ${step + 1}: no tool calls, done`);
      endTranscriptStep(false);
      break;
    }

    // Print any text that appears before the first tool call.
    const textBefore = stepText.slice(0, calls[0].startIdx).trimEnd();
    if (textBefore) {
      writeTranscriptText(renderMarkdown(textBefore) + "\n");
    }

    log(
      "parsed-tools",
      `Step ${step + 1}: ${calls.length} tool call(s): ${calls.map((c) => c.name).join(", ")}`,
    );

    const executed = await executeToolCalls(
      tools,
      calls,
      `pt-${step}`,
      activeMessages,
    );

    // Esc: this step still commits (its text, its calls, and their results), but
    // the loop stops here rather than calling the model with the denial.
    endTranscriptStep(!executed.stopped); // close step, open next unless stopping
    // Append the assistant turn and all tool results for the next iteration.
    activeMessages = [
      ...activeMessages,
      { role: "assistant" as const, content: stepText },
      { role: "user" as const, content: executed.parts.join("\n\n") },
    ];
    accText += stepText;
    if (executed.stopped) {
      log("parsed-tools", `Step ${step + 1}: user stopped the turn`);
      stopped = true;
      break;
    }
  }

  return {
    text: accText.trimEnd(),
    totalTokens,
    promptTokens,
    outputTokens,
    turnMessages: activeMessages.slice(baseMessages.length),
    stopped,
  };
}
