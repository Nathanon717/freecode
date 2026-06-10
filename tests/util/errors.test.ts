import { describe, expect, it } from 'vitest';
import { isProviderToolUseFailed, toDetailedErrorMessage, toErrorMessage } from '../../src/util/errors.js';

describe('error formatting', () => {
  it('keeps the compact error message helper unchanged', () => {
    expect(toErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('includes OpenAI-compatible response body details', () => {
    const error = new Error('Failed to call a function');
    Object.assign(error, {
      responseBody: JSON.stringify({
        error: {
          message: 'Failed to call a function. See failed_generation.',
          type: 'invalid_request_error',
          code: 'tool_use_failed',
          failed_generation: '{"tool_calls":[{"name":"write_file","arguments":"not-json"}]}',
        },
      }),
    });

    expect(toDetailedErrorMessage(error)).toBe([
      'Failed to call a function',
      'Details:',
      '  provider message: Failed to call a function. See failed_generation.',
      '  code: tool_use_failed',
      '  type: invalid_request_error',
      '  failed_generation: {"tool_calls":[{"name":"write_file","arguments":"not-json"}]}',
    ].join('\n'));
  });

  it('explains tool_use_failed when the provider references missing failed_generation data', () => {
    const error = {
      message: 'Failed to call a function. Please adjust your prompt. See \'failed_generation\' for more details.',
      type: 'invalid_request_error',
      code: 'tool_use_failed',
    };

    const formatted = toDetailedErrorMessage(error);
    expect(formatted).toContain('code: tool_use_failed');
    expect(formatted).toContain('provider rejected the model output as an invalid tool/function call');
  });

  it('detects provider-side tool call rejections from SDK error payloads', () => {
    const error = new Error('Failed to call a function');
    Object.assign(error, {
      data: {
        error: {
          message: 'Failed to call a function. See failed_generation.',
          type: 'invalid_request_error',
          code: 'tool_use_failed',
        },
      },
    });

    expect(isProviderToolUseFailed(error)).toBe(true);
    expect(isProviderToolUseFailed(new Error('boom'))).toBe(false);
  });
});
