# Providers

## Supported Providers

This table is generated from `src/providers/registry.ts`. Run `npm run docs:generate` after provider registry changes.

<!-- BEGIN GENERATED PROVIDERS -->
| Order | Provider | ID | Type | API key env var | Tools | Paid | Models |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Groq | `groq` | openai-compat | `GROQ_API_KEY` | Yes | No | `allam-2-7b`<br>`groq/compound`<br>`groq/compound-mini`<br>`llama-3.1-8b-instant`<br>`llama-3.3-70b-versatile`<br>`meta-llama/llama-4-scout-17b-16e-instruct`<br>`moonshotai/kimi-k2-instruct`<br>`moonshotai/kimi-k2-instruct-0905`<br>`openai/gpt-oss-120b`<br>`openai/gpt-oss-20b`<br>`qwen/qwen3-32b` |
| 2 | OpenRouter | `openrouter` | openai-compat | `OPENROUTER_API_KEY` | Yes | No | `deepseek/deepseek-r1`<br>`meta-llama/llama-3.3-70b-instruct`<br>`qwen/qwen-2.5-72b-instruct` |
| 3 | SiliconFlow | `siliconflow` | openai-compat | `SILICONFLOW_API_KEY` | Yes | No | `deepseek-ai/DeepSeek-R1`<br>`deepseek-ai/DeepSeek-V3`<br>`Qwen/Qwen2.5-72B-Instruct-128K` |
| 4 | NVIDIA NIM | `nvidia` | openai-compat | `NVIDIA_API_KEY` | Yes | No | `meta/llama-3.3-70b-instruct`<br>`mistralai/mistral-large-2`<br>`qwen/qwen3-235b-a22m` |
| 5 | LLM7 | `llm7` | openai-compat | `LLM7_API_KEY` | No | No | `deepseek-ai/DeepSeek-R1`<br>`Qwen/Qwen2.5-Coder-14B-Instruct`<br>`deepseek-ai/DeepSeek-V3` |
| 6 | GitHub Models | `github` | openai-compat | `GITHUB_TOKEN` | Yes | No | `gpt-4o`<br>`gpt-4o-mini`<br>`meta-llama/Llama-3.1-70B-Instruct`<br>`meta-llama/Llama-3.1-8B-Instruct` |
| 7 | Cohere | `cohere` | openai-compat | `COHERE_API_KEY` | Yes | No | `command-r-plus-08-2024`<br>`command-r-08-2024` |
| 8 | Cerebras | `cerebras` | openai-compat | `CEREBRAS_API_KEY` | Yes | No | `llama3.1-8b`<br>`qwen-3-235b-a22b-instruct-2507`<br>`zai-glm-4-7b` |
| 9 | Mistral | `mistral` | openai-compat | `MISTRAL_API_KEY` | Yes | No | `mistral-large-latest`<br>`mistral-small-latest`<br>`mistral-nemo-latest` |
| 10 | Anthropic | `anthropic` | anthropic | `ANTHROPIC_API_KEY` | Yes | Yes | `claude-haiku-4-5-20251001`<br>`claude-sonnet-4-6` |
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
