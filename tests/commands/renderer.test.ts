import { describe, expect, it, vi, afterEach } from 'vitest';
import { runRendererDemo } from '../../src/commands/renderer.js';

describe('runRendererDemo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes output to stdout without throwing', () => {
    const written: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    });

    expect(() => runRendererDemo()).not.toThrow();
    expect(written.length).toBeGreaterThan(0);
    expect(written.join('')).toContain('Renderer Demo');
  });
});
