# Providers

## Supported Providers

This table is generated from `src/providers/registry.ts`. Run `npm run docs:generate` after provider registry changes.

<!-- BEGIN GENERATED PROVIDERS -->
| Order | Provider | ID | Type | API key env var | Tools | Paid | Models |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Groq | `groq` | openai-compat | `GROQ_API_KEY` | Yes | No | `allam-2-7b`<br>`groq/compound`<br>`groq/compound-mini`<br>`llama-3.1-8b-instant`<br>`llama-3.3-70b-versatile`<br>`meta-llama/llama-4-scout-17b-16e-instruct`<br>`openai/gpt-oss-120b`<br>`openai/gpt-oss-20b`<br>`qwen/qwen3-32b` |
| 2 | OpenRouter | `openrouter` | openai-compat | `OPENROUTER_API_KEY` | Yes | No | `meta-llama/llama-3.3-70b-instruct:free`<br>`deepseek/deepseek-v4-flash:free`<br>`google/gemma-3-27b-it:free` |
| 3 | SiliconFlow | `siliconflow` | openai-compat | `SILICONFLOW_API_KEY` | Yes | No | `Qwen/Qwen3-8B`<br>`deepseek-ai/DeepSeek-R1-Distill-Qwen-7B` |
| 4 | NVIDIA NIM | `nvidia` | openai-compat | `NVIDIA_API_KEY` | Yes | No | `meta/llama-3.3-70b-instruct`<br>`meta/llama-4-maverick-17b-128e-instruct`<br>`mistralai/mistral-large`<br>`deepseek-ai/deepseek-v4-flash`<br>`nvidia/llama-3.1-nemotron-ultra-253b-v1`<br>`qwen/qwen3-next-80b-a3b-instruct` |
| 5 | LLM7 | `llm7` | openai-compat | `LLM7_API_KEY` | Yes | No | `gpt-oss-20b`<br>`codestral-latest`<br>`GLM-4.6V-Flash` |
| 6 | GitHub Models | `github` | openai-compat | `GITHUB_TOKEN` | Yes | No | `gpt-4o`<br>`gpt-4o-mini`<br>`Meta-Llama-3.1-405B-Instruct`<br>`Meta-Llama-3.1-8B-Instruct` |
| 7 | Cohere | `cohere` | openai-compat | `COHERE_API_KEY` | Yes | No | `command-a-03-2025`<br>`command-r-plus-08-2024`<br>`command-r-08-2024`<br>`command-r7b-12-2024` |
| 8 | Cerebras | `cerebras` | openai-compat | `CEREBRAS_API_KEY` | Yes | No | `llama3.1-8b`<br>`qwen-3-235b-a22b-instruct-2507`<br>`zai-glm-4.7`<br>`gpt-oss-120b` |
| 9 | Mistral | `mistral` | openai-compat | `MISTRAL_API_KEY` | Yes | No | `mistral-large-latest`<br>`mistral-small-latest`<br>`open-mistral-nemo`<br>`ministral-3b-latest`<br>`ministral-8b-latest` |
| 10 | Cloudflare Workers AI | `cloudflare` | openai-compat | `CLOUDFLARE_API_KEY` | Yes | No | `@cf/meta/llama-3.3-70b-instruct-fp8-fast`<br>`@cf/meta/llama-3.1-8b-instruct`<br>`@cf/qwen/qwen2.5-coder-32b-instruct`<br>`@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` |
| 11 | Z.ai (ZhipuAI) | `zai` | openai-compat | `ZAI_API_KEY` | Yes | No | `glm-4.7-flash`<br>`glm-4.5-flash`<br>`glm-5.1`<br>`glm-5-turbo`<br>`glm-5`<br>`glm-4.7`<br>`glm-4.6`<br>`glm-4.5`<br>`glm-4.5-air` |
| 12 | OpenAI | `openai` | openai-compat | `OPENAI_API_KEY` | Yes | Yes | `gpt-4.1`<br>`gpt-4.1-mini`<br>`gpt-4.1-nano`<br>`gpt-4o`<br>`gpt-4o-mini`<br>`o3`<br>`o4-mini` |
| 13 | Anthropic | `anthropic` | anthropic | `ANTHROPIC_API_KEY` | Yes | Yes | `claude-haiku-4-5-20251001`<br>`claude-sonnet-4-6`<br>`claude-opus-4-7` |
<!-- END GENERATED PROVIDERS -->

## Testing Providers

### `npm run test-all`
- Sends minimal request to each provider's endpoint
- Checks if API key is valid, model exists, endpoint reachable

### `npm run test`
- Uses AI SDK's `streamText()` to get real model response
- Router selects first available provider
- Prints actual model output

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
npm run test
```

## Anthropic Cost Estimates

Anthropic turns capture streamed usage metadata and estimate turn/session cost from live pricing when available, with a bundled fallback table when the pricing page cannot be fetched. Estimates include input, output, cache write, and cache read token charges when those usage fields are present.
