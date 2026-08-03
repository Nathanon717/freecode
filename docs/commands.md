# Commands

Reference docs for npm scripts and slash commands.

## NPM Scripts

This table is generated from `package.json`.

<!-- BEGIN GENERATED NPM SCRIPTS -->
| Script | Command |
| --- | --- |
| `npm run build` | `tsc` |
| `npm run coverage` | `vitest run --coverage` |
| `npm run dead-code` | `tsx scripts/diagnostics/dead-code.ts` |
| `npm run dev` | `tsx src/index.ts` |
| `npm run docs:generate` | `tsx scripts/docgen/sync-docs.ts` |
| `npm run docs:refresh-models` | `tsx scripts/docgen/refresh-models.ts` |
| `npm run lint` | `eslint src tests scripts --cache` |
| `npm run lint:fix` | `eslint src tests scripts --cache --fix` |
| `npm run map-drift` | `tsx scripts/diagnostics/map-drift.ts` |
| `npm run postinstall` | `node scripts/install/ensure-pty.cjs && node scripts/install/pin-conpty.cjs && node scripts/install/ensure-link.cjs` |
| `npm run pty` | `cross-env MSYS_NO_PATHCONV=1 tsx tests/harness/pty/session.ts` |
| `npm run pty:test` | `cross-env FREECODE_PTY=1 vitest run tests/harness/pty/driver.test.ts tests/harness/pty/session.test.ts` |
| `npm run rate-limit-probe` | `tsx scripts/diagnostics/rate-limit-probe.ts` |
| `npm run start` | `node dist/index.js` |
| `npm run test` | `tsx scripts/pipeline/test.ts` |
| `npm run test-all-models` | `tsx scripts/diagnostics/test-all-models.ts` |
| `npm run test:e2e` | `tsx tests/harness/run-e2e.ts --no-build` |
| `npm run time` | `tsx scripts/pipeline/time.ts` |
<!-- END GENERATED NPM SCRIPTS -->

## Slash Commands

This table is generated from `src/cli/slash-commands.ts`.

<!-- BEGIN GENERATED SLASH COMMANDS -->
| Command | Description |
| --- | --- |
| `/clear` | Clear screen and chat history |
| `/config` | Open interactive config |
| `/eval` | Show and run LLM eval scenarios |
| `/help` | Show this help |
| `/status` | Show API key status, DB sync, and Doppler |
| `/model` | Show or set model |
| `/tools` | List callable tools |
| `/renderer` | Show a hardcoded demo transcript through the live renderer |
<!-- END GENERATED SLASH COMMANDS -->

## CLI Flags

- `-p "<prompt>"`: Run one non-interactive turn and print the final response to stdout. See [Headless prompt mode](#headless-prompt-mode--p).
- `--stats`: With `-p`, print one stderr line of cost/timing info after the turn. Ignored without `-p`.
- `--script <file>`: Run scripted input from a file instead of the interactive TUI. Cannot be combined with `-p`.
- `--model <provider:model>`: Override `FREECODE_MODEL` and config default model for the current process.
- `-log`: Enable diagnostic logging.

## Headless prompt mode (`-p`)

```bash
freecode -p "which module owns the retry backoff? answer with the file path"
answer=$(freecode -p "list the exported names in src/agent/loop.ts")
```

Meant for scripting and for LLM callers — an agent shells out to freecode, and reads
the answer back from stdout.

**Output contract**

- stdout carries the final response and nothing else. The tool transcript is silenced,
  not redirected, so `$(...)` captures a clean answer.
- The response is the model's *final* message, not its running commentary. A turn that
  said "let me look at that" before reading a file prints only what it concluded.
- Failures print to stderr and exit `1`; success exits `0`. Partial output still prints
  when a turn errored after saying something.

**What it can do**

- Read-only: `read`, `grep`, `list_dir`. No writes, no shell, and no sub-agents.
- No confirmation prompts — there is nothing to confirm on.
- Free models only. It sets `FREECODE_FREE_ONLY=1` on itself, so a paid model is
  refused with a message naming the flag rather than silently billing. Pick the model
  with `--model` or `FREECODE_MODEL`; it uses the configured default otherwise.
- Bounded at 50 tool calls so an unattended run cannot loop forever.
  `FREECODE_MAX_TOOL_CALLS` overrides it — the same variable `--script` mode reads
  (where it defaults to 10), so an exported value applies to both.

**Cost/timing stats (`--stats`)**

Add `--stats` to print one stderr line after the turn: model, context tokens, output
tokens, total tokens, tool-call count, and wall time. stdout is unaffected, so
`$(...)` still captures a clean answer. Printed even when the turn errors, since a
failed or rate-limited turn still spent tokens.

```bash
freecode -p "..." --stats
# stdout: <answer>
# stderr: stats: model=groq:llama-3.3-70b ctx=1234 output=56 total=1290 toolCalls=2 wallTimeMs=843
```
