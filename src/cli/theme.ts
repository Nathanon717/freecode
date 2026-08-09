/**
 * @role Names the CLI's static colors by *role* (`warning`, `toolName`, `codeSurface`, …) so a color is retuned in one place instead of at each call site. Tokens are `ChalkInstance` values that drop in wherever a `chalk.hex(...)` literal used to sit.
 *
 * @readwhen
 * adding or retuning a static color anywhere under `src/cli/`, or before hardcoding a hex/rgb value in a renderer.
 */

// Named color tokens for the CLI's static palette.
//
// Call sites should name a *role* ("this is a warning") rather than a color
// ("this is orange"), so a color can be retuned in one place. Tokens are
// `ChalkInstance` values, so they substitute directly for the `chalk.hex(...)`
// expressions they replace and produce byte-identical escape sequences.
//
// Deliberately excluded: the banner's rotating pastel, which is a per-session
// *dynamic* color with its own disk-persisted state. See `render/banner.ts`.

import chalk from 'chalk';
import { getBannerColorRGB } from './render/banner.js';

/**
 * Raw color values behind the tokens. Exported for the rare call site that
 * needs the value itself rather than a styler — prefer `theme` otherwise.
 */
export const palette = {
  /** Caution/attention, short of an outright failure. */
  warning: '#FFA500',
  /** Flat grey surface behind rendered code. */
  codeSurface: '#333333',
  /** Pastel lavender that marks a recognized tool name. */
  toolName: '#c9b3ff',
  /** Secondary text sitting next to a live control. */
  mutedHint: '#808080',
} as const;

// Getters, not stored values: chalk resolves a hex down to whatever the current
// `chalk.level` supports when the *builder* is constructed, not when it is
// called. Building these once at module load would freeze every token at the
// level detected during import — truecolor `#333333` collapses to basic black
// if the level is still 0 at that moment. Resolving per access reproduces the
// inline `chalk.hex(...)` calls these tokens replaced.
export const theme = {
  /** Warning text and the degraded eval status dot. */
  get warning() { return chalk.hex(palette.warning); },
  /** Tool name tint in the input line. */
  get toolName() { return chalk.hex(palette.toolName); },
  /** Muted hint text trailing an interactive control. */
  get mutedHint() { return chalk.hex(palette.mutedHint); },
  /** Code surface used as a *foreground* tint (the language label above a block). */
  get codeSurface() { return chalk.hex(palette.codeSurface); },
  /** Code surface as a background with the foreground left alone (padding runs). */
  get codeSurfaceBg() { return chalk.bgHex(palette.codeSurface); },
  /** Code surface as a background with readable foreground (code text, codespans). */
  get codeSurfaceText() { return chalk.bgHex(palette.codeSurface).white; },

  /**
   * The session's accent. Unlike the tokens above this is *dynamic*: `banner.ts`
   * owns an 8-color pastel ring plus the disk-persisted index that advances once
   * per session, and these read whichever entry is current. Not in `palette`,
   * which holds one fixed value per role.
   */
  get rotatingPastel() { return chalk.rgb(...getBannerColorRGB()); },
  /** The accent as a background with black text — a selected tab or menu row. */
  get rotatingPastelBg() { return chalk.bgRgb(...getBannerColorRGB()).black; },
};
