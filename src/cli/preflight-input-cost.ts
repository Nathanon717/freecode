import type { CoreMessage } from 'ai';
import { buildSystemPrompt } from '../agent/system-prompt.js';
import { createTools } from '../agent/tools/index.js';
import { getProvider } from '../providers/registry.js';
import { estimateOpenAIInputCostVerified } from '../providers/openai-cost.js';
import { getOpenAIVerifiedRates } from '../providers/pricing-verifier.js';
import {
  buildOpenAIResponsesPayload,
  countOpenAIResponsesInputTokens,
  getOpenAIApiKey,
  hashOpenAIResponsesPayload,
} from '../providers/adapters/openai-responses.js';
import type { PreflightInputCost } from './terminal-ui.js';
import { toErrorMessage } from '../util/errors.js';

interface OpenAIPreflightControllerOptions {
  getMessages: () => CoreMessage[];
  getSelectedModel: () => string;
  setPreflightInputCost: (snapshot: PreflightInputCost) => void;
  redraw: () => void;
  debounceMs?: number;
  countInputTokens?: typeof countOpenAIResponsesInputTokens;
  getRates?: typeof getOpenAIVerifiedRates;
  hasApiKey?: (provider: NonNullable<ReturnType<typeof getProvider>>) => boolean;
}

const countCache = new Map<string, PreflightInputCost>();

function idle(providerId = '', modelId = ''): PreflightInputCost {
  return { state: 'idle', providerId, modelId, updatedAt: Date.now() };
}

function idleWarning(providerId: string, modelId: string, warning: string): PreflightInputCost {
  return { state: 'idle', providerId, modelId, updatedAt: Date.now(), warning };
}

function unavailable(providerId: string, modelId: string, warning: string): PreflightInputCost {
  return { state: 'unavailable', providerId, modelId, updatedAt: Date.now(), warning };
}

function parseOpenAIModel(modelPreference: string): { providerId: string; modelId: string } | null {
  const colonIdx = modelPreference.indexOf(':');
  if (colonIdx === -1) return null;
  const providerId = modelPreference.slice(0, colonIdx);
  const modelId = modelPreference.slice(colonIdx + 1);
  return providerId === 'openai' && modelId ? { providerId, modelId } : null;
}

export function resetOpenAIPreflightCache(): void {
  countCache.clear();
}

export function createOpenAIPreflightInputController(options: OpenAIPreflightControllerOptions) {
  const debounceMs = options.debounceMs ?? 500;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let abortController: AbortController | null = null;
  let sequence = 0;

  function apply(snapshot: PreflightInputCost): void {
    options.setPreflightInputCost(snapshot);
    options.redraw();
  }

  function clear(providerId = '', modelId = '', warning?: string): void {
    sequence++;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    abortController?.abort();
    abortController = null;
    apply(warning ? idleWarning(providerId, modelId, warning) : idle(providerId, modelId));
  }

  function schedule(input: string): void {
    const selected = parseOpenAIModel(options.getSelectedModel());
    const providerId = selected?.providerId ?? '';
    const modelId = selected?.modelId ?? '';
    const trimmed = input.trim();

    if (trimmed.length === 0 || trimmed.startsWith('/')) {
      clear(providerId, modelId);
      return;
    }

    if (!selected) {
      const selectedModel = options.getSelectedModel();
      clear(providerId, modelId, selectedModel ? `selected ${selectedModel}` : 'no model selected');
      return;
    }

    const provider = getProvider('openai');
    const hasApiKey = provider ? (options.hasApiKey ?? ((p) => Boolean(getOpenAIApiKey(p))))(provider) : false;
    if (!provider || !hasApiKey) {
      clear(providerId, modelId, 'OPENAI_API_KEY missing');
      return;
    }

    sequence++;
    const runSequence = sequence;
    if (timer) clearTimeout(timer);
    abortController?.abort();
    abortController = null;

    apply({ state: 'pending', providerId, modelId, updatedAt: Date.now() });
    timer = setTimeout(() => {
      timer = null;
      const messages: CoreMessage[] = [
        ...options.getMessages(),
        { role: 'user', content: input },
      ];
      const payload = buildOpenAIResponsesPayload({
        modelId,
        systemPrompt: buildSystemPrompt(),
        messages,
        tools: createTools(),
      });
      const payloadHash = hashOpenAIResponsesPayload(payload);
      const cached = countCache.get(payloadHash);
      if (cached) {
        if (runSequence === sequence) apply({ ...cached, updatedAt: Date.now() });
        return;
      }

      abortController = new AbortController();
      void (async () => {
        try {
          const count = await (options.countInputTokens ?? countOpenAIResponsesInputTokens)(provider, payload, abortController?.signal);
          const rates = await (options.getRates ?? getOpenAIVerifiedRates)(modelId);
          const estimate = estimateOpenAIInputCostVerified(count.inputTokens, rates);
          const snapshot: PreflightInputCost = {
            state: 'ready',
            providerId,
            modelId,
            inputTokens: count.inputTokens,
            inputUsd: estimate.inputUsd,
            formattedInputUsd: estimate.inputUsd === null ? undefined : estimate.formattedInputUsd,
            payloadHash: count.payloadHash,
            updatedAt: Date.now(),
            ...(estimate.warning ? { warning: estimate.warning } : {}),
          };
          countCache.set(payloadHash, snapshot);
          if (runSequence === sequence) apply(snapshot);
        } catch (error) {
          if (runSequence !== sequence) return;
          if (error instanceof Error && error.name === 'AbortError') return;
          apply(unavailable(providerId, modelId, toErrorMessage(error)));
        }
      })();
    }, debounceMs);
  }

  return {
    schedule,
    stop: () => clear(),
  };
}
