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
    const command = `${JSON.stringify(process.execPath)} -e "setTimeout(() => {}, 5000)"`;

    const completed = await shellTool.execute?.({ command: 'cd .', timeout_ms: 5000 }, {}) as string | undefined;
    const result = await shellTool.execute?.({ command, timeout_ms: 50 }, {}) as string | undefined;

    expect(completed).toBe('[exit 0, no output]');
    expect(result).toContain('timed out after 50ms');
  });

  // The bug this guards: exec folds stderr into `error.message` but leaves
  // stdout only on `error.stdout`, so returning the message alone threw away
  // everything a stdout-reporting build tool (dotnet, tsc, msbuild) had said.
  it('keeps stdout when the command exits non-zero', async () => {
    const { shellTool } = await import('../../../src/agent/tools/shell.js');
    const script = 'console.log("error CS1002: expected"); process.exit(1)';
    const command = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;

    const result = await shellTool.execute?.({ command }, {}) as string | undefined;

    expect(result).toContain('error CS1002: expected');
    expect(result).toContain('[exit 1]');
    expect(result).not.toContain('Command failed');
  });

  it('keeps stderr and reports the exit code', async () => {
    const { shellTool } = await import('../../../src/agent/tools/shell.js');
    const script = 'console.error("boom"); process.exit(3)';
    const command = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;

    const result = await shellTool.execute?.({ command }, {}) as string | undefined;

    expect(result).toContain('[stderr]: boom');
    expect(result).toContain('[exit 3]');
  });

  it('marks a failure that produced no output at all', async () => {
    const { shellTool } = await import('../../../src/agent/tools/shell.js');
    const command = `${JSON.stringify(process.execPath)} -e "process.exit(2)"`;

    const result = await shellTool.execute?.({ command }, {}) as string | undefined;

    expect(result).toBe('[exit 2]');
  });

  // 2 MB would have been killed outright by exec's 1 MB maxBuffer default,
  // losing everything. It is now captured, then windowed down to something a
  // context window can hold — with the elision stated rather than silent.
  it('captures past exec\'s 1 MB default, then elides to the result cap', async () => {
    const { shellTool } = await import('../../../src/agent/tools/shell.js');
    const script = 'process.stdout.write("a".repeat(1024 * 1024) + "b".repeat(1024 * 1024))';
    const command = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;

    const result = await shellTool.execute?.({ command, timeout_ms: 20000 }, {}) as string | undefined;

    expect(result).not.toContain('exceeded');
    expect(result).toContain('characters elided');
    // Head and tail both survive: the command's last byte is a 'b', its first an 'a'.
    expect(result?.startsWith('a')).toBe(true);
    expect(result?.endsWith('b')).toBe(true);
    expect((result ?? '').length).toBeLessThan(110_000);
  });

  it('leaves output under the cap byte-exact', async () => {
    const { shellTool } = await import('../../../src/agent/tools/shell.js');
    const script = 'process.stdout.write("x".repeat(50000))';
    const command = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;

    const result = await shellTool.execute?.({ command }, {}) as string | undefined;

    // A clean exit that produced output gets no status line appended.
    expect(result).toBe('x'.repeat(50000));
  });

  it('keeps the status line when output is elided', async () => {
    const { shellTool } = await import('../../../src/agent/tools/shell.js');
    const script = 'process.stdout.write("y".repeat(200000)); process.exit(1)';
    const command = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;

    const result = await shellTool.execute?.({ command }, {}) as string | undefined;

    expect(result).toContain('characters elided');
    expect(result?.endsWith('[exit 1]')).toBe(true);
  });
});
