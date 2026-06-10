import chalk from 'chalk';

export interface SlashCommandInfo {
  command: string;
  description: string;
}

export const SLASH_COMMANDS: SlashCommandInfo[] = [
  { command: '/clear', description: 'Clear screen and chat history' },
{ command: '/config', description: 'Open interactive config' },
  { command: '/eval', description: 'Show and run LLM eval scenarios' },
  { command: '/help', description: 'Show this help' },
  { command: '/humaneval', description: 'Run HumanEval code-completion benchmark' },
  { command: '/keys', description: 'Show API key status' },
  { command: '/model', description: 'Show or set model' },
  { command: '/renderer', description: 'Show a hardcoded demo transcript through the live renderer' },
];

const SLASH_COMMAND_NAMES = SLASH_COMMANDS.map(({ command }) => command);

function fuzzyMatch(target: string, query: string): boolean {
  if (!query) return true;
  let qi = 0;
  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) qi++;
  }
  return qi === query.length;
}

function getRawFilteredCommands(input: string): string[] {
  if (!input.startsWith('/')) return [];
  const query = input.slice(1).toLowerCase();
  return SLASH_COMMAND_NAMES.filter(cmd => fuzzyMatch(cmd.slice(1), query));
}

export function getCommandCompletion(input: string): string | null {
  if (!input.startsWith('/')) return null;
  const normalized = input.toLowerCase();
  if (normalized === '/') return null;

  const exact = SLASH_COMMAND_NAMES.find(cmd => cmd === normalized);
  if (exact) return null;

  const prefixMatch = SLASH_COMMAND_NAMES.find(cmd => cmd.startsWith(normalized));
  if (prefixMatch) return prefixMatch;

  return getRawFilteredCommands(input)[0] ?? null;
}

export function getFilteredCommands(input: string): string[] {
  const commands = getRawFilteredCommands(input);
  const completion = getCommandCompletion(input);
  if (!completion) return commands.filter(cmd => cmd !== input.toLowerCase());

  return commands.filter(cmd => cmd !== completion);
}

export function showHelp() {
  console.log(chalk.bold('Available commands'));
  const commandWidth = Math.max(...SLASH_COMMANDS.map(({ command }) => command.length));
  for (const { command, description } of SLASH_COMMANDS) {
    console.log(chalk.gray(`  ${command.padEnd(commandWidth)}  ${description}`));
  }
}
