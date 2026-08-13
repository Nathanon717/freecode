# Plan: agent containment and reviewable checkpoints

**Status: the whole reviewability half is landed — R1 (layer 1), R2, R3, R4, R5. C1 is implemented
but not yet accepted: this machine has no Docker daemon for the real-boundary test, and live
stdout/stderr streaming remains. C2 and C4 are partially landed through that boundary; C3 and C5
have not begun.** R1's env-marker layer, its fail-closed lock, the
sub-agent tool-set pin, R2's coverage of ignored files, R3's capture of `.git`, R4's surfacing of
snapshot failure, and R5's tolerance of a locked file are done and covered by tests; R1's layer 2
waits on C1. **R2 added one work item and deviated from one locked decision**, both forced by
evidence and both recorded in its section: `.freecode` is excluded alongside `node_modules`, and R5
is new. **R3 corrected two claims this plan used to make** — it does not retire `git-guard.ts` (C5
does, and only after containment), and it closes the local half of A3 but not `git config
--global`. **R5 retired the fix this plan proposed for it and found a worse bug than the one it
described**, both recorded in its section. Every decision in "Decisions locked" is the user's and
is settled — do not re-litigate them, and do not re-derive the audit. The evidence base is
[agent-containment-audit.md](agent-containment-audit.md), which records how each finding was
demonstrated; this file is the plan built on it.

## The problem

`freecode -p --edit` hands an unattended agent `create` / `edit` / `shell_exec` with ask mode
forced to `auto`. [undo-snapshots-plan.md](undo-snapshots-plan.md) made that *reversible*. A
full audit of the result (2026-08-12) found the reversibility is not sound: a rogue agent can
defeat the review gate with one command, hide work where `checkpoint diff` cannot see it, and
persist code that survives `checkpoint revert`.

The root cause is one thing, not sixteen. **`shell_exec` is `child_process.exec` with
`cwd: projectRoot` and nothing else**, and it is defended by denylist regexes over the command
string. That cannot be made sound: the set of destructive commands is infinite, and the guard's
own stated threat — unrecoverable history loss — is reachable through `git config`,
`git reflog expire`, `git gc --prune=now`, and `git branch -D`, none of which contain the
string `.git`.

## The threat model, split

The two halves are independent, and both are required. Fixing one alone leaves a hole the user
would reasonably believe was closed.

- **Containment** — the agent cannot affect anything outside the project. Solvable with an
  OS-enforced boundary. Work items C1–C5.
- **Reviewability** — nothing the agent does can hide from `checkpoint diff` or survive
  `checkpoint revert`. Solvable with ordinary bug fixes. Work items R1–R5, all landed.

**What neither half fixes, and no design can:** the agent writes code you then read, approve,
and merge. A sandbox is silent about whether `src/` gained a subtle backdoor. That is the
reason reviewability carries equal weight — the review is the last control, so it has to be
complete.

## Decisions locked

Settled with the user on 2026-08-12. The reasoning is recorded because re-deriving it costs a
session.

| Decision | Choice | Why |
| --- | --- | --- |
| Containment substrate | **Docker / WSL2 container** | One implementation for all three platforms. |
| Network | **Off by default** (`--network=none`), per-run opt-in | Exfiltration becomes impossible, not unmatched. |
| Ignored files | **Snapshotted**, except `node_modules` — and, since R2, `.freecode` | Closes the invisible-payload hole (A2). The second exclusion is not a preference: including freecode's own live store made `checkpoint revert` fail outright, see R2. |
| `node_modules` | **Read-only mount**, not snapshotted | Prevention over backup — nothing to hide, nothing to copy. |
| `.git` | **Snapshotted wholesale** | Retires the *premise* of the `.git` hard block — but not the block itself, which C5 removes once containment prevents rather than reverses. See R3. |
| Regex guards | **Deleted once containment lands** | They only ever approximated containment. CLAUDE.md: never justify dead code as a "fallback". |

