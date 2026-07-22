import { describe, it, expect } from 'vitest';
import { makeSpawnAgentTool } from '../../../src/agent/tools/spawn-agent.js';

describe('makeSpawnAgentTool', () => {
  it('delegates execute to the injected runner and returns its string', async () => {
    const calls: Array<{ agentType: string; prompt: string }> = [];
    const tool = makeSpawnAgentTool((agentType, prompt) => {
      calls.push({ agentType, prompt });
      return Promise.resolve(`ran ${agentType}`);
    });
    const execute = tool.execute as (
      args: { agentType: string; prompt: string },
      opts: unknown,
    ) => Promise<string>;

    const result = await execute({ agentType: 'explore', prompt: 'map X' }, {});

    expect(result).toBe('ran explore');
    expect(calls).toEqual([{ agentType: 'explore', prompt: 'map X' }]);
  });

  it('advertises the available agents in its description', () => {
    const tool = makeSpawnAgentTool(() => Promise.resolve(''));
    expect(tool.description).toContain('explore');
    expect(tool.description).toContain('read-only');
  });
});
