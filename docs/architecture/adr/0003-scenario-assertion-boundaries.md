# 0003 Scenario Assertion Boundaries

**Status:** Accepted
**Date:** 2026-05-19

## Context

The scenario harness needs to validate different expectation types: stdout and stderr text, exit code, file content, and tool traces. Keeping all assertion logic inside the scenario runner made the harness harder to extend and test.

## Decision

`tests/harness/assertions/` owns one focused checker per expectation type. `tests/harness/run-scenarios.ts` runs scenarios and delegates expectation evaluation to that boundary.

## Consequences

New expectation types can be added without reshaping the full harness. Focused unit tests can cover assertion behavior directly, while the scenario runner stays responsible for process orchestration.
