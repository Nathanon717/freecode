import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';

vi.mock('fs');

import {
  clearAndRedrawBanner,
  clearEntireTerminal,
  getBannerColor,
  getBannerColorRGB,
  redrawBanner,
  showBanner,
} from '../../src/cli/banner.js';

const PASTEL_COLORS: [number, number, number][] = [
  [255, 182, 193],
  [255, 210, 170],
  [255, 250, 160],
  [182, 248, 182],
  [170, 232, 255],
  [182, 200, 255],
  [220, 182, 255],
  [255, 182, 230],
];

function setColumns(val: number | undefined) {
  Object.defineProperty(process.stdout, 'columns', {
    get: () => val,
    configurable: true,
  });
}

describe('clearEntireTerminal', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes scrollback-clearing escape sequence', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    clearEntireTerminal();
    expect(write).toHaveBeenCalledWith('\x1b[0m\x1b[r\x1b[H\x1b[2J\x1b[3J\x1b[H');
  });
});

describe('clearAndRedrawBanner', () => {
  let write: ReturnType<typeof vi.spyOn>;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    setColumns(undefined);
  });

  it('writes non-scrollback-clearing escape sequence', () => {
    setColumns(100);
    clearAndRedrawBanner();
    expect(write).toHaveBeenCalledWith('\x1b[0m\x1b[r\x1b[H\x1b[2J\x1b[H');
  });

  it('uses FULL_BANNER when columns >= 82', () => {
    setColumns(82);
    clearAndRedrawBanner();
    expect(log).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('.d88b.'));
  });

  it('uses COMPACT_BANNER when columns < 82', () => {
    setColumns(81);
    clearAndRedrawBanner();
    expect(log).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('freecode'));
  });

  it('defaults to COMPACT_BANNER (80) when columns is undefined', () => {
    setColumns(undefined);
    clearAndRedrawBanner();
    expect(log).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('freecode'));
  });
});

describe('getBannerColor', () => {
  it('returns a callable chalk instance', () => {
    const color = getBannerColor();
    expect(typeof color).toBe('function');
    expect(typeof color('test')).toBe('string');
  });
});

describe('getBannerColorRGB', () => {
  it('returns a valid RGB tuple from the palette', () => {
    const rgb = getBannerColorRGB();
    expect(rgb).toHaveLength(3);
    expect(PASTEL_COLORS).toContainEqual(rgb);
  });
});

describe('showBanner', () => {
  let write: ReturnType<typeof vi.spyOn>;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    setColumns(undefined);
  });

  it('clears scrollback and logs banner (wide terminal)', () => {
    setColumns(100);
    showBanner();
    expect(write).toHaveBeenCalledWith('\x1b[0m\x1b[r\x1b[H\x1b[2J\x1b[3J\x1b[H');
    expect(log).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('.d88b.'));
  });

  it('uses COMPACT_BANNER with narrow terminal', () => {
    setColumns(60);
    showBanner();
    expect(log).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('freecode'));
  });

  it('defaults to COMPACT_BANNER when columns is undefined', () => {
    setColumns(undefined);
    showBanner();
    expect(log).toHaveBeenCalledOnce();
  });

  it('increments color index when state file exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => JSON.stringify({ idx: 2 }));
    setColumns(100);
    showBanner();
    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify({ idx: 3 }),
      'utf-8',
    );
  });

  it('wraps color index around at end of palette', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => JSON.stringify({ idx: 7 }));
    setColumns(100);
    showBanner();
    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify({ idx: 0 }),
      'utf-8',
    );
  });

  it('handles file read error gracefully', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('disk error');
    });
    setColumns(100);
    expect(() => showBanner()).not.toThrow();
    expect(log).toHaveBeenCalledOnce();
  });

  it('creates directory when it does not exist', () => {
    vi.mocked(fs.existsSync)
      .mockReturnValueOnce(false)  // state file does not exist
      .mockReturnValueOnce(false); // parent dir does not exist
    setColumns(100);
    showBanner();
    expect(vi.mocked(fs.mkdirSync)).toHaveBeenCalledWith(
      expect.any(String),
      { recursive: true },
    );
  });

  it('skips mkdirSync when directory already exists', () => {
    vi.mocked(fs.existsSync)
      .mockReturnValueOnce(false) // state file does not exist
      .mockReturnValueOnce(true); // parent dir exists
    setColumns(100);
    showBanner();
    expect(vi.mocked(fs.mkdirSync)).not.toHaveBeenCalled();
  });

  it('handles write error gracefully', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.writeFileSync).mockImplementation(() => {
      throw new Error('write error');
    });
    setColumns(100);
    expect(() => showBanner()).not.toThrow();
  });
});

describe('redrawBanner', () => {
  let write: ReturnType<typeof vi.spyOn>;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    setColumns(undefined);
  });

  it('clears scrollback and logs banner (wide terminal)', () => {
    setColumns(100);
    redrawBanner();
    expect(write).toHaveBeenCalledWith('\x1b[0m\x1b[r\x1b[H\x1b[2J\x1b[3J\x1b[H');
    expect(log).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('.d88b.'));
  });

  it('uses COMPACT_BANNER with narrow terminal', () => {
    setColumns(60);
    redrawBanner();
    expect(log).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('freecode'));
  });

  it('defaults to COMPACT_BANNER when columns is undefined', () => {
    setColumns(undefined);
    redrawBanner();
    expect(log).toHaveBeenCalledOnce();
  });
});

describe('module-level initialization', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('reads saved color index from state file on module load', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => JSON.stringify({ idx: 5 }));
    vi.resetModules();
    const { getBannerColorRGB: getRGB } = await import('../../src/cli/banner.js');
    expect(getRGB()).toEqual(PASTEL_COLORS[5]);
  });

  it('wraps saved index to keep it in bounds', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // idx 8 wraps to 0
    vi.mocked(fs.readFileSync).mockImplementation(() => JSON.stringify({ idx: 8 }));
    vi.resetModules();
    const { getBannerColorRGB: getRGB } = await import('../../src/cli/banner.js');
    expect(getRGB()).toEqual(PASTEL_COLORS[0]);
  });

  it('keeps default index when state file does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.resetModules();
    const { getBannerColorRGB: getRGB } = await import('../../src/cli/banner.js');
    expect(getRGB()).toEqual(PASTEL_COLORS[0]);
  });

  it('falls back to default index on invalid JSON', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => '{ not valid json }');
    vi.resetModules();
    const { getBannerColorRGB: getRGB } = await import('../../src/cli/banner.js');
    expect(getRGB()).toEqual(PASTEL_COLORS[0]);
  });

  it('falls back to default index on read error during init', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('cannot read');
    });
    vi.resetModules();
    const { getBannerColorRGB: getRGB } = await import('../../src/cli/banner.js');
    expect(getRGB()).toEqual(PASTEL_COLORS[0]);
  });
});
