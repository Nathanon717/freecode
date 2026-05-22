import { describe, it, expect, afterEach } from 'vitest';
import { createPtyDriver } from './driver.js';
import type { PtyDriver } from './driver.js';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;

describe('createPtyDriver', () => {
  let driver: PtyDriver | undefined;

  afterEach(() => {
    driver?.kill();
    driver = undefined;
  });

  it('captures output in raw stream', async () => {
    driver = createPtyDriver({
      command: NODE,
      args: ['-e', 'process.stdout.write("READY\\n"); setInterval(()=>{}, 60000);'],
      cwd: __dirname,
      env: { ...process.env },
    });
    const found = await driver.waitForText('READY', 5000);
    expect(found).toBe(true);
    expect(driver.raw()).toContain('READY');
  }, 10000);

  it('snapshot returns visible text', async () => {
    driver = createPtyDriver({
      command: NODE,
      args: ['-e', 'console.log("SNAPSHOT_TEST"); setInterval(()=>{}, 60000);'],
      cwd: __dirname,
      env: { ...process.env },
    });
    await driver.waitForText('SNAPSHOT_TEST', 5000);
    await driver.settle(200);
    const snap = driver.snapshot().join('\n');
    expect(snap).toContain('SNAPSHOT_TEST');
  }, 10000);

  it('waitForText returns false when text never appears', async () => {
    driver = createPtyDriver({
      command: NODE,
      args: ['-e', 'setInterval(()=>{}, 60000);'],
      cwd: __dirname,
      env: { ...process.env },
    });
    const found = await driver.waitForText('NEVER_APPEARS_XYZ', 400);
    expect(found).toBe(false);
  }, 5000);

  it('transcript accumulates all output including scrollback', async () => {
    const lines = Array.from({ length: 30 }, (_, i) => `LINE_${i}`);
    const script = lines.map(l => `console.log("${l}");`).join('') + 'setInterval(()=>{}, 60000);';
    driver = createPtyDriver({
      command: NODE,
      args: ['-e', script],
      cwd: __dirname,
      env: { ...process.env },
      rows: 10,
    });
    await driver.waitForText('LINE_29', 5000);
    await driver.settle(200);
    const t = driver.transcript().join('\n');
    expect(t).toContain('LINE_0');
    expect(t).toContain('LINE_29');
  }, 15000);

  it('detects process exit', async () => {
    driver = createPtyDriver({
      command: NODE,
      args: ['-e', 'setTimeout(() => process.exit(0), 100);'],
      cwd: __dirname,
      env: { ...process.env },
    });
    const exited = await driver.waitExit(5000);
    expect(exited).toBe(true);
    expect(driver.isExited()).toBe(true);
  }, 10000);

  it('exitCode is available after process exits', async () => {
    driver = createPtyDriver({
      command: NODE,
      args: ['-e', 'process.exit(0);'],
      cwd: __dirname,
      env: { ...process.env },
    });
    await driver.waitExit(5000);
    expect(driver.isExited()).toBe(true);
    // exitCode() is non-null after exit; exact value may be wrapped by ConPTY on Windows
    expect(driver.exitCode()).not.toBeNull();
  }, 10000);

  it('kill terminates the process', async () => {
    driver = createPtyDriver({
      command: NODE,
      args: ['-e', 'setInterval(()=>{}, 60000);'],
      cwd: __dirname,
      env: { ...process.env },
    });
    await driver.waitQuiet(300, 2000);
    driver.kill();
    const exited = await driver.waitExit(5000);
    expect(exited).toBe(true);
    driver = undefined;
  }, 10000);

  it('send delivers keystrokes to the subprocess', async () => {
    // Use raw mode so ConPTY delivers characters immediately (no line buffering).
    // The subprocess writes a unique response for each byte received.
    const script = [
      'if(process.stdin.isTTY)process.stdin.setRawMode(true);',
      'process.stdin.resume();',
      "process.stdin.on('data',d=>process.stdout.write('K:'+d.toString('hex')+'\\n'));",
    ].join(' ');
    driver = createPtyDriver({
      command: NODE,
      args: ['-e', script],
      cwd: __dirname,
      env: { ...process.env },
    });
    await driver.waitQuiet(300, 2000);
    driver.send('A'); // hex 41
    const found = await driver.waitForText('K:41', 5000);
    expect(found).toBe(true);
  }, 15000);

  it('second kill is safe after process already exited', async () => {
    driver = createPtyDriver({
      command: NODE,
      args: ['-e', 'process.exit(0);'],
      cwd: __dirname,
      env: { ...process.env },
    });
    await driver.waitExit(5000);
    expect(() => driver!.kill()).not.toThrow();
    driver = undefined;
  }, 10000);
});
