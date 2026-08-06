# src/cli/theme.ts - Color Tokens

**Role:** Names the CLI's static colors by *role* (`warning`, `toolName`, `codeSurface`, …) so a color is retuned in one place instead of at each call site. Tokens are `ChalkInstance` values that drop in wherever a `chalk.hex(...)` literal used to sit.

**Read when:** adding or retuning a static color anywhere under `src/cli/`, or before hardcoding a hex/rgb value in a renderer.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
palette: { readonly warning: '#FFA500'; readonly codeSurface: '#333333'; readonly toolName: '#c9b3ff'; readonly mutedHint: '#808080'; }

theme: { readonly warning: ChalkInstance; readonly toolName: ChalkInstance; readonly mutedHint: ChalkInstance; readonly codeSurface: ChalkInstance; readonly codeSurfaceBg: ChalkInstance; readonly codeSurfaceText: ChalkInstance; readonly rotatingPastel: ChalkInstance; readonly rotatingPastelBg: ChalkInstance; }
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `theme` — the tokens call sites use. Every entry is a **getter**, not a stored value. Chalk resolves a hex down to the current `chalk.level` when the *builder* is constructed, so building the tokens once at module load would freeze them at whatever level was detected during import — truecolor `#333333` collapses to basic black at level 0. Resolving per access reproduces the inline `chalk.hex(...)` calls these tokens replaced. Do not "optimize" the getters into plain properties.
- `theme.codeSurface` vs `codeSurfaceBg` vs `codeSurfaceText` — one color, three uses: foreground tint (the language label above a block), background with the foreground untouched (padding runs), and background with a readable foreground (code text, codespans).
- `rotatingPastel` / `rotatingPastelBg` — the per-session accent, read live from `banner.ts` on each access. Deliberately **not** in `palette`, which holds one fixed value per role; the accent is a ring of eight.
- `palette` — the raw values. Prefer `theme`; reach for `palette` only when a call site needs the value itself rather than a styler.

## Scope

Covers both the static tokens and the session accent. **Ownership of the accent stays in `cli/render/banner.ts`** — the 8-color pastel ring, the rotation index, and its disk persistence all live there; `rotatingPastel` / `rotatingPastelBg` only read the current entry. Moving that state here would break the ~30 `getBannerColor()` call sites and the seven test files that mock `render/banner.js`, for no gain.

**This module must stay free of the `ai` SDK, transitively.** `cli/tools/tool-invocation.ts` consumes `toolName` and is documented as safe to load on the early interactive boot path (bottom-ui imports the highlighter). The `banner.ts` import is fine — bottom-ui already pulls it on that same path — but a config or model-registry import here would drag the SDK in.

There is no theme *switching* mechanism yet (no light/dark, no config selection). This module is the token layer that a switcher would sit on top of.

## Key neighbors

- `cli/render/markdown-renderer.ts` — `codeSurface`, `codeSurfaceBg`, `codeSurfaceText`
- `cli/eval/eval-dots.ts`, `cli/eval/eval-screen.ts` — `warning`
- `cli/tools/tool-invocation.ts` — `toolName`
- `cli/chrome/toggles.ts` — `mutedHint`, `rotatingPastel`, `rotatingPastelBg`
- `cli/menus/list-menu.ts`, `cli/menus/model-screen.ts` — `rotatingPastelBg` for the selected tab / row
- `cli/render/banner.ts` — owns the pastel ring and rotation state this module reads (one-way: banner does not import theme)

## Update triggers

Adding a token, retuning a palette value, or migrating more call sites off literal colors. `tests/cli/theme.test.ts` pins each token to the literal it replaced — a deliberate retune moves those expectations with it.
