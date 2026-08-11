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
| `npm run intent-drift` | `tsx scripts/diagnostics/intent-drift.ts` |
| `npm run lint` | `eslint src tests scripts --cache` |
| `npm run lint:fix` | `eslint src tests scripts --cache --fix` |
| `npm run map` | `tsx scripts/docgen/map-query.ts` |
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

## Subcommands

- `undo`: Restore the project to the snapshot freecode took before this session's first write. See [Undo](#undo-freecode-undo). Resolved from the first argument, before every flag is parsed.

## CLI Flags

**A flag that takes a value takes the very next argument** — `-p`, `--model`, and `--script`
each own the token directly after them, and other flags go before or after that pair. Both of
these are the same command:

```bash
freecode -p "<prompt>" --stats --model zen:big-pickle
freecode --stats --model zen:big-pickle -p "<prompt>"
```

Nothing is accepted silently. A value that is itself a flag (`-p --stats "<prompt>"` — the
prompt is no longer where `-p` looks), a flag not listed below (`-m`; the long form
`--model` is the only spelling), and a bare argument no flag claimed are each rejected by
name with exit code 1. Quoting is the shell's job and the quotes never reach freecode — they
exist so a multi-word prompt arrives as *one* argument.

- `-p "<prompt>"`: Run one non-interactive turn and print the final response to stdout. See [Headless prompt mode](#headless-prompt-mode--p).
- `--stats`: With `-p`, print one stderr line of cost/timing info after the turn. Ignored without `-p`.
- `--edit`: With `-p`, offer the write tools (`create`, `edit`, `shell_exec`) instead of running read-only. A no-op without `-p`: interactive and `--script` sessions already have those tools, and Ctrl+R is what takes them away.
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

- Read-only by default: `read`, `grep`, `list_dir`. Add `--edit` for the write half.
- Never sub-agents. `spawn_agent` is absent in both modes: a headless turn that fans
  out spends whole sub-turns nobody is watching.
- No confirmation prompts — there is nothing to confirm on.
- Free models only. It sets `FREECODE_FREE_ONLY=1` on itself, so a paid model is
  refused with a message naming the flag rather than silently billing. Pick the model
  with `--model` or `FREECODE_MODEL`; it uses the configured default otherwise.
- Bounded at 50 tool calls so an unattended run cannot loop forever.
  `FREECODE_MAX_TOOL_CALLS` overrides it — the same variable `--script` mode reads
  (where it defaults to 10), so an exported value applies to both.

**Editing (`--edit`)**

```bash
freecode -p "add a docstring to the exported function in src/util/foo.ts" --edit
```

Turns off read-only for the run, so the turn gets `create`, `edit`, and `shell_exec`
on top of the read tools. `spawn_agent` stays absent — editing is not fan-out.

There is still no confirmation channel, so **writes and shell commands run unattended**
in the working directory the CLI was launched from. The 50-call budget is the only
stop; give it a scoped prompt and a workspace you can `git diff`.

`--edit` does not change anything else about `-p`: still free models only, still one
turn, still nothing but the final answer on stdout.

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

## Undo (`freecode undo`)

```bash
freecode undo           # restore the most recent snapshot
freecode undo --list    # every snapshot, newest first, with what changed since each
freecode undo <id>      # restore one by id
```

**Nobody has to arm it.** Immediately before the first `create`, `edit`, or `shell_exec` of
a process — interactive, `--script`, or `-p --edit` alike — freecode snapshots the project
into a bare git repo of its own under `$FREECODE_HOME/snapshots/`. A turn that only reads
costs nothing; the snapshot is taken lazily, once, and captures pre-agent state exactly.

The shadow repo lives outside the project and never touches the user's own repo: no refs, no
objects, no index-lock contention, and nothing to clean up if freecode is killed mid-run. It
works in directories that are not git repos at all.

A restore puts back working files, the exact staged/unstaged split, and — when a rogue
command moved it — the branch's pre-run commit. The first `git status` after an undo
re-hashes, because the restored index carries stale stat data.

`undo` does not need to be run from the directory freecode was launched in. It walks up from
the current directory (never past the enclosing repo) to find the snapshots, and says which
root it used. If the snapshots belong to a directory *below* you instead, it names it.

**Cost.** The first snapshot in a project writes the tracked tree into a fresh object store —
a few seconds on a repo this size, once. Every session after that is about a second, and a
session that never writes pays nothing at all.

**What it does not cover:**

- **Files ignored by `.gitignore`.** They never enter a snapshot and are never restored.
  This is what keeps snapshots cheap. `undo` says so when it runs.
- **The project's own `.git`.** Deleting it loses commit history, branches, and reflog, which
  no worktree snapshot can return. That is prevented rather than recovered: writes and
  deletes targeting `.git/` are refused outright by `create`, `edit`, and `shell_exec`, and
  the refusal is not something the model can confirm its way past.

**Without a `git` binary** there is no net: the failure is logged, and the write proceeds
unprotected rather than being blocked. Refusing to work because the safety net is missing
inverts the point of having one. `freecode undo` itself exits 1 and says so.

Retention is the newest 20 snapshots per project; older refs are deleted, which is what lets
git reclaim the objects. `--list` prints the `--git-dir` incantation for inspecting them by
hand — they are deliberately invisible to `git log` in the project.
