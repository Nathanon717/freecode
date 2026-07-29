#!/usr/bin/env node
// Pins the ConPTY host that node-pty loads on Windows to 1.23.251008001.
//
// node-pty >= 1.2.0-beta.12 vendors ConPTY 1.25.260303002, which takes ~1-1.5s
// to hand a window-size change to the child where 1.23 takes 15ms, and does not
// always deliver it under load at all. That makes every `tty-resize-*` scenario
// flaky. The node-pty version itself must stay >= beta.13, which is where the
// segfault fix lives (a mutex around the global `ptyHandles` vector in
// conpty.cc) — so the two are pinned independently. See
// docs/bug log/29-07-2026f.md.
//
// The host is a plain pair of files loaded by path: `LoadConptyDll` in
// node-pty's conpty.cc resolves `conpty\conpty.dll` relative to the *loaded*
// conpty.node. 1.23 comes from the `conpty-pinned` devDependency (an alias for
// node-pty@1.1.0) so no binaries live in this repo. Only that package's
// `third_party/` payload is consumed — it ships in the tarball, so whether the
// alias's own native addon was fetched or built makes no difference here.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PTY_DIR = path.join(ROOT, 'node_modules', 'node-pty');
const SOURCE_PKG = path.join(ROOT, 'node_modules', 'conpty-pinned');
const WANTED = '1.23.251008001';
const FILES = ['conpty.dll', 'OpenConsole.exe'];
/** Written next to the pinned files so the TTY harness can warn if the pin is gone. */
const MARKER = `.pinned-${WANTED}`;

if (process.platform !== 'win32') process.exit(0);

const warn = (msg) => {
  console.warn(`[pin-conpty] ${msg}`);
  console.warn('[pin-conpty] TTY resize scenarios will be flaky until this is resolved.');
  process.exit(0); // never fail an install over this
};

if (!fs.existsSync(PTY_DIR)) process.exit(0); // node-pty not installed yet
if (!fs.existsSync(SOURCE_PKG)) warn(`missing devDependency "conpty-pinned" — cannot pin ConPTY ${WANTED}.`);

const arch = process.env.npm_config_arch || process.arch;
const from = path.join(SOURCE_PKG, 'third_party', 'conpty', WANTED, `win10-${arch}`);
if (!fs.existsSync(from)) warn(`no ConPTY ${WANTED} for arch ${arch} at ${from}.`);

// Every directory holding a conpty.node is a place node-pty may resolve the
// host from; `prebuilds/` is the live one on a prebuilt install and
// `build/Release/` on a locally compiled one. Keep both consistent so which one
// wins can never change the outcome.
const targets = [
  path.join(PTY_DIR, 'prebuilds', `win32-${arch}`, 'conpty'),
  path.join(PTY_DIR, 'build', 'Release', 'conpty'),
].filter((dir) => fs.existsSync(dir));

if (!targets.length) warn('found no conpty host directory inside node-pty.');

for (const dir of targets) {
  for (const file of FILES) {
    const src = path.join(from, file);
    if (!fs.existsSync(src)) warn(`missing ${file} in ${from}.`);
    fs.copyFileSync(src, path.join(dir, file));
  }
  fs.writeFileSync(
    path.join(dir, MARKER),
    `ConPTY pinned to ${WANTED} by scripts/install/pin-conpty.cjs\n`,
    'utf-8',
  );
}

console.log(`[pin-conpty] ConPTY ${WANTED} pinned in ${targets.length} location(s).`);
