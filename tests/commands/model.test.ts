import { describe, expect, it } from 'vitest';
import { filterModelItems, buildAllItemLines, type ModelMenuItem } from '../../src/commands/model.js';

// The pure rendering/data helpers now live in src/cli/model-screen.ts (see
// tests/cli/model-screen.test.ts). model.ts re-exports them for a stable import
// surface; these tests guard that the re-export keeps working.
describe('model.ts re-export surface', () => {
  const items: ModelMenuItem[] = [
    { providerId: 'openai', providerName: 'OpenAI', modelId: 'gpt-4o', displayName: 'GPT-4o' },
    { providerId: 'anthropic', providerName: 'Anthropic', modelId: 'claude-sonnet', displayName: 'Claude Sonnet' },
  ];

  it('re-exports filterModelItems', () => {
    expect(filterModelItems(items, 'anthropic').map(i => i.modelId)).toEqual(['claude-sonnet']);
  });

  it('re-exports buildAllItemLines', () => {
    const { itemLines } = buildAllItemLines(items, 0, '');
    expect(itemLines.some(l => l.includes('GPT-4o'))).toBe(true);
  });
});
