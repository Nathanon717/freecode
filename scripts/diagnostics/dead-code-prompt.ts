/**
 * Prompt construction for scripts/diagnostics/dead-code.ts.
 *
 * Split out for the same reason as dead-code-index.ts: dead-code.ts calls
 * `runSweep()` at module scope, so nothing there can be imported without
 * launching a full sweep. The evidence table is the substance of this sweep —
 * the model's verdict is only as good as what this file shows it — so it is
 * built here, in the open, and asserted in tests/scripts/dead-code-prompt.test.ts.
 */
import type { ExportRecord, Reference } from './dead-code-index.js';

/**
 * Above this many external references a symbol is plainly live, and listing the
 * lines would spend prompt on a settled question. The count still shows.
 */
const EVIDENCE_THRESHOLD = 3;
/** Enough lines to judge an ambiguous symbol without turning the table into the file. */
const MAX_EVIDENCE_LINES = 6;

export interface PromptUnit {
  relative: string;
  code: string;
  exports: ExportRecord[];
}

function formatReference(reference: Reference): string {
  return `      ${reference.file}:${reference.line}: ${reference.text}`;
}

/** Same-file hits sit under a heading that already names the file, so the path is noise. */
function formatInternal(reference: Reference): string {
  return `      line ${reference.line}: ${reference.text}`;
}

export function describeExport(record: ExportRecord): string {
  const external = record.external.length;
  const head = `- \`${record.name}\` (${record.kind}, line ${record.line}) — ${external} code reference${external === 1 ? '' : 's'} outside this file`;
  const lines = [external === 0 && record.internal.length === 0 ? `${head}, and never used inside it` : head];

  if (external > 0 && external <= EVIDENCE_THRESHOLD) {
    lines.push(...record.external.slice(0, MAX_EVIDENCE_LINES).map(formatReference));
  }
  if (external === 0 && record.internal.length > 0) {
    lines.push('    used inside this file:');
    lines.push(...record.internal.slice(0, MAX_EVIDENCE_LINES).map(formatInternal));
  }
  // Only worth showing when the symbol is otherwise unused: a doc mention is not
  // a use, so its whole value is telling apart "dead" from "dead and documented".
  if (external === 0 && record.docs.length > 0) {
    lines.push('    mentioned in documentation (not a use):');
    lines.push(...record.docs.slice(0, MAX_EVIDENCE_LINES).map(formatReference));
  }
  return lines.join('\n');
}

export const SYSTEM_PROMPT = `You audit ONE TypeScript file for code that should be deleted or narrowed. You are given the file and a reference table listing, for every symbol it exports, where that name occurs across the rest of the repository.

Report only what is actionable — something a maintainer could delete or unexport today.

ALREADY RULED OUT BY TOOLING. This project runs \`@typescript-eslint/no-unused-vars\` and TypeScript \`strict\`. Unused local variables, unused imports and unused parameters are already impossible. Never report them.

THE REFERENCE TABLE is your only evidence about the rest of the repository. It is a textual identifier match over \`src/\`, \`tests/\`, \`scripts/\` and \`docs/\`, so:
- It over-reports. A listed line may match an unrelated symbol that happens to share the name. Read the line before trusting it.
- A symbol can be reached WITHOUT its name appearing anywhere: string-keyed dispatch, a registry populated at import time, a dynamic import, an index signature, a name built by concatenation. If the file shows such a mechanism, the symbol is live.
- A hit in \`docs/\` is documentation OF the symbol, not a use of it. A symbol whose only hits are in \`docs/\` is unused.
- A hit in \`tests/\` IS a use. Tested code is live code.

FINDING TAGS — every bullet carries exactly one:
- [unexport] — nothing outside the file references the symbol, but the file itself uses it. The code stays; the \`export\` keyword goes.
- [dead] — nothing reaches it at all: an export nobody imports and the file never uses, a branch no input can take, a guard for a state an earlier check already excluded, a null-check or \`??\` on a value the types make non-nullable, a value computed and never read, an option parsed and never consulted, a second implementation of what the file already does elsewhere.
- [stale] — a comment, JSDoc or name asserting behaviour, a flag, a file or a symbol that the code no longer has.

NOT FINDINGS. Report none of these:
- Style, naming, formatting, ordering, or "this could be simplified". This is not a code review.
- A type or interface exported as part of an exported function's signature. Callers build those values without ever writing the type name, so zero references is expected and correct.
- A symbol exported from a public entry point (\`src/index.ts\`) or from a barrel file that exists to re-export.
- A defensive check against a state that really can occur — anything from I/O, a parse, user input, or a provider response.
- Anything you would have to read another file to be sure about. If the evidence in front of you does not settle it, say nothing.
- Incompleteness. A missing test, a missing doc, an unhandled case: none of these are findings.

Answer format, exactly:
- First line: \`OK\` or \`DEAD\`.
- If DEAD: following lines list one bullet per finding, as \`- [tag] <symbol or line> — <what is dead, and what in the evidence proves it>\`. Cite the symbol by name. No preamble, no praise, no suggestions beyond the deletion.`;

export function buildUserPrompt(unit: PromptUnit): string {
  const table = unit.exports.length === 0
    ? '(this file exports nothing)'
    : unit.exports.map(describeExport).join('\n');
  return [
    `FILE: ${unit.relative}`,
    '```typescript',
    unit.code,
    '```',
    '',
    `EXPORT REFERENCE TABLE for ${unit.relative}`,
    'Identifier matches across src/, tests/, scripts/ and docs/.',
    '',
    table,
    '',
    'Audit this file. Answer in the required format.',
  ].join('\n');
}

