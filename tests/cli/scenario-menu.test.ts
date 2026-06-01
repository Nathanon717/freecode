import { describe, expect, it } from 'vitest';
import { getEvalStatus } from '../../src/cli/scenario-menu.js';

const currentHash = 'current-hash';

describe('eval menu status circles', () => {
  it('uses only exact history for models in the other bucket', () => {
    const groups = {
      other: [
        'groq:used-model',
        'groq:unused-model',
      ],
    };

    const status = getEvalStatus(
      '001-example',
      currentHash,
      'groq:unused-model',
      [{
        timestamp: '2026-05-31T23:00:00.000Z',
        scenarioId: '001-example',
        model: 'groq:used-model',
        pass: true,
        tokens: { total: 1 },
        scenarioHash: currentHash,
      }],
      groups,
    );

    expect(status).toBe('grey');
  });

  it('shares history across named canonical model groups', () => {
    const groups = {
      'GPT-OSS 120b': [
        'groq:openai/gpt-oss-120b',
        'cerebras:gpt-oss-120b',
      ],
    };

    const status = getEvalStatus(
      '001-example',
      currentHash,
      'cerebras:gpt-oss-120b',
      [{
        timestamp: '2026-05-31T23:00:00.000Z',
        scenarioId: '001-example',
        model: 'groq:openai/gpt-oss-120b',
        pass: true,
        tokens: { total: 1 },
        scenarioHash: currentHash,
      }],
      groups,
    );

    expect(status).toBe('green');
  });

  it('ignores stale scenario hashes', () => {
    const status = getEvalStatus(
      '001-example',
      currentHash,
      'groq:used-model',
      [{
        timestamp: '2026-05-31T23:00:00.000Z',
        scenarioId: '001-example',
        model: 'groq:used-model',
        pass: false,
        tokens: { total: 1 },
        scenarioHash: 'old-hash',
      }],
      {},
    );

    expect(status).toBe('grey');
  });

  it('shows default-model history when no model is selected', () => {
    const status = getEvalStatus(
      '001-example',
      currentHash,
      '',
      [{
        timestamp: '2026-05-31T23:00:00.000Z',
        scenarioId: '001-example',
        model: 'default',
        pass: false,
        tokens: { total: 1 },
        scenarioHash: currentHash,
      }],
      {},
    );

    expect(status).toBe('red');
  });

  it('uses the most recent matching run instead of mixed history', () => {
    const status = getEvalStatus(
      '001-example',
      currentHash,
      'groq:used-model',
      [{
        timestamp: '2026-05-31T23:00:00.000Z',
        scenarioId: '001-example',
        model: 'groq:used-model',
        pass: true,
        tokens: { total: 1 },
        scenarioHash: currentHash,
      }, {
        timestamp: '2026-06-01T00:00:00.000Z',
        scenarioId: '001-example',
        model: 'groq:used-model',
        pass: false,
        tokens: { total: 1 },
        scenarioHash: currentHash,
      }],
      {},
    );

    expect(status).toBe('red');
  });

  it('shows orange for the most recent passing run with warnings', () => {
    const status = getEvalStatus(
      '001-example',
      currentHash,
      'groq:used-model',
      [{
        timestamp: '2026-06-01T00:00:00.000Z',
        scenarioId: '001-example',
        model: 'groq:used-model',
        pass: true,
        warnings: true,
        tokens: { total: 1 },
        scenarioHash: currentHash,
      }],
      {},
    );

    expect(status).toBe('orange');
  });
});
