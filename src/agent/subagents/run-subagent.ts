/**
 * @role Runs a named sub-agent turn loop that is deliberately *not* the main `agentLoop`. Returns only the sub-agent's final text as a string, so the caller spends one tool call of context instead of the whole search.
 *
 * @readwhen
 * changing how spawned sub-agents execute, which tools they get, or how the injected model handle reaches them.
 */

// Runs a named sub-agent turn loop that is deliberately NOT the main agentLoop.
//
// The main loop (agent/loop.ts) is fused to foreground rendering — transcript
// steps, the tool-render gate, stdout streaming. A sub-agent must avoid all of
// that: it runs "silently" and returns only its final text as a tool result, so
// the caller spends one tool call of context instead of the whole search.
//
// It reuses the RAW read-only tools — READ_ONLY_TOOL_DEFS straight from the
// registry, without createTools' wrappers — which sidesteps three couplings at
// once: no confirmation prompts (they only read), no render-gate participation
// (only the wrappers touch it), and no serialized-execution queue (so a sub-agent
// inside a wrapped tool cannot deadlock on the parent's queue).
//
// The model handle is injected by the caller (agent/loop.ts) via SubAgentContext,
// which is why a tool's execute — which never receives a LanguageModel — can still
// drive an LLM turn.

import type { CoreMessage, CoreTool, LanguageModel } from "ai";
import { streamText } from "ai";
import { READ_ONLY_TOOL_DEFS } from "../tools/index.js";
import { runFakeModel } from "../../providers/fake.js";
import { runRecoveringStream, type RecoverableStream } from "../stream-turn.js";
import { log } from "../../logger.js";
import { agentCatalog, getAgentPersona, type AgentPersona } from "./registry.js";

type RawTool = CoreTool & {
  execute?: (args: Record<string, unknown>, opts: unknown) => Promise<unknown>;
};

function rawReadOnlyTools(): Record<string, RawTool> {
  return READ_ONLY_TOOL_DEFS as Record<string, RawTool>;
}

/** Model context for a sub-agent, closed over by the caller where the model lives. */
export type SubAgentContext =
  | { kind: "native"; model: LanguageModel }
  | {
      kind: "fake";
      providerId: string;
      modelId: string;
      toolRationale: boolean;
      parallelTools: boolean;
    };

export async function runSubAgent(
  agentType: string,
  prompt: string,
  ctx: SubAgentContext,
): Promise<string> {
  const persona = getAgentPersona(agentType);
  if (!persona) {
    return `Error: unknown agent type "${agentType}". Available agents: ${agentCatalog()}.`;
  }
  const messages: CoreMessage[] = [{ role: "user", content: prompt }];
  log("stream", `spawn_agent: running "${agentType}" sub-agent`, { promptLength: prompt.length });
  try {
    const text =
      ctx.kind === "fake"
        ? await runFakeSubAgent(persona, messages, ctx)
        : await runNativeSubAgent(persona, messages, ctx.model);
    return text.length > 0 ? text : `(the ${agentType} agent returned no findings)`;
  } catch (err) {
    return `Error: the ${agentType} sub-agent failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// Real/native providers (and the fake-native provider): let the AI SDK drive the
// multi-step tool loop, then drain the stream silently and return the text.
async function runNativeSubAgent(
  persona: AgentPersona,
  messages: CoreMessage[],
  model: LanguageModel,
): Promise<string> {
  // Keep only the final report, not inter-step narration: reset the buffer at each
  // tool call so what survives is the text after the LAST tool call — the sub-agent's
  // actual findings, not "let me check X…" chatter that would dilute the caller's context.
  let text = "";

  // Rejected-tool-call recovery (error parts on fullStream, which are reported
  // rather than thrown) is shared with the foreground loop — see agent/stream-turn.ts.
  // Left unread, one would silently truncate the sub-turn and the caller would get a
  // partial (or empty) report presented as findings.
  await runRecoveringStream<RecoverableStream>({
    messages,
    start: async (attemptMessages) => {
      text = "";
      return await streamText({
        model,
        system: persona.systemPrompt,
        messages: attemptMessages,
        tools: rawReadOnlyTools(),
        maxSteps: persona.maxSteps,
      });
    },
    onPart: (part) => {
      if (part.type === "tool-call") {
        text = "";
      } else if (part.type === "text-delta" && typeof part.textDelta === "string") {
        text += part.textDelta;
      }
    },
    logPrefix: "spawn_agent: ",
  });

  return text.trim();
}

// Fake-direct provider (e2e tests): a manual ReAct loop that consumes from
// the SAME flat fixture queue as the parent (runFakeModel shares consumedSteps),
// so parent step N emits spawn_agent, the sub-agent consumes N+1…, parent resumes.
async function runFakeSubAgent(
  persona: AgentPersona,
  messages: CoreMessage[],
  ctx: Extract<SubAgentContext, { kind: "fake" }>,
): Promise<string> {
  const tools = rawReadOnlyTools();
  const toolNames = Object.keys(tools);
  let activeMessages = messages;
  // Only the final step's text is returned — see runNativeSubAgent: inter-step
  // narration is discarded so the caller receives the findings, not the chatter.
  let lastText = "";

  for (let step = 0; step < persona.maxSteps; step++) {
    const generated = await runFakeModel({
      providerId: ctx.providerId,
      modelId: ctx.modelId,
      systemPrompt: persona.systemPrompt,
      messages: activeMessages,
      toolNames,
      toolRationale: ctx.toolRationale,
      parallelTools: ctx.parallelTools,
      nativeToolsSupplied: true,
    });
    lastText = generated.text;
    if (generated.toolCalls.length === 0) return lastText.trim();

    const resultParts: string[] = [];
    for (const call of generated.toolCalls) {
      const tool = tools[call.name];
      let resultStr: string;
      if (!tool?.execute) {
        resultStr = `Unknown tool: "${call.name}". Available: ${toolNames.join(", ")}`;
      } else {
        const raw = await tool.execute(call.args, {
          toolCallId: `sub-${step}`,
          messages: activeMessages,
        });
        resultStr = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
      }
      resultParts.push(`<tool_result name="${call.name}">\n${resultStr}\n</tool_result>`);
    }

    activeMessages = [
      ...activeMessages,
      { role: "assistant", content: generated.text },
      { role: "user", content: resultParts.join("\n\n") },
    ];
  }
  return lastText.trim();
}
