import { describe, expect, it } from 'vitest';
import { isBackspaceKey } from '../../src/util/keys.js';

describe('isBackspaceKey', () => {
  it.each(['\x7f', '\x08'])('treats %j as backspace', (key) => {
    expect(isBackspaceKey(key)).toBe(true);
  });

  it.each(['a', '\r', '\x1b', ''])('rejects %j', (key) => {
    expect(isBackspaceKey(key)).toBe(false);
  });
});
