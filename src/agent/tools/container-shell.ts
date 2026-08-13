/**
 * @role Runs agent shell commands inside one warm, resource-limited Docker container per project, exposing only the project bind mount and a container-owned node_modules volume.
 *
 * @readwhen
 * - Changing the Docker containment boundary, image selection, resource limits, or project mount layout.
 * - Debugging Docker-unavailable refusals, container startup, command timeouts, or host/container path translation.
 */

import { createHash } from 'crypto';
import { execFile, execFileSync, spawn } from 'child_process';
import type { Readable } from 'stream';
import { loadConfig } from '../../config/index.js';

const CONTAINER_WORKDIR = '/work';
const DEFAULT_IMAGE = 'node:22-bookworm-slim';
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const activeContainers = new Set<string>();
let cleanupRegistered = false;

export interface SandboxCommandResult {
  stdout: string;
  stderr: string;
  code?: number | string;
  killed?: boolean;
  message?: string;
}

const containerName = (projectRoot: string): string =>
  `freecode-${process.pid}-${createHash('sha256').update(projectRoot).digest('hex').slice(0, 12)}`;

const nodeModulesVolume = (projectRoot: string): string =>
  `${containerName(projectRoot)}-node-modules`;

const dockerError = (error: unknown): Error => {
  const candidate = error as NodeJS.ErrnoException;
  if (candidate?.code === 'ENOENT') {
    return new Error('Docker is required for shell_exec but was not found on PATH. Install and start Docker, then retry.');
  }
  return error instanceof Error ? error : new Error(String(error));
};

const inspectRunning = (name: string): Promise<boolean> => new Promise((resolve) => {
  execFile('docker', ['inspect', '--format', '{{.State.Running}}', name], (error, stdout) => {
    resolve(!error && stdout.trim() === 'true');
  });
});

const execDocker = (args: string[]): Promise<void> => new Promise((resolve, reject) => {
  execFile('docker', args, (error) => error ? reject(dockerError(error)) : resolve());
});

export function sandboxUser(): string {
  const uid = typeof process.getuid === 'function' && process.getuid() > 0 ? process.getuid() : 1000;
  const gid = typeof process.getgid === 'function' && process.getgid() > 0 ? process.getgid() : 1000;
  return `${uid}:${gid}`;
}

async function ensureContainer(projectRoot: string): Promise<string> {
  const name = containerName(projectRoot);
  try {
    if (await inspectRunning(name)) return name;
    const image = loadConfig().sandboxImage?.trim() || DEFAULT_IMAGE;
    const volume = nodeModulesVolume(projectRoot);
    const user = sandboxUser();
    // Docker creates a fresh named volume as root. Initialise only that isolated
    // volume before the project is mounted, so the non-root executor can use it.
    await execDocker(['volume', 'create', volume]);
    await execDocker([
      'run', '--rm', '--network=none', '--read-only', '--user=0:0',
      '--volume', `${volume}:/node_modules`, '--entrypoint', 'sh', image,
      '-c', `chown -R ${user} /node_modules`,
    ]);
    const args = containerRunArgs(projectRoot, image);
    await execDocker(args);
    activeContainers.add(name);
    if (!cleanupRegistered) {
      cleanupRegistered = true;
      process.once('exit', () => {
        for (const container of activeContainers) {
          try { execFileSync('docker', ['rm', '--force', container], { stdio: 'ignore', windowsHide: true }); } catch { /* already gone */ }
        }
      });
    }
    return name;
  } catch (error) {
    throw dockerError(error);
  }
}

export function containerRunArgs(projectRoot: string, image: string): string[] {
  const name = containerName(projectRoot);
  return [
      'run', '--detach', '--rm', '--name', name,
      '--network=none', '--read-only', '--pids-limit=256', '--memory=1g', '--cpus=2',
      `--user=${sandboxUser()}`, '--tmpfs', `/tmp:rw,noexec,nosuid,size=256m,uid=${sandboxUser().split(':')[0]},gid=${sandboxUser().split(':')[1]}`,
      '--volume', `${projectRoot}:${CONTAINER_WORKDIR}`,
      '--volume', `${nodeModulesVolume(projectRoot)}:${CONTAINER_WORKDIR}/node_modules`,
      '--workdir', CONTAINER_WORKDIR, '--entrypoint', 'sh',
      image, '-c', 'trap : TERM INT; sleep infinity & wait',
    ];
}

/** Replace paths crossing the container boundary without altering unrelated slash paths. */
export function translateContainerPaths(text: string, projectRoot: string): string {
  const hostRoot = projectRoot.replace(/[\\/]+$/, '');
  return text.replace(/\/work(?=\/|\\|$)/g, hostRoot.replace(/\$/g, '$$$$'));
}

export function translateHostPaths(command: string, projectRoot: string): string {
  const roots = [projectRoot, projectRoot.replace(/\\/g, '/')]
    .map((root) => root.replace(/[\\/]+$/, ''))
    .sort((a, b) => b.length - a.length);
  return roots.reduce((translated, root) => translated.replaceAll(root, CONTAINER_WORKDIR), command);
}

export function containerExecArgs(name: string, command: string): string[] {
  return ['exec', '--env', 'FREECODE_SANDBOXED=1', name, 'sh', '-lc', command];
}

/** Collects a docker-exec child while enforcing the shell tool's timeout and byte ceiling. */
export async function collectSandboxProcess(
  child: {
    stdout: Readable;
    stderr: Readable;
    kill(): boolean;
    once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
    once(event: 'error', listener: (error: Error) => void): unknown;
  },
  projectRoot: string,
  timeoutMs: number,
): Promise<SandboxCommandResult> {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let bytes = 0;
  let overflow = false;
  let timedOut = false;
  const collect = (target: Buffer[]) => (chunk: Buffer): void => {
    bytes += chunk.length;
    if (bytes <= MAX_OUTPUT_BYTES) target.push(chunk);
    else if (!overflow) {
      overflow = true;
      child.kill();
    }
  };
  child.stdout.on('data', collect(stdout));
  child.stderr.on('data', collect(stderr));
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, timeoutMs);
  try {
    const [code, signal] = await new Promise<[number | null, NodeJS.Signals | null]>((resolve, reject) => {
      child.once('exit', (exitCode: number | null, exitSignal: NodeJS.Signals | null) => resolve([exitCode, exitSignal]));
      child.once('error', reject);
    });
    return {
      stdout: translateContainerPaths(Buffer.concat(stdout).toString(), projectRoot),
      stderr: translateContainerPaths(Buffer.concat(stderr).toString(), projectRoot),
      code: overflow ? 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' : code ?? signal ?? undefined,
      killed: timedOut,
    };
  } catch (error) {
    return { stdout: '', stderr: '', message: dockerError(error).message };
  } finally {
    clearTimeout(timer);
  }
}

/** Runs one command in the session's warm container; failures are returned with partial output. */
export async function runSandboxedCommand(
  command: string,
  projectRoot: string,
  timeoutMs: number,
): Promise<SandboxCommandResult> {
  let name: string;
  try {
    name = await ensureContainer(projectRoot);
  } catch (error) {
    return { stdout: '', stderr: '', message: dockerError(error).message };
  }

  const child = spawn('docker', containerExecArgs(name, translateHostPaths(command, projectRoot)), {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  return collectSandboxProcess(child, projectRoot, timeoutMs);
}
