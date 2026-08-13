# Plan: agent undo snapshots

> **The surface is now `freecode checkpoint` (`list` / `diff` / `revert`), not `freecode undo`.**
> This file keeps its original name and wording as the design record of the day it was
> written; the current contract is [commands.md](commands.md#checkpoint-freecode-checkpoint).

**Status:** **built.** All five implementation steps shipped; the user-facing contract now
lives in [commands.md](commands.md#undo-freecode-undo) and the mechanism in the map pages for
`src/snapshots/` and `src/agent/tools/git-guard.ts`. This file is kept as the design record —
the "Established facts" and "Rejected alternatives" sections are why the code looks the way it
does, and re-deriving them costs a session. Two deviations from the plan as written are noted
inline below (the hook's placement, and the snapshot id's discriminator).

> **One piece of the mechanism below has since been replaced.** The security audit that followed
> ([agent-containment-plan.md](agent-containment-plan.md)) found `.git` outside coverage entirely,
> so it is now snapshotted as a second work tree — and the `.git/index` byte-copy this file
> describes is gone, because the index comes back inside that tree. Everything written here about
> *why* an index copy was needed still explains what the replacement has to preserve. Current
> mechanism: [map/snapshots/gitdir.md](map/snapshots/gitdir.md).

## The problem

`freecode -p --edit` hands an unattended agent `create` / `edit` / `shell_exec` with ask
mode forced to `auto` (see `src/cli/headless-prompt.ts`, and its header comment). Before
that gets real use, a rogue or merely careless run must be cheaply reversible.

Two constraints from the user, both of which rule out the obvious answers:

1. **Not "always commit before calling an agent."** It usually won't be the right moment
   to commit.
2. **It must not depend on anyone remembering to arm it.** The net has to already be there
   when the disaster is discovered, whether or not it was anticipated.

So: recovery must be automatic, taken by freecode itself, and invocable after the fact.

## Scope decision

**Snapshot on the first write-tool call of any session** — interactive and `-p --edit`
alike — taken lazily, once per session. Chosen over "only `-p --edit`" and "every session
start" (user's call, this conversation).

Consequences: read-only turns cost nothing; an `--edit` run that never writes costs
nothing; interactive sessions get the same net for free. The snapshot is taken immediately
before the first mutation, so it captures pre-agent state exactly.

## Design: a shadow repo

A bare git repo outside the project, driven over the project directory:

```
git --git-dir=$SHADOW --work-tree=$PROJECT add -A                      # snapshot
git --git-dir=$SHADOW --work-tree=$PROJECT read-tree -u --reset <tree> # restore
```

It never touches the user's repo: no refs, no objects, no index-lock contention, no
interaction with their gc, and nothing to clean up if the process is killed mid-run. It
also works in directories that are not git repos at all.

### Location

`$FREECODE_HOME/snapshots/<basename>-<hash-of-abs-path>.git`, where `$FREECODE_HOME`
resolves via `getConfigDir()` (`src/config/index.ts:89`) to `~/.config/freecode` by
default.

- Using `$FREECODE_HOME` rather than a hardcoded home path keeps e2e runs and pty sessions
  writing snapshots into their own isolated temp dirs (`docs/e2e-testing.md`,
  `docs/pty-session.md`) instead of polluting the real config dir.
- The hash suffix is required: two checkouts sharing a basename would otherwise share one
  snapshot history.
- **Containment check at creation.** `$FREECODE_HOME` is an env var and the e2e/pty
  harnesses redirect it. If the resolved shadow path is inside the active project root, the
  shadow repo sits in its own blast radius — deleted by the `rm -rf` it exists to undo, and
  snapshotting itself every run. On that condition, fall back to
  `~/.config/freecode/snapshots/` regardless of `$FREECODE_HOME` and warn once.
  **Relocate, never refuse** — a netless `--edit` run is precisely the failure being
  prevented, so this check must not be able to disable the net.
  **As built the warning goes to `log()`, not to the user** — it only surfaces under
  `-log`. Anything louder would have to write to stderr, which corrupts the TUI, and the
  condition is one the e2e and pty harnesses create deliberately rather than one a user hits.

### Three details that are not optional

1. **`* -text` written into the shadow repo's `info/attributes` at creation.** Without it,
   restore re-applies smudge filters and silently rewrites line endings (see Established
   facts #2). Because the file lives in freecode's own git dir it is written once, at
   creation, and never touched again.
2. **A byte-copy of the user's `.git/index` stored with each snapshot.** A tree alone
   flattens staged and unstaged into a single blob; copying the index file back restores
   the exact staged/unstaged split. Note the restored index carries stale stat data, so the
   first `git status` after an undo re-hashes — correct, just slower.
3. **Record pre-run `HEAD` sha and branch name** in the snapshot commit message. A rogue
   `shell_exec` can run `git commit` or `git reset --hard`; restoring files alone leaves
   HEAD moved and the agent's commit in history. Undo offers
   `git update-ref refs/heads/<branch> <oldSha>`.

### Rejected alternatives

| Option | Why rejected |
| --- | --- |
| "Always commit first" | Wrong moment; depends on memory. Both stated constraints. |
| `git stash create` | **Excludes untracked files entirely.** A new-but-unadded file the agent deletes is unrecoverable. This is the tempting simplification — do not take it. |
| Snapshot commits under `refs/freecode/…` in the user's repo | Works, and dedups against existing objects, but needs `* -text` in the user's `.git/info/attributes` to avoid corrupting line endings. That is transient mutation of shared state: if freecode dies between write and cleanup, every file in the user's repo is left marked binary, silently breaking their diffs until someone notices. Worse than the failure it prevents. |

### Found during implementation: concurrency is the normal case

The plan assumed one freecode per project. `CLAUDE.md` makes that false — its standing rule
is for an interactive session to delegate to `freecode -p --edit`, so two processes share one
shadow repo routinely. Three consequences, all verified with real concurrent processes:

1. `git init` is not atomic; the loser of the race fails partway through. Creation catches
   that and re-checks for `HEAD`.
2. Nothing may stage into the shared index. Every operation gets its own `GIT_INDEX_FILE`;
   the shared index is read as a stat cache and written back best-effort, never locked. This
   matters *because* the hook swallows failures — an `index.lock` collision would otherwise
   leave the second session unprotected and silent, which is the exact failure mode this
   whole design exists to prevent.
3. Snapshot ids must be reserved synchronously. The listing they are checked against is stale
   the moment it is read, so two snapshots in one tick would pick the same id and the second
   `update-ref` would overwrite the first.

### Accepted costs

- Snapshots do not dedup against the user's existing objects; the first one copies the
  tracked tree once.
- Snapshots are not visible to `git log` in the project. `undo` must print the
  `--git-dir` incantation for anyone wanting to poke at them by hand.

## Established facts

Verified in throwaway repos during planning. Recorded so nobody re-derives them.

1. **`git stash create` excludes untracked files.** Hence `add -A` into a scratch index.
2. **Snapshot/restore is not byte-identical under default Windows git.** In a repo with
   `core.autocrlf=true` and `*.txt text=auto`, a full round trip converted an LF-on-disk
   file to CRLF (md5 changed). A file already CRLF on disk survived. The corruption is
   silent. `* -text` in the git dir's `info/attributes` fixes it: retested with one LF file
   and one CRLF file in the same `text=auto` repo, both round-tripped byte-identical.
   - This repo happens to be safe either way — `.gitattributes` pins `* text=auto eol=lf`
     (and `*.cmd eol=crlf`), so disk already matches checkout output. **Do not use that as
     evidence the mechanism is safe**; freecode runs in arbitrary repos.
3. **A shadow git-dir does not swallow the project's `.git`.** With
   `--git-dir=../shadow.git --work-tree=.` in a repo containing a real `.git`,
   `ls-files` returned 0 entries under `.git/`. Adding `/.git/` to the shadow's
   `info/exclude` anyway is free insurance.
4. **The project's `.gitignore` is still honored by the shadow repo** (ignore files live in
   the worktree, not the git dir). Verified: `node_modules/` and `dist/` produced 0
   entries. This is what keeps snapshots cheap — and it means gitignored files are **out of
   scope for recovery**. Say so in user-facing docs rather than implying total coverage.
5. **`FREECODE_HOME` is not the project root.** `getConfigDir()` (`src/config/index.ts:89`)
   returns `process.env.FREECODE_HOME ?? join(homedir(), '.config', 'freecode')`.
6. **The destructive-command guard is self-policed and not a barrier.**
   `src/agent/tools/shell.ts` returns a refusal only when `confirmDestructive` is falsy —
   and `confirmDestructive` is a tool parameter the *model* sets. Under `-p --edit`, ask
   mode is `auto`, so nothing else intercepts. A rogue agent that sets the flag runs
   `rm -rf` unimpeded. The snapshot system must not lean on this guard.

### On-disk layout

Pinned here so the snapshot and restore paths cannot invent two incompatible schemes:

```text
$FREECODE_HOME/snapshots/<basename>-<hash>.git/   # $SHADOW — bare repo, created once
  info/attributes                                 # "* -text", written at creation
  info/exclude                                    # "/.git/", written at creation
  refs/snapshots/<snapshot-id>                    # one ref per snapshot
  freecode-index/<snapshot-id>.index              # byte-copy of the project's .git/index
```

`<snapshot-id>` is `YYYYMMDDTHHMMSS` (UTC) + `-` + the session id, with `-<n>` appended on
collision. **As built it is the pid, not a session id** — freecode has no process-wide session
identifier, and the pid has the property actually needed here: unique per run. Timestamp alone is not enough: the hook fires on first write, a session can be
re-entered, and two snapshots in the same second would silently overwrite each other.

A ref maps to its index copy by that id and nothing else. `freecode-index/` is created by
the snapshot path (`mkdir -p`) at the same time the shadow repo is initialized — it is a
plain directory inside the git dir, ignored by git itself.

### Verified command sequences

Snapshot (all under `--git-dir=$SHADOW --work-tree=$PROJECT`):

```sh
git add -A
TREE=$(git write-tree)
SNAP=$(git commit-tree "$TREE" -m "freecode-snapshot
head=$HEAD_SHA branch=$BRANCH session=$SESSION_ID")
git update-ref refs/snapshots/"$ID" "$SNAP"
# Only when the project is a git repo — see "Non-git projects" below.
cp "$PROJECT/.git/index" "$SHADOW/freecode-index/$ID.index"
```

Restore:

```sh
git add -A                              # capture current state so read-tree can diff against it
git read-tree -u --reset "$TREE"        # worktree <- snapshot; deletes agent-created files
# Both of the following are conditional — see "Non-git projects" below.
cp "$SHADOW/freecode-index/$ID.index" "$PROJECT/.git/index"      # staged/unstaged split
git -C "$PROJECT" update-ref refs/heads/"$BRANCH" "$HEAD_SHA"    # only if HEAD moved
```

### Non-git projects

The worktree half works anywhere; only the index copy and the HEAD/branch rollback need the
project to be a git repo. Both sides must be guarded, and the state can change mid-session
(someone runs `git init`, or deletes `.git`), so **the guard is on what the snapshot
recorded, not on what is true at restore time**:

- **No index file recorded** (project was not a repo when snapshotted): restore the worktree
  only. Never write `$PROJECT/.git/index` — if the project is a repo *now*, its index
  belongs to history the snapshot knows nothing about, and clobbering it would corrupt state
  the agent never touched.
- **Index recorded but `$PROJECT/.git` is now missing** (agent deleted it): restore the
  worktree, skip the index copy and the ref update, and tell the user plainly that history
  was not recovered — see "The one real gap" below.
- **Index recorded and `.git` present**: full restore as written above.

The `add -A` before `read-tree -u --reset` is load-bearing: `read-tree` updates the
worktree by diffing the *index* against the target tree, so the index must first describe
the post-disaster state or agent-created files will not be deleted.

End-to-end rehearsal that passed during planning: agent overwrote a tracked file, deleted
an untracked file, added a junk file, and committed. After restore, `git status --porcelain`
matched the pre-agent output exactly (`MM tracked.txt`, `?? untracked-new.txt`), the junk
file was gone, the untracked file was back, and the branch was off the rogue commit.

## The one real gap: `rm -rf .git`

Deleting working files is fully covered — the shadow repo is outside the project. Deleting
the project's `.git` is **not**: files come back, but commit history, branches, and reflog
do not, because the shadow repo stores worktree content plus an index copy, not the user's
object store.

Close this by prevention rather than backup: **hard-block writes and deletes targeting
`.git/`**, not model-confirmable (fact #6 — a `confirmDestructive`-style flag is worthless
here). This is a separate, smaller change than the snapshot system and can land alongside it.

## Implementation steps

1. **New module** — snapshot/restore/list/prune over the shadow repo. Needs `@role` and
   `@readwhen` in its module header per `CLAUDE.md`. Keep it free of CLI concerns; it is a
   library over `git`. Watch the 500-line limit (`docs/line-limit.md`).
2. **Lazy hook at the write choke point.** Every offered tool is built through the decorator
   stack in `src/agent/tools/wrappers.ts` (`index.ts` owns *which* tools exist; `wrappers.ts`
   owns what happens around each call). Re-locate the exact site with
   `npm run map -- exports agent/tools/wrappers` rather than trusting the line numbers
   below — they were accurate when this was written and will rot.

   **As built the hook is not on the approved path.** It is a separate innermost wrapper,
   `src/agent/tools/snapshot-gate.ts`, applied by `wrap` only when `isWriteTool(name)` — which
   satisfies "immediately before the first mutation" literally, cannot be bypassed by a future
   `requiresConfirmation = false`, cannot fire on the `hasPrecomputed` read-only path, and sits
   inside `withSerializedExecution`'s queue so concurrent first writes cannot race. It also
   left `wrappers.ts` (6 lines under the limit at the time) alone. The analysis below is why
   that site was the alternative considered.

   As of writing, the composition is (outermost first) `withSerializedExecution` →
   `withTurnStop` → `withActivity` → `withToolRendering` → `withConfirmation` →
   `withRationale` → raw tool. The precise choke point is the approved path at the end of
   `withConfirmation` (`wrappers.ts:401-402`), where read-only tools take the
   `hasPrecomputed` early return and only real executions reach `original(args, opts)`.
   Identify the write half via the predicates in `src/agent/tools/tool-names.ts` — do not
   hardcode tool names.

   **The run-once flag must not live in `createTools` state.** `queueExecution` and
   `stopState` are created per `createTools()` call, and that is **per streamText attempt,
   not per session** (`src/agent/tools/index.ts:60`, and its own comment at
   `wrappers.ts:460`). `createTools` is called from `agent/loop.ts:178`,
   `agent/parsed-tools.ts:187`, `agent/fake-loop.ts:43`, and `cli/tools/tool-runner.ts:77`.
   A flag threaded through there would re-snapshot on every turn — and the second snapshot
   would capture *post-mutation* state, destroying the thing being protected. Memoize at
   module scope in the snapshot module instead: one `ensureSnapshot()` promise per process,
   awaited by the hook.
3. **`freecode undo` surface** — no-arg restores the most recent snapshot; `--list` shows
   snapshots with a `git diff --stat` of what changed since each. Retention: keep-last-N via
   `update-ref -d` (refs are what protect objects from gc, so ref deletion is the only
   retention lever needed).

   Flag parsing in `src/index.ts` is hand-rolled — `args = process.argv.slice(2)` at
   `src/index.ts:50`, then positional `indexOf` scans for `--model` / `-p` / `--script`.
   An `args[0] === 'undo'` check must go **before** those scans (they are `indexOf`-based
   and would otherwise match a stray argument), with an early return mirroring the `-p`
   block's shape, including its `await drainPendingWrites(); rl.close();` teardown. Put the
   implementation in a new `src/cli/` module loaded via `await import()` at that branch,
   matching the file's lazy-load pattern.
4. **`.git/` hard block** in the write tools and `shell_exec`.
5. **Missing `git` binary** is the only hard-fail case left. Decide the behavior explicitly
   and state it in the docs.

## Verification

- `npm test` must pass before reporting completion (build, lint, `docs:generate`, e2e, unit).
- Update `@role` / `@readwhen` on anything touched, plus authored page tails whose described
  behavior moved, then `npm run docs:generate`.
- **E2e coverage is required** — `undo` and the `.git` block are user-visible behavior. See
  `docs/e2e-testing.md` and `docs/e2e-inventory.md`.
- Unit coverage should include the round-trip cases from Established facts #2: a repo with
  `core.autocrlf=true` containing both an LF and a CRLF file, asserting byte-identical
  restore. That is the regression most likely to be reintroduced by a well-meaning
  simplification.
- No bug-log entry — `CLAUDE.md` excludes brand-new behavior from `docs/bug log/`.

## Relationship to the sandbox work

`docs/ideas/we need a secure from the ground up.txt` argues, correctly, that the real
security boundary is an OS-enforced sandbox and that confirmation prompts are UX rather than
security. That work is **prevention**; this plan is **recovery**. They are complementary and
neither substitutes for the other — a sandbox stops the agent reaching outside the project,
while snapshots undo what it legitimately did inside it. That document independently reaches
the same conclusion as fact #6 about the destructive-command guard.
