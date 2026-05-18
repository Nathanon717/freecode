# src/providers/registry.ts - Provider Registry

**Role:** Hardcoded catalog of known cloud providers and their models. It is the source of provider IDs, display names, base URLs, API key env vars, tool support flags, model IDs, and static model limits.

## Exports

```typescript
PROVIDER_REGISTRY: ProviderConfig[]
getProvider(id: string): ProviderConfig | undefined
getAllProviders(): ProviderConfig[]
```

## Registered Providers

| ID | Name | Base URL | Env Var | Models | Tools |
|----|------|----------|---------|--------|-------|
| `groq` | Groq | `https://api.groq.com/openai/v1` | `GROQ_API_KEY` | 11 | yes |
| `openrouter` | OpenRouter | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` | 3 | yes |
| `siliconflow` | SiliconFlow | `https://api.siliconflow.cn/v1` | `SILICONFLOW_API_KEY` | 3 | yes |
| `nvidia` | NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | `NVIDIA_API_KEY` | 3 | yes |
| `llm7` | LLM7 | `https://api.llm7.io/v1` | `LLM7_API_KEY` | 3 | no |
| `github` | GitHub Models | `https://models.inference.githubusercontent.com/v1` | `GITHUB_TOKEN` | 4 | yes |
| `cohere` | Cohere | `https://api.cohere.ai/compatibility/v1` | `COHERE_API_KEY` | 2 | yes |
| `cerebras` | Cerebras | `https://api.cerebras.ai/v1` | `CEREBRAS_API_KEY` | 3 | yes |
| `mistral` | Mistral | `https://api.mistral.ai/v1` | `MISTRAL_API_KEY` | 3 | yes |

## Groq Models

Groq entries include static rate limit metadata used for display/supplementing quota information:

| Model ID | Display Name | RPM | RPD | TPM | TPD |
|----------|--------------|-----|-----|-----|-----|
| `allam-2-7b` | Allam 2 7B | 30 | 7000 | 6000 | 500000 |
| `groq/compound` | Groq Compound | 30 | 250 | 70000 | null |
| `groq/compound-mini` | Groq Compound Mini | 30 | 250 | 70000 | null |
| `llama-3.1-8b-instant` | Llama 3.1 8B Instant | 30 | 14400 | 6000 | 500000 |
| `llama-3.3-70b-versatile` | Llama 3.3 70B | 30 | 1000 | 12000 | 100000 |
| `meta-llama/llama-4-scout-17b-16e-instruct` | Llama 4 Scout | 30 | 1000 | 30000 | 500000 |
| `moonshotai/kimi-k2-instruct` | Kimi K2 | 60 | 1000 | 10000 | 300000 |
| `moonshotai/kimi-k2-instruct-0905` | Kimi K2 (0905) | 60 | 1000 | 10000 | 300000 |
| `openai/gpt-oss-120b` | GPT-OSS 120B | 30 | 1000 | 8000 | 200000 |
| `openai/gpt-oss-20b` | GPT-OSS 20B | 30 | 1000 | 8000 | 200000 |
| `qwen/qwen3-32b` | Qwen3 32B | 60 | 1000 | 6000 | 500000 |

## Special Cases

- LLM7 has `supportsTools: false`, so `agentLoop()` does not pass tools to that model.
- Ollama is not in `PROVIDER_REGISTRY`; it is detected dynamically in [ollama.md](ollama.md).
