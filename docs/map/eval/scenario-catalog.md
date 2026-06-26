# src/eval/scenario-catalog.ts - Scenario Catalog

**Role:** Discovers scenario JSON files, summarizes their assertions, resolves user selections, and runs individual scenarios.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface TestScenarioSummary {
  name: string;
  description: string;
  requiresLlm: boolean;
  file: string;
  workspace?: 'repo' | 'temp';
  checks: string[];
}

interface ScenarioRunResult {
  status: number;
  output: string;
}

getScenarioSummaries(projectRoot: string): TestScenarioSummary[]

runScenario(projectRoot: string, name: string, details?: boolean): ScenarioRunResult

findScenario(scenarios: TestScenarioSummary[], choice: string): TestScenarioSummary | undefined

parseScenarioSelection(input: string, scenarios: TestScenarioSummary[]): TestScenarioSummary[]
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `getScenarioSummaries`: Reads `tests/scenarios/*.scenario.json`, classifies each scenario, returns sorted summaries.
- `runScenario`: Spawns the TypeScript harness with `--no-build`; sets `FORCE_COLOR=1` and `VERBOSE=1`.
- `findScenario`: Resolves by numeric index, name, file path, or file stem.
- `parseScenarioSelection`: Supports space/comma-separated choices and numeric ranges.

## Scenario Summary Checks

Summaries include human-readable assertion hints for:

- expected exit code
- output contains/absent assertions
- file assertions
- tool trace assertions
- fake LLM trace assertions
- classification errors

## Runner Command

`runScenario()` invokes:

```text
node <tsx-cli> tests/harness/run-scenarios.ts --no-build --only=<name> [--details]
```

with `FORCE_COLOR=1` and `VERBOSE=1` defaults.
