# Providers

## Supported Providers

| Provider | ID | Type | Status Notes |
|----------|-----|------|-------------|
| Groq | `groq` | openai-compat | Working |
| LLM7 | `llm7` | openai-compat | Working (no tool support) |
| Ollama | `ollama` | openai-compat | Working (local, no tool support) |
| OpenRouter | `openrouter` | openai-compat | Check status |
| SiliconFlow | `siliconflow` | openai-compat | Check status |
| NVIDIA NIM | `nvidia` | openai-compat | Configured (needs `NVIDIA_API_KEY`) |
| GitHub Models | `github` | openai-compat | Configured (needs `GITHUB_TOKEN`) |
| Cohere | `cohere` | openai-compat | Check status |
| Cerebras | `cerebras` | openai-compat | Check status |
| Mistral | `mistral` | openai-compat | Check status |

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
   - `id`, `name`, `type` (openai-compat)
   - `baseUrl`, `apiKeyEnvVar`
   - `models` array with `id`, `displayName`, optional `contextWindow` and `limits`
   - Set `supportsTools: false` if the provider doesn't support tool calls

2. If OpenAI-compatible, it just works with `createOpenAICompatProvider()`

3. Wire up the API key:
   - Add `<provider>: '<PROVIDER>_API_KEY'` to the `envVars` map in `src/config/index.ts`
   - Add the provider id to the `providerIds` array in `src/config/index.ts`
   - Set `apiKeyEnvVar: '<PROVIDER>_API_KEY'` on the registry entry

## API Key Configuration

API keys are read from environment variables (e.g., `GROQ_API_KEY`, `OPENROUTER_API_KEY`).

### Setting a key (persists permanently at Windows user level)

```powershell
[System.Environment]::SetEnvironmentVariable("GROQ_API_KEY", "your-key-here", "User")
```

Restart your terminal after setting, then verify:

```powershell
echo $env:GROQ_API_KEY
npm run test
```
