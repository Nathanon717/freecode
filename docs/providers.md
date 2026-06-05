# Providers

## Supported Providers

This table is generated from `src/providers/registry.ts`. Run `npm run docs:generate` after provider registry changes.

<!-- BEGIN GENERATED PROVIDERS -->
| Order | Provider | ID | Type | API key env var | Tools | Paid | Models |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Groq | `groq` | openai-compat | `GROQ_API_KEY` | Yes | No | `allam-2-7b`<br>`groq/compound`<br>`llama-3.1-8b-instant`<br>`llama-3.3-70b-versatile`<br>`meta-llama/llama-4-scout-17b-16e-instruct`<br>`openai/gpt-oss-120b`<br>`openai/gpt-oss-20b`<br>`openai/gpt-oss-safeguard-20b`<br>`qwen/qwen3-32b` |
| 2 | OpenRouter | `openrouter` | openai-compat | `OPENROUTER_API_KEY` | Yes | No | `cognitivecomputations/dolphin-mistral-24b-venice-edition:free`<br>`google/gemma-4-26b-a4b-it:free`<br>`google/gemma-4-31b-it:free`<br>`liquid/lfm-2.5-1.2b-instruct:free`<br>`liquid/lfm-2.5-1.2b-thinking:free`<br>`meta-llama/llama-3.2-3b-instruct:free`<br>`meta-llama/llama-3.3-70b-instruct:free`<br>`moonshotai/kimi-k2.6:free`<br>`nousresearch/hermes-3-llama-3.1-405b:free`<br>`nvidia/nemotron-3-nano-30b-a3b:free`<br>`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`<br>`nvidia/nemotron-3-super-120b-a12b:free`<br>`nvidia/nemotron-3-ultra-550b-a55b:free`<br>`nvidia/nemotron-3.5-content-safety:free`<br>`nvidia/nemotron-nano-12b-v2-vl:free`<br>`nvidia/nemotron-nano-9b-v2:free`<br>`openai/gpt-oss-120b:free`<br>`openai/gpt-oss-20b:free`<br>`poolside/laguna-m.1:free`<br>`poolside/laguna-xs.2:free`<br>`qwen/qwen3-coder:free`<br>`qwen/qwen3-next-80b-a3b-instruct:free`<br>`z-ai/glm-4.5-air:free` |
| 3 | SiliconFlow | `siliconflow` | openai-compat | `SILICONFLOW_API_KEY` | Yes | No |  |
| 4 | NVIDIA NIM | `nvidia` | openai-compat | `NVIDIA_API_KEY` | Yes | No | `01-ai/yi-large`<br>`abacusai/dracarys-llama-3.1-70b-instruct`<br>`adept/fuyu-8b`<br>`ai21labs/jamba-1.5-large-instruct`<br>`aisingapore/sea-lion-7b-instruct`<br>`bigcode/starcoder2-15b`<br>`bytedance/seed-oss-36b-instruct`<br>`databricks/dbrx-instruct`<br>`deepseek-ai/deepseek-coder-6.7b-instruct`<br>`deepseek-ai/deepseek-v4-flash`<br>`deepseek-ai/deepseek-v4-pro`<br>`google/codegemma-1.1-7b`<br>`google/codegemma-7b`<br>`google/gemma-2-2b-it`<br>`google/gemma-2b`<br>`google/gemma-3-12b-it`<br>`google/gemma-3-4b-it`<br>`google/gemma-3n-e2b-it`<br>`google/gemma-3n-e4b-it`<br>`google/gemma-4-31b-it`<br>`google/recurrentgemma-2b`<br>`ibm/granite-3.0-3b-a800m-instruct`<br>`ibm/granite-3.0-8b-instruct`<br>`ibm/granite-34b-code-instruct`<br>`ibm/granite-8b-code-instruct`<br>`meta/codellama-70b`<br>`meta/llama-3.1-70b-instruct`<br>`meta/llama-3.1-8b-instruct`<br>`meta/llama-3.2-11b-vision-instruct`<br>`meta/llama-3.2-1b-instruct`<br>`meta/llama-3.2-3b-instruct`<br>`meta/llama-3.2-90b-vision-instruct`<br>`meta/llama-3.3-70b-instruct`<br>`meta/llama-4-maverick-17b-128e-instruct`<br>`meta/llama2-70b`<br>`microsoft/phi-3-vision-128k-instruct`<br>`microsoft/phi-3.5-moe-instruct`<br>`microsoft/phi-4-mini-instruct`<br>`microsoft/phi-4-multimodal-instruct`<br>`minimaxai/minimax-m2.7`<br>`mistralai/codestral-22b-instruct-v0.1`<br>`mistralai/ministral-14b-instruct-2512`<br>`mistralai/mistral-7b-instruct-v0.3`<br>`mistralai/mistral-large`<br>`mistralai/mistral-large-2-instruct`<br>`mistralai/mistral-large-3-675b-instruct-2512`<br>`mistralai/mistral-medium-3.5-128b`<br>`mistralai/mistral-nemotron`<br>`mistralai/mistral-small-4-119b-2603`<br>`mistralai/mixtral-8x22b-v0.1`<br>`mistralai/mixtral-8x7b-instruct-v0.1`<br>`moonshotai/kimi-k2.6`<br>`nv-mistralai/mistral-nemo-12b-instruct`<br>`nvidia/cosmos-reason2-8b`<br>`nvidia/llama-3.1-nemotron-51b-instruct`<br>`nvidia/llama-3.1-nemotron-70b-instruct`<br>`nvidia/llama-3.1-nemotron-nano-8b-v1`<br>`nvidia/llama-3.1-nemotron-nano-vl-8b-v1`<br>`nvidia/llama-3.1-nemotron-ultra-253b-v1`<br>`nvidia/llama-3.3-nemotron-super-49b-v1`<br>`nvidia/llama-3.3-nemotron-super-49b-v1.5`<br>`nvidia/llama3-chatqa-1.5-70b`<br>`nvidia/mistral-nemo-minitron-8b-8k-instruct`<br>`nvidia/nemotron-3-nano-30b-a3b`<br>`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`<br>`nvidia/nemotron-3-super-120b-a12b`<br>`nvidia/nemotron-3-ultra-550b-a55b`<br>`nvidia/nemotron-4-340b-instruct`<br>`nvidia/nemotron-mini-4b-instruct`<br>`nvidia/nemotron-nano-12b-v2-vl`<br>`nvidia/nemotron-nano-3-30b-a3b`<br>`nvidia/neva-22b`<br>`nvidia/nvidia-nemotron-nano-9b-v2`<br>`openai/gpt-oss-120b`<br>`openai/gpt-oss-20b`<br>`qwen/qwen3-coder-480b-a35b-instruct`<br>`qwen/qwen3-next-80b-a3b-instruct`<br>`qwen/qwen3.5-122b-a10b`<br>`qwen/qwen3.5-397b-a17b`<br>`sarvamai/sarvam-m`<br>`stepfun-ai/step-3.5-flash`<br>`stepfun-ai/step-3.7-flash`<br>`stockmark/stockmark-2-100b-instruct`<br>`upstage/solar-10.7b-instruct`<br>`writer/palmyra-creative-122b`<br>`writer/palmyra-fin-70b-32k`<br>`writer/palmyra-med-70b`<br>`writer/palmyra-med-70b-32k`<br>`z-ai/glm-5.1`<br>`zyphra/zamba2-7b-instruct` |
| 5 | LLM7 | `llm7` | openai-compat | `LLM7_API_KEY` | Yes | No | `codestral-latest`<br>`devstral-small-2:24b`<br>`mistral-small-3.2`<br>`qwen3-235b` |
| 6 | GitHub Models | `github` | openai-compat | `GITHUB_TOKEN` | Yes | No | `gpt-4o`<br>`gpt-4o-mini`<br>`Meta-Llama-3.1-405B-Instruct`<br>`Meta-Llama-3.1-8B-Instruct` |
| 7 | Cohere | `cohere` | openai-compat | `COHERE_API_KEY` | Yes | No | `c4ai-aya-expanse-32b`<br>`command-a-03-2025`<br>`command-a-plus-05-2026`<br>`command-a-reasoning-08-2025`<br>`command-r-08-2024`<br>`command-r-plus-08-2024`<br>`command-r7b-12-2024`<br>`command-r7b-arabic-02-2025`<br>`tiny-aya-earth`<br>`tiny-aya-fire`<br>`tiny-aya-global`<br>`tiny-aya-water` |
| 8 | Cerebras | `cerebras` | openai-compat | `CEREBRAS_API_KEY` | Yes | No | `gpt-oss-120b`<br>`zai-glm-4.7` |
| 9 | Mistral | `mistral` | openai-compat | `MISTRAL_API_KEY` | Yes | No | `codestral-2508`<br>`devstral-2512`<br>`magistral-medium-2509`<br>`magistral-small-2509`<br>`ministral-14b-2512`<br>`ministral-3b-2512`<br>`ministral-8b-2512`<br>`mistral-large-2512`<br>`mistral-medium-2505`<br>`mistral-medium-2508`<br>`mistral-medium-c21211-r0-75`<br>`mistral-small-2506`<br>`mistral-small-2603`<br>`mistral-tiny-2407` |
| 10 | Cloudflare Workers AI | `cloudflare` | openai-compat | `CLOUDFLARE_API_KEY` | Yes | No | `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`<br>`@cf/meta/llama-3.1-8b-instruct`<br>`@cf/meta/llama-3.3-70b-instruct-fp8-fast`<br>`@cf/qwen/qwen2.5-coder-32b-instruct` |
| 11 | Z.ai (ZhipuAI) | `zai` | openai-compat | `ZAI_API_KEY` | Yes | No | `glm-4.5-flash`<br>`glm-4.7-flash` |
| 12 | OpenCode Zen | `zen` | openai-compat | `OPENCODE_ZEN_API_KEY` | Yes | No | `big-pickle`<br>`deepseek-v4-flash-free`<br>`mimo-v2.5-free`<br>`nemotron-3-ultra-free` |
| 13 | OpenAI | `openai` | openai-compat | `OPENAI_API_KEY` | Yes | Yes | `gpt-4`<br>`gpt-4-turbo`<br>`gpt-4.1`<br>`gpt-4.1-mini`<br>`gpt-4.1-nano`<br>`gpt-4o`<br>`gpt-4o-mini`<br>`gpt-5`<br>`gpt-5-chat-latest`<br>`gpt-5-codex`<br>`gpt-5-mini`<br>`gpt-5-nano`<br>`gpt-5-pro`<br>`gpt-5.1`<br>`gpt-5.1-chat-latest`<br>`gpt-5.1-codex`<br>`gpt-5.1-codex-max`<br>`gpt-5.1-codex-mini`<br>`gpt-5.2`<br>`gpt-5.2-chat-latest`<br>`gpt-5.2-codex`<br>`gpt-5.2-pro`<br>`gpt-5.3-chat-latest`<br>`gpt-5.3-codex`<br>`gpt-5.4`<br>`gpt-5.4-mini`<br>`gpt-5.4-nano`<br>`gpt-5.4-pro`<br>`gpt-5.5`<br>`gpt-5.5-pro`<br>`o1`<br>`o1-pro`<br>`o3`<br>`o3-mini`<br>`o4-mini` |
| 14 | Anthropic | `anthropic` | anthropic | `ANTHROPIC_API_KEY` | Yes | Yes | `claude-haiku-4-5-20251001`<br>`claude-opus-4-1-20250805`<br>`claude-opus-4-20250514`<br>`claude-opus-4-5-20251101`<br>`claude-opus-4-6`<br>`claude-opus-4-7`<br>`claude-opus-4-8`<br>`claude-sonnet-4-20250514`<br>`claude-sonnet-4-5-20250929`<br>`claude-sonnet-4-6` |
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

### Setting a key — Windows (persists permanently at user level)

```powershell
[System.Environment]::SetEnvironmentVariable("GROQ_API_KEY", "your-key-here", "User")
```

Restart your terminal after setting, then verify:

```powershell
echo $env:GROQ_API_KEY
```

### Setting a key — Linux / Claude Code web container (persists via ~/.bashrc)

```bash
echo 'export GROQ_API_KEY=your-key-here' >> ~/.bashrc
source ~/.bashrc
```

## Anthropic Cost Estimates

Anthropic turns capture streamed usage metadata and estimate turn/session cost from live pricing when available, with a bundled fallback table when the pricing page cannot be fetched. Estimates include input, output, cache write, and cache read token charges when those usage fields are present.
