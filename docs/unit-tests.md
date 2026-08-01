# Writing Unit Tests

Test behavior observable through the public surface. A test earns its place by catching a regression a user or caller would notice — never write one just to raise coverage.

## Avoid these

1. **Don't test unreachable branches.** If a branch can't occur through the public API (a defensive `return ''` for a type TypeScript forbids), don't cast invalid input to hit it — mark it `/* v8 ignore next -- reason */`.
2. **Don't repeat the same assertion per case.** Cases that vary only by value are a table: use `it.each([...])`. Assert a shared invariant (e.g. "returns continue") once, not in every block.
3. **Don't over-mock.** Prefer real fast collaborators (e.g. real `fs` in a temp dir, as `tests/agent/tools/edit.test.ts` does) and injected dependencies (see `makeRuntime(overrides)` in `command-dispatcher.test.ts`) over module mocks. Asserting "mock was called" couples the test to today's implementation. Needing to mock ~10 modules means the source is too coupled — note it, don't build scaffolding to chase a number.
4. **Don't assert internal arithmetic.** Hard-coded intermediate values break on refactor. Assert the property that matters, unless the exact value *is* the contract (formatter output, parsed result).
5. **Don't re-inline the same capture/setup.** When many tests open with the same spy-and-collect or `mock.calls[0]` destructure, name it once (`captureLog()`, `lastRun()`). Assign shared fixtures by destructuring in `beforeEach` (`({ stdin, writeSpy } = setupStreams(...))`) so test bodies keep referring to the same names.

```ts
it.each([['user', 'hello', 7], ['user', null, 5]])(
  'role %s + content %p → %i tokens',
  (role, content, n) => expect(estimateMessageTokens({ role, content } as CoreMessage)).toBe(n));
```

## Exempting a file from the mirrored-test rule

Every `src/**/*.ts` file must have a matching `tests/**/*.test.ts` with at least one real `it`/`test`/`describe`, enforced by `scripts/checks/check-tests.ts`. A file opts out with an inline marker **and a mandatory reason**:

```ts
// check-tests: no-test — pure type declarations; erased at compile time, no runtime behavior to test
```

A marker with no reason is a hard build failure. The exemption list is kept out of the normal `npm test` output; audit it on demand with `npx tsx scripts/checks/check-tests.ts --list-exempt`. The exemption is deliberately narrow — **default to writing the test.** A file qualifies only if *both* are true:

1. **It has no runtime behavior of its own to observe.** Nothing in it can compute a wrong answer, throw, or return the wrong shape at runtime.
2. **Any test you could write would restate the source, not check it** — asserting the language/compiler works rather than catching a regression a caller would notice.

Two categories pass, and essentially nothing else does:

- **Pure type files** — only `type`/`interface`/type-only `import`/`export`. They vanish at compile time; a runtime test just re-declares a literal and asserts its own fields (see the deleted `types.test.ts`). `tsc` is the real check.
- **Pure barrels** — a file whose every statement is `export … from './x.js'` with no logic. `it('re-exports X')` only fails when someone deletes a line *and* stops importing it, which the build already catches.

### Not exemptions — write the test

- **A file with any executable code:** a `const` computed from a call, a function, a default value, a mapper, a guard, a `return`. If a line runs, it can be wrong. `src/config/index.ts` looks index-ish but caches and parses — it is tested.
- **Static data files** (`provider-catalog.ts` and similar). Data is not type-only: ids collide, a URL goes missing, an enum drifts. Assert the *invariants* of the data (unique ids, required fields present) — that is a real, valuable test, not a tautology. See `tests/providers/provider-catalog.test.ts`.
- **"It's small / obvious / I'll add it later."** Not criteria. Size and confidence say nothing about whether a runtime regression can hit it.

If you reach for the marker on anything other than a pure-type or pure-barrel file, that is the signal to write the test instead. When unsure, the file is not exempt.

## Orphan test files

The mirror runs both ways: a `tests/**/*.test.ts` with no matching `src/` file is reported as an *orphan* — a warning, not a build failure. Either delete the file (it is dead once its source is gone) or mark it `// check-tests: orphan — <why>`. The reason is not enforced the way `no-test`'s is, but write one; it is what tells the next reader the file is deliberate. Two shapes are legitimate:

- **A second test file for one `src/` module**, split off to isolate a `vi.mock` that must not leak into the mirrored test — `tests/store/db-sync-recovery.test.ts` (`src/store/db.ts`), `tests/eval/runner-subprocess.test.ts` (`src/eval/runner.ts`).
- **Tests of code that has no `src/` mirror** — the e2e harness (`tests/harness/`), `scripts/` (`tests/scripts/map-drift-classify.test.ts`), or repo-wide guards (`tests/repo-encoding.test.ts`).

## Coverage & length

Coverage is a by-product, not a target — don't chase it past the point where the only way up is bloat. Mark deliberately-uncovered defensive branches `/* v8 ignore */`; branch coverage matters least.

When a test file exceeds ~2× its source, hunt for the patterns above before adding more. The fix for an oversized test file is deleting duplication.
