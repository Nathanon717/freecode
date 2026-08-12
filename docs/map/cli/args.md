# src/cli/args.ts — CLI Argument Contract

<!-- BEGIN GENERATED MAP INTENT -->
## Role

The entry point's argv contract in one place — every flag freecode accepts, which of
them take a value, and one left-to-right walk that refuses any token the table does not
account for. Pure and dependency-free, so `src/index.ts` can run it before it loads
anything heavy.

## Read When

- Adding, removing, or renaming a CLI flag, or changing whether it takes a value.
- A flag or a prompt reached the process and was silently ignored instead of rejected.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Whether `token` is a process-level flag, and whether it consumes the argument after it.
 *
 * For the subcommand parsers, which are dispatched off raw argv *before* the walk below
 * ever runs and so still see flags aimed at the process rather than at them. They skip
 * what this claims and reject everything else by name, which is only single-sourced —
 * rather than a second copy of the table, drifting — because it is answered from here.
 */
processFlag(token: string): { takesValue: boolean; } | undefined

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
validateCliArgs(args: readonly string[]): string | null
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`cli/checkpoint.ts`](checkpoint.md) ×1, [`index.ts`](../index.md) ×1

## Tests

`tests/cli/args.test.ts`.

## Budget

69 / 500 lines (431 to spare).
<!-- END GENERATED MAP FACTS -->

## Why It Exists

`freecode -p --stats -m X "prompt"` used to exit 0 with a confident answer to the prompt
`--stats`. Every scan in [../index.md](../index.md) was `indexOf`-based, so a token the entry
point did not go looking for was simply never seen: `-p` took `--stats` as its value, `-m`
(no such flag — `--model` is the only spelling) was dropped whole, and the real prompt was a
positional the parser had no concept of. Three silent drops in one command. See
`docs/bug log/11-08-2026g.md`.

So this module exists to make "no argument goes unaccounted for" a property of one walk
rather than a habit spread across call sites. It is pure and imports nothing, because
`src/index.ts` runs it before it loads the `ai` SDK graph — an invalid command line must
still exit in milliseconds.

**Scope: the main command line only.** `src/index.ts` resolves the `checkpoint` verb from
`args[0]` and returns *before* this walk, so a subcommand's own arguments are parsed by the
subcommand. [checkpoint.md](checkpoint.md) applies the same rule there — every token
accounted for or named in an error — which is why `processFlag()` is exported: argv on that
path still carries flags aimed at the process, and the subcommand has to be able to tell
those from a typo aimed at it. It asks this table rather than keeping a second copy that
would drift out of step the next time a flag is added above.

## Behavior

Three rejections, each naming what it found:

| Input | Rejected as |
| --- | --- |
| `-p` / `--model` / `--script` with no next token | *requires a … argument* |
| `-p --stats "ask"` — value slot holds a known flag | *…, but the next argument is the flag `--stats`* |
| `-m zen:big-pickle` | *Unknown flag: -m* + the valid list |
| `-p "ask" and more` | *Unexpected argument: "and more"* |

The value-slot check is gated on **the flag table**, not on a leading `-`. That is the
difference between rejecting an ambiguity and rejecting a legitimate prompt: `-p "--stats is
what?"` still runs, and a test pins it.

Because the walk guarantees no flag's value is itself a flag, the `indexOf` dispatch left in
`src/index.ts` is safe by construction — `indexOf('--model')` can no longer match the
`--model` sitting in another flag's value slot and read the wrong side of the pair.

## Adding a flag

Add it to `FLAGS` in the same edit that teaches `src/index.ts` to act on it, then document it
in `docs/commands.md`. A flag the table does not name is rejected, so the entry point cannot
quietly grow one — which is the point.
