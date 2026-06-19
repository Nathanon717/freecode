#!/usr/bin/env node
// Links this package globally so `freecode` is on PATH.
// Uses --ignore-scripts to prevent recursive postinstall invocations,
// which cause OOM on memory-constrained environments (e.g. Termux/PRoot-Distro).
'use strict';
const { spawnSync } = require('child_process');

const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';

console.log('[ensure-link] Linking freecode globally...');
const result = spawnSync(npm, ['link', '--ignore-scripts'], {
  stdio: 'inherit',
  shell: false,
});

if (result.status !== 0) {
  console.warn('[ensure-link] npm link failed — run `npm link` manually to put `freecode` on PATH.');
}
