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
| `npm run docs:generate` | `tsx scripts/sync-docs.ts` |
| `npm run pty:session` | `cross-env MSYS_NO_PATHCONV=1 tsx tests/harness/pty/session.ts` |
| `npm run start` | `node dist/index.js` |
| `npm run test` | `npm run build && npm run docs:generate && npm run verify:scenarios && vitest run --exclude tests/harness/pty/driver.test.ts --exclude tests/harness/pty/session.test.ts` |
| `npm run test:pty` | `vitest run tests/harness/pty/driver.test.ts tests/harness/pty/session.test.ts` |
| `npm run unit:watch` | `vitest` |
| `npm run verify:scenarios` | `tsx tests/harness/run-scenarios.ts --no-build --skip-llm` |
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