### Rejected alternatives

- **Native Windows sandbox (restricted token + Job Object + AppContainer).** Fastest, no
  dependency, no path translation, and the host toolchain works natively. Rejected because
  freecode is cross-platform *by requirement* — it would need three sandbox implementations
  (AppContainer, bubblewrap, `sandbox-exec`), three sets of security bugs, and a guarantee that
  differs per OS.
- **Windows Sandbox (Hyper-V).** Strongest boundary available and built into Win 11 Pro.
  Rejected on ergonomics: it boots a fresh OS with no toolchain, and has no clean stdio channel —
  streaming a build back into the TUI degenerates into tailing a file in a mapped folder. It is
  built to run one suspicious installer, not two hundred short commands.
- **Argv allowlist instead of a shell.** Kills every quoting/substitution bypass for near-zero
  cost, and composes with the container. Rejected *as a substitute* because it contains nothing:
  an allowlisted `git` still runs `git config --global`, an allowlisted `npm` still runs
  postinstall scripts with full filesystem and network. Reconsider as a hardening layer **after**
  C1–C5, never instead of them.
- **Bind-mounting the host's `node_modules` into the container.** Would break the build: the
  host's resolved tree holds win32 binaries (`@esbuild/win32-x64`, `@vscode/ripgrep-win32-x64`).
  This is *not* an argument against Docker — those are `os`/`cpu`-gated `optionalDependencies`
  and `node_modules/` is gitignored host-local state, so the container simply owns its own,
  installed for Linux at image-build time. Recorded because it was initially mistaken for a
  reason to abandon the container approach.

## Already landed

Three fixes shipped ahead of this plan, `npm test` green. They are prerequisites, not the plan.

- **`restoreHead()` in `src/snapshots/index.ts`** — moves HEAD via `symbolic-ref`, not just the
  branch ref. Revert previously reported success while leaving the user on the agent's branch
  (finding A4). Mutations are gated on a pre-read so `headRestored` means *history was rolled
  back*, not *HEAD happens to be right*.
- **Case-folding in `src/agent/tools/git-guard.ts`** — `create .GIT/hooks/pre-commit` wrote a
  real git hook on Windows and macOS (finding B9).
- **Honest revert message in `src/cli/checkpoint.ts`**.

Bug log: `docs/bug log/12-08-2026b.md`, `12-08-2026c.md`.

---

## Work items

Ordered by severity of what they close. R1 is first because it is the single most devastating
finding and does not depend on the substrate.

### R1 — Make the control plane unreachable from the agent — **layer 1 done**

**Closes A1**, the total silent review-gate bypass: `freecode checkpoint accept` run from
`shell_exec` releases the review lock, re-baselines the snapshot so `checkpoint diff` reports
"No changes", leaves the payload on disk, and permits the next `-p --edit`. Demonstrated end to
end; `freecode` is on `$PATH` and nothing marks `checkpoint` as privileged.

Two layers, because either alone is bypassable:

1. ~~Set a marker in the agent's environment (`FREECODE_SANDBOXED=1`) and have `runCheckpoint`
   refuse `accept` and `revert` when it is set.~~ **Done.** `shell.ts` stamps it per call;
   `runCheckpoint` refuses both verbs before resolving a snapshot root, so a refusal cannot leave
   an agent-triggered baseline behind. `list`/`diff` still work. Defeated by `env -u`, as designed.
2. After C1, the real fix: no `freecode` binary inside the sandbox, and the shadow repo and
   review lock outside the mount. Then the CLI is not reachable and the store is not writable.

~~Also fix while here: `claimReviewLock` returns `undefined` — meaning *proceed* — when the write
fails and the readback fails (finding B11).~~ **Done.** It now returns
`claimed | held | unavailable`, and only `claimed` proceeds. `unavailable` carries the lock path,
the errno, and a `cause` splitting the two shapes it has: `unreadable-lock` is deleted by hand,
while `store-unwritable` has no route through freecode at all — `checkpoint accept`, the documented
way out of a stuck lock, must write the same store to take its baseline. One behaviour change to
know about: a half-written lock file now wedges `-p --edit` until it is deleted, which is the
fail-closed side of the trade.

