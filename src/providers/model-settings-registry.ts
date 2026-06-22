import type { OverridableSettings } from './types.js';

type GetModelSettingsFn = (key: string) => OverridableSettings;

let _fn: GetModelSettingsFn | null = null;

export function registerModelSettings(fn: GetModelSettingsFn): void {
  _fn = fn;
}

export function getModelSettings(key: string): OverridableSettings {
  return _fn?.(key) ?? {};
}
