import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Interface } from 'readline';

// Capture the opts handed to runRawPicker so we can drive render()/onKey() directly.
const { store } = vi.hoisted(() => ({
  store: {
    opts: null as null | {
      render: () => string[];
      onKey: (key: string, redraw: () => void, close: (v: unknown) => void) => void;
    },
  },
}));

vi.mock('../../src/cli/raw-picker.js', () => ({
  runRawPicker: vi.fn((_rl: unknown, opts: unknown) => {
    store.opts = opts as typeof store.opts;
    return new Promise(() => {}); // never resolves; tests drive opts directly
  }),
}));

import { runListMenu, type MenuTab, type ListMenuBody } from '../../src/cli/list-menu.js';
import { InlineActionMenu } from '../../src/cli/action-menu.js';

const fakeRl = { pause: vi.fn(), resume: vi.fn() } as unknown as Interface;

const UP = '\x1b[A';
const DOWN = '\x1b[B';
const RIGHT = '\x1b[C';
const ESC = '\x1b';
const ENTER = '\r';

const redraw = vi.fn();
let closeArg: unknown;
let closed = false;
const close = (v: unknown): void => { closed = true; closeArg = v; };

beforeEach(() => {
  vi.clearAllMocks();
  store.opts = null;
  closed = false;
  closeArg = undefined;
});

// A simple body renderer: one line per item, selected row marked with '>'.
function listBody(items: string[], selected: number): ListMenuBody {
  const lines = ['  header', '  hint', ...items.map((it, i) => `${i === selected ? '>' : ' '} ${it}`)];
  return { lines, selectedLineIdx: 2 + selected, hintLineIdx: 1 };
}

function singleTab(overrides?: Partial<MenuTab<unknown>>): MenuTab<unknown> {
  const items = ['alpha', 'beta', 'gamma'];
  return {
    id: 'items',
    label: 'Items',
    count: () => items.length,
    renderBody: (sel) => listBody(items, sel),
    ...overrides,
  };
}

describe('runListMenu — single tab navigation', () => {
  it('renders the body without a tab bar', () => {
    void runListMenu(fakeRl, { tabs: [singleTab()] });
    expect(store.opts!.render()).toEqual(['  header', '  hint', '> alpha', '  beta', '  gamma']);
  });

  it('moves Down and Up through items', () => {
    void runListMenu(fakeRl, { tabs: [singleTab()] });
    store.opts!.onKey(DOWN, redraw, close);
    expect(store.opts!.render()[3]).toBe('> beta');
    store.opts!.onKey(UP, redraw, close);
    expect(store.opts!.render()[2]).toBe('> alpha');
  });

  it('wraps at the ends by default', () => {
    void runListMenu(fakeRl, { tabs: [singleTab()] });
    store.opts!.onKey(UP, redraw, close); // from 0 → last
    expect(store.opts!.render()[4]).toBe('> gamma');
    store.opts!.onKey(DOWN, redraw, close); // from last → 0
    expect(store.opts!.render()[2]).toBe('> alpha');
  });

  it('does not wrap when wrap:false', () => {
    void runListMenu(fakeRl, { tabs: [singleTab()], wrap: false });
    store.opts!.onKey(UP, redraw, close); // stays at 0
    expect(store.opts!.render()[2]).toBe('> alpha');
  });

  it('closes with null on Esc, or onCancel value', () => {
    void runListMenu(fakeRl, { tabs: [singleTab()] });
    store.opts!.onKey(ESC, redraw, close);
    expect(closed).toBe(true);
    expect(closeArg).toBeNull();

    closed = false;
    void runListMenu(fakeRl, { tabs: [singleTab()], onCancel: () => 'bye' });
    store.opts!.onKey(ESC, redraw, close);
    expect(closeArg).toBe('bye');
  });
});

describe('runListMenu — detail mode', () => {
  it('opens detail with Right when renderDetail is present, and Esc returns', () => {
    void runListMenu(fakeRl, {
      tabs: [singleTab({ renderDetail: (sel) => [`detail of item ${sel}`] })],
    });
    store.opts!.onKey(RIGHT, redraw, close);
    expect(store.opts!.render()).toEqual(['detail of item 0']);
    store.opts!.onKey(ESC, redraw, close);
    expect(closed).toBe(false);
    expect(store.opts!.render()[2]).toBe('> alpha');
  });

  it('does not open detail when renderDetail is absent', () => {
    const onKey = vi.fn(() => false);
    void runListMenu(fakeRl, { tabs: [singleTab({ onKey })] });
    store.opts!.onKey(RIGHT, redraw, close);
    // Right fell through to the tab's onKey hatch.
    expect(onKey).toHaveBeenCalledWith(RIGHT, expect.anything());
  });
});

describe('runListMenu — action menu', () => {
  it('opens on Enter, splices action lines, and routes select', () => {
    const onSelect = vi.fn();
    const menu = new InlineActionMenu(['Run', 'View']);
    void runListMenu(fakeRl, {
      tabs: [singleTab({ actionMenu: { menu, actionHint: '  ACTION HINT', onSelect } })],
    });
    store.opts!.onKey(ENTER, redraw, close);
    const screen = store.opts!.render();
    expect(screen[1]).toBe('  ACTION HINT'); // hint line swapped
    expect(screen.some((l) => l.includes('Run'))).toBe(true);
    store.opts!.onKey(ENTER, redraw, close); // select first option
    expect(onSelect).toHaveBeenCalledWith('Run', expect.anything());
  });
});

describe('runListMenu — tab bar', () => {
  function twoTabs(): MenuTab<unknown>[] {
    return [
      { id: 'a', label: 'AAA', count: () => 2, renderBody: (s) => listBody(['a0', 'a1'], s) },
      { id: 'b', label: 'BBB', count: () => 2, renderBody: (s) => listBody(['b0', 'b1'], s) },
    ];
  }

  it('prepends a tab bar and focuses the tab row on Up from item 0', () => {
    void runListMenu(fakeRl, { tabs: twoTabs() });
    const initial = store.opts!.render();
    expect(initial.join('\n')).toContain('AAA');
    store.opts!.onKey(UP, redraw, close); // item 0 → tab row
    // On the tab row, Right switches to the second tab.
    store.opts!.onKey(RIGHT, redraw, close);
    expect(store.opts!.render().join('\n')).toContain('b0');
    // Down returns into the (now active) tab's first item.
    store.opts!.onKey(DOWN, redraw, close);
    expect(store.opts!.render()).toContain('> b0');
  });

  it('opens on initialTabId', () => {
    void runListMenu(fakeRl, { tabs: twoTabs(), initialTabId: 'b' });
    expect(store.opts!.render()).toContain('> b0');
  });
});

describe('runListMenu — onKey hatch and onEnter', () => {
  it('lets the tab consume keys before base fallbacks', () => {
    const onKey = vi.fn((key: string) => key === 'x');
    const onEnter = vi.fn();
    void runListMenu(fakeRl, { tabs: [singleTab({ onKey, onEnter })] });
    store.opts!.onKey('x', redraw, close);
    expect(onKey).toHaveReturnedWith(true);
    store.opts!.onKey(ENTER, redraw, close); // no actionMenu → onEnter
    expect(onEnter).toHaveBeenCalled();
  });
});
