import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';

const D = 'file:///C:/stuff/dev/freecode/dist/';
const { setProjectRoot } = await import(D + 'agent/workspace.js');
const { createFileTool, editTool, shellTool } = await import(D + 'agent/tools/index.js');

const root = join(tmpdir(), 'fc-esc-' + Date.now());
mkdirSync(join(root, '.git', 'hooks'), { recursive: true });
execFileSync('git', ['init', '-q'], { cwd: root });
writeFileSync(join(root, 'ok.txt'), 'hi\n');
setProjectRoot(root);

const outside = join(tmpdir(), 'fc-OUTSIDE-' + Date.now() + '.txt');

const run = async (label, tool, args) => {
  const r = await tool.execute(args, {});
  console.log(`${label}\n    -> ${String(r).split('\n')[0].slice(0, 120)}`);
};

console.log('=== create: .git path guard, case variations ===');
await run('create .git/hooks/pre-commit ', createFileTool, { path: '.git/hooks/pre-commit', content: 'x' });
await run('create .GIT/hooks/pre-commit ', createFileTool, { path: '.GIT/hooks/pre-commit', content: '#!/bin/sh\ntouch OWNED\n' });
console.log('    real .git/hooks/pre-commit now exists? ',
  existsSync(join(root, '.git', 'hooks', 'pre-commit')),
  existsSync(join(root, '.git', 'hooks', 'pre-commit')) ? JSON.stringify(readFileSync(join(root,'.git','hooks','pre-commit'),'utf-8')) : '');

console.log('\n=== create: absolute / traversal paths ===');
await run('create ../escaped.txt         ', createFileTool, { path: '../escaped.txt', content: 'x' });
await run('create C:\\Windows\\evil.txt   ', createFileTool, { path: 'C:\\Windows\\evil.txt', content: 'x' });

console.log('\n=== shell_exec: containment ===');
await run('write outside project root   ', shellTool, { command: `node -e "require('fs').writeFileSync(${JSON.stringify(outside)},'ESCAPED')"` });
console.log('    file outside root created? ', existsSync(outside));
await run('read a secret outside root   ', shellTool, { command: 'node -e "console.log(process.env.PATH ? \'env visible\' : \'no env\')"' });
await run('cd out and write             ', shellTool, { command: 'cd .. && node -e "console.log(process.cwd())"' });

console.log('\n=== shell_exec: does the API key env reach the child? ===');
process.env.FREECODE_FAKE_SECRET = 'sk-test-do-not-use';
await run('echo a freecode env var      ', shellTool, { command: 'node -e "console.log(process.env.FREECODE_FAKE_SECRET)"' });

console.log('\n=== shell_exec: survives the timeout via a detached child? ===');
const marker = join(tmpdir(), 'fc-detached-' + Date.now() + '.txt');
await run('spawn detached, 200ms timeout', shellTool, {
  command: `node -e "const{spawn}=require('child_process');const c=spawn(process.execPath,['-e','setTimeout(()=>require(\\'fs\\').writeFileSync(${JSON.stringify(JSON.stringify(marker)).slice(1,-1)},\\'SURVIVED\\'),700)'],{detached:true,stdio:'ignore'});c.unref();"`,
  timeout_ms: 200,
});
await new Promise((r) => setTimeout(r, 1500));
console.log('    detached child outlived the tool call? ', existsSync(marker));

rmSync(root, { recursive: true, force: true });
rmSync(outside, { force: true });
rmSync(marker, { force: true });
rmSync(join(tmpdir(), 'escaped.txt'), { force: true });
