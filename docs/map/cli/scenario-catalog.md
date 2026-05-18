# src/cli/scenario-catalog.ts - Scenario Catalog

**Role:** Discovers scenario JSON files, summarizes their assertions, resolves user selections, and runs individual scenarios.

## Exports

| Symbol | Description |
|--------|-------------|
| `TestScenarioSummary` | Display-oriented scenario metadata. |
| `ScenarioRunResult` | Exit status and combined output from a scenario run. |
| `getScenarioSummaries(projectRoot)` | Reads `tests/scenarios/*.scenario.json`, classifies each scenario, and returns sorted summaries. |
| `runScenario(projectRoot, name, details?)` | Spawns the TypeScript scenario harness for one scenario with `--no-build`. |
| `findScenario(scenarios, choice)` | Resolves by numeric index, name, file, or file stem. |
| `parseScenarioSelection(input, scenarios)` | Supports space/comma-separated choices and numeric ranges. |

## Scenario Summary Checks

Summaries include human-readable assertion hints for:

- expected exit code
- output contains/absent assertions
- file assertions
- tool trace assertions
- classification errors

## Runner Command

`runScenario()` invokes:

```text
node <tsx-cli> tests/harness/run-scenarios.ts --no-build --only=<name> [--details]
```

with `FORCE_COLOR=1` and `VERBOSE=1` defaults.