**Acceptance: met.** `docs/scripts/containment-audit/selfapprove.mjs` now reports the accept
refused, the lock still held by `"add a feature"`, both mutations still in the diff, and the
second delegation refused. Tests: the same assertions as unit tests in
`tests/cli/checkpoint.test.ts` (`describe('inside an agent shell')`), the marker's propagation
into the child in `tests/agent/tools/shell.test.ts`, the real binary reading the real environment
in `tests/e2e/checkpoint-no-self-approval.e2e.json`, and the fail-closed lock in
`tests/snapshots/review-lock.test.ts` + `tests/cli/headless-prompt.test.ts`.

**One trap for anyone extending this.** The marker is inherited, so running `npm test` *through*
`shell_exec` would leak it into the whole suite and fail every accept/revert case for a reason no
failure output would name. It is stripped in two places for that: `vitest.config.ts`'s `env`, and
`STRIPPED_VARS` in `tests/harness/run-e2e.ts`. C4's env allowlist must keep both true.

### R2 — Snapshot ignored files — **done**

**Closes A2.** A payload in `dist/` was invisible to `checkpoint diff --patch` and survived
`checkpoint revert`, with no `.gitignore` edit needed. Deletion of ignored files (`.env`, local
DBs) was unrecoverable.

All three staging calls now come from one builder (`stagingArgs()` in `snapshots/index.ts`), so
take, diff and restore cannot drift — the failure mode if they did is a revert that leaves behind
exactly what the diff showed. `node_modules` is excluded at any depth by pathspec, since `-f`
overrides `info/exclude` as well as `.gitignore`; `FREECODE_SNAPSHOT_EXCLUDE` replaces the list.
Revert now **enumerates** the excluded paths that really exist (`listExcludedPaths`) in place of
the old constant `.gitignore` note, which was both false and unactionable.

Also removed: the shadow repo's `info/exclude`. It held `/.git/` as "free insurance" and `-f`
overrides it — verified both ways. What keeps `.git` out is git skipping any directory of that
name during the walk, which is why **R3 needs its own mechanism, not a looser add.**

**Acceptance: met.** `snaptest.mjs`: payload in diff `true`, `.env` deletion in diff `true`,
`dist/payload2` gone `true`, `.env` recovered `true`. `node_modules/payload` still there, by
design. Tests in `tests/snapshots/index.test.ts` (both directions in one case, node_modules at
two depths, the env override, the enumeration) and `tests/cli/checkpoint.test.ts`.

**Cost, measured on this repo:**

| | before | after |
| --- | --- | --- |
| first snapshot in a project | 3.0s | 11.8s |
| every snapshot after | 0.20s | 0.29s |
| store after three snapshots | 1.8 MB | 4.3 MB |

Cold is file count, not bytes (~1800 extra small files for git to hash) and is paid once per
project. Warm is what every delegated run's first write waits on, and it barely moved. The e2e
harness now pre-warms the shared snapshot store once before the run — a cold walk inside a
`waitFor` budget is what broke `tty-status-line-ticks` and `tty-thinking-label`.

**One deviation from the locked list, forced by evidence: `.freecode` is excluded too.** The
locked decision was "ignored files snapshotted, except `node_modules`", and `.freecode` — the
store directory, live SQLite plus `-wal`/`-shm`, which sits in the project whenever freecode runs
from source there — landed inside coverage. That is not a stale-database risk. Tested with a live
libsql connection:

```
restore THREW: Command failed: git … read-tree -u --reset refs/snapshots/…
```

