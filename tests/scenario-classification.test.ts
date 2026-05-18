import { describe, expect, it } from 'vitest';
import { classifyScenario, isNonLlmScriptInput } from '../src/scenario-classification.js';

describe('scenario LLM classification', () => {
  it('treats scripted slash commands and approvals as non-LLM input', () => {
    expect(isNonLlmScriptInput('/help')).toBe(true);
    expect(isNonLlmScriptInput('/model groq:test-model')).toBe(true);
    expect(isNonLlmScriptInput('yes')).toBe(true);
    expect(isNonLlmScriptInput('Say PONG')).toBe(false);
  });

  it('accepts a correctly labelled non-LLM scenario', () => {
    const result = classifyScenario({
      name: 'slash-help',
      requiresLlm: false,
      turns: [{ input: '/help' }],
    });

    expect(result.inferredRequiresLlm).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it('rejects non-LLM metadata for a scenario that reaches the agent loop', () => {
    const result = classifyScenario({
      name: 'prompt',
      requiresLlm: false,
      turns: [{ input: 'Say PONG' }],
    });

    expect(result.inferredRequiresLlm).toBe(true);
    expect(result.errors[0]).toContain('requiresLlm=false');
  });

  it('requires requiresLlm metadata to be explicit', () => {
    const result = classifyScenario({
      name: 'missing-metadata',
      turns: [{ input: '/help' }],
    });

    expect(result.errors).toContain('requiresLlm must be explicitly set to true or false');
  });
});
