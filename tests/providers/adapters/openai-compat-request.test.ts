import { describe, it, expect } from 'vitest';
import {
  stripTemperatureIfDisallowed,
  stripStreamForNonStream,
  injectCodestralSystem,
  injectParallelToolCallsFalse,
} from '../../../src/providers/adapters/openai-compat-request.js';

describe('stripTemperatureIfDisallowed', () => {
  it('strips temperature for o1 models', () => {
    const body = { model: 'o1-mini', temperature: 0, messages: [] };
    const result = stripTemperatureIfDisallowed(body);
    expect(result).not.toHaveProperty('temperature');
    expect(result).toMatchObject({ model: 'o1-mini', messages: [] });
  });

  it('strips temperature for o3 models', () => {
    const body = { model: 'o3-mini', temperature: 1 };
    expect(stripTemperatureIfDisallowed(body)).not.toHaveProperty('temperature');
  });

  it('leaves temperature for non-reasoning models', () => {
    const body = { model: 'gpt-4o', temperature: 0.7 };
    expect(stripTemperatureIfDisallowed(body)).toHaveProperty('temperature', 0.7);
  });

  it('is a no-op when temperature is absent', () => {
    const body = { model: 'o1-mini', messages: [] };
    expect(stripTemperatureIfDisallowed(body)).toBe(body);
  });
});

describe('stripStreamForNonStream', () => {
  it('strips stream and stream_options when stream is true', () => {
    const body = { stream: true, stream_options: { include_usage: true }, model: 'x' };
    const { body: result, forcedNonStream } = stripStreamForNonStream(body);
    expect(forcedNonStream).toBe(true);
    expect(result).not.toHaveProperty('stream');
    expect(result).not.toHaveProperty('stream_options');
    expect(result).toMatchObject({ model: 'x' });
  });

  it('is a no-op when stream is absent', () => {
    const body = { model: 'x' };
    const { body: result, forcedNonStream } = stripStreamForNonStream(body);
    expect(forcedNonStream).toBe(false);
    expect(result).toBe(body);
  });
});

describe('injectCodestralSystem', () => {
  it('moves system message into first user message for Codestral models', () => {
    const body = {
      model: 'codestral-latest',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
      ],
    };
    const result = injectCodestralSystem(body);
    const messages = result['messages'] as Array<Record<string, unknown>>;
    expect(messages.find(m => m['role'] === 'system')).toBeUndefined();
    expect(messages[0]).toMatchObject({ role: 'user', content: 'You are a helpful assistant.\n\nHello' });
  });

  it('is a no-op for non-Codestral models', () => {
    const body = { model: 'mistral-large', messages: [{ role: 'system', content: 'Sys' }] };
    expect(injectCodestralSystem(body)).toBe(body);
  });
});

describe('injectParallelToolCallsFalse', () => {
  it('adds parallel_tool_calls:false when tools are present', () => {
    const body = { tools: [{ type: 'function', function: { name: 'foo' } }] };
    const result = injectParallelToolCallsFalse(body);
    expect(result).toHaveProperty('parallel_tool_calls', false);
  });

  it('is a no-op when tools array is empty', () => {
    const body = { tools: [] };
    expect(injectParallelToolCallsFalse(body)).toBe(body);
  });

  it('is a no-op when tools is absent', () => {
    const body = { model: 'x' };
    expect(injectParallelToolCallsFalse(body)).toBe(body);
  });
});
