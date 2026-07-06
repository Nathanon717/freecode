# src/tokenizers/backends/tiktoken.ts - Tiktoken-Backed Exact Encoders

**Role:** Wraps a `js-tiktoken` encoding as a `TokenizerEncoder`, and registers the GPT-OSS exact family into `count.ts`'s `encoderCache`. `createTiktokenEncoder` is the reusable wrapper — typed to accept any `Tiktoken`, whether from `getEncoding` (GPT-OSS) or constructed directly from parsed ranks. The Mistral Tekken backend ([tekken.md](tekken.md)) reuses it, building a `Tiktoken` from `tekken.json`'s vocab.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
createTiktokenEncoder(encoding: Tiktoken): TokenizerEncoder

getGptOssEncoder(): TokenizerEncoder
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `createTiktokenEncoder`: binds a `js-tiktoken` encoding to [chat-format.md](../chat-format.md)'s `countContextTokens`, always encoding with empty allowed/disallowed-special lists (matches the fallback's never-throw contract).
- `getGptOssEncoder`: memoized `TokenizerEncoder` built from js-tiktoken's bundled `o200k_base` ranks.

## Known inaccuracy — read before trusting GPT-OSS counts as "exact"

GPT-OSS's real tokenizer is `o200k_harmony`, not `o200k_base`. Verified against `openai/tiktoken`'s own source (`tiktoken_ext/openai_public.py`): `o200k_harmony` reuses `o200k_base`'s BPE ranks/pattern exactly and only *adds* special tokens for the harmony chat-format wrapper (`<|start|>role<|message|>content<|end|>`, `<|channel|>`, `<|call|>`, etc). Because messages here are encoded as plain text (`encode(text, [], [])`, required for the never-throw contract), those specials never activate — with an empty allowed-special set, js-tiktoken tokenizes any special-token-looking substring as ordinary text regardless of whether it's a registered special. Net effect, confirmed empirically (see the pinned test in `tests/tokenizers/backends/tiktoken.test.ts`):

- The BPE/vocab portion of the count **is** exact for GPT-OSS.
- The per-message overhead is [chat-format.md](../chat-format.md)'s generic flat constant, not GPT-OSS's real harmony wrapper token cost.
- **The total is currently numerically identical to the Phase 1 fallback** — GPT-OSS is classified as an "exact family" (for cache wiring and any future exact-vs-estimate UI marker) without yet being numerically more accurate than the fallback. Making it genuinely exact requires rendering the harmony template and encoding its wrapper tokens as real specials — out of scope for this phase; flagged to the user and deferred rather than silently scoped in.

## Used By

- [count.md](../count.md): `preloadTokenizerFor` registers `getGptOssEncoder()` into `encoderCache` for the GPT-OSS family.
- [tekken.md](tekken.md): `loadTekkenEncoder` feeds its `tekken.json`-derived `Tiktoken` through `createTiktokenEncoder`.

## Update Triggers

If a later phase renders the real harmony template (making GPT-OSS counts genuinely diverge from the fallback), update the "Known inaccuracy" section above and the corresponding pinned test.
