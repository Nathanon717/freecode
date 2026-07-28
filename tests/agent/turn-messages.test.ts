import type { CoreMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { dropUnpairedToolCalls, flattenToolMessagesToText } from '../../src/agent/turn-messages.js';

const assistantCall = (id: string, name = 'read'): CoreMessage => ({
  role: 'assistant',
  content: [{ type: 'tool-call', toolCallId: id, toolName: name, args: { path: 'a.ts' } }],
});

const toolResult = (id: string, name = 'read', result = 'file body'): CoreMessage => ({
  role: 'tool',
  content: [{ type: 'tool-result', toolCallId: id, toolName: name, result }],
});

describe('dropUnpairedToolCalls', () => {
  it('keeps a call that has its matching result', () => {
    const messages = [assistantCall('c1'), toolResult('c1')];
    expect(dropUnpairedToolCalls(messages)).toEqual(messages);
  });

  it('drops a call whose result never arrived', () => {
    // The failure this guards: persisted unpaired, it 400s every LATER request
    // too, so one bad turn would brick the whole session.
    expect(dropUnpairedToolCalls([assistantCall('c1')])).toEqual([]);
  });

  it('keeps the paired call and drops only the orphan from the same message', () => {
    const mixed: CoreMessage = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'checking' },
        { type: 'tool-call', toolCallId: 'ok', toolName: 'read', args: {} },
        { type: 'tool-call', toolCallId: 'orphan', toolName: 'grep', args: {} },
      ],
    };
    const out = dropUnpairedToolCalls([mixed, toolResult('ok')]);
    const parts = out[0].content as { type: string; toolCallId?: string }[];
    expect(parts.map((p) => p.toolCallId)).toEqual([undefined, 'ok']);
  });

  it('leaves plain string messages alone', () => {
    const messages: CoreMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    expect(dropUnpairedToolCalls(messages)).toEqual(messages);
  });

  it('keeps an assistant message that still has text after an orphan is dropped', () => {
    const withText: CoreMessage = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'here is the answer' },
        { type: 'tool-call', toolCallId: 'orphan', toolName: 'read', args: {} },
      ],
    };
    const out = dropUnpairedToolCalls([withText]);
    expect(out).toHaveLength(1);
    expect(out[0].content).toEqual([{ type: 'text', text: 'here is the answer' }]);
  });
});

describe('flattenToolMessagesToText', () => {
  it('returns text-protocol history untouched', () => {
    const messages: CoreMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    expect(flattenToolMessagesToText(messages)).toBe(messages);
  });

  it('rewrites a tool message into a user <tool_result> block', () => {
    const out = flattenToolMessagesToText([toolResult('c1', 'read', 'file body')]);
    expect(out).toEqual([
      { role: 'user', content: '<tool_result name="read">\nfile body\n</tool_result>' },
    ]);
  });

  it('rewrites an assistant tool call into text, keeping any preamble', () => {
    const out = flattenToolMessagesToText([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'let me look' },
          { type: 'tool-call', toolCallId: 'c1', toolName: 'read', args: { path: 'a.ts' } },
        ],
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe('assistant');
    expect(out[0].content).toContain('let me look');
    expect(out[0].content).toContain('<tool_call name="read">');
    expect(out[0].content).toContain('"path": "a.ts"');
  });

  it('leaves no role:tool message behind, so a request declaring no tools is valid', () => {
    // The 400 this prevents: parsed-tools/fake call streamText without `tools`,
    // reachable by switching models mid-session with /model.
    const out = flattenToolMessagesToText([
      { role: 'user', content: 'read it' },
      assistantCall('c1'),
      toolResult('c1'),
      { role: 'assistant', content: 'done' },
    ]);
    expect(out.some((m) => m.role === 'tool')).toBe(false);
    expect(out.every((m) => typeof m.content === 'string')).toBe(true);
  });

  it('drops an assistant message left empty rather than sending a contentless one', () => {
    const out = flattenToolMessagesToText([{ role: 'assistant', content: [] }]);
    expect(out).toEqual([]);
  });

  it('stringifies a non-string tool result', () => {
    const out = flattenToolMessagesToText([
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c1', toolName: 'grep', result: { hits: 2 } }] },
    ]);
    expect(out[0].content).toContain('"hits": 2');
  });
});
