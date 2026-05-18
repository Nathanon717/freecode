import chalk from 'chalk';

const SLASH_COMMANDS = ['/clear', '/config', '/eval', '/help', '/keys', '/model', '/resume', '/test'];

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
  return SLASH_COMMANDS.filter(cmd => fuzzyMatch(cmd.slice(1), query));
}

export function getCommandCompletion(input: string): string | null {
  if (!input.startsWith('/')) return null;
  const normalized = input.toLowerCase();
  if (normalized === '/') return null;

  const exact = SLASH_COMMANDS.find(cmd => cmd === normalized);
  if (exact) return null;

  const prefixMatch = SLASH_COMMANDS.find(cmd => cmd.startsWith(normalized));
  if (prefixMatch) return prefixMatch;

  return getRawFilteredCommands(input)[0] ?? null;
}

export function getFilteredCommands(input: string): string[] {
  const commands = getRawFilteredCommands(input);
  const completion = getCommandCompletion(input);
  if (!completion) return commands;

  return commands.filter(cmd => cmd !== completion);
}

export function showHelp() {
  console.log(chalk.bold('Available commands'));
  console.log(chalk.gray('  /clear   Clear screen and chat history'));
  console.log(chalk.gray('  /config  Open interactive config'));
  console.log(chalk.gray('  /help    Show this help'));
  console.log(chalk.gray('  /keys    Show API key status'));
  console.log(chalk.gray('  /model   Show or set model'));
  console.log(chalk.gray('  /resume  Resume last session'));
  console.log(chalk.gray('  /test    Show and run non-LLM verification scenarios'));
  console.log(chalk.gray('  /eval    Show and run LLM eval scenarios'));
}