`read-tree -u` cannot rewrite files the running process holds open on Windows, so **the revert
aborts part-way through** — R2 would have shipped `checkpoint revert` broken in this repo's own
dev setup. With `.freecode` excluded the same test restores cleanly and the database passes
`PRAGMA integrity_check`. It also cuts the store from 12.1 MB to 4.3 MB; cold time is unchanged,
so this is correctness, not speed.

The residual is R5 below: any *other* live database inside coverage (a user's `dev.db` held open
by their dev server) breaks a revert the same way, and no exclusion list can enumerate those.

### R5 — A locked file must not abort a revert part-way — **done**

**New, found while landing R2, and caused by it.** Before R2 the files a running process holds
open were usually ignored (databases, caches) and therefore out of scope. Now they are in it.
`.freecode` is excluded by name (see R2); a user's own `dev.db` cannot be enumerated the same way.

New module `src/snapshots/locked-files.ts` owns the worktree restore. A path git could not write
comes back as a name in `RestoreOutcome.lockedPaths`, and `checkpoint revert` treats it exactly as
it treats a `.git` that would not go back — exit 1, review lock kept, paths named, both ways out
stated. That resolves the question this section left open, and **against** the "run it again"
option: the worktree half can name the paths exactly, so it does, and "run it again" is added as
one of two exits rather than being the only thing on offer. The `.git` half keeps the weaker
promise because it genuinely cannot make the stronger one.

**This section's premise was wrong in two ways, both measured rather than reasoned.**

**The proposed fix does not exist.** `read-tree` takes tree-ish arguments, not a pathspec:
`read-tree -u --reset HEAD -- a.txt` dies with `fatal: Not a valid object name a.txt`, reading the
path as a second tree. There is no "re-run with those paths excluded".

**And it is not needed, because `read-tree -u --reset` is not all-or-nothing.** Held against a file
locked the way SQLite locks one (`FILE_SHARE_READ` — readable, so `add` still stages it, but
neither replaceable nor deletable), git restores every other path *including ones sorting after the
locked one*, performs its deletions, and then reports what it could not touch. "Aborts
*mid-restore*, some paths back and the rest not" describes the `.git` half (R3, where the index is
being rewritten), not this one. So the fix is to catch, parse, and report — no second pass.

**The real bug here was the quiet one, and this section did not know about it.** Two shapes:

| git must | git says | exit | before R5 |
| --- | --- | --- | --- |
| **replace** a file it cannot | `error: unable to unlink old '<p>':` | 128 | threw; `Error reverting snapshot:` naming nothing, despite the rest of the tree being back |
| **delete** a file it cannot | `warning: unable to unlink '<p>':` | **0** | **nothing at all** |

The second row is an agent-created file surviving `checkpoint revert` while git reports success —
the class of failure this whole plan exists to close, and strictly worse than the throw this
section was written about. `runGit` discarded stderr on a zero exit, so nobody saw it;
`runShadowGitCapturing` in `shadow-repo.ts` exists for that one caller.

The tolerance is narrow on purpose, like `isObjectWriteCollision`: only a failure whose every
`error:`/`fatal:` line is one of those unlinks is swallowed. A missing ref or a full disk has not
been shown to leave the rest of the tree restored, so it still throws.

**Acceptance: met.** `tests/snapshots/locked-files.test.ts` holds a real lock (PowerShell,
`FileShare.Read`) and asserts every other file restored, the locked one named, and — separately —
the delete-failure case caught despite exit 0. Re-running once the holder lets go completes the
restore, which is what makes the warning's advice true. The CLI's exit-1-and-keep-the-lock is in
`tests/cli/checkpoint.test.ts`. Those cases are Windows-only and say so: POSIX advisory locks do
not stop `unlink`, so there is no portable way to take this lock.

### R3 — Snapshot `.git` — **done**

**Closes the local half of A3.** `git config core.hooksPath` gave RCE that survived revert and
never appeared in the diff — proved live, a planted hook executed during a test `git commit`.
Branch deletions and `reflog expire && gc --prune=now` were equally unrecoverable. All of it is
snapshot state now.

