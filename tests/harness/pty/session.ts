#!/usr/bin/env tsx
/**
 * Persistent PTY session manager – lets an agent drive freecode interactively.
 *
 * Commands:
 *   session.ts start [--cols N] [--rows N]
 *       Spawns a freecode PTY daemon and prints the initial screen.
 *
 *   session.ts goto <screen> [--screen] [--cols N] [--rows N]
 *       Navigate to a named screen (home/models/config/eval) via BFS pathfinding.
 *       Auto-starts a session if none is running. Prints the screen when --screen is set.
 *
 *   session.ts send <keys> [<keys>...] [--wait-for <text>] [--quiet-ms N]
 *       Sends keystrokes to the running session, prints the resulting screen.
 *       Keys are raw strings; use shell ANSI-C quoting for control chars:
 *         Tab     $'\t'     Enter   $'\r'     Escape  $'\x1b'     Ctrl-C  $'\x03'
 *       Multiple key args are concatenated in order.
 *       Pass "-" as the keys arg to read from stdin — useful for slash-prefixed
 *       commands that MSYS would otherwise mangle:
 *         printf '/model' | npm run pty:session -- send -
 *
 *   session.ts screen
 *       Prints the current screen without sending any input.
 *
 *   session.ts stop
 *       Kills the session and cleans up.
 *
 * The --server flag is internal – used by 'start' to launch the daemon process.
 */
import { createPtyDriver } from './driver.js';
import net from 'net';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');
const DIST_ENTRY = join(ROOT, 'dist', 'index.js');
const SESSION_DIR = join(tmpdir(), 'freecode-sessions');
const ACTIVE_FILE = join(SESSION_DIR, 'active.json');

// ── active session state ─────────────────────────────────────────────────────

interface ActiveSession { id: string; screen: string; }

function readActive(): ActiveSession | null {
  if (!existsSync(ACTIVE_FILE)) return null;
  try { return JSON.parse(readFileSync(ACTIVE_FILE, 'utf8')); } catch { return null; }
}

function writeActive(state: ActiveSession): void {
  mkdirSync(SESSION_DIR, { recursive: true });
  writeFileSync(ACTIVE_FILE, JSON.stringify(state));
}

function clearActive(): void {
  try { unlinkSync(ACTIVE_FILE); } catch { /* already gone */ }
}

function resolveId(): string {
  const active = readActive();
  if (!active) { console.error('No active session. Run: pty start'); process.exit(1); }
  return active.id;
}

// ── nav graph ────────────────────────────────────────────────────────────────

// steps are sent as separate RPCs so each gets its own settle window.
// This matters for slash commands: '/model\r' sent as one chunk doesn't
// trigger execution — the app needs to settle after typing before \r submits.
const NAV: Record<string, { steps: string[]; to: string }[]> = {
  home:   [
    { steps: ['/model', '\r'], to: 'models' },
    { steps: ['/config', '\r'], to: 'config' },
    { steps: ['/eval',   '\r'], to: 'eval' },
  ],
  models: [{ steps: ['\x1b'], to: 'home' }],
  config: [{ steps: ['\x1b'], to: 'home' }],
  eval:   [{ steps: ['\x1b'], to: 'home' }],
};

