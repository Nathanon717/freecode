import { describe, it, expect, afterEach } from 'vitest';
import {
  beginAnthropicUsageCapture,
  endAnthropicUsageCapture,
  getLastCapturedAnthropicHeaders,
} from '../../../src/providers/adapters/anthropic.js';

describe('anthropic usage capture lifecycle', () => {
  afterEach(() => {
    endAnthropicUsageCapture('test-provider');
  });

  it('returns null before any capture begins', async () => {
    const result = await endAnthropicUsageCapture('never-started');
    expect(result).toBeNull();
  });

  it('returns null when capture started but no responses captured', async () => {
    beginAnthropicUsageCapture('test-provider');
    const result = await endAnthropicUsageCapture('test-provider');
    expect(result).toBeNull();
  });

  it('clears capture state after end', async () => {
    beginAnthropicUsageCapture('test-provider');
    await endAnthropicUsageCapture('test-provider');
    const result = await endAnthropicUsageCapture('test-provider');
    expect(result).toBeNull();
  });
});

describe('getLastCapturedAnthropicHeaders', () => {
  it('returns null for unknown provider', () => {
    expect(getLastCapturedAnthropicHeaders('no-such-provider')).toBeNull();
  });
});
