/**
 * @role Thin shared module holding the `getModelSettings` function pointer. Exists to break the circular-import risk between `model-data.ts` (which depends on `db.ts`) and `config/index.ts` (which calls `getModelSettings` inside `resolveModelSettings`). Neither file imports the other; `model-data.ts` registers into this module and `config/index.ts` reads from it.
 *
 * @readwhen
 * - Tracing the circular-import avoidance pattern between `model-data.ts` and `config/index.ts`.
 * - Debugging per-model settings not applying in `resolveModelSettings`.
 */

import type { OverridableSettings } from './types.js';

type GetModelSettingsFn = (key: string) => OverridableSettings;

let _fn: GetModelSettingsFn | null = null;

export function registerModelSettings(fn: GetModelSettingsFn): void {
  _fn = fn;
}

export function getModelSettings(key: string): OverridableSettings {
  return _fn?.(key) ?? {};
}
