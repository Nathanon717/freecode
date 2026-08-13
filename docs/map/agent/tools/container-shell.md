# src/agent/tools/container-shell.ts - Docker Shell Boundary

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Runs agent shell commands inside one warm, resource-limited Docker container per project, exposing only the project bind mount and a container-owned node_modules volume.

## Read When

- Changing the Docker containment boundary, image selection, resource limits, or project mount layout.
- Debugging Docker-unavailable refusals, container startup, command timeouts, or host/container path translation.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface SandboxCommandResult {
  stdout: string;
  stderr: string;
  code?: number | string;
  killed?: boolean;
  message?: string;
}

sandboxUser(): string

containerRunArgs(projectRoot: string, image: string): string[]

/**
 * Replace paths crossing the container boundary without altering unrelated slash paths.
 */
translateContainerPaths(text: string, projectRoot: string): string

translateHostPaths(command: string, projectRoot: string): string

containerExecArgs(name: string, command: string): string[]

/**
 * Collects a docker-exec child while enforcing the shell tool's timeout and byte ceiling.
 */
collectSandboxProcess(child: { stdout: Readable; stderr: Readable; kill(): boolean; once(event: "exit", listener: (code: number | null, signal: Signals | null) => void): unknown; once(event: "error", listener: (error: Error) => void): unknown; }, projectRoot: string, timeoutMs: number): Promise<...>

/**
 * Runs one command in the session's warm container; failures are returned with partial output.
 */
runSandboxedCommand(command: string, projectRoot: string, timeoutMs: number): Promise<SandboxCommandResult>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`config/index.ts`](../../config/index.md) ×1
- **Imported by:** [`agent/tools/shell.ts`](shell.md) ×1

## Tests

`tests/agent/tools/container-shell.test.ts`. 1 other test file references it.

## Budget

179 / 500 lines (321 to spare).
<!-- END GENERATED MAP FACTS -->

## Boundary contract

One warm container belongs to one freecode process and project. Only the project is bind-mounted,
at `/work`; `node_modules` lives in a named Docker volume. The container has no host environment,
home directory, Docker socket, freecode installation, or snapshot store. Runtime networking is
disabled, the root filesystem is read-only, `/tmp` is a bounded tmpfs, and commands run as a
non-root uid/gid.

The default image is `node:22-bookworm-slim`. A project's `.freecoderc` may set `sandboxImage` to
an image containing another toolchain. A missing image or daemon is a refusal, never an
unsandboxed execution.

Docker creates named volumes as root. Before mounting the project, startup runs a short root
container with only the `node_modules` volume attached and changes that volume's ownership to the
executor uid. The project is never exposed to that initializer.

## Paths and lifetime

Commands that repeat the host project path are translated to `/work`; output translates `/work`
back to the host root. `/workbench` and other prefix lookalikes are left alone. Container names
include the freecode pid and a hash of the project root, which gives commands in one session warm
reuse without sharing a mutable executor between sessions. An exit hook removes containers;
`--rm` removes their writable layers, while the dependency volume remains project-scoped.

## Testing boundary

Unit tests assert the security-sensitive argv, translation in both directions, Docker's absence,
mixed output with a nonzero exit, and timeout killing. A real-daemon smoke test must also be run on
a Docker-equipped machine; Docker is not available in every development or CI host.
