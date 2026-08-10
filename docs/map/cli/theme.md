# src/cli/theme.ts - Color Tokens

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Names the CLI's static colors by *role* (`warning`, `toolName`, `codeSurface`, …) so a color is retuned in one place instead of at each call site. Tokens are `ChalkInstance` values that drop in wherever a `chalk.hex(...)` literal used to sit.

## Read When

adding or retuning a static color anywhere under `src/cli/`, or before hardcoding a hex/rgb value in a renderer.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Raw color values behind the tokens. Exported for the rare call site that
 * needs the value itself rather than a styler — prefer `theme` otherwise.
 */
palette: { readonly warning: '#FFA500'; readonly codeSurface: '#333333'; readonly toolName: '#c9b3ff'; readonly mutedHint: '#808080'; }

/**
 * The tokens call sites use. Every entry is a **getter**, not a stored value:
 * chalk resolves a hex down to whatever the current `chalk.level` supports when
 * the *builder* is constructed, not when it is called, so building these once at
 * module load would freeze every token at the level detected during import —
 * truecolor `#333333` collapses to basic black if the level is still 0 at that
 * moment. Resolving per access reproduces the inline `chalk.hex(...)` calls these
 * tokens replaced. Do not "optimize" the getters into plain properties.
 *
 * `codeSurface` / `codeSurfaceBg` / `codeSurfaceText` are one colour in three
 * uses: foreground tint, background with the foreground untouched, and background
 * with a readable foreground. `rotatingPastel` / `rotatingPastelBg` are the
 * per-session accent, read live from `banner.ts` on each access and deliberately
 * absent from `palette`, which holds one fixed value per role.
 */
theme: { readonly warning: ChalkInstance; readonly toolName: ChalkInstance; readonly mutedHint: ChalkInstance; readonly codeSurface: ChalkInstance; readonly codeSurfaceBg: ChalkInstance; readonly codeSurfaceText: ChalkInstance; readonly rotatingPastel: ChalkInstance; readonly rotatingPastelBg: ChalkInstance; }
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`cli/render/banner.ts`](render/banner.md) ×2
- **Imported by:** [`cli/eval/eval-screen.ts`](eval/eval-screen.md) ×4, [`cli/render/markdown-renderer.ts`](render/markdown-renderer.md) ×4, [`cli/chrome/toggles.ts`](chrome/toggles.md) ×3, [`cli/chrome/turn-state.ts`](chrome/turn-state.md) ×1, [`cli/eval/eval-dots.ts`](eval/eval-dots.md) ×1, [`cli/menus/list-menu.ts`](menus/list-menu.md) ×1, [`cli/menus/model-screen.ts`](menus/model-screen.md) ×1, [`cli/tools/tool-invocation.ts`](tools/tool-invocation.md) ×1

## Tests

`tests/cli/theme.test.ts`.

## Budget

67 / 500 lines (433 to spare).
<!-- END GENERATED MAP FACTS -->

## Scope

Covers both the static tokens and the session accent. **Ownership of the accent stays in `cli/render/banner.ts`** — the 8-color pastel ring, the rotation index, and its disk persistence all live there; `rotatingPastel` / `rotatingPastelBg` only read the current entry. Moving that state here would break the ~30 `getBannerColor()` call sites and the seven test files that mock `render/banner.js`, for no gain.

**This module must stay free of the `ai` SDK, transitively.** `cli/tools/tool-invocation.ts` consumes `toolName` and is documented as safe to load on the early interactive boot path (bottom-ui imports the highlighter). The `banner.ts` import is fine — bottom-ui already pulls it on that same path — but a config or model-registry import here would drag the SDK in.

There is no theme *switching* mechanism yet (no light/dark, no config selection). This module is the token layer that a switcher would sit on top of.

## Notes

`tests/cli/theme.test.ts` pins each token to the literal it replaced, so a deliberate
retune moves those expectations with it.
