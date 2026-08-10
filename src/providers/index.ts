/**
 * @role Barrel file for the providers subsystem.
 *
 * @readwhen
 * - Adding or removing a symbol re-exported from the providers barrel.
 */

// check-tests: no-test — pure barrel; only re-exports, no logic of its own
export * from './types.js';
export * from './provider-registry.js';
