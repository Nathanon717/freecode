import { spawnSync, spawn } from 'child_process';
import type { Interface } from 'readline';
import chalk from 'chalk';
import { runRawPicker } from '../cli/raw-picker.js';
import { getScreenBuffer } from '../util/screen-buffer.js';
import { teardownFooterUI } from '../cli/terminal-ui.js';

function buildDiagnosisPrompt(screenContent: string, userMessage: string): string {
  const parts = [
    'You are a debugging assistant for freecode, a TypeScript CLI coding agent. The user encountered a problem. Below is their recent terminal output. Diagnose what went wrong and give concrete, actionable steps to resolve it. Be direct and concise.',
    '',
    '--- TERMINAL OUTPUT ---',
    screenContent || '(no terminal output captured)',
    '--- END ---',
  ];
  if (userMessage) parts.push('', `User note: ${userMessage}`);
  return parts.join('\n');
}

async function callClaudeCLI(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', prompt], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('close', (code: number | null) => {
      if (code !== 0) reject(new Error(stderr.trim() || `claude exited with status ${code}`));
      else resolve(stdout.trim());
    });
    child.on('error', reject);
  });
}

type HelpAction = 'fix' | 'dismiss';

async function showActionPicker(rl: Interface): Promise<HelpAction> {
  let selected: HelpAction = 'fix';
  return runRawPicker<HelpAction>(rl, {
    skipScrollClear: true,
    render() {
      const fix = selected === 'fix' ? chalk.inverse('> Fix with Claude Code') : '  Fix with Claude Code';
      const dismiss = selected === 'dismiss' ? chalk.inverse('> Dismiss') : '  Dismiss';
      return ['', '  What would you like to do?', `  ${fix}`, `  ${dismiss}`, ''];
    },
    onKey(key, redraw, close) {
      if (key === '\x1b') { close('dismiss'); return; }
      if (key === '\r' || key === '\n') { close(selected); return; }
      if (key === '\x1b[A' || key === 'k') { selected = 'fix'; redraw(); return; }
      if (key === '\x1b[B' || key === 'j') { selected = 'dismiss'; redraw(); return; }
    },
  });
}

function launchClaudeCodeFix(fixPrompt: string): void {
  teardownFooterUI();
  console.log(chalk.cyan('\nLaunching Claude Code to apply the fix...\n'));
  spawnSync('claude', [fixPrompt], { stdio: 'inherit' });
  console.log(chalk.dim('\nClaude Code session ended. Run `freecode` to start a fresh session.'));
  process.exit(0);
}

export async function runClaudeHelpCommand(
  rl: Interface,
  userMessage: string,
): Promise<void> {
  if (!process.stdin.isTTY) {
    console.log(chalk.dim('/claude is only available in interactive mode.'));
    return;
  }

  const screen = getScreenBuffer();

  console.log(chalk.cyan('Asking Claude for a diagnosis...'));

  let diagnosis: string;
  try {
    diagnosis = await callClaudeCLI(buildDiagnosisPrompt(screen, userMessage));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`Failed to contact Claude: ${msg}`));
    return;
  }

  const divider = chalk.cyan('─'.repeat(Math.min(52, process.stdout.columns || 80)));
  console.log('');
  console.log(chalk.bold.cyan('Claude Diagnosis'));
  console.log(divider);
  console.log(diagnosis);
  console.log(divider);
  console.log('');

  const action = await showActionPicker(rl);
  if (action === 'dismiss') return;

  const fixPrompt = `I was using freecode (a CLI coding agent) and Claude diagnosed the following issue:\n\n${diagnosis}\n\nPlease apply the suggested fix.`;
  launchClaudeCodeFix(fixPrompt);
}
