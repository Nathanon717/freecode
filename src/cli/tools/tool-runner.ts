// Execution + `/tools` listing for hand-typed tool calls. Pulls in the tool
// registry (and transitively the `ai` SDK), so it is imported lazily from the
// command dispatcher rather than on the interactive boot path.

import chalk from 'chalk';
import type { z } from 'zod';
import {
  createTools,
  readFileTool,
  createFileTool,
  editTool,
  grepTool,
  shellTool,
  listDirTool,
  type ConfirmToolCall,
} from '../../agent/tools/index.js';
import { toErrorMessage } from '../../util/errors.js';
import { TOOL_NAMES, type ToolName } from './tool-invocation.js';

interface BaseTool {
  description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parameters: z.ZodObject<any>;
  execute?: (args: Record<string, unknown>, opts: unknown) => Promise<unknown>;
}

const BASE_TOOLS: Record<ToolName, BaseTool> = {
  read: readFileTool as unknown as BaseTool,
  grep: grepTool as unknown as BaseTool,
  list_dir: listDirTool as unknown as BaseTool,
  create: createFileTool as unknown as BaseTool,
  edit: editTool as unknown as BaseTool,
  shell_exec: shellTool as unknown as BaseTool,
};

// `read(path, [offset], [limit])` — optional params bracketed. Derived from the
// tool's zod schema so it can never drift from the real parameter set.
function signature(name: ToolName): string {
  const shape = BASE_TOOLS[name].parameters.shape as Record<string, z.ZodTypeAny>;
  const params = Object.entries(shape).map(([key, schema]) =>
    schema.isOptional() ? `[${key}]` : key,
  );
  return `${name}(${params.join(', ')})`;
}

export function printToolsList(): void {
  console.log(
    chalk.bold('Available tools') +
      chalk.dim('  — call directly, e.g. ') +
      chalk.cyan('read(path=src/index.ts)'),
  );
  console.log();
  for (const name of TOOL_NAMES) {
    console.log('  ' + chalk.cyan(signature(name)));
    const desc = BASE_TOOLS[name].description;
    if (desc) console.log(chalk.dim('    ' + desc));
  }
  console.log();
}

// Runs a hand-typed tool call through the same wrapped executor the agent uses:
// header, read-only precompute/preview, confirmation, and result rendering all
// go through the transcript renderer. Confirmation is reused as-is, so write
// tools still prompt (and read-only mode is enforced) exactly as for the agent.
export async function executeToolInvocation(
  name: ToolName,
  args: Record<string, unknown>,
  confirmToolCall: ConfirmToolCall,
): Promise<void> {
  const tools = createTools(confirmToolCall, false, false, false) as unknown as Record<
    string,
    BaseTool
  >;
  const tool = tools[name];
  if (!tool?.execute) {
    console.log(chalk.red(`Unknown tool: ${name}`));
    return;
  }

  const parsed = tool.parameters.safeParse(args);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(args)'}: ${issue.message}`)
      .join('; ');
    console.log(chalk.red(`Invalid arguments for ${name}(): ${detail}`));
    return;
  }

  // The wrapped executor turns a failing tool into an "Error: ..." result string
  // rather than rejecting, but the rendering it does *before* that try — the
  // render gate, the call header — is outside it. Nothing between here and
  // `runCliSession` catches, so an escaping throw would end the REPL over one
  // mistyped call; report it and stay at the prompt instead.
  try {
    await tool.execute(parsed.data, {
      toolCallId: 'manual',
      messages: [],
    });
  } catch (err) {
    console.log(chalk.red(`Error: ${toErrorMessage(err)}`));
  }
  console.log();
}
