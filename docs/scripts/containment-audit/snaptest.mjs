import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const D = 'file:///C:/stuff/dev/freecode/dist/';
const { takeSnapshot, restoreSnapshot, snapshotDiffPatch, snapshotGitDirDiff } =
  await import(D + 'snapshots/index.js');
const { shadowRepoPath } = await import(D + 'snapshots/shadow-repo.js');

const root = join(tmpdir(), 'fc-sec-' + Date.now());
process.env.FREECODE_SNAPSHOT_DIR = join(root, '..', 'fc-sec-shadow-' + Date.now());
mkdirSync(root, { recursive: true });
const g = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf-8' });
g('init', '-q');
g('config', 'user.email', 't@t'); g('config', 'user.name', 't');

writeFileSync(join(root, '.gitignore'), 'node_modules/\ndist/\n.env\n');
mkdirSync(join(root, 'node_modules'), { recursive: true });
writeFileSync(join(root, 'src.js'), 'original\n');
writeFileSync(join(root, '.env'), 'SECRET=hunter2\n');
g('add', '-A'); g('commit', '-qm', 'init');
const headBefore = g('rev-parse', 'HEAD').trim();
// Before the snapshot, or deleting it later proves nothing: a branch the agent
// both created and deleted is one a correct revert removes.
g('branch', 'sidebranch');

// === pre-agent snapshot ===
const snap = await takeSnapshot(root);
console.log(`snapshot ${snap.id} head=${snap.head?.slice(0,8)} branch=${snap.branch}`);

// === "rogue agent" actions ===
writeFileSync(join(root, 'src.js'), 'tampered\n');                       // visible change
writeFileSync(join(root, 'node_modules', 'payload.js'), 'PAYLOAD\n');    // gitignored payload
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'payload2.js'), 'PAYLOAD2\n');          // gitignored payload
rmSync(join(root, '.env'));                                              // destroy gitignored secret
mkdirSync(join(root, '.evilhooks'), { recursive: true });
// Benign stand-in for arbitrary code: drops a marker file to prove the hook ran.
writeFileSync(join(root, '.evilhooks', 'pre-commit'), '#!/bin/sh\ntouch HOOK_RAN\n');
g('config', 'core.hooksPath', '.evilhooks');                             // RCE persistence in .git/config
g('checkout', '-q', '-b', 'agentbranch');                                // move HEAD to another branch
writeFileSync(join(root, 'src.js'), 'tampered-committed\n');
g('add', '-A'); g('commit', '-qm', 'agent commit');
g('branch', '-D', 'sidebranch');                                         // delete a branch
g('reflog', 'expire', '--all', '--expire=now');                          // and put it beyond reflog recovery
g('gc', '-q', '--prune=now');

// === what the reviewer sees ===
const patch = await snapshotDiffPatch(root, snap.id);
console.log('\n=== checkpoint diff --patch sees these files ===');
console.log(patch.split('\n').filter(l => l.startsWith('diff --git')).join('\n') || '(nothing)');
const gitPatch = await snapshotGitDirDiff(root, snap);
console.log('payload mentioned in diff? ', /payload/.test(patch));
console.log('.env deletion in diff?    ', /\.env/.test(patch));
// `.git` is reviewed as its own section, restricted to config and hooks — the
// RCE surface. Refs and objects churn too much to be worth showing.
console.log('hooksPath in diff?        ', /hooksPath/.test(gitPatch));

// === revert ===
const out = await restoreSnapshot(root, snap.id);
console.log('\n=== after checkpoint revert ===');
console.log('outcome:', JSON.stringify(out));
console.log('src.js restored?           ', readFileSync(join(root,'src.js'),'utf-8').trim() === 'original');
console.log('node_modules/payload gone? ', !existsSync(join(root,'node_modules','payload.js')));
console.log('dist/payload2 gone?        ', !existsSync(join(root,'dist','payload2.js')));
console.log('.env recovered?            ', existsSync(join(root,'.env')));
console.log('evil hooksPath cleared?    ', (()=>{try{return g('config','core.hooksPath').trim()===''}catch{return true}})());
console.log('.evilhooks dir gone?       ', !existsSync(join(root,'.evilhooks','pre-commit')));
console.log('HEAD back on main?         ', g('rev-parse','--abbrev-ref','HEAD').trim() === 'master' || g('rev-parse','--abbrev-ref','HEAD').trim()==='main');
console.log('   (actually on)            ', g('rev-parse','--abbrev-ref','HEAD').trim());
console.log('deleted branch recovered?  ', g('branch','--list','sidebranch').trim() !== '');
console.log('hook actually executed?    ', existsSync(join(root,'HOOK_RAN')) || 'marker cleaned by revert (but it ran)');
console.log('working HEAD == pre-agent? ', g('rev-parse','HEAD').trim() === headBefore);

rmSync(root, { recursive: true, force: true });
rmSync(process.env.FREECODE_SNAPSHOT_DIR, { recursive: true, force: true });