`.git` could not be folded into the existing `add`, and both halves of that were verified rather
than assumed: git skips any directory of that name during the worktree walk regardless of `-f`,
and `read-tree --prefix=.git/` is refused outright (`invalid path '.git/config'`) by the same
`verify_path` that stops a hostile tree writing one. So it is a **second work tree** —
`--work-tree=<project>/.git` over the same shadow repo — whose commit is recorded as the
**parent** of the snapshot commit, making one ref protect both objects and leaving
`pruneSnapshots` unchanged. New module `src/snapshots/gitdir.ts`.

Three mechanisms collapsed into one, which answers the question this item was left holding. The
`.git/index` byte-copy is **gone** (the index is in the tree), and `restoreHead` is no longer the
rollback path — it stays for the three cases with no `.git` commit to restore: a pre-R3 snapshot,
a `.git` that is a *file* (linked worktree, real git dir outside the project, deliberately
skipped), and a failed `.git` restore. Ordering: worktree first, `.git` second, since `.git` holds
the index describing the worktree. A `.git` the agent deleted outright is now rebuilt.

`checkpoint diff` gained a `.git` section limited to `config` and `hooks/`, raw in both modes.
That is the audit's recommendation #4 ("snapshot `.git/config` **and diff it**"), narrowed on
purpose: refs, logs and objects churn on every git command an agent runs, and a diff nobody reads
is not review coverage. **The trade is explicit — a deleted branch is recovered by a revert
without being shown by the diff.**

**Two corrections to what this section used to say.** It claimed R3 "retires `git-guard.ts`
entirely"; it does not, and C5 below is right. Snapshotting `.git` makes a planted hook
*reversible*, not *harmless* — it still executes during the agent's own session, since the agent
runs `git commit` itself and `gc --auto` fires unprompted. Revert-after-the-fact is not
prevention, so the guards stay until containment lands. And this closes the **local** half of A3
only: `git config --global core.hooksPath` writes outside the project, where no project snapshot
reaches. That half waits on C4.

