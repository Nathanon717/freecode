import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('tool confirmation', () => {
  it('executes an approved tool call', async () => {
    const { createTools } = await import('../../../src/agent/tools/index.js');
    const tools = createTools(() => Promise.resolve(true));

    const result = await tools.read_file.execute?.({ path: 'package.json' }, {}) as string | undefined;

    expect(result).toContain('"name": "freecode"');
  });

  it('denies a rejected tool call before execution', async () => {
    const { createTools } = await import('../../../src/agent/tools/index.js');
    const tools = createTools(() => Promise.resolve(false));

    const result = await tools.read_file.execute?.({ path: 'package.json' }, {}) as string | undefined;

    expect(result).toContain('Tool call denied by user');
    expect(result).toContain('read_file');
  });

  it('includes user feedback when a denied tool call provides it', async () => {
    const { createTools } = await import('../../../src/agent/tools/index.js');
    const tools = createTools(() => Promise.resolve({
      approved: false,
      message: 'Do not read that file; summarize the current directory instead.',
    }));

    const result = await tools.read_file.execute?.({ path: 'package.json' }, {}) as string | undefined;

    expect(result).toContain('Tool call denied by user');
    expect(result).toContain('User input after denial');
    expect(result).toContain('summarize the current directory instead');
  });

  it('runs concurrent tool calls in request order', async () => {
    const { createTools } = await import('../../../src/agent/tools/index.js');
    const { setProjectRoot } = await import('../../../src/agent/context.js');
    const tempRoot = await mkdtemp(join(tmpdir(), 'freecode-tool-order-'));
    setProjectRoot(tempRoot);

    try {
      const tools = createTools(async (preview) => {
        if (preview.name === 'write_file') {
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        return true;
      });

      const [, readResult] = (await Promise.all([
        tools.write_file.execute?.({ path: 'output.txt', content: 'queued content' }, {}),
        tools.read_file.execute?.({ path: 'output.txt' }, {}),
      ])) as [unknown, unknown];

      expect(readResult).toContain('queued content');
    } finally {
      setProjectRoot(process.cwd());
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
