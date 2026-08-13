# Containment audit proof scripts

The scripts that demonstrated the **[V]** findings in
[../../agent-containment-audit.md](../../agent-containment-audit.md). Each one builds its own
throwaway repo under the OS temp directory and cleans up after itself; none touches this
project. They import from `dist/`, so **run `npm run build` first**.

```bash
npm run build
node docs/scripts/containment-audit/guardtest2.mjs    # which commands the regex guards miss
node docs/scripts/containment-audit/snaptest.mjs      # what checkpoint diff/revert cannot see
node docs/scripts/containment-audit/escapetest.mjs    # create/edit/shell containment escapes
node docs/scripts/containment-audit/selfapprove.mjs   # the checkpoint accept review-gate bypass
```

They are kept as scratch scripts rather than tests because they assert nothing — they *print* a
table of what passed and what was blocked, which is what makes them useful to re-run after a
change. As the plan's work items land, each should grow a real assertion and move into `tests/`;
the plan names which script is the acceptance check for which item.

Three are already partly or wholly green: `escapetest.mjs` now shows `.GIT/hooks/pre-commit`
refused, `snaptest.mjs` is green on everything but `node_modules/payload` (excluded by design,
R2) — HEAD back on the original branch, ignored files covered both ways, and since R3 the
planted `core.hooksPath` shown in the diff, cleared by the revert, with the deleted branch
recovered from a repo that had been `gc --prune=now`'d. `selfapprove.mjs` is
**fully green** — the accept is refused, the lock stays held, both mutations stay in the diff, and
the second delegation is refused (R1 layer 1). It runs whatever `freecode` resolves to on `$PATH`,
so `npm run build` alone is not enough if that is a copy rather than this repo's `dist/`.

`snaptest.mjs` plants a `pre-commit` hook that runs `touch HOOK_RAN` — a deliberately benign
stand-in for arbitrary code. It is there to prove the hook *executes*, which is the finding. The
first version of this script used `curl` and demonstrated the point rather more vividly than
intended; do not restore that.

It also creates `sidebranch` **before** the snapshot. That looks incidental and is not: while it
was created afterwards, a revert correctly deleting a branch the agent had invented was being read
as a failure to recover one, and the line reported `false` against code that was working.
