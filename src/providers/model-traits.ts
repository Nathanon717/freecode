import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getConfigDir } from '../config/index.js';
import { logError } from '../logger.js';

interface ModelTraitsFile {
  noNativeTools: string[];
}

const TRAITS_PATH = join(getConfigDir(), 'model-traits.json');

function load(): ModelTraitsFile {
  try {
    if (!existsSync(TRAITS_PATH)) return { noNativeTools: [] };
    return JSON.parse(readFileSync(TRAITS_PATH, 'utf-8')) as ModelTraitsFile;
  } catch (err) {
    logError('model-traits', 'Failed to load', err);
    return { noNativeTools: [] };
  }
}

function save(traits: ModelTraitsFile): void {
  try {
    mkdirSync(getConfigDir(), { recursive: true });
    writeFileSync(TRAITS_PATH, JSON.stringify(traits, null, 2), 'utf-8');
  } catch (err) {
    logError('model-traits', 'Failed to save', err);
  }
}

export function markModelNoNativeTools(providerId: string, modelId: string): void {
  const traits = load();
  const key = `${providerId}:${modelId}`;
  if (!traits.noNativeTools.includes(key)) {
    traits.noNativeTools.push(key);
    save(traits);
  }
}

export function isModelNoNativeTools(providerId: string, modelId: string): boolean {
  return load().noNativeTools.includes(`${providerId}:${modelId}`);
}

export function getNoNativeToolsModels(): Set<string> {
  return new Set(load().noNativeTools);
}
