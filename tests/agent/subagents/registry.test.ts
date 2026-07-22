import { describe, it, expect } from 'vitest';
import {
  getAgentPersona,
  listAgentNames,
  agentCatalog,
} from '../../../src/agent/subagents/registry.js';

describe('sub-agent registry', () => {
  it('ships the explore persona with a non-empty system prompt and a step budget', () => {
    const explore = getAgentPersona('explore');
    expect(explore).toBeDefined();
    expect(explore!.name).toBe('explore');
    expect(explore!.systemPrompt.length).toBeGreaterThan(0);
    expect(explore!.maxSteps).toBeGreaterThan(0);
  });

  it('returns undefined for an unknown persona', () => {
    expect(getAgentPersona('nope')).toBeUndefined();
  });

  it('lists every persona name', () => {
    expect(listAgentNames()).toContain('explore');
  });

  it('renders a model-facing catalog naming each persona', () => {
    const catalog = agentCatalog();
    for (const name of listAgentNames()) {
      expect(catalog).toContain(name);
    }
  });
});
