// check-tests: no-test — pure type declarations; erased at compile time, no runtime behavior to test
import type { ModelEntry } from '../providers/model-data.js';

/** The in-memory model store: every `"provider:modelId"` key to its entry. */
export type ModelDataMap = Record<string, ModelEntry>;
