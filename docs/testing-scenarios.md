# Scenario Tests

Scenario tests live in `tests/scenarios/*.scenario.json` and run through `tests/harness/run-scenarios.ts`. They execute the built CLI with `node dist/index.js --script <temp-file>`, so they cover the real scripted interactive path.

## Commands

```powershell
npm run verify        # build + non-LLM scenarios only
npm run verify:fast   # non-LLM scenarios only, no rebuild
npm run eval          # build + LLM eval scenarios with detailed breakdown
```

`npm run verify` is the normal post-change safety check and never calls an LLM. Use evals only when you explicitly want provider-backed tests. LLM scenarios cost tokens/time and can vary by provider.

Inside the CLI, run `/test` to open the non-LLM verification menu. Run `/eval` to list provider-backed evals, see the checks each one performs, and select one or many evals to run sequentially. `/eval` accepts numbers, names, comma/space-separated selections, and numeric ranges such as `1-3`.

## Basic Shape

```json
{
  "name": "02-eval-medium-create-files",
  "description": "Medium: create a small nested project with exact code and JSON files",
  "requiresLlm": true,
  "config": {
    "toolRationale": false,
    "useOllama": false
  },
  "workspace": "temp",
  "turns": [
    {
      "input": "Use list_dir with path \".\" first. Then use write_file to create src/math.js with content exactly \"export function sum(values) {\\n  return values.reduce((total, value) => total + value, 0);\\n}\\n\". Then use write_file to create config/app.json with content exactly \"{\\n  \\\"name\\\": \\\"eval-medium\\\",\\n  \\\"enabled\\\": true,\\n  \\\"limits\\\": {\\n    \\\"items\\\": 3\\n  }\\n}\\n\". Do not use any other tools."
    },
    { "input": "y" },
    { "input": "y" },
    { "input": "y" }
  ],
  "expect": {
    "stdoutAbsent": ["Error:"],
    "exitCode": 0,
    "files": [
      {
        "path": "src/math.js",
        "contentExact": "export function sum(values) {\n  return values.reduce((total, value) => total + value, 0);\n}\n"
      },
      {
        "path": "config/app.json",
        "contentExact": "{\n  \"name\": \"eval-medium\",\n  \"enabled\": true,\n  \"limits\": {\n    \"items\": 3\n  }\n}\n"
      }
    ],
    "toolTrace": {
      "maxCalls": 3,
      "sequence": ["list_dir", "write_file", "write_file"],
      "absent": ["read_file", "grep", "shell_exec"]
    }
  }
}
```

## Fields

- `name`: Stable kebab-case identifier shown in harness output.
- `description`: Human-readable purpose of the scenario.
- `requiresLlm`: Set `true` for prompts that call a provider. These are skipped by `verify` and `verify:fast`, and shown under `/eval`.
- `config`: Optional temporary `config.json` contents written under the scenario's isolated `FREECODE_HOME`.
- `workspace`: Use `"temp"` for file-writing or project-mutating scenarios. Omit it or use `"repo"` for structural CLI checks.
- `filesBefore`: Optional seed files written before the CLI runs. Use with `workspace: "temp"` for edit/preservation scenarios.
- `flags`: Optional CLI flags inserted before `--script`.
- `model`: Optional model preference passed as `--model <value>`.
- `turns`: Input lines sent to script mode. Script mode exits cleanly after the final turn.
- `y`/`yes` and `n`/`no` turns are consumed as tool-call confirmations when the agent requests a tool. If the next turn is not an approval answer, the tool call is denied and the turn remains available as normal user input.
- Approval turns are skipped if there is no pending tool request, so a failed provider call does not accidentally turn `y` into a user prompt.

## Assertions

- `stdoutContains`: Substrings expected in combined stdout + stderr.
- `stdoutAbsent`: Substrings that must not appear in combined stdout + stderr.
- `exitCode`: Expected process exit code.
- `files`: File assertions relative to the scenario workspace.
- `files[].contentExact`: Exact file content. On mismatch, the harness prints the actual content.
- `toolTrace.maxCalls`: Maximum allowed tool calls.
- `toolTrace.sequence`: Exact tool call sequence.
- `toolTrace.present`: Tool names that must appear at least once.
- `toolTrace.absent`: Tool names that must not appear.

## Guidelines

- Prefer `workspace: "temp"` for agent tasks that create or edit files.
- Keep LLM assertions structural and outcome-based. Check files, tool trace, and broad output markers instead of exact assistant prose.
- Use exact file assertions for deterministic artifacts.
- Use tool trace assertions to catch inefficient behavior, but avoid overfitting unless the workflow truly requires a specific sequence.
- Include only the tool approval turns you expect the scenario to need. Extra unexpected tool calls will be denied unless followed by another `y`/`yes`.
- Keep each scenario focused on one user-visible behavior.

## Gotchas

- LLM eval scenarios make real provider network calls. In sandboxed Codex runs, rerun them with escalated network permissions if they fail with `EACCES` / `Cannot connect to API`.
- Groq tool-call failures can surface as `code: "tool_use_failed"` and may be followed by Windows exit code `3221226505` (`0xC0000409`) if the child process aborts during shutdown. Treat the provider error as the root cause; the exit code is a secondary crash symptom.
- For tool scenarios, write prompts that name the expected tool sequence and exact tool arguments. This reduces malformed provider tool calls and keeps trace assertions meaningful.
