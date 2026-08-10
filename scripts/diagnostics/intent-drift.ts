#!/usr/bin/env tsx
/**
 * Intent-drift detector: does a module's `@role` / `@readwhen` still describe
 * the code below it?
 *
 * The map's two intent sections are generated from those tags, so `map-drift`
 * cannot see them — it strips every generated block before the page reaches the
 * model, which left purpose and read-when drift with no detector at all. This
 * sweep asks the question where the claim actually lives: in the source file.
 *
 * The header is stripped from the code it is judged against, so the model is
 * comparing a claim to evidence rather than to a restatement of itself.
 *
 * This is a sweep — one bare LLM call per file, concurrent, findings-only
 * report. Everything not specific to intent drift lives in `scripts/sweep/`.
 * See docs/sweeps.md.
 *
 * Usage:
 *   npm run intent-drift                         # config's defaultModel
 *   npm run intent-drift -- --model zen:big-pickle
 *   npm run intent-drift -- --only agent/ --limit 5
 *
 * Flags: see docs/sweeps.md — every sweep takes the same set.
 */
import { readFileSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';
import { classify as classifyDrift } from './drift-classify.js';
import { listSourceFiles } from '../docgen/map-exports.js';
import { readModuleIntent, stripModuleHeader } from '../docgen/map-intent.js';
import { runSweep, type SweepVerdict } from '../sweep/sweep.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

interface Unit {
  sourceRelative: string;
  role: string;
  readWhen: string;
  code: string;
}

function collectUnits(): Unit[] {
  const units: Unit[] = [];
  const untagged: string[] = [];

  for (const sourceFile of listSourceFiles()) {
    const sourceRelative = relative(ROOT, sourceFile).replace(/\\/g, '/');
    const { role, readWhen } = readModuleIntent(sourceFile);
    if (!role && !readWhen) {
      // check-map.ts is the enforcer; here an untagged file is just a file with
      // no claim to audit.
      untagged.push(sourceRelative);
      continue;
    }
    units.push({
      sourceRelative,
      role,
      readWhen,
      code: stripModuleHeader(readFileSync(sourceFile, 'utf-8')),
    });
  }

  if (untagged.length > 0) {
    console.warn(`Warning: ${untagged.length} source file(s) have no @role or @readwhen: ${untagged.join(', ')}`);
  }
  return units;
}

const SYSTEM_PROMPT = `You audit two claims a TypeScript module makes about itself. THE CODE IS THE SOURCE OF TRUTH.

You are given a source file with its header comment removed, plus the two claims that header made:
- ROLE: one paragraph saying what the module is for.
- READ WHEN: when an agent should open this file. It may be absent.

These claims are an agent-navigation layer, not documentation. Their rules:
- They exist purely for token reduction: they let an agent decide whether this file matters WITHOUT reading it.
- They are deliberately terse. Brevity is correct, not a defect. ROLE is capped at 400 characters and READ WHEN at three bullets, so omission of detail is intended.
- They describe the module as a whole. They are not an API listing, and per-export intent lives in each export's own JSDoc, which is not your concern.
- They are copied verbatim onto a map page under \`docs/map/\`, which mirrors the source tree at identical depth, so a markdown link written in a claim is resolved from the *page*, not from the source file. A link target ending in \`.md\` is therefore a pointer to another page, never a filename the code is expected to contain:
  - A target that mirrors a source path — \`[wrappers.md](wrappers.md)\`, \`[db-schema.md](./db-schema.md)\`, \`[model-screen.md](../cli/menus/model-screen.md)\` — names that source module (\`wrappers.ts\`, \`./db-schema.ts\`, \`../cli/menus/model-screen.ts\`). Translate it, then judge whether *that module* is still the right target: pointing at a module that no longer owns the thing IS drift.
  - A target that leaves the mirrored tree — \`[providers.md](../../providers.md)\` — is a hand-written doc. You cannot see it, so you cannot audit it. Not drift.
  In neither case is the \`.md\` extension itself drift, and in neither case is the code's failure to mention the linked filename evidence of anything. A linking file need not import what it points at; the reference may run against the dependency direction. This applies only to markdown link syntax — a claim naming a real repo file in prose (\`AGENTS.md\`, \`CLAUDE.md\`) means that file, and is judged normally.

Drift is ONLY where a claim asserts something the code contradicts or no longer supports:
- a stated purpose the file no longer has, or one that misses the responsibility the file now mostly is,
- named symbols, flags, files or behaviours in either claim that the code no longer contains,
- READ WHEN pointing at behaviour that has moved out of this file.

Incompleteness is NOT drift. Terseness is NOT drift. A missing READ WHEN is NOT drift. Wanting more detail is NOT drift.

Answer format, exactly:
- First line: \`OK\` or \`DRIFT\`.
- If DRIFT: following lines list each drift as \`- <what the claim says> -> <what the code shows>\`. Be specific and cite the symbol or phrase. No preamble, no praise, no suggestions beyond the correction.`;

function buildUserPrompt(unit: Unit): string {
  return [
    `SOURCE FILE: ${unit.sourceRelative} (header comment removed)`,
    '```typescript',
    unit.code,
    '```',
    '',
    'ROLE:',
    unit.role || '(none)',
    '',
    'READ WHEN:',
    unit.readWhen || '(none)',
    '',
    'Do the claims drift from the code? Answer in the required format.',
  ].join('\n');
}

function classify(text: string): SweepVerdict {
  const { verdict, detail, recovered } = classifyDrift(text);
  return { verdict, detail, recovered, finding: verdict !== 'ok' };
}

runSweep<Unit>(
  {
    name: 'Intent drift',
    unitNoun: 'file',
    primaryVerdict: 'drift',
    collect: collectUnits,
    label: unit => unit.sourceRelative,
    describe: unit => `${unit.sourceRelative} — ${unit.role.split('\n')[0].slice(0, 70)}`,
    system: SYSTEM_PROMPT,
    user: buildUserPrompt,
    classify,
  },
  process.argv.slice(2),
  { outDir: join(__dirname, 'intent-drift') },
)
  .then(exitCode => { process.exitCode = exitCode; })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
