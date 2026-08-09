/**
 * @role Shared type guard utilities used across multiple modules.
 *
 * @readwhen
 * You need to narrow `unknown` to a plain object (`Record<string, unknown>`).
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
