// One hard block on paid model calls, so freecode can be handed to an LLM (the
// `-p` mode, a `pty` session) without risking spend.
//
// This is a deliberate leaf module: no imports, because src/index.ts consults it
// before anything else loads — the Doppler secret injection at boot has to know
// whether to skip the paid keys, and by the time the module graph is up the keys
// would already be in process.env.
//
// Three layers, each independently sufficient for the case it covers:
//
//  1. src/index.ts never injects PAID_API_KEY_ENV_VARS from Doppler in this mode,
//     so the credentials are not in the process at all.
//  2. config/index.ts `resolveApiKey` reports no key for a `paid` provider, which
//     hides it from the picker and stops model discovery fetching it — this is the
//     layer that catches a key exported in the user's own shell.
//  3. providers/provider-registry.ts `resolveModel` refuses to build a model
//     handle for a paid provider, or for a non-free model id on a provider that
//     has both free and paid models (OpenRouter, Zen). Layer 2 makes the first
//     unreachable in practice; it is checked anyway because that is the function
//     every call path funnels through, and it produces a message that says why.
//
// Threat model: this stops an agent spending money by accident — picking a paid
// model, or being handed one as a default. It is not a sandbox against an agent
// that means to; anything able to edit source can unset an env var.

export const FREE_ONLY_ENV_VAR = "FREECODE_FREE_ONLY";

/**
 * Env vars holding credentials that can be billed. Kept as literals rather than
 * derived from PROVIDER_REGISTRY because src/index.ts reads this before the
 * catalog loads; a unit test pins it against every `paid: true` provider.
 *
 * OPENAI_ADMIN_KEY is not a provider key — providers/openai-daily-spend.ts uses it
 * for the read-only billing endpoint, so it cannot spend. It is filtered anyway so
 * that "no paid credentials in this process" is literally true.
 */
export const PAID_API_KEY_ENV_VARS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_ADMIN_KEY",
] as const;

const PAID_API_KEY_ENV_VAR_SET = new Set<string>(PAID_API_KEY_ENV_VARS);

export function isPaidApiKeyEnvVar(name: string): boolean {
  return PAID_API_KEY_ENV_VAR_SET.has(name);
}

export function isFreeOnlyMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[FREE_ONLY_ENV_VAR] === "1";
}

/**
 * Message for a refused model. Deliberately names the flag: the agent reading it
 * should understand it needs a different model, not that freecode is broken.
 */
export function freeOnlyRefusal(modelPreference: string, why: string): string {
  return `Blocked: "${modelPreference}" ${why} and ${FREE_ONLY_ENV_VAR}=1 allows free models only.`;
}
