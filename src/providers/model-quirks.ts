/**
 * Static per-model capability quirks. One named predicate per quirk.
 * Import these wherever request bodies are patched (openai-compat.ts) rather
 * than inlining model-ID checks in the adapter.
 */

/** OpenAI reasoning models (o1, o3, gpt-5) reject any temperature value; strip it entirely. */
export function openAIModelDisallowsTemperature(modelId: string): boolean {
  return /^(o1|o3|gpt-5)([-.]|$)/i.test(modelId);
}

/** Mistral Codestral models silently ignore the system role; inject system content into the first user message instead. */
export function mistralCodestralRequiresSystemInjection(modelId: string): boolean {
  return /^codestral/i.test(modelId);
}

/**
 * Move the system message into the first user message for models that ignore
 * the system role. Removes the system entry and prepends its content to the
 * first user message's content string.
 */
export function injectSystemIntoFirstUserMessage(
  messages: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const msgs = [...messages];
  const sysIdx = msgs.findIndex(m => m['role'] === 'system');
  if (sysIdx === -1) return msgs;
  const sysContent = typeof msgs[sysIdx]['content'] === 'string' ? (msgs[sysIdx]['content'] as string) : '';
  msgs.splice(sysIdx, 1);
  if (!sysContent) return msgs;
  const firstUserIdx = msgs.findIndex(m => m['role'] === 'user');
  if (firstUserIdx !== -1) {
    const userContent = typeof msgs[firstUserIdx]['content'] === 'string' ? (msgs[firstUserIdx]['content'] as string) : '';
    msgs[firstUserIdx] = { ...msgs[firstUserIdx], content: `${sysContent}\n\n${userContent}` };
  }
  return msgs;
}
