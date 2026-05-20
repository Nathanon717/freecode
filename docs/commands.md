# Commands

Reference docs for npm scripts and slash commands.

## NPM Scripts

This table is generated from `package.json`.

<!-- BEGIN GENERATED NPM SCRIPTS -->
| Script | Command |
| --- | --- |
| `npm run build` | `tsc` |
| `npm run coverage` | `vitest run --coverage` |
| `npm run dev` | `tsx src/index.ts` |
| `npm run docs:check` | `tsx scripts/generate-docs.ts && tsx scripts/check-map.ts` |
| `npm run docs:generate` | `tsx scripts/generate-docs.ts` |
| `npm run eval` | `npm run build && tsx tests/harness/run-scenarios.ts --no-build --only-llm --details` |
| `npm run start` | `node dist/index.js` |
| `npm run test` | `tsx src/index.ts --test` |
| `npm run test-all` | `tsx src/index.ts --test-all` |
| `npm run test-env` | `node test-env.js` |
| `npm run unit` | `vitest run` |
| `npm run unit:watch` | `vitest` |
| `npm run verify` | `npm run build && npm run docs:check && npm run verify:scenarios` |
| `npm run verify:e2e` | `npm run build && tsx tests/harness/run-scenarios.ts --no-build --only-tty` |
| `npm run verify:fast` | `npm run docs:check && npm run verify:scenarios` |
| `npm run verify:scenarios` | `tsx tests/harness/run-scenarios.ts --no-build --skip-llm --skip-tty` |
<!-- END GENERATED NPM SCRIPTS -->

## Slash Commands

This table is generated from `src/cli/slash-commands.ts`.

<!-- BEGIN GENERATED SLASH COMMANDS -->
| Command | Description |
| --- | --- |
| `/clear` | Clear screen and chat history |
| `/config` | Open interactive config |
| `/eval` | Show and run LLM eval scenarios |
| `/help` | Show this help |
| `/keys` | Show API key status |
| `/model` | Show or set model |
| `/resume` | Resume last session |
| `/sources` | Show model data sources |
| `/test` | Show and run non-LLM verification scenarios |
<!-- END GENERATED SLASH COMMANDS -->
