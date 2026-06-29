# Providers

## Supported Providers

This table is generated from `src/providers/registry.ts`. Run `npm run docs:generate` after provider registry changes.

<!-- BEGIN GENERATED PROVIDERS -->
| Order | Provider | ID | Type | API key env var | Tools | Paid | Models |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Groq | `groq` | openai-compat | `GROQ_API_KEY` | Yes | No | `allam-2-7b`<br>`groq/compound`<br>`llama-3.1-8b-instant`<br>`llama-3.3-70b-versatile`<br>`meta-llama/llama-4-scout-17b-16e-instruct`<br>`openai/gpt-oss-120b`<br>`openai/gpt-oss-20b`<br>`openai/gpt-oss-safeguard-20b`<br>`qwen/qwen3-32b`<br>`qwen/qwen3.6-27b` |
| 2 | OpenRouter | `openrouter` | openai-compat | `OPENROUTER_API_KEY` | Yes | No | `cognitivecomputations/dolphin-mistral-24b-venice-edition:free`<br>`cohere/north-mini-code:free`<br>`google/gemma-4-26b-a4b-it:free`<br>`google/gemma-4-31b-it:free`<br>`liquid/lfm-2.5-1.2b-instruct:free`<br>`liquid/lfm-2.5-1.2b-thinking:free`<br>`meta-llama/llama-3.2-3b-instruct:free`<br>`meta-llama/llama-3.3-70b-instruct:free`<br>`nousresearch/hermes-3-llama-3.1-405b:free`<br>`nvidia/nemotron-3-nano-30b-a3b:free`<br>`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`<br>`nvidia/nemotron-3-super-120b-a12b:free`<br>`nvidia/nemotron-3-ultra-550b-a55b:free`<br>`nvidia/nemotron-3.5-content-safety:free`<br>`nvidia/nemotron-nano-12b-v2-vl:free`<br>`nvidia/nemotron-nano-9b-v2:free`<br>`openai/gpt-oss-120b:free`<br>`openai/gpt-oss-20b:free`<br>`poolside/laguna-m.1:free`<br>`poolside/laguna-xs.2:free`<br>`qwen/qwen3-coder:free`<br>`qwen/qwen3-next-80b-a3b-instruct:free` |
| 3 | SiliconFlow | `siliconflow` | openai-compat | `SILICONFLOW_API_KEY` | Yes | No |  |
| 4 | NVIDIA | `nvidia` | openai-compat | `NVIDIA_API_KEY` | Yes | No | `01-ai/yi-large`<br>`abacusai/dracarys-llama-3.1-70b-instruct`<br>`bytedance/seed-oss-36b-instruct`<br>`deepseek-ai/deepseek-v4-flash`<br>`deepseek-ai/deepseek-v4-pro`<br>`google/diffusiongemma-26b-a4b-it`<br>`google/gemma-2-2b-it`<br>`google/gemma-3n-e2b-it`<br>`google/gemma-3n-e4b-it`<br>`google/gemma-4-31b-it`<br>`meta/llama-3.1-70b-instruct`<br>`meta/llama-3.1-8b-instruct`<br>`meta/llama-3.2-11b-vision-instruct`<br>`meta/llama-3.2-1b-instruct`<br>`meta/llama-3.2-3b-instruct`<br>`meta/llama-3.2-90b-vision-instruct`<br>`meta/llama-3.3-70b-instruct`<br>`meta/llama-4-maverick-17b-128e-instruct`<br>`meta/llama-guard-4-12b`<br>`microsoft/phi-4-mini-instruct`<br>`microsoft/phi-4-multimodal-instruct`<br>`minimaxai/minimax-m2.7`<br>`minimaxai/minimax-m3`<br>`mistralai/ministral-14b-instruct-2512`<br>`mistralai/mistral-large-3-675b-instruct-2512`<br>`mistralai/mistral-medium-3.5-128b`<br>`mistralai/mistral-nemotron`<br>`mistralai/mistral-small-4-119b-2603`<br>`mistralai/mixtral-8x7b-instruct-v0.1`<br>`moonshotai/kimi-k2.6`<br>`nvidia/ising-calibration-1-35b-a3b`<br>`nvidia/llama-3.1-nemotron-nano-8b-v1`<br>`nvidia/llama-3.1-nemotron-nano-vl-8b-v1`<br>`nvidia/llama-3.3-nemotron-super-49b-v1`<br>`nvidia/llama-3.3-nemotron-super-49b-v1.5`<br>`nvidia/nemotron-3-nano-30b-a3b`<br>`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`<br>`nvidia/nemotron-3-super-120b-a12b`<br>`nvidia/nemotron-3-ultra-550b-a55b`<br>`nvidia/nemotron-4-340b-instruct`<br>`nvidia/nemotron-mini-4b-instruct`<br>`nvidia/nemotron-nano-12b-v2-vl`<br>`nvidia/nvidia-nemotron-nano-9b-v2`<br>`openai/gpt-oss-120b`<br>`openai/gpt-oss-20b`<br>`qwen/qwen3-next-80b-a3b-instruct`<br>`qwen/qwen3.5-122b-a10b`<br>`qwen/qwen3.5-397b-a17b`<br>`sarvamai/sarvam-m`<br>`stepfun-ai/step-3.5-flash`<br>`stepfun-ai/step-3.7-flash`<br>`stockmark/stockmark-2-100b-instruct`<br>`upstage/solar-10.7b-instruct`<br>`writer/palmyra-fin-70b-32k`<br>`writer/palmyra-med-70b`<br>`writer/palmyra-med-70b-32k`<br>`z-ai/glm-5.1` |
| 5 | LLM7 | `llm7` | openai-compat | `LLM7_API_KEY` | Yes | No | `codestral-latest`<br>`devstral-small-2:24b`<br>`ministral-3:8b` |
| 6 | GitHub | `github` | openai-compat | `GITHUB_TOKEN` | Yes | No | `gpt-4o`<br>`gpt-4o-mini`<br>`Meta-Llama-3.1-405B-Instruct`<br>`Meta-Llama-3.1-8B-Instruct` |
| 7 | Cohere | `cohere` | openai-compat | `COHERE_API_KEY` | Yes | No | `c4ai-aya-expanse-32b`<br>`command-a-03-2025`<br>`command-a-plus-05-2026`<br>`command-a-reasoning-08-2025`<br>`command-r-08-2024`<br>`command-r-plus-08-2024`<br>`command-r7b-12-2024`<br>`command-r7b-arabic-02-2025`<br>`north-mini-code-1-0`<br>`tiny-aya-earth`<br>`tiny-aya-fire`<br>`tiny-aya-global`<br>`tiny-aya-water` |
| 8 | Cerebras | `cerebras` | openai-compat | `CEREBRAS_API_KEY` | Yes | No | `gpt-oss-120b`<br>`zai-glm-4.7` |
| 9 | Mistral | `mistral` | openai-compat | `MISTRAL_API_KEY` | Yes | No | `codestral-2508`<br>`devstral-2512`<br>`magistral-medium-2509`<br>`magistral-small-2509`<br>`ministral-14b-2512`<br>`ministral-3b-2512`<br>`ministral-8b-2512`<br>`mistral-large-2512`<br>`mistral-medium-2505`<br>`mistral-medium-2508`<br>`mistral-medium-2604`<br>`mistral-small-2506`<br>`mistral-small-2603`<br>`mistral-tiny-2407` |
| 10 | Cloudflare | `cloudflare` | openai-compat | `CLOUDFLARE_API_KEY` | Yes | No | `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`<br>`@cf/meta/llama-3.1-8b-instruct`<br>`@cf/meta/llama-3.3-70b-instruct-fp8-fast`<br>`@cf/qwen/qwen2.5-coder-32b-instruct` |
| 11 | Z.ai | `zai` | openai-compat | `ZAI_API_KEY` | Yes | No | `glm-4.5-flash`<br>`glm-4.7-flash` |
| 12 | Hugging Face | `huggingface` | openai-compat | `HF_TOKEN` | Yes | No | `aisingapore/Qwen-SEA-LION-v4-32B-IT:publicai`<br>`allenai/Olmo-3-7B-Instruct:publicai`<br>`swiss-ai/Apertus-70B-Instruct-2509:publicai`<br>`swiss-ai/Apertus-8B-Instruct-2509:publicai`<br>`utter-project/EuroLLM-22B-Instruct-2512:publicai` |
| 13 | OpenCode | `zen` | openai-compat | `OPENCODE_ZEN_API_KEY` | Yes | No | `big-pickle`<br>`deepseek-v4-flash-free`<br>`mimo-v2.5-free`<br>`nemotron-3-ultra-free`<br>`north-mini-code-free` |
| 14 | OpenAI | `openai` | openai-compat | `OPENAI_API_KEY` | Yes | Yes | `gpt-4`<br>`gpt-4-turbo`<br>`gpt-4.1`<br>`gpt-4.1-mini`<br>`gpt-4.1-nano`<br>`gpt-4o`<br>`gpt-4o-mini`<br>`gpt-5`<br>`gpt-5-chat-latest`<br>`gpt-5-codex`<br>`gpt-5-mini`<br>`gpt-5-nano`<br>`gpt-5-pro`<br>`gpt-5.1`<br>`gpt-5.1-chat-latest`<br>`gpt-5.1-codex`<br>`gpt-5.1-codex-max`<br>`gpt-5.1-codex-mini`<br>`gpt-5.2`<br>`gpt-5.2-chat-latest`<br>`gpt-5.2-codex`<br>`gpt-5.2-pro`<br>`gpt-5.3-chat-latest`<br>`gpt-5.3-codex`<br>`gpt-5.4`<br>`gpt-5.4-mini`<br>`gpt-5.4-nano`<br>`gpt-5.4-pro`<br>`gpt-5.5`<br>`gpt-5.5-pro`<br>`o1`<br>`o1-pro`<br>`o3`<br>`o3-mini`<br>`o4-mini` |
| 15 | Anthropic | `anthropic` | anthropic | `ANTHROPIC_API_KEY` | Yes | Yes | `claude-fable-5`<br>`claude-haiku-4-5-20251001`<br>`claude-opus-4-1-20250805`<br>`claude-opus-4-5-20251101`<br>`claude-opus-4-6`<br>`claude-opus-4-7`<br>`claude-opus-4-8`<br>`claude-sonnet-4-5-20250929`<br>`claude-sonnet-4-6` |
<!-- END GENERATED PROVIDERS -->

