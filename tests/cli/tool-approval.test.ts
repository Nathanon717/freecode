import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  parseScriptedToolChoice,
  formatScriptedToolMenu,
} from '../../src/cli/tool-approval.js';

describe('parseScriptedToolChoice', () => {
  it.each([
    ['y', 'approve'],
    ['yes', 'approve'],
    ['approve', 'approve'],
    ['a', 'approve'],
    ['Y', 'approve'],
    ['YES', 'approve'],
    ['  approve  ', 'approve'],
  ])('parses %s as approve', (input, expected) => {
    expect(parseScriptedToolChoice(input)).toBe(expected);
  });

  it.each([
    ['n', 'deny'],
    ['no', 'deny'],
    ['deny', 'deny'],
    ['d', 'deny'],
    ['N', 'deny'],
    ['NO', 'deny'],
    ['  deny  ', 'deny'],
  ])('parses %s as deny', (input, expected) => {
    expect(parseScriptedToolChoice(input)).toBe(expected);
  });

  it('returns null for empty string', () => {
    expect(parseScriptedToolChoice('')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parseScriptedToolChoice(undefined)).toBeNull();
  });

  it('returns null for unrecognised input', () => {
    expect(parseScriptedToolChoice('maybe')).toBeNull();
    expect(parseScriptedToolChoice('skip')).toBeNull();
  });
});

describe('formatScriptedToolMenu', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('highlights the approve option when choice is approve', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((s: string) => lines.push(s));
    formatScriptedToolMenu('approve');
    const combined = lines.join('\n').replace(/\x1b\[[0-9;]*m/g, '');
    expect(combined).toContain('> Approve');
    expect(combined).toContain('Deny');
  });

  it('highlights the deny option when choice is deny', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((s: string) => lines.push(s));
    formatScriptedToolMenu('deny');
    const combined = lines.join('\n').replace(/\x1b\[[0-9;]*m/g, '');
    expect(combined).toContain('Approve');
    expect(combined).toContain('> Deny');
  });
});
