import { describe, expect, it } from 'vitest';
import { buildPromptToolsSystemPrompt } from '../src/agent/prompt-tools.js';

describe('prompt-based tool prompt', () => {
  it('documents grep include glob with the actual tool argument name', () => {
    const prompt = buildPromptToolsSystemPrompt('base');

    expect(prompt).toContain('"include"?: string');
    expect(prompt).not.toContain('file_glob');
  });
});
