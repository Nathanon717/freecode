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

## Coverage & length

Coverage is a by-product, not a target — don't chase it past the point where the only way up is bloat. Mark deliberately-uncovered defensive branches `/* v8 ignore */`; branch coverage matters least.

When a test file exceeds ~2× its source, hunt for the patterns above before adding more. The fix for an oversized test file is deleting duplication.
