import chalk from 'chalk';
import { getBannerColor } from './banner.js';

export type ActionMenuResult =
  | { type: 'close' }
  | { type: 'redraw' }
  | { type: 'select'; option: string };

/**
 * Renders and handles keyboard input for an inline action sub-menu that splices
 * into a list picker screen directly below the selected row.
 */
export class InlineActionMenu {
  sel = 0;
  readonly padWidth: number;

  constructor(readonly options: readonly string[]) {
    this.padWidth = Math.max(...options.map((o) => o.length)) + 4;
  }

  renderLines(): string[] {
    const sep = chalk.dim('─'.repeat(this.padWidth));
    const lines = [`      ${sep}`];
    for (let i = 0; i < this.options.length; i++) {
      const cursor = i === this.sel ? getBannerColor()('▶') : ' ';
      const text =
        i === this.sel ? chalk.bold(this.options[i]) : this.options[i];
      lines.push(`      ${cursor} ${text}`);
    }
    lines.push(`      ${sep}`);
    return lines;
  }

  handleKey(key: string): ActionMenuResult {
    if (key === '\x1b') return { type: 'close' };
    if (key === '\x1b[A') {
      this.sel = (this.sel - 1 + this.options.length) % this.options.length;
      return { type: 'redraw' };
    }
    if (key === '\x1b[B') {
      this.sel = (this.sel + 1) % this.options.length;
      return { type: 'redraw' };
    }
    if (key === '\r' || key === '\n')
      return { type: 'select', option: this.options[this.sel] };
    return { type: 'redraw' };
  }

  reset(): void {
    this.sel = 0;
  }
}
