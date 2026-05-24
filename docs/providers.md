# Providers

## Supported Providers

This table is generated from `src/providers/registry.ts`. Run `npm run docs:generate` after provider registry changes.

<!-- BEGIN GENERATED PROVIDERS -->
| Order | Provider | ID | Type | API key env var | Tools | Paid | Models |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Groq | `groq` | openai-compat | `GROQ_API_KEY` | Yes | No | `allam-2-7b`<br>`canopylabs/orpheus-arabic-saudi`<br>`canopylabs/orpheus-v1-english`<br>`groq/compound`<br>`groq/compound-mini`<br>`llama-3.1-8b-instant`<br>`llama-3.3-70b-versatile`<br>`meta-llama/llama-4-scout-17b-16e-instruct`<br>`meta-llama/llama-prompt-guard-2-22m`<br>`meta-llama/llama-prompt-guard-2-86m`<br>`openai/gpt-oss-120b`<br>`openai/gpt-oss-20b`<br>`openai/gpt-oss-safeguard-20b`<br>`qwen/qwen3-32b`<br>`whisper-large-v3`<br>`whisper-large-v3-turbo` |
| 2 | OpenRouter | `openrouter` | openai-compat | `OPENROUTER_API_KEY` | Yes | No | `arcee-ai/trinity-large-thinking:free`<br>`baidu/cobuddy:free`<br>`cognitivecomputations/dolphin-mistral-24b-venice-edition:free`<br>`deepseek/deepseek-v4-flash:free`<br>`google/gemma-4-26b-a4b-it:free`<br>`google/gemma-4-31b-it:free`<br>`liquid/lfm-2.5-1.2b-instruct:free`<br>`liquid/lfm-2.5-1.2b-thinking:free`<br>`meta-llama/llama-3.2-3b-instruct:free`<br>`meta-llama/llama-3.3-70b-instruct:free`<br>`minimax/minimax-m2.5:free`<br>`nousresearch/hermes-3-llama-3.1-405b:free`<br>`nvidia/nemotron-3-nano-30b-a3b:free`<br>`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`<br>`nvidia/nemotron-3-super-120b-a12b:free`<br>`nvidia/nemotron-nano-12b-v2-vl:free`<br>`nvidia/nemotron-nano-9b-v2:free`<br>`openai/gpt-oss-120b:free`<br>`openai/gpt-oss-20b:free`<br>`poolside/laguna-m.1:free`<br>`poolside/laguna-xs.2:free`<br>`qwen/qwen3-coder:free`<br>`qwen/qwen3-next-80b-a3b-instruct:free`<br>`z-ai/glm-4.5-air:free` |
| 3 | SiliconFlow | `siliconflow` | openai-compat | `SILICONFLOW_API_KEY` | Yes | No |  |
| 4 | NVIDIA NIM | `nvidia` | openai-compat | `NVIDIA_API_KEY` | Yes | No | `deepseek-ai/deepseek-v4-flash`<br>`meta/llama-3.3-70b-instruct`<br>`meta/llama-4-maverick-17b-128e-instruct`<br>`mistralai/mistral-large`<br>`nvidia/llama-3.1-nemotron-ultra-253b-v1`<br>`qwen/qwen3-next-80b-a3b-instruct` |
| 5 | LLM7 | `llm7` | openai-compat | `LLM7_API_KEY` | Yes | No | `codestral-latest`<br>`GLM-4.6V-Flash`<br>`gpt-oss-20b` |
| 6 | GitHub Models | `github` | openai-compat | `GITHUB_TOKEN` | Yes | No | `gpt-4o`<br>`gpt-4o-mini`<br>`Meta-Llama-3.1-405B-Instruct`<br>`Meta-Llama-3.1-8B-Instruct` |
| 7 | Cohere | `cohere` | openai-compat | `COHERE_API_KEY` | Yes | No | `command-a-03-2025`<br>`command-r-08-2024`<br>`command-r-plus-08-2024`<br>`command-r7b-12-2024` |
| 8 | Cerebras | `cerebras` | openai-compat | `CEREBRAS_API_KEY` | Yes | No | `gpt-oss-120b`<br>`llama3.1-8b`<br>`qwen-3-235b-a22b-instruct-2507`<br>`zai-glm-4.7` |
| 9 | Mistral | `mistral` | openai-compat | `MISTRAL_API_KEY` | Yes | No | `codestral-2508`<br>`devstral-2512`<br>`devstral-medium-2507`<br>`devstral-small-2507`<br>`magistral-medium-2509`<br>`magistral-small-2509`<br>`ministral-14b-2512`<br>`ministral-3b-2512`<br>`ministral-8b-2512`<br>`mistral-large-2411`<br>`mistral-large-2512`<br>`mistral-medium-2505`<br>`mistral-medium-2508`<br>`mistral-medium-c21211-r0-75`<br>`mistral-small-2506`<br>`mistral-small-2603`<br>`mistral-tiny-2407`<br>`mistral-vibe-cli-latest` |
| 10 | Cloudflare Workers AI | `cloudflare` | openai-compat | `CLOUDFLARE_API_KEY` | Yes | No | `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`<br>`@cf/meta/llama-3.1-8b-instruct`<br>`@cf/meta/llama-3.3-70b-instruct-fp8-fast`<br>`@cf/qwen/qwen2.5-coder-32b-instruct` |
| 11 | Z.ai (ZhipuAI) | `zai` | openai-compat | `ZAI_API_KEY` | Yes | No | `glm-4.5`<br>`glm-4.5-air`<br>`glm-4.5-flash`<br>`glm-4.6`<br>`glm-4.7`<br>`glm-4.7-flash`<br>`glm-5`<br>`glm-5-turbo`<br>`glm-5.1` |
| 12 | OpenAI | `openai` | openai-compat | `OPENAI_API_KEY` | Yes | Yes | `gpt-4`<br>`gpt-4-turbo`<br>`gpt-4.1`<br>`gpt-4.1-mini`<br>`gpt-4.1-nano`<br>`gpt-4o`<br>`gpt-4o-mini`<br>`gpt-5`<br>`gpt-5-chat-latest`<br>`gpt-5-codex`<br>`gpt-5-mini`<br>`gpt-5-nano`<br>`gpt-5-pro`<br>`gpt-5.1`<br>`gpt-5.1-chat-latest`<br>`gpt-5.1-codex`<br>`gpt-5.1-codex-max`<br>`gpt-5.1-codex-mini`<br>`gpt-5.2`<br>`gpt-5.2-chat-latest`<br>`gpt-5.2-codex`<br>`gpt-5.2-pro`<br>`gpt-5.3-chat-latest`<br>`gpt-5.3-codex`<br>`gpt-5.4`<br>`gpt-5.4-mini`<br>`gpt-5.4-nano`<br>`gpt-5.4-pro`<br>`gpt-5.5`<br>`gpt-5.5-pro`<br>`o1`<br>`o1-pro`<br>`o3`<br>`o3-mini`<br>`o4-mini` |
| 13 | Anthropic | `anthropic` | anthropic | `ANTHROPIC_API_KEY` | Yes | Yes | `claude-haiku-4-5-20251001`<br>`claude-opus-4-1-20250805`<br>`claude-opus-4-20250514`<br>`claude-opus-4-5-20251101`<br>`claude-opus-4-6`<br>`claude-opus-4-7`<br>`claude-sonnet-4-20250514`<br>`claude-sonnet-4-5-20250929`<br>`claude-sonnet-4-6` |
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

### Setting a key (persists permanently at Windows user level)

```powershell
[System.Environment]::SetEnvironmentVariable("GROQ_API_KEY", "your-key-here", "User")
```

Restart your terminal after setting, then verify:

```powershell
echo $env:GROQ_API_KEY
```

## Anthropic Cost Estimates

Anthropic turns capture streamed usage metadata and estimate turn/session cost from live pricing when available, with a bundled fallback table when the pricing page cannot be fetched. Estimates include input, output, cache write, and cache read token charges when those usage fields are present.
