import { describe, expect, it } from 'vitest';
import { filterModelItems, buildAllItemLines, type ModelMenuItem } from '../../src/cli/model-screen.js';

const makeItem = (overrides: Partial<ModelMenuItem> & Pick<ModelMenuItem, 'providerId' | 'providerName' | 'modelId' | 'displayName'>): ModelMenuItem => ({
  ...overrides,
});

const openaiItem: ModelMenuItem = makeItem({
  providerId: 'openai', providerName: 'OpenAI',
  modelId: 'gpt-4o', displayName: 'GPT-4o',
});
const anthropicItem: ModelMenuItem = makeItem({
  providerId: 'anthropic', providerName: 'Anthropic',
  modelId: 'claude-sonnet', displayName: 'Claude Sonnet',
});

describe('model picker filtering', () => {
  const items: ModelMenuItem[] = [
    makeItem({ providerId: 'openai', providerName: 'OpenAI', modelId: 'gpt-5.1-codex', displayName: 'GPT-5.1 Codex' }),
    makeItem({ providerId: 'anthropic', providerName: 'Anthropic', modelId: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6' }),
  ];

  it('filters by display name, model id, provider, and full preference', () => {
    expect(filterModelItems(items, 'codex').map(item => item.modelId)).toEqual(['gpt-5.1-codex']);
    expect(filterModelItems(items, 'ANTHROPIC').map(item => item.modelId)).toEqual(['claude-sonnet-4-6']);
    expect(filterModelItems(items, 'openai:gpt').map(item => item.modelId)).toEqual(['gpt-5.1-codex']);
  });

  it('returns all models for blank filters and no models for misses', () => {
    expect(filterModelItems(items, '   ')).toHaveLength(2);
    expect(filterModelItems(items, 'missing')).toEqual([]);
  });
});

describe('buildAllItemLines', () => {
  it('renders provider headers for each provider', () => {
    const { itemLines } = buildAllItemLines([openaiItem, anthropicItem], 0, '');
    expect(itemLines.some(l => l.includes('OpenAI'))).toBe(true);
    expect(itemLines.some(l => l.includes('Anthropic'))).toBe(true);
  });

  it('renders display names', () => {
    const { itemLines } = buildAllItemLines([openaiItem], 0, '');
    expect(itemLines.some(l => l.includes('GPT-4o'))).toBe(true);
  });

  it('places cursor on the selected item', () => {
    const { itemLines, selectedLineIdx } = buildAllItemLines([openaiItem, anthropicItem], 1, '');
    expect(itemLines[selectedLineIdx]).toContain('Claude Sonnet');
    expect(itemLines[selectedLineIdx]).toContain('▶');
  });

  it('shows green triangle on current model when not selected', () => {
    // openaiItem is current but anthropicItem is selected — openaiItem's line must have ▶
    const { itemLines, selectedLineIdx } = buildAllItemLines([openaiItem, anthropicItem], 1, 'openai:gpt-4o');
    const openaiLine = itemLines.find(l => l.includes('GPT-4o'));
    expect(openaiLine).toContain('▶');
    // the selected line should NOT be the openaiItem line
    expect(itemLines[selectedLineIdx]).toContain('Claude Sonnet');
  });

  it('does not show triangle on non-selected, non-current items', () => {
    // anthropicItem is selected; openai is not current — anthropicItem line has ▶ via cursor, openaiItem line has space
    const { itemLines, selectedLineIdx } = buildAllItemLines([openaiItem, anthropicItem], 1, 'anthropic:claude-sonnet');
    const openaiLine = itemLines.find(l => l.includes('GPT-4o'));
    // openaiItem is not active and not current, so no ▶
    expect(openaiLine).not.toContain('▶');
    // but the selected line (anthropicItem) has the cursor ▶
    expect(itemLines[selectedLineIdx]).toContain('▶');
  });

  it('shows static badge in provider header', () => {
    const item = { ...openaiItem, modelsSource: 'static' as const };
    const { itemLines } = buildAllItemLines([item], 0, '');
    const headerLine = itemLines.find(l => l.includes('OpenAI'));
    expect(headerLine).toContain('static');
  });

  it('omits static badge for live source', () => {
    const item = { ...openaiItem, modelsSource: 'live' as const };
    const { itemLines } = buildAllItemLines([item], 0, '');
    const headerLine = itemLines.find(l => l.includes('OpenAI'));
    expect(headerLine).not.toContain('static');
  });

  it('shows new badge for new models', () => {
    const item = { ...openaiItem, isNew: true };
    const { itemLines } = buildAllItemLines([item], 0, '');
    expect(itemLines.some(l => l.includes('new'))).toBe(true);
  });

  it('shows ~tools badge for noNativeTools models', () => {
    const item = { ...openaiItem, noNativeTools: true };
    const { itemLines } = buildAllItemLines([item], 0, '');
    expect(itemLines.some(l => l.includes('~tools'))).toBe(true);
  });

  it('shows evalDots badge', () => {
    const item = { ...openaiItem, evalDots: '●○●' };
    const { itemLines } = buildAllItemLines([item], 0, '');
    expect(itemLines.some(l => l.includes('●○●'))).toBe(true);
  });

  it('does not show star badge for favorites', () => {
    const item = { ...openaiItem, isFavorite: true };
    const { itemLines } = buildAllItemLines([item], 0, '');
    expect(itemLines.some(l => l.includes('★'))).toBe(false);
  });

  it('shows provider headers when showProviderHeaders=true (default)', () => {
    const { itemLines } = buildAllItemLines([openaiItem, anthropicItem], 0, '');
    expect(itemLines.some(l => l.includes('OpenAI'))).toBe(true);
  });

  it('omits provider headers when showProviderHeaders=false', () => {
    const { itemLines } = buildAllItemLines([openaiItem, anthropicItem], 0, '', 'pretty', false);
    expect(itemLines.every(l => !l.includes('OpenAI') && !l.includes('Anthropic'))).toBe(true);
  });

  it('shows agreed pricing badge', () => {
    const item = { ...openaiItem, pricing: { input: 3.0, output: 15.0, confidence: 'agreed' as const } };
    const { itemLines } = buildAllItemLines([item], 0, '');
    expect(itemLines.some(l => l.includes('$3/$15/MTok'))).toBe(true);
  });

  it('shows unverified pricing badge (no error color)', () => {
    const item = { ...openaiItem, pricing: { input: 2.5, output: 10.0, confidence: 'litellm-only' as const } };
    const { itemLines } = buildAllItemLines([item], 0, '');
    expect(itemLines.some(l => l.includes('$2.5/$10/MTok'))).toBe(true);
  });

  it('shows disagree pricing label instead of numbers', () => {
    const item = { ...openaiItem, pricing: { input: null, output: null, confidence: 'disagree' as const } };
    const { itemLines } = buildAllItemLines([item], 0, '');
    expect(itemLines.some(l => l.includes('sources disagree'))).toBe(true);
  });

  it('shows model ID in provider groupMode', () => {
    const { itemLines } = buildAllItemLines([openaiItem], 0, '', 'provider');
    expect(itemLines.some(l => l.includes('openai:gpt-4o'))).toBe(true);
  });

  it('separates providers with a blank line between them', () => {
    const { itemLines } = buildAllItemLines([openaiItem, anthropicItem], 0, '');
    const openaiIdx = itemLines.findIndex(l => l.includes('OpenAI'));
    const anthropicIdx = itemLines.findIndex(l => l.includes('Anthropic'));
    // There must be a blank line between the two provider sections
    expect(itemLines.slice(openaiIdx + 1, anthropicIdx).some(l => l.trim() === '')).toBe(true);
  });

  it('returns selectedLineIdx pointing to the selected item line', () => {
    const { itemLines, selectedLineIdx } = buildAllItemLines([openaiItem, anthropicItem], 0, '');
    expect(itemLines[selectedLineIdx]).toContain('GPT-4o');
  });

  it('handles an empty items array gracefully', () => {
    const { itemLines, selectedLineIdx } = buildAllItemLines([], 0, '');
    expect(itemLines).toEqual([]);
    expect(selectedLineIdx).toBe(0);
  });

  it('renders the selected item name with pastel background', () => {
    // When active, name is wrapped in chalk.bgRgb — can only verify content presence
    const { itemLines, selectedLineIdx } = buildAllItemLines([openaiItem], 0, '');
    expect(itemLines[selectedLineIdx]).toContain('GPT-4o');
  });
});
