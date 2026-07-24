import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import type { ToolCallPreview } from '../../../src/agent/tools/index.js';
import { readFileTool } from '../../../src/agent/tools/read.js';
import { grepTool } from '../../../src/agent/tools/grep.js';
import { listDirTool } from '../../../src/agent/tools/list-dir.js';
import { createFileTool } from '../../../src/agent/tools/create.js';
import { editTool } from '../../../src/agent/tools/edit.js';
import { shellTool } from '../../../src/agent/tools/shell.js';
import { printToolsList, executeToolInvocation } from '../../../src/cli/tools/tool-runner.js';
import { TOOL_NAMES, TOOL_PARAMS } from '../../../src/cli/tools/tool-invocation.js';

let logged: string[] = [];
const prevStream = process.env.FREECODE_TRANSCRIPT_STREAM;

beforeEach(() => {
  // Route the tool transcript (header/preview/result) to nowhere so only the
  // dispatcher-level messages this module emits reach the captured console.
  process.env.FREECODE_TRANSCRIPT_STREAM = 'null';
  logged = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logged.push(a.map(String).join(' '));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (prevStream === undefined) delete process.env.FREECODE_TRANSCRIPT_STREAM;
  else process.env.FREECODE_TRANSCRIPT_STREAM = prevStream;
});

// Drift guard: the autofill skeleton in tool-invocation.ts hardcodes each tool's
// param list and string-ness (it must stay off the `ai`-SDK boot path). If a
// tool's real zod schema changes, the skeleton would silently produce args that
// fail validation. This asserts TOOL_PARAMS still matches the real schemas.
describe('TOOL_PARAMS matches the real tool schemas', () => {
  const SCHEMAS: Record<(typeof TOOL_NAMES)[number], { shape: Record<string, z.ZodTypeAny> }> = {
    read: readFileTool.parameters,
    grep: grepTool.parameters,
    list_dir: listDirTool.parameters,
    create: createFileTool.parameters,
    edit: editTool.parameters,
    shell_exec: shellTool.parameters,
  };

  // Zod stores the kind in `_def.typeName`; wrappers (optional/nullable/default)
  // nest the real type under `_def.innerType`. Read both through a typed view.
  interface ZodDef {
    _def?: { typeName?: string; innerType?: z.ZodTypeAny };
  }
  const defOf = (schema: z.ZodTypeAny): ZodDef['_def'] => (schema as ZodDef)._def;

  // ZodEnum counts as a string param: its values are strings, so the skeleton must
  // autofill quotes for them exactly as it does for a free-form ZodString.
  function isStringParam(schema: z.ZodTypeAny): boolean {
    let s = schema;
    let def = defOf(s);
    while (
      def?.innerType &&
      ['ZodOptional', 'ZodNullable', 'ZodDefault'].includes(def.typeName ?? '')
    ) {
      s = def.innerType;
      def = defOf(s);
    }
    return def?.typeName === 'ZodString' || def?.typeName === 'ZodEnum';
  }

  for (const name of TOOL_NAMES) {
    it(name, () => {
      const expected = Object.entries(SCHEMAS[name].shape).map(([key, schema]) => ({
        name: key,
        quoted: isStringParam(schema),
      }));
      expect(TOOL_PARAMS[name]).toEqual(expected);
    });
  }
});

describe('printToolsList', () => {
  it('lists every tool with a schema-derived signature', () => {
    printToolsList();
    const out = logged.join('\n');
    expect(out).toContain('Available tools');
    expect(out).toContain('read(path, [offset], [limit])');
    expect(out).toContain('grep(pattern, [path], [include], [output_mode], [case_insensitive], [context_lines], [multiline], [head_limit])');
    expect(out).toContain('list_dir([path])');
    expect(out).toContain('shell_exec(command, [timeout_ms], [confirmDestructive])');
  });
});

describe('executeToolInvocation', () => {
  it('reports a schema validation error without invoking the tool', async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    await executeToolInvocation('read', {}, confirm);
    expect(logged.join('\n')).toContain('Invalid arguments for read()');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('runs a valid call through the wrapped executor and confirmation', async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    await executeToolInvocation('read', { path: 'package.json' }, confirm);
    expect(confirm).toHaveBeenCalledTimes(1);
    const preview = confirm.mock.calls[0][0] as ToolCallPreview;
    expect(preview.name).toBe('read');
    expect(preview.args).toMatchObject({ path: 'package.json' });
  });
});
