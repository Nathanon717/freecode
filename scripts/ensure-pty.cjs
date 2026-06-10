#!/usr/bin/env node
// Rebuilds node-pty with the system compiler when the prebuilt binary doesn't
// load. Needed on Linux environments (e.g. Ubuntu on Termux) where the default
// cc on PATH is the Android NDK clang, which produces a binary that links
// against Bionic libc instead of glibc.
'use strict';
const { spawnSync } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PTY_DIR = path.join(ROOT, 'node_modules', 'node-pty');

if (!existsSync(PTY_DIR)) process.exit(0); // not installed yet

try {
  require(path.join(PTY_DIR, 'lib', 'index.js'));
  process.exit(0); // already works
} catch {}

if (process.platform !== 'linux') {
  console.warn('[ensure-pty] node-pty failed to load on non-Linux platform — skipping auto-rebuild.');
  process.exit(0);
}

const gcc = '/usr/bin/gcc';
const gxx = '/usr/bin/g++';

if (!existsSync(gcc)) {
  console.warn('[ensure-pty] node-pty native module unavailable. To fix: sudo apt-get install gcc g++');
  process.exit(0);
}

console.log('[ensure-pty] Rebuilding node-pty with system gcc...');
const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['node-gyp', 'rebuild', '--directory', PTY_DIR],
  {
    cwd: ROOT,
    env: { ...process.env, CC: gcc, CXX: gxx },
    stdio: 'inherit',
    shell: false,
  },
);

if (result.status !== 0) {
  console.error('[ensure-pty] Rebuild failed — TTY scenarios will not work.');
}
