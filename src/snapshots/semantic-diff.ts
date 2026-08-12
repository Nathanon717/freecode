/**
 * @role Re-encodes a unified patch as a symbol-and-shape summary — what `freecode checkpoint diff` prints unless `--patch` asks for the raw one. A pure string transform with no imports — checkpoint runs before the heavy module graph loads.
 *
 * @readwhen
 * - Changing how a delegated change is summarised, or which hunks collapse into a repeated shape.
 * - A review printed a hunk twice, or dropped one — the one-hunk-one-place invariant is here.
 * - Adding a file status (rename, binary) the parser does not yet name.
 */

// Written for the case where a lead agent reviews a subagent's edit and must
// hold all of it in context: the lever is how tersely the change can be
// encoded, never how much of it can be skipped. So collapsing is allowed only
// where it is lossless for that judgement — identical hunk *bodies* become one
// exemplar, while every location stays listed, because an unexpected location
// is the whole anti-scope signal. A hunk this file cannot classify with
// certainty is printed raw rather than approximated.

interface Hunk {
  file: string;
  /** First line on the new side — where a reader should look. */
  line: number;
  /** git's `@@ … @@` trailer: the enclosing declaration, when its heuristic finds one. */
  context: string;
  removed: string[];
  added: string[];
  /** The hunk exactly as git printed it, for when it cannot be classified. */
  raw: string;
}

type Status = 'added' | 'deleted' | 'renamed' | 'modified' | 'binary';

