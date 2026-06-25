import { describe, expect, it } from 'vitest';
import { extractApiErrors } from '../../src/eval/errors.js';

describe('extractApiErrors', () => {
  it('returns empty array when no errors in stdout', () => {
    expect(extractApiErrors('Hello, world!')).toEqual([]);
  });

  it('parses a simple error object from stdout', () => {
    const stdout = 'Error: {"message": "rate limited", "code": "rate_limit_exceeded"}';
    const errors = extractApiErrors(stdout);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('rate limited');
    expect(errors[0].code).toBe('rate_limit_exceeded');
  });

  it('strips ANSI escape codes before parsing', () => {
    const stdout = 'Error: \x1b[31m{"message": "bad request"}\x1b[0m';
    const errors = extractApiErrors(stdout);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('bad request');
  });

  it('parses nested error object under "error" key', () => {
    const stdout = 'Error: {"error": {"message": "unauthorized", "type": "auth_error", "code": "invalid_key"}}';
    const errors = extractApiErrors(stdout);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('unauthorized');
    expect(errors[0].type).toBe('auth_error');
    expect(errors[0].code).toBe('invalid_key');
  });

  it('captures type and param fields', () => {
    const stdout = 'Error: {"message": "invalid param", "type": "invalid_request_error", "param": "temperature"}';
    const errors = extractApiErrors(stdout);
    expect(errors[0].type).toBe('invalid_request_error');
    expect(errors[0].param).toBe('temperature');
  });

  it('sets diagnosis when tool_use_failed and no failed_generation', () => {
    const stdout = 'Error: {"message": "failed_generation was not included", "code": "tool_use_failed"}';
    const errors = extractApiErrors(stdout);
    expect(errors[0].code).toBe('tool_use_failed');
    expect(errors[0].diagnosis).toBeTruthy();
  });

  it('clears diagnosis when failed_generation is present', () => {
    const stdout = 'Error: {"message": "oops", "code": "tool_use_failed", "failed_generation": "some content"}';
    const errors = extractApiErrors(stdout);
    expect(errors[0].diagnosis).toBeUndefined();
  });

  it('parses multiple errors in sequence', () => {
    const stdout = [
      'Error: {"message": "first error"}',
      'Error: {"message": "second error"}',
    ].join('\n');
    const errors = extractApiErrors(stdout);
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toBe('first error');
    expect(errors[1].message).toBe('second error');
  });

  it('ignores objects without a message field', () => {
    const stdout = 'Error: {"code": "no_message_here"}';
    expect(extractApiErrors(stdout)).toHaveLength(0);
  });
});