function bfsPath(from: string, to: string): { steps: string[]; to: string }[] | null {
  if (from === to) return [];
  const visited = new Set<string>([from]);
  const queue: { screen: string; path: { keys: string; to: string }[] }[] = [{ screen: from, path: [] }];
  while (queue.length) {
    const { screen, path } = queue.shift()!;
    for (const edge of (NAV[screen] ?? [])) {
      if (visited.has(edge.to)) continue;
      const newPath = [...path, edge];
      if (edge.to === to) return newPath;
      visited.add(edge.to);
      queue.push({ screen: edge.to, path: newPath });
    }
  }
  return null;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
// Ready file stores the TCP port the daemon is listening on.
const flagPath = (id: string) => join(SESSION_DIR, `${id}.ready`);

function printScreen(lines: string[], cols: number): void {
  const bar = '─'.repeat(cols);
  console.log(bar);
  if (lines.length) console.log(lines.join('\n'));
  console.log(bar);
}

// ── daemon (internal) ────────────────────────────────────────────────────────

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

async function runServer(id: string, cols: number, rows: number): Promise<void> {
  mkdirSync(SESSION_DIR, { recursive: true });
  const home = mkdtempSync(join(tmpdir(), 'freecode-sess-'));

  const driver = createPtyDriver({
    command: process.execPath,
    args: [DIST_ENTRY],
    cwd: ROOT,
    env: { ...process.env, FREECODE_HOME: home, FORCE_COLOR: '1' },
    cols,
    rows,
  });

  if (!await driver.waitForText('for commands', 20_000)) process.exit(1);
  await driver.settle(400);

  const fp = flagPath(id);
  let lastActivityAt = Date.now();

  const idleTimer = setInterval(() => {
    if (Date.now() - lastActivityAt >= IDLE_TIMEOUT_MS) {
      clearInterval(idleTimer);
      driver.kill();
      server.close();
      process.exit(0);
    }
  }, 30_000);

  const server = net.createServer(socket => {
    socket.on('error', () => { /* client may destroy() after receiving response */ });
    let buf = '';
    socket.on('data', async chunk => {
      buf += chunk.toString('utf8');
      const nl = buf.indexOf('\n');
      if (nl === -1) return;
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);

      let msg: Record<string, unknown>;
      try { msg = JSON.parse(line); } catch { socket.write('{"error":"parse"}\n'); return; }

      const respond = (obj: object) => socket.write(JSON.stringify(obj) + '\n');
      lastActivityAt = Date.now();

      if (msg.type === 'screen') {
        respond({ screen: driver.snapshot(), exited: driver.isExited() });
      } else if (msg.type === 'send') {
        if (driver.isExited()) { respond({ error: 'exited', exitCode: driver.exitCode() }); return; }
        driver.send(msg.keys as string);
        if (msg.waitFor) await driver.waitForText(msg.waitFor as string, 60_000);
        await driver.settle((msg.quietMs as number) ?? 350);
        respond({ screen: driver.snapshot(), exited: driver.isExited() });
      } else if (msg.type === 'stop') {
        clearInterval(idleTimer);
        respond({ ok: true });
        socket.end();
        driver.kill();
        server.close();
        process.exit(0);
      }
    });
  });

  process.on('exit', () => {
    try { unlinkSync(fp); } catch { /* already gone */ }
  });

  // Listen on a random port; write the assigned port to the ready file so the
  // client can find it. Port 0 works on both Linux and Windows.
  server.listen(0, '127.0.0.1', () => {
    const port = (server.address() as net.AddressInfo).port;
    writeFileSync(fp, String(port));
  });
  // Keep the process alive – the event loop stays open via the server.
}

// ── RPC client ───────────────────────────────────────────────────────────────

function rpc(id: string, msg: object): Promise<Record<string, unknown>> {
  const port = parseInt(readFileSync(flagPath(id), 'utf8').trim(), 10);
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(port, '127.0.0.1');
    let buf = '';
    socket.on('connect', () => socket.write(JSON.stringify(msg) + '\n'));
    socket.on('data', chunk => {
      buf += chunk.toString('utf8');
      const nl = buf.indexOf('\n');
      if (nl !== -1) {
        const line = buf.slice(0, nl).trim();
        socket.destroy();
        try { resolve(JSON.parse(line)); }
        catch { reject(new Error('bad response: ' + line)); }
      }
    });
    socket.on('error', reject);
  });
}

// ── commands ─────────────────────────────────────────────────────────────────

async function cmdStart(cols: number, rows: number, showScreen = false): Promise<void> {
  mkdirSync(SESSION_DIR, { recursive: true });

  // Stop any existing sessions before starting a new one.
  const existing = existsSync(SESSION_DIR)
    ? readdirSync(SESSION_DIR).filter(f => f.endsWith('.ready'))
    : [];
  for (const file of existing) {
    const existingId = file.slice(0, -'.ready'.length);
    await rpc(existingId, { type: 'stop' }).catch(() => {
      try { unlinkSync(flagPath(existingId)); } catch { /* already gone */ }
    });
  }
  clearActive();

  const id = randomBytes(6).toString('hex');
  const tsxCli = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const self = fileURLToPath(import.meta.url);

  spawn(process.execPath, [tsxCli, self, '--server', id, '--cols', String(cols), '--rows', String(rows)], {
    detached: true, stdio: 'ignore', windowsHide: true, cwd: ROOT,
  }).unref();

  const flag = flagPath(id);
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (existsSync(flag)) break;
    await sleep(100);
  }
  if (!existsSync(flag)) { console.error('Session never became ready (timeout)'); process.exit(1); }

  writeActive({ id, screen: 'home' });
  if (showScreen) {
    const res = await rpc(id, { type: 'screen' });
    printScreen(res.screen as string[], cols);
  }
}