interface FileChange {
  path: string;
  status: Status;
  added: number;
  removed: number;
  hunks: Hunk[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/;

// Shape keys are built by concatenation and taken apart again, so the two
// separators must be characters source code cannot contain. FIELD divides a
// key's parts; PAIR divides one replaced token from its replacement.
const FIELD = '\u0001';
const PAIR = '\u0002';

/** Splits a line into identifiers, numbers, and single punctuation characters. */
function tokenize(line: string): string[] {
  return line.match(/[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|\S/g) ?? [];
}

function normalize(lines: string[]): string {
  return lines.map((line) => line.trim()).join('\n');
}

/**
 * The substitution that turns `before` into `after`, or undefined when the two
 * are not related by one — a differing token count means tokens were inserted
 * or removed, which this deliberately refuses to guess at.
 */
function substitution(before: string, after: string): string | undefined {
  const from = tokenize(before);
  const to = tokenize(after);
  if (from.length !== to.length) return undefined;

  const swaps: string[] = [];
  for (const [index, token] of from.entries()) {
    if (token !== to[index]) swaps.push(`${token}${PAIR}${to[index]}`);
  }
  // No differing tokens means the lines differ only in whitespace. That is a
  // real, classifiable shape — and one worth naming, since it is usually
  // reformatting rather than a change of behaviour.
  return swaps.length === 0 ? 'whitespace' : [...new Set(swaps)].sort().join(FIELD);
}

/**
 * A key shared by hunks that make the same edit, or undefined when the hunk is
 * not one of the shapes this recognises. Two hunks with equal keys are
 * interchangeable for review, which is what licenses printing the body once.
 */
function shapeOf(hunk: Hunk): string | undefined {
  const { removed, added } = hunk;
  if (removed.length === 0 && added.length > 0) return `insert${FIELD}${normalize(added)}`;
  if (added.length === 0 && removed.length > 0) return `delete${FIELD}${normalize(removed)}`;
  if (removed.length === 0 || removed.length !== added.length) return undefined;

  // Every replaced line must make the *same* substitution. One line out of
  // step means the hunk is doing more than one thing, and a summary of it
  // would be a guess.
  const first = substitution(removed[0], added[0]);
  if (first === undefined) return undefined;
  for (let i = 1; i < removed.length; i++) {
    if (substitution(removed[i], added[i]) !== first) return undefined;
  }
  return `replace${FIELD}${first}`;
}

function parse(patch: string): FileChange[] {
  const files: FileChange[] = [];
  let file: FileChange | undefined;
  let hunk: Hunk | undefined;

  const closeHunk = (): void => {
    if (file && hunk) file.hunks.push(hunk);
    hunk = undefined;
  };

  for (const line of patch.split('\n')) {
    const header = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (header) {
      closeHunk();
      file = { path: header[2], status: 'modified', added: 0, removed: 0, hunks: [] };
      files.push(file);
      continue;
    }
    if (!file) continue;

    if (line.startsWith('new file mode')) file.status = 'added';
    else if (line.startsWith('deleted file mode')) file.status = 'deleted';
    else if (line.startsWith('rename to')) file.status = 'renamed';
    else if (line.startsWith('Binary files')) file.status = 'binary';

    const bounds = HUNK_HEADER.exec(line);
    if (bounds) {
      closeHunk();
      hunk = {
        file: file.path,
        line: Number(bounds[2]),
        context: bounds[3].trim(),
        removed: [],
        added: [],
        raw: line,
      };
      continue;
    }
    if (!hunk) continue;

    hunk.raw += `\n${line}`;
    // `+++`/`---` are file headers, never content, and only reachable here in
    // a malformed patch — but a stray one would otherwise count as a line.
    if (line.startsWith('+') && !line.startsWith('+++')) {
      hunk.added.push(line.slice(1));
      file.added++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      hunk.removed.push(line.slice(1));
      file.removed++;
    }
  }
  closeHunk();
  return files;
}

const MARKER: Record<Status, string> = {
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  modified: 'M',
  binary: 'B',
};

/** git's trailer is a whole declaration line; the name is the useful part of it. */
function symbolName(context: string): string | undefined {
  if (context === '') return undefined;
  const named = /([A-Za-z_$][\w$]*)\s*[({=]/.exec(context);
  return named?.[1] ?? context;
}

function fileLines(files: FileChange[]): string[] {
  const width = Math.max(...files.map((f) => f.path.length));
  return files.map((file) => {
    const counts = `+${file.added} -${file.removed}`.padEnd(9);
    const symbols = [
      ...new Set(file.hunks.map((h) => symbolName(h.context)).filter((s): s is string => !!s)),
    ];
    const where = symbols.length > 0 ? `  ${symbols.join(', ')}` : '';
    return `  ${MARKER[file.status]} ${file.path.padEnd(width)}  ${counts}${where}`.trimEnd();
  });
}

/** A shape key back into the sentence to print, plus the body to show once. */
function describeShape(key: string, exemplar: Hunk): { title: string; body: string[] } {
  // A replace key carries one field per substituted token pair, so the tail is
  // a list — destructuring a single `detail` would drop every swap but the
  // first, and silently under-report what the hunk did.
  const [kind, ...detail] = key.split(FIELD);
  if (kind === 'insert') return { title: 'insert', body: exemplar.added.map((l) => `+${l}`) };
  if (kind === 'delete') return { title: 'delete', body: exemplar.removed.map((l) => `-${l}`) };
  if (detail[0] === 'whitespace') return { title: 'whitespace only', body: [] };

  const swaps = detail
    .map((swap) => swap.split(PAIR))
    .map(([from, to]) => `\`${from}\` -> \`${to}\``);
  return { title: `replace ${swaps.join(', ')}`, body: [] };
}

/**
 * Re-encodes a unified patch as changed files, the symbols they touch, and the
 * repeated shapes among their hunks.
 *
 * Every hunk lands in exactly one place: collapsed into a shape that occurs
 * more than once — with all of its locations named — or printed verbatim under
 * `remaining hunks`. Nothing is summarised away.
 *
 * Symbol attribution comes from git's own hunk-header heuristic, so it is as
 * good as that is: reliable for declarations at column zero, empty or
 * attributed to the enclosing block for indented members.
 */
export function semanticDiff(patch: string): string {
  const files = parse(patch.trimEnd());
  if (files.length === 0) return '';

  const shapes = new Map<string, Hunk[]>();
  const loose: Hunk[] = [];
  for (const hunk of files.flatMap((f) => f.hunks)) {
    const key = shapeOf(hunk);
    if (key === undefined) loose.push(hunk);
    else shapes.set(key, [...(shapes.get(key) ?? []), hunk]);
  }
  // A shape seen once is not a repetition, and printing it as one would cost a
  // heading to say nothing. Its hunk goes out verbatim instead.
  for (const hunks of shapes.values()) if (hunks.length === 1) loose.push(...hunks);
  const repeated = [...shapes.entries()].filter(([, hunks]) => hunks.length > 1);
  repeated.sort((a, b) => b[1].length - a[1].length);
  loose.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));

  const totals = files.reduce(
    (sum, f) => ({ added: sum.added + f.added, removed: sum.removed + f.removed }),
    { added: 0, removed: 0 },
  );
  const out: string[] = [
    `${files.length} file${files.length === 1 ? '' : 's'} changed, +${totals.added} -${totals.removed}`,
    '',
    ...fileLines(files),
  ];

  if (repeated.length > 0) {
    const collapsed = repeated.reduce((n, [, hunks]) => n + hunks.length, 0);
    const shapes = `${repeated.length} shape${repeated.length === 1 ? '' : 's'}`;
    out.push('', `repeated edits (${shapes}, ${collapsed} hunks)`, '');
    for (const [key, hunks] of repeated) {
      const { title, body } = describeShape(key, hunks[0]);
      out.push(`  ${hunks.length}x  ${title}`);
      for (const line of body) out.push(`      ${line}`);
      // Every site, never a count: an edit in a file nobody asked for is the
      // signal this whole encoding exists to preserve.
      out.push(`      ${hunks.map((h) => `${h.file}:${h.line}`).join('  ')}`, '');
    }
    out.pop();
  }

  if (loose.length > 0) {
    out.push('', `remaining hunks (${loose.length})`, '');
    for (const hunk of loose) out.push(`--- ${hunk.file}`, hunk.raw, '');
    out.pop();
  }

  return out.join('\n');
}
