// Shape rules for the messages a turn contributes back to the session history.
//
// Two different tool protocols write into the same `Conversation`:
//
//   - the native path emits real `tool-call` parts on an assistant message plus a
//     `role: 'tool'` message carrying the matching `tool-result` parts;
//   - the parsed-tools and fake paths emit the text protocol — a plain assistant
//     message and a plain user message holding `<tool_result>` blocks.
//
// Text-protocol messages are accepted by every provider, so they need no
// translation. Native tool messages are the constrained direction, and this
// module owns both constraints that come with them.

import type { CoreMessage } from 'ai';
import { log } from '../logger.js';

interface ToolCallPartLike {
  type: string;
  toolCallId?: unknown;
  toolName?: unknown;
  args?: unknown;
  result?: unknown;
  text?: unknown;
}

function partsOf(content: unknown): ToolCallPartLike[] {
  return Array.isArray(content) ? (content as ToolCallPartLike[]) : [];
}

function partText(part: ToolCallPartLike): string {
  return typeof part.text === 'string' ? part.text : '';
}

/** Every `toolCallId` that already has a `tool-result` somewhere in `messages`. */
function pairedResultIds(messages: CoreMessage[]): Set<string> {
  const resultIds = new Set<string>();
  for (const message of messages) {
    if (message.role !== 'tool') continue;
    for (const part of partsOf(message.content)) {
      if (typeof part.toolCallId === 'string') resultIds.add(part.toolCallId);
    }
  }
  return resultIds;
}

/**
 * Give the tool call(s) a stopped turn left unanswered the results that were
 * already rendered for them, so the turn commits as balanced call/result pairs.
 *
 * Esc ends a turn by rejecting out of the tool's `execute` (see
 * `agent/tools/index.ts` `withTurnStop`), which is precisely what stops the AI
 * SDK taking another step — but a rejected execute also produces no
 * `tool-result` part, so the call it denied comes back unpaired. Without this,
 * `dropUnpairedToolCalls` would strip the call, the turn would sanitize to
 * nothing, and `Conversation.commitTurn` would drop the user's own message with
 * it — the very loss `docs/bug log/05-08-2026.md` fixed.
 *
 * Which calls need repairing is decided by `toolCallId`. `denials` is consumed
 * in order: the tools run serialized (`withSerializedExecution`), so the nth
 * unpaired call is the nth stop, and a count mismatch only costs precision of
 * wording, never the pairing itself.
 */
export function pairStoppedToolCalls(messages: CoreMessage[], denials: string[]): CoreMessage[] {
  const resultIds = pairedResultIds(messages);
  const unpaired: { toolCallId: string; toolName: string }[] = [];
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const part of partsOf(message.content)) {
      if (part.type !== 'tool-call' || typeof part.toolCallId !== 'string') continue;
      if (resultIds.has(part.toolCallId)) continue;
      unpaired.push({
        toolCallId: part.toolCallId,
        toolName: typeof part.toolName === 'string' ? part.toolName : 'tool',
      });
    }
  }
  if (unpaired.length === 0) return messages;

  const fallback = denials[denials.length - 1] ?? 'Tool call denied by user.';
  return [
    ...messages,
    {
      role: 'tool',
      content: unpaired.map((call, i) => ({
        type: 'tool-result' as const,
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        result: denials[i] ?? fallback,
      })),
    },
  ];
}

/**
 * Drop any assistant `tool-call` part with no matching `tool-result`, and any
 * assistant message left with nothing but whitespace afterwards.
 *
 * A provider that receives a tool call without its result answers 400 — and it
 * does so on every *later* request too, because the orphan is now a permanent
 * part of the history. That makes an unbalanced append the one failure mode
 * that can brick a session rather than just spoil a turn.
 *
 * This is a guard rail, not the mechanism: `runRecoveringStream` only collects
 * response messages from an attempt that drained, and those are already
 * balanced — except for a turn stopped by Esc, whose one unpaired call
 * `pairStoppedToolCalls` above balances before this ever runs. If this drops
 * something, the invariant upstream broke — hence the log line.
 */
export function dropUnpairedToolCalls(messages: CoreMessage[]): CoreMessage[] {
  const resultIds = pairedResultIds(messages);

  const out: CoreMessage[] = [];
  for (const message of messages) {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) {
      out.push(message);
      continue;
    }
    const parts = partsOf(message.content);
    const kept = parts.filter(
      (part) => part.type !== 'tool-call' || (typeof part.toolCallId === 'string' && resultIds.has(part.toolCallId)),
    );
    if (kept.length !== parts.length) {
      log('stream', 'Dropping tool call(s) with no matching result before persisting turn', {
        dropped: parts.length - kept.length,
      });
    }
    // An assistant message with no tool calls and no text carries nothing and is
    // rejected outright by some providers (see Conversation.commitTurn).
    const hasText = kept.some((part) => part.type === 'text' && partText(part).trim());
    const hasCall = kept.some((part) => part.type === 'tool-call');
    if (!hasText && !hasCall) continue;
    out.push({ ...message, content: kept } as CoreMessage);
  }
  return out;
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  return partsOf(content)
    .filter((part) => part.type === 'text')
    .map(partText)
    .join('');
}

/**
 * Rewrite native tool messages into the text protocol.
 *
 * The parsed-tools and fake loops call `streamText` *without* a `tools`
 * parameter, so a `role: 'tool'` message in the history is a request that
 * references tools the request never declared — OpenAI and several
 * OpenAI-compatible providers 400 on exactly that. It is reachable as soon as
 * native turns persist: switch from a native model to a parsed-tools one with
 * `/model` mid-session and the next turn resends the native history.
 *
 * Flattening to the same `<tool_result>` text those loops already produce keeps
 * the history readable to the model instead of discarding it.
 */
export function flattenToolMessagesToText(messages: CoreMessage[]): CoreMessage[] {
  if (!messages.some((m) => m.role === 'tool' || (m.role === 'assistant' && Array.isArray(m.content)))) {
    return messages;
  }

  const out: CoreMessage[] = [];
  for (const message of messages) {
    if (message.role === 'tool') {
      const blocks = partsOf(message.content).map((part) => {
        const name = typeof part.toolName === 'string' ? part.toolName : 'tool';
        const result = typeof part.result === 'string' ? part.result : JSON.stringify(part.result ?? null, null, 2);
        return `<tool_result name="${name}">\n${result}\n</tool_result>`;
      });
      if (blocks.length) out.push({ role: 'user', content: blocks.join('\n\n') });
      continue;
    }

    if (message.role === 'assistant' && Array.isArray(message.content)) {
      const parts = partsOf(message.content);
      const text = textOf(message.content);
      const calls = parts
        .filter((part) => part.type === 'tool-call')
        .map((part) => {
          const name = typeof part.toolName === 'string' ? part.toolName : 'tool';
          return `<tool_call name="${name}">\n${JSON.stringify(part.args ?? {}, null, 2)}\n</tool_call>`;
        });
      const merged = [text.trim(), ...calls].filter(Boolean).join('\n\n');
      // Consecutive user messages are fine, so a now-empty assistant turn is
      // dropped rather than sent as the contentless message Mistral rejects.
      if (merged) out.push({ role: 'assistant', content: merged });
      continue;
    }

    out.push(message);
  }
  return out;
}
