import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

const execFileMock = vi.fn<(file: string, args: string[], callback: (error: Error | null, stdout: string) => void) => void>();
const spawnMock = vi.fn();

vi.mock('child_process', () => ({
  execFile: execFileMock,
  spawn: spawnMock,
}));

vi.mock('../../../src/config/index.js', () => ({
  loadConfig: vi.fn(() => ({})),
}));

describe('container shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execFileMock.mockImplementation((_file, args, callback) => {
      callback(null, args[0] === 'inspect' ? 'true' : 'container-id');
    });
  });

  it('builds the hardened container and exec contracts', async () => {
    const { containerExecArgs, containerRunArgs, translateContainerPaths, translateHostPaths } = await import('../../../src/agent/tools/container-shell.js');
    const runArgs = containerRunArgs('C:\\repo', 'node:22-bookworm-slim');
    expect(runArgs).toEqual(expect.arrayContaining([
      '--network=none', '--read-only', '--pids-limit=256', '--memory=1g', '--cpus=2',
      'node:22-bookworm-slim', '--entrypoint', 'sh',
    ]));
    expect(runArgs).toContain('C:\\repo:/work');
    expect(runArgs.some((arg) => arg.endsWith(':/work/node_modules'))).toBe(true);
    expect(containerExecArgs('freecode-abc', 'pwd')).toEqual([
      'exec', '--env', 'FREECODE_SANDBOXED=1', 'freecode-abc', 'sh', '-lc', 'pwd',
    ]);
    expect(translateContainerPaths('/work/src/a.ts\n', 'C:\\repo')).toBe('C:\\repo/src/a.ts\n');
    expect(translateContainerPaths('/workbench /work', '/repo')).toBe('/workbench /repo');
    expect(translateHostPaths('cd C:\\repo && cat C:/repo/a.ts', 'C:\\repo')).toBe('cd /work && cat /work/a.ts');
  });

  it('refuses when Docker cannot start the container', async () => {
    execFileMock.mockImplementation((_file, _args, callback) => {
      const error = Object.assign(new Error('spawn docker ENOENT'), { code: 'ENOENT' });
      callback(error, '');
    });
    const { runSandboxedCommand } = await import('../../../src/agent/tools/container-shell.js');

    const result = await runSandboxedCommand('pwd', 'C:\\repo', 1000);

    expect(result.message).toContain('Docker is required');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('collects both streams, exit status, and translated paths', async () => {
    const { collectSandboxProcess } = await import('../../../src/agent/tools/container-shell.js');
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(),
    });
    const pending = collectSandboxProcess(child, 'C:\\repo', 1000);
    child.stdout.write('/work/a.ts');
    child.stderr.write('warning');
    child.emit('exit', 7, null);

    await expect(pending).resolves.toMatchObject({
      stdout: 'C:\\repo/a.ts', stderr: 'warning', code: 7, killed: false,
    });
  });

  it('kills and marks a timed-out process', async () => {
    vi.useFakeTimers();
    const { collectSandboxProcess } = await import('../../../src/agent/tools/container-shell.js');
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(),
    });
    child.kill.mockImplementation(() => child.emit('exit', null, 'SIGTERM'));
    const pending = collectSandboxProcess(child, '/repo', 25);
    await vi.advanceTimersByTimeAsync(25);

    await expect(pending).resolves.toMatchObject({ code: 'SIGTERM', killed: true });
    expect(child.kill).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
