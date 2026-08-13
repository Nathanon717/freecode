import { exec } from 'child_process';
import { promisify } from 'util';
import { describe, it, expect, vi } from 'vitest';

const execAsync = promisify(exec);

vi.mock('../../../src/agent/tools/container-shell.js', () => ({
  runSandboxedCommand: async (command: string, projectRoot: string, timeoutMs: number) => {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: projectRoot,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, FREECODE_SANDBOXED: '1' },
      });
      return { stdout, stderr, code: 0 };
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string; code?: number | string; killed?: boolean; message?: string };
      return {
        stdout: failure.stdout ?? '', stderr: failure.stderr ?? '', code: failure.code,
        killed: failure.killed, message: failure.message,
      };
    }
  },
}));

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

  // The other half of finding A1's fix: the refusal in cli/checkpoint.ts is only
  // reachable if the marker actually lands in the child. Also asserts the rest of
  // the environment still arrives — commands here run real builds, and C4 of
  // docs/agent-containment-plan.md is where that inheritance is narrowed.
  it('marks its children as agent-run, keeping the rest of the environment', async () => {
    const { shellTool } = await import('../../../src/agent/tools/shell.js');
    process.env['FREECODE_SHELL_ENV_PROBE'] = 'inherited';
    const script = 'console.log(process.env.FREECODE_SANDBOXED + "/" + process.env.FREECODE_SHELL_ENV_PROBE)';
    const command = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;

    try {
      const result = await shellTool.execute?.({ command }, {}) as string | undefined;
      expect(result?.trim()).toBe('1/inherited');
    } finally {
      delete process.env['FREECODE_SHELL_ENV_PROBE'];
    }

    // The marker belongs to the child and must never reach freecode's own process:
    // the human's route out of a held review lock *is* `checkpoint accept`, and
    // setting this on `process.env` would lock them out of their own project while
    // leaving every test above green.
    expect(process.env['FREECODE_SANDBOXED']).toBeFalsy();
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
