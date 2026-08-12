/**
 * @role The entry point's argv contract in one place — every flag freecode accepts, which of
 * them take a value, and one left-to-right walk that refuses any token the table does not
 * account for. Pure and dependency-free, so `src/index.ts` can run it before it loads
 * anything heavy.
 *
 * @readwhen
 * - Adding, removing, or renaming a CLI flag, or changing whether it takes a value.
 * - A flag or a prompt reached the process and was silently ignored instead of rejected.
 */

/** What a flag needs after it. `null` marks a boolean flag that consumes nothing. */
type FlagSpec = {
  /** Stands in for the value in the suggested command line of an error. */
  readonly placeholder: string;
  /** Leading clause of both "missing" and "that's a flag" errors. */
  readonly requires: string;
} | null;

/**
 * Every flag `src/index.ts` understands. A flag absent from this table is rejected by name,
 * so teaching the entry point a new one means adding it here in the same edit.
 */
const FLAGS: ReadonlyMap<string, FlagSpec> = new Map<string, FlagSpec>([
  ['-p', { placeholder: '"<prompt>"', requires: '-p requires a prompt argument' }],
  ['--model', { placeholder: '<provider:model>', requires: '--model requires a provider:model argument' }],
  ['--script', { placeholder: '<file>', requires: '--script requires a file path argument' }],
  ['--stats', null],
  ['--edit', null],
  ['-log', null],
]);

const FLAG_LIST = [...FLAGS.keys()].join(', ');

/**
 * Whether `token` is a process-level flag, and whether it consumes the argument after it.
 *
 * For the subcommand parsers, which are dispatched off raw argv *before* the walk below
 * ever runs and so still see flags aimed at the process rather than at them. They skip
 * what this claims and reject everything else by name, which is only single-sourced —
 * rather than a second copy of the table, drifting — because it is answered from here.
 */
export function processFlag(token: string): { takesValue: boolean } | undefined {
  if (!FLAGS.has(token)) return undefined;
  return { takesValue: FLAGS.get(token) !== null };
}

/**
 * Validates `args` — argv past the executable, with any subcommand verb already resolved —
 * and returns the first problem as a printable message, or `null` when every token is
 * accounted for. Three ways to be wrong, all of which used to pass silently and run a turn
 * on the wrong input:
 *
 * - a value-taking flag whose value is missing, **or is itself a flag** (`-p --stats "ask"`
 *   ran with the literal prompt `--stats`);
 * - an unknown flag (`-m gpt` was dropped whole, leaving the default model);
 * - a bare argument no flag claimed (the real prompt, left stranded after the above).
 */
export function validateCliArgs(args: readonly string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!FLAGS.has(arg)) {
      return arg.startsWith('-')
        ? `Unknown flag: ${arg}. Valid flags: ${FLAG_LIST}`
        : `Unexpected argument: ${JSON.stringify(arg)}. A prompt is the argument directly after -p, quoted as one word: freecode -p "<prompt>". Valid flags: ${FLAG_LIST}`;
    }
    const spec = FLAGS.get(arg);
    if (!spec) continue;
    const value = args[i + 1];
    if (!value) return spec.requires;
    // The value is taken positionally, so a flag standing where it belongs is an ambiguity,
    // never an argument. Rejecting the whole flag table rather than any token starting with
    // `-` keeps a prompt that merely opens with a dash usable.
    if (FLAGS.has(value)) {
      return `${spec.requires}, but the next argument is the flag ${value}. Put the value directly after ${arg}: freecode ${arg} ${spec.placeholder} ${value}`;
    }
    i++;
  }
  return null;
}
