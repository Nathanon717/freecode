import { describe, it, expect } from 'vitest';

describe('shell tool', () => {
  it('identifies destructive commands', async () => {
    const { isDestructiveCommand } = await import('../../../src/agent/tools/shell.js');
    expect(isDestructiveCommand('rm -rf /')).toBe(true);
    expect(isDestructiveCommand('rmdir somedir')).toBe(true);
    expect(isDestructiveCommand('del /f output.txt')).toBe(true);
    expect(isDestructiveCommand('format c:')).toBe(true);
    expect(isDestructiveCommand('git push')).toBe(true);
    expect(isDestructiveCommand('git pull')).toBe(true);
    expect(isDestructiveCommand('git reset --hard HEAD')).toBe(true);
    expect(isDestructiveCommand('git clean -fdx')).toBe(true);
    expect(isDestructiveCommand('Remove-Item output.txt')).toBe(true);
    expect(isDestructiveCommand('Set-Content output.txt value')).toBe(true);
    expect(isDestructiveCommand('Move-Item a b')).toBe(true);
    expect(isDestructiveCommand('ren old.txt new.txt')).toBe(true);
    expect(isDestructiveCommand('echo hello')).toBe(false);
    expect(isDestructiveCommand('remark --help')).toBe(false);
    expect(isDestructiveCommand('model list')).toBe(false);
    expect(isDestructiveCommand('bundle install')).toBe(false);
  });

  it('honors a custom timeout_ms', async () => {
    const { shellTool } = await import('../../../src/agent/tools/shell.js');
    const command = `${JSON.stringify(process.execPath)} -e "setTimeout(() => {}, 100)"`;

    const completed = await shellTool.execute?.({ command, timeout_ms: 1000 }, {}) as string | undefined;
    const result = await shellTool.execute?.({ command, timeout_ms: 10 }, {}) as string | undefined;

    expect(completed).toBe('Command completed with no output');
    expect(result).toContain('Error:');
  });
});
