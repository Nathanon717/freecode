import { describe, it, expect } from 'vitest';
import { listDirTool } from '../../../src/agent/tools/list-dir.js';

describe('tool integration: list_dir', () => {
  it('lists files in current directory', async () => {
    const result = await listDirTool.execute({ path: '.' });
    expect(result).toContain('package.json');
    expect(result).toContain('src/');
  });

  it('treats an empty path as the current directory', async () => {
    const result = await listDirTool.execute({ path: '' });
    expect(result).toContain('package.json');
    expect(result).toContain('src/');
  });

  it('lists files in nested directory', async () => {
    const result = await listDirTool.execute({ path: 'src' });
    expect(result).toContain('index.ts');
  });

  it('returns error for non-existent directory', async () => {
    const result = await listDirTool.execute({ path: 'nonexistent-dir-xyz' });
    expect(result).toContain('Error');
  });

  it('rejects paths outside the project root', async () => {
    const result = await listDirTool.execute({ path: '..' });
    expect(result).toContain('Path escapes project root');
  });
});
