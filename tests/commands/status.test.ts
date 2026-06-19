import { describe, expect, it, vi, afterEach } from 'vitest';
import { runStatusCommand } from '../../src/commands/status.js';

describe('runStatusCommand', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('prints all three sections without throwing', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    });

    expect(() => runStatusCommand()).not.toThrow();
    const output = lines.join('\n');
    expect(output).toMatch(/API Keys/i);
    expect(output).toMatch(/Database/i);
    expect(output).toMatch(/Environment/i);
    expect(output).toMatch(/Turso sync/i);
  });

  it('shows Doppler as active when DOPPLER_PROJECT is set', () => {
    vi.stubEnv('DOPPLER_PROJECT', 'freecode');
    vi.stubEnv('DOPPLER_CONFIG', 'dev');

    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    });

    runStatusCommand();
    const output = lines.join('\n');
    expect(output).toMatch(/Doppler.*active/i);
    expect(output).toMatch(/freecode/);
  });

  it('shows Doppler as not detected when DOPPLER_PROJECT is absent', () => {
    vi.stubEnv('DOPPLER_PROJECT', '');

    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    });

    runStatusCommand();
    const output = lines.join('\n');
    expect(output).toMatch(/not detected/i);
  });
});
