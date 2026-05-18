import { describe, expect, it } from 'vitest';
import { getCommandCompletion, getFilteredCommands } from '../../src/cli/slash-commands.js';

describe('slash command completion', () => {
  it('uses prefix matches for inline completion', () => {
    expect(getCommandCompletion('/e')).toBe('/eval');
    expect(getCommandCompletion('/mo')).toBe('/model');
  });

  it('does not complete an empty slash or exact command', () => {
    expect(getCommandCompletion('/')).toBeNull();
    expect(getCommandCompletion('/eval')).toBeNull();
  });

  it('excludes the inline completion from the visible suggestion list', () => {
    const suggestions = getFilteredCommands('/e');

    expect(getCommandCompletion('/e')).toBe('/eval');
    expect(suggestions).not.toContain('/eval');
  });
});
