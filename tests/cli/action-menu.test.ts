import { describe, expect, it } from 'vitest';
import { InlineActionMenu } from '../../src/cli/action-menu.js';

describe('InlineActionMenu', () => {
  it('renderLines returns separator + one row per option + separator', () => {
    const menu = new InlineActionMenu(['Foo', 'Bar']);
    expect(menu.renderLines()).toHaveLength(4);
  });

  it('padWidth equals longest option length + 4', () => {
    const menu = new InlineActionMenu(['short', 'much-longer-option']);
    expect(menu.padWidth).toBe('much-longer-option'.length + 4);
  });

  it('handleKey Escape returns close', () => {
    const menu = new InlineActionMenu(['A', 'B']);
    expect(menu.handleKey('\x1b')).toEqual({ type: 'close' });
  });

  it('handleKey down arrow advances selection', () => {
    const menu = new InlineActionMenu(['A', 'B', 'C']);
    expect(menu.handleKey('\x1b[B')).toEqual({ type: 'redraw' });
    expect(menu.sel).toBe(1);
  });

  it('handleKey down arrow wraps around', () => {
    const menu = new InlineActionMenu(['A', 'B']);
    menu.sel = 1;
    menu.handleKey('\x1b[B');
    expect(menu.sel).toBe(0);
  });

  it('handleKey up arrow moves back and wraps', () => {
    const menu = new InlineActionMenu(['A', 'B']);
    menu.handleKey('\x1b[A');
    expect(menu.sel).toBe(1);
  });

  it('handleKey Enter selects current option with \\r', () => {
    const menu = new InlineActionMenu(['Yes', 'No']);
    expect(menu.handleKey('\r')).toEqual({ type: 'select', option: 'Yes' });
  });

  it('handleKey Enter selects current option with \\n', () => {
    const menu = new InlineActionMenu(['Yes', 'No']);
    menu.sel = 1;
    expect(menu.handleKey('\n')).toEqual({ type: 'select', option: 'No' });
  });

  it('unrecognized key returns redraw', () => {
    const menu = new InlineActionMenu(['A']);
    expect(menu.handleKey('x')).toEqual({ type: 'redraw' });
  });

  it('reset resets sel to 0', () => {
    const menu = new InlineActionMenu(['X', 'Y']);
    menu.sel = 1;
    menu.reset();
    expect(menu.sel).toBe(0);
  });
});