async function cmdSend(
  keys: string,
  opts: { waitFor?: string; quietMs?: number; cols: number },
): Promise<void> {
  const id = resolveId();
  // Allow keys to be read from stdin (pass "-" as the keys arg) so that
  // slash-prefixed commands like "/model" aren't mangled by MSYS path conversion.
  if (keys === '-') keys = readFileSync(0, 'utf8');
  const res = await rpc(id, { type: 'send', keys, waitFor: opts.waitFor, quietMs: opts.quietMs });
  if ('error' in res) { console.error('Error:', res.error); process.exit(1); }
  printScreen(res.screen as string[], opts.cols);
}

async function cmdScreen(cols: number): Promise<void> {
  const id = resolveId();
  const res = await rpc(id, { type: 'screen' });
  if ('error' in res) { console.error('Error:', res.error); process.exit(1); }
  printScreen(res.screen as string[], cols);
}

async function cmdStop(): Promise<void> {
  const id = resolveId();
  await rpc(id, { type: 'stop' }).catch(() => {
    try { unlinkSync(flagPath(id)); } catch { /* already gone */ }
  });
  clearActive();
  console.log('stopped');
}

async function cmdGoto(
  screen: string,
  opts: { showScreen: boolean; cols: number; rows: number },
): Promise<void> {
  let active = readActive();
  if (!active) {
    await cmdStart(opts.cols, opts.rows);
    active = readActive()!;
  }

  const startScreen = active.screen;
  const path = bfsPath(startScreen, screen);
  if (path === null) {
    console.error(`No path from '${startScreen}' to '${screen}'. Known screens: ${Object.keys(NAV).join(', ')}`);
    process.exit(1);
  }

  for (const edge of path) {
    for (const keys of edge.steps) {
      await rpc(active.id, { type: 'send', keys });
    }
    active.screen = edge.to;
    writeActive(active);
  }

  console.log(`navigated: ${startScreen} → ${screen}`);

  if (opts.showScreen) {
    const res = await rpc(active.id, { type: 'screen' });
    printScreen(res.screen as string[], opts.cols);
  }
}

// ── entry ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const raw = process.argv.slice(2);
  let cols = 80, rows = 24;
  let waitFor: string | undefined;
  let quietMs: number | undefined;
  let showScreen = false;
  const args: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    if      (raw[i] === '--cols'     && raw[i + 1]) cols       = parseInt(raw[++i], 10);
    else if (raw[i] === '--rows'     && raw[i + 1]) rows       = parseInt(raw[++i], 10);
    else if (raw[i] === '--wait-for' && raw[i + 1]) waitFor    = raw[++i];
    else if (raw[i] === '--quiet-ms' && raw[i + 1]) quietMs    = parseInt(raw[++i], 10);
    else if (raw[i] === '--screen')                 showScreen = true;
    else args.push(raw[i]);
  }

  const [cmd, ...rest] = args;

  switch (cmd) {
    case '--server': return runServer(rest[0], cols, rows);
    case 'start':   return cmdStart(cols, rows, showScreen);
    case 'goto': {
      const [screen] = rest;
      if (!screen) { console.error('Usage: goto <screen> [--screen]'); process.exit(1); }
      return cmdGoto(screen, { showScreen, cols, rows });
    }
    case 'send':   return cmdSend(rest.join(''), { waitFor, quietMs, cols });
    case 'screen': return cmdScreen(cols);
    case 'stop':   return cmdStop();
    default:
      console.error(
        'Usage:\n' +
        '  session.ts start [--cols N] [--rows N]\n' +
        '  session.ts goto <screen> [--screen] [--cols N] [--rows N]\n' +
        '  session.ts send <keys> [--wait-for <text>] [--quiet-ms N]\n' +
        '  session.ts screen\n' +
        '  session.ts stop\n' +
        '\n' +
        'Screens: ' + Object.keys(NAV).join(', '),
      );
      process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
