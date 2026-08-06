import chalk from 'chalk';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Pin the session's rotating accent so the pastel tokens have a fixed expectation.
const ACCENT: [number, number, number] = [170, 232, 255];
vi.mock('../../src/cli/render/banner.js', () => ({
  getBannerColorRGB: () => ACCENT,
}));

import { palette, theme } from '../../src/cli/theme.js';

// Tokens are only distinguishable from one another when color is actually
// emitted, so pin truecolor for the whole file.
let prevLevel: typeof chalk.level;
beforeAll(() => {
  prevLevel = chalk.level;
  chalk.level = 3;
});
afterAll(() => {
  chalk.level = prevLevel;
});

describe('theme tokens', () => {
  // The migration's contract: each token renders byte-identically to the
  // literal it replaced at the call sites. If a palette value is retuned on
  // purpose, these expectations move with it — that is the intended signal.
  it.each([
    ['warning', () => theme.warning('x'), () => chalk.hex('#FFA500')('x')],
    ['toolName', () => theme.toolName('x'), () => chalk.hex('#c9b3ff')('x')],
    ['mutedHint', () => theme.mutedHint('x'), () => chalk.rgb(128, 128, 128)('x')],
    ['codeSurface', () => theme.codeSurface.bold('x'), () => chalk.hex('#333333').bold('x')],
    ['codeSurfaceBg', () => theme.codeSurfaceBg('x'), () => chalk.bgHex('#333333')('x')],
    [
      'codeSurfaceText',
      () => theme.codeSurfaceText('x'),
      () => chalk.bgHex('#333333').white('x'),
    ],
    ['rotatingPastel', () => theme.rotatingPastel('x'), () => chalk.rgb(...ACCENT)('x')],
    [
      'rotatingPastelBg',
      () => theme.rotatingPastelBg('x'),
      () => chalk.bgRgb(...ACCENT).black('x'),
    ],
  ])('%s matches the literal it replaced', (_name, token, literal) => {
    expect(token()).toBe(literal());
  });

  it('tracks the rotating accent per access rather than freezing it', () => {
    const before = theme.rotatingPastel('x');
    ACCENT[0] = 255;
    try {
      expect(theme.rotatingPastel('x')).not.toBe(before);
    } finally {
      ACCENT[0] = 170;
    }
  });

  it('emits color rather than passing text through unstyled', () => {
    for (const [name, token] of Object.entries(theme)) {
      expect(token('x'), name).not.toBe('x');
    }
  });

  it('gives every palette entry a distinct value', () => {
    const values = Object.values(palette);
    expect(new Set(values).size).toBe(values.length);
  });
});