## Testing Providers

Use `/keys` inside the freecode REPL to check which provider API keys are configured.

## Adding a New Provider

1. Add provider config to `src/providers/registry.ts` with:
   - `id`, `name`, `type` (`openai-compat` or `anthropic`)
   - `baseUrl` for OpenAI-compatible providers, `apiKeyEnvVar` for all providers
   - `models` array with `id`, `displayName`, optional `contextWindow` and `limits`
   - Set `supportsTools: false` if the provider doesn't support tool calls
   - Set `paid: true` for providers where cost reporting or paid-provider labeling matters

2. If OpenAI-compatible, it just works with `createOpenAICompatProvider()`
   - If it uses a native SDK, add or update an adapter under `src/providers/adapters/` and route it from `src/providers/router.ts`

3. Wire up the API key:
   - Add `<provider>: '<PROVIDER>_API_KEY'` to the `envVars` map in `src/config/index.ts`
   - Add the provider id to the `providerIds` array in `src/config/index.ts`
   - Set `apiKeyEnvVar: '<PROVIDER>_API_KEY'` on the registry entry

## API Key Configuration

API keys are read from environment variables (e.g., `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`) or the Freecode config file.

**Setting up a new device?** See [device-setup.md](device-setup.md) — all keys are synced via Doppler and require only a one-time `doppler login` + `doppler setup`.

## Anthropic Cost Estimates

Anthropic turns capture streamed usage metadata and estimate turn/session cost from live pricing when available, with a bundled fallback table when the pricing page cannot be fetched. Estimates include input, output, cache write, and cache read token charges when those usage fields are present.
