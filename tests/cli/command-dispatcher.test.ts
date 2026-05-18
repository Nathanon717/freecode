import { describe, expect, it } from 'vitest';
import { formatQuotaReset } from '../../src/cli/command-dispatcher.js';

describe('formatQuotaReset', () => {
  it('preserves the provider reset duration when available', () => {
    expect(formatQuotaReset(259_200, '4m19.2s')).toBe('4m19.2s');
    expect(formatQuotaReset(5_130, '5.13s')).toBe('5.13s');
    expect(formatQuotaReset(300, '300ms')).toBe('300ms');
  });

  it('falls back to parsed duration or placeholder when raw text is unavailable', () => {
    expect(formatQuotaReset(259_200, null)).toBe('4m19s');
    expect(formatQuotaReset(null, 'garbage')).toBe('garbage');
    expect(formatQuotaReset(null, null)).toBe('?');
  });
});
