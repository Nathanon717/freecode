#!/usr/bin/env tsx
/**
 * Persistent PTY session manager – lets an agent drive freecode interactively.
 *
 * Commands:
 *   session.ts start [--cols N] [--rows N]
 *       Spawns a freecode PTY daemon, prints SESSION_ID and the initial screen.
 *
 *   session.ts send <id> <keys> [<keys>...] [--wait-for <text>] [--quiet-ms N]
 *       Sends keystrokes to a running session, prints the resulting screen.
 *       Keys are raw strings; use shell ANSI-C quoting for control chars:
 *         Tab     $'\t'     Enter   $'\r'     Escape  $'\x1b'     Ctrl-C  $'\x03'
 *       Multiple key args are concatenated in order.
 *       Pass "-" as the keys arg to read from stdin — useful for slash-prefixed
 *       commands that MSYS would otherwise mangle:
 *         printf '/model' | npm run pty:session -- send <id> -
 *
 *   session.ts screen <id>
 *       Prints the current screen without sending any input.
 *
 *   session.ts stop <id>
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

async function cmdStart(cols: number, rows: number): Promise<void> {
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

  const res = await rpc(id, { type: 'screen' });
  console.log(`SESSION_ID=${id}`);
  printScreen(res.screen as string[], cols);
}

async function cmdSend(
  id: string,
  keys: string,
  opts: { waitFor?: string; quietMs?: number; cols: number },
): Promise<void> {
  // Allow keys to be read from stdin (pass "-" as the keys arg) so that
  // slash-prefixed commands like "/model" aren't mangled by MSYS path conversion.
  if (keys === '-') keys = readFileSync(0, 'utf8');
  const res = await rpc(id, { type: 'send', keys, waitFor: opts.waitFor, quietMs: opts.quietMs });
  if ('error' in res) { console.error('Error:', res.error); process.exit(1); }
  printScreen(res.screen as string[], opts.cols);
}

async function cmdScreen(id: string, cols: number): Promise<void> {
  const res = await rpc(id, { type: 'screen' });
  if ('error' in res) { console.error('Error:', res.error); process.exit(1); }
  printScreen(res.screen as string[], cols);
}

async function cmdStop(id: string): Promise<void> {
  await rpc(id, { type: 'stop' }).catch(() => {
    try { unlinkSync(flagPath(id)); } catch { /* already gone */ }
  });
  console.log('stopped');
}

// ── entry ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const raw = process.argv.slice(2);
  let cols = 80, rows = 24;
  let waitFor: string | undefined;
  let quietMs: number | undefined;
  const args: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    if      (raw[i] === '--cols'     && raw[i + 1]) cols    = parseInt(raw[++i], 10);
    else if (raw[i] === '--rows'     && raw[i + 1]) rows    = parseInt(raw[++i], 10);
    else if (raw[i] === '--wait-for' && raw[i + 1]) waitFor = raw[++i];
    else if (raw[i] === '--quiet-ms' && raw[i + 1]) quietMs = parseInt(raw[++i], 10);
    else args.push(raw[i]);
  }

  const [cmd, id, ...keyParts] = args;

  switch (cmd) {
    case '--server': return runServer(id, cols, rows);
    case 'start':   return cmdStart(cols, rows);
    case 'send':    return cmdSend(id, keyParts.join(''), { waitFor, quietMs, cols });
    case 'screen':  return cmdScreen(id, cols);
    case 'stop':    return cmdStop(id);
    default:
      console.error(
        'Usage:\n' +
        '  session.ts start [--cols N] [--rows N]\n' +
        '  session.ts send <id> <keys> [--wait-for <text>] [--quiet-ms N]\n' +
        '  session.ts screen <id>\n' +
        '  session.ts stop <id>',
      );
      process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
