/**
 * @role The `ModelDataMap` shape, in its own file so `db.ts` and `db-load.ts` can share it without a cycle.
 *
 * @readwhen
 * you need the in-memory store's type and want to avoid importing `db.ts`.
 */

// check-tests: no-test — pure type declarations; erased at compile time, no runtime behavior to test
import type { ModelEntry } from '../providers/model-data.js';

/** The in-memory model store: every `"provider:modelId"` key to its entry. */
export type ModelDataMap = Record<string, ModelEntry>;
