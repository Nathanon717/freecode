import type { ModelConfig } from './types.js';
import { createOllamaProvider } from './adapters/openai-compat.js';
import { log, logError } from '../logger.js';

interface OllamaModel {
  name: string;
  model?: string;
  size?: number;
  digest?: string;
}

interface OllamaTagsResponse {
  models: OllamaModel[];
}

function inferContextWindow(modelName: string): number {
  const lower = modelName.toLowerCase();
  
  if (lower.includes('70b') || lower.includes('72b') || lower.includes('405b') || lower.includes('235b')) {
    return 128000;
  }
  
  if (lower.includes('14b') || lower.includes('32n')) {
    return 32000;
  }
  
  return 8192;
}

export async function detectOllama(): Promise<ModelConfig[]> {
  log('ollama', 'Probing http://localhost:11434/api/tags (timeout: 3s)');
  try {
    const res = await fetch('http://localhost:11434/api/tags', {
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      log('ollama', `HTTP error from Ollama`, { status: res.status, statusText: res.statusText });
      return [];
    }

    const json = await res.json() as OllamaTagsResponse;
    const models = json.models.map(m => ({
      id: m.name,
      displayName: m.name,
      contextWindow: inferContextWindow(m.name),
    }));
    log('ollama', `Ollama available — ${models.length} model(s)`, models.map(m => m.id));
    return models;
  } catch (err) {
    logError('ollama', 'Ollama unreachable', err);
    return [];
  }
}

let ollamaModels: ModelConfig[] | null = null;

export async function getOllamaModels(): Promise<ModelConfig[]> {
  if (ollamaModels === null) {
    ollamaModels = await detectOllama();
  }
  return ollamaModels;
}

export function getOllamaProvider() {
  return createOllamaProvider();
}

export function isOllamaAvailable(): boolean {
  return ollamaModels !== null && ollamaModels.length > 0;
}