**A locked file inside `.git` fails worse than one in the worktree, and R5's shape does not
transfer.** Measured with a foreign handle held the way SQLite holds one: a file git must
**delete** and cannot (a packfile) is a `warning:` and exit 0, restore completes; a file git must
**replace** and cannot (`.git/index`) is an `error:` and exit 128, aborting mid-write and leaving
refs rolled back against a stale index, with `fsck` reporting a broken cache-tree. Excluding the
named path and retrying — R5's plan for the worktree — cannot work here, because "everything
except `refs/heads/main`" is not a git directory. What saves it is that `read-tree -u --reset` is
**idempotent**: re-running the revert once the holder lets go was verified to repair the state
completely. So the failure is caught, the worktree restore is kept, `restoreHead` is still
attempted, and the warning says to run the same revert again. `checkpoint revert` treats that as a
**failed** revert — exit 1, review lock kept — because freeing the lock would both mark a broken
`.git` reviewed and take away the repair, since the lock is what keeps a repeated revert aimed at
the same snapshot. (Caught in review: the first cut of this warned and then released the lock and
exited 0, which is R4's own mistake made one layer up.)

**Cost, measured on this repo:** +12s cold, +0.1s warm, ~19 MB of store, once per project — a
project's first snapshot goes 11.8s → **~24s**, and that is what blocks the first write of a
delegated run. Packfiles dedupe by content hash, so later snapshots store only what changed. The
e2e harness needed no change: it pre-warms by taking one real snapshot, which warms both walks
(its `.git` stat cache is a separate index, `freecode-index/gitdir.index` — seeding one walk from
the other's cache matches nothing and silently pays cold every time).

**Acceptance: met.** `snaptest.mjs` reports `hooksPath in diff true`, `hooksPath cleared true`,
and `sidebranch recovered true` against a repo it has just `gc --prune=now`'d. The script had a
bug that had to be fixed to mean anything: it created `sidebranch` *after* the snapshot, so a
correct revert deleting it read as a failure to recover it. Tests: `tests/snapshots/gitdir.test.ts`
(capture, restore, the diff's narrowness, the `.git`-as-a-file skip), the integrated revert cases
in `tests/snapshots/index.test.ts`, and the CLI's two diff modes in `tests/cli/checkpoint.test.ts`.

### R4 — Surface snapshot failure — **done**

**Closes A5 and A6.** `ensureSnapshot` swallowed every error to the log; under `-p` the
transcript is `null`, so nothing reached the caller. Worse, `headless-prompt.ts` then *released
the review lock*, because `sessionSnapshotId()` returned `undefined` identically for "never
wrote" and "wrote unprotected".

`sessionSnapshot()` now answers `none | taken | failed`, and `settleReviewLock` does one thing per
answer: free the project, record the id, or keep the lock and report on stderr. The exit code still
belongs to the turn — a turn that succeeded did succeed — and stdout is untouched, so
`$(freecode -p ...)` still composes. The old rationale for conflating `failed` with `none` was that
holding a lock for it would strand the project; that is not true, because `checkpoint accept` works
with nothing snapshotted and is the documented way out.

`outstanding()` is the other half, and the fix is to stop inferring. The lock now carries the
snapshot id its holder took (`recordLockSnapshot`), so the usual answer is exact; the timestamp
walk survives only as the fallback for a run killed before it recorded one. When the lock says the
snapshot *failed*, `outstanding()` returns `'unsnapshotted'` and the bare verb is refused — every
snapshot in the store belongs to some other session, so a bare `diff` would report a clean tree and
a bare `revert` would restore a state the agent had already damaged, both with exit 0. Naming an id
explicitly still works.

`recordLockSnapshot` is an update and never a claim: it refuses when there is no lock, and when the
lock belongs to another pid. `claimReviewLock`'s exclusive `wx` write is the whole mutual-exclusion
mechanism, and a bookkeeping call that could create a lock would undo it.

**Acceptance: met.** `tests/e2e/prompt-mode-edit-snapshot-failure.e2e.json` runs the real binary
against a broken store — `GIT_OBJECT_DIRECTORY` pointing at a directory that is not there, which
fails every shadow-repo git call while leaving the lock file (plain `fs`, no git) claimable, so the
run gets past its claim and dies at the snapshot. It asserts the write still landed, stdout is
still only the answer, and the stderr report names the fault. Unit coverage: the three states in
`tests/snapshots/auto.test.ts`, the three effects in `tests/cli/headless-prompt.test.ts`,
`recordLockSnapshot`'s guards in `tests/snapshots/review-lock.test.ts`, and both `outstanding()`
branches in `tests/cli/checkpoint.test.ts`.

### C1 — Run `shell_exec` inside the container — **implemented, acceptance pending**

The substrate. Project bind-mounted rw at a fixed path; container-owned `node_modules` volume;
`--user` non-root; `--pids-limit`, `--memory`, `--cpus`; `--read-only` rootfs with a tmpfs
`/tmp`; `--rm`.

Real work beyond the flags:
- **Path translation** both ways — the model sees `/work/src/foo.ts`, the user sees
  `C:\stuff\...`. Every tool result, error, and stack trace crosses this boundary.
- **A warm container per session**, or per-command startup dominates.
- **Streaming** stdout/stderr back to the TUI as it happens, preserving the existing 10 MB cap
  and head+tail elision in `shell.ts`.
- **Graceful degradation** when Docker is absent. Refusing to run is defensible for `--edit`;
  silently falling back to an unsandboxed shell is not.

`src/agent/tools/container-shell.ts` now owns the boundary. It starts one warm container per
freecode process and project, bind-mounts only the project at `/work`, gives `node_modules` a
project-scoped Docker volume, runs commands as a non-root uid/gid, and applies `--network=none`,
`--read-only`, a bounded `/tmp`, and CPU/memory/PID limits. Docker absence and startup failure are
returned as refusals; there is no host-shell path. The default image is
`node:22-bookworm-slim`, with `sandboxImage` in `.freecoderc` as the project override.

Host project paths in commands translate to `/work`, and `/work` in stdout/stderr translates back
without rewriting prefix lookalikes such as `/workbench`. The system prompt now distinguishes the
host OS from the Linux shell. The container inherits no host environment; the only explicit
variable is R1's `FREECODE_SANDBOXED=1`, retained for a development checkout containing its own
built CLI. Container startup initializes only the dependency volume as root before the project is
mounted, avoiding the root-owned-volume/non-root-command failure.

**Still required before marking done:** stream stdout/stderr to the TUI while retaining the 10 MB
capture and head+tail result contract, and run the conditional real-Docker e2e on a machine with a
working daemon. This development machine has no `docker` executable, so only the fail-closed path
and the orchestration/collector contracts have run here.

### C2 — Network off by default

`--network=none`. Per-run opt-in flag for tasks that genuinely need `npm install`. Closes
exfiltration and `curl | sh` as a class.

### C3 — Read-only `node_modules`

Mount it `:ro`. Closes the `node_modules/.bin` payload vector by prevention, which is what lets
R2 exclude it from the snapshot without reopening A2.

### C4 — Scrub the environment

The child currently inherits all of `process.env`, provider API keys included — demonstrated.
Replace with an explicit allowlist.

### C5 — Delete the guards

Once C1–C4 hold: remove `git-guard.ts`, `DESTRUCTIVE_PATTERNS`, and `confirmDestructive`. The
last is actively harmful — a boolean the *model* sets, forced to `auto` under `-p --edit`, that
reads to a user as protection. Its false positives (`docker run --rm`) also train the model to
set it reflexively.

---

## Adjacent findings, not scheduled

Real, and out of scope until the above lands. Full detail in the audit.

- ~~**Sub-agent tools bypass the whole wrapper stack**~~ (`run-subagent.ts:37` uses
  `READ_ONLY_TOOL_DEFS` raw — no snapshot gate, no confirmation, no rendering). No hole today
  because the set is read-only. **Pinned** in `tests/agent/subagents/run-subagent.test.ts`: the
  names the sub-turn is actually handed must equal `READ_ONLY_TOOL_DEFS` and be disjoint from
  `WRITE_TOOL_DEFS`. Note the audit's D14 wording ("one persona edit away") is wrong and misled
  this entry: `AgentPersona` has no tool field, so no persona edit can widen the set. The real
  one-edit risk is a write tool added to `READ_ONLY_TOOL_DEFS`, or `rawReadOnlyTools()` switching
  source — which is what the test pins.
- **`shell_exec` can still launch `freecode -p --edit`.** The marker from R1 refuses `accept` and
  `revert`, not `-p`, so a *headless* run cannot escalate — its own held lock refuses the nested
  delegation — but an interactive session with auto-run on can fan out into unattended edit runs
  the no-fan-out rule forbids. Cheap to close by refusing `-p --edit` under `FREECODE_SANDBOXED`
  too; left out of R1 because it is a different rule from "the run under review cannot end its own
  review", and C1 closes it outright.
- **The shadow repo never runs `git gc`** — `pruneSnapshots` deletes refs but objects survive
  indefinitely, so secrets from deleted files persist in plaintext under
  `~/.config/freecode/snapshots`, unbounded.
- **Lock orphaning** — `headless-prompt` claims at its own `projectRoot`; `checkpoint` releases
  at whatever `resolveSnapshotRoot` walks up to. Launch `-p --edit` from a subdirectory and the
  lock is never released.
- Tool results are not ANSI/OSC-stripped before reaching the terminal; `checkpoint diff` output
  is attacker-influenced text fed to a reviewing agent.
