#!/usr/bin/env tsx
import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC_ROOT = join(ROOT, "src");

const MAX_LINES = 500;

function toPosix(path: string): string {
  return path.replace(/\\/g, "/");
}

function walkFilesSync(
  dir: string,
  predicate: (file: string) => boolean,
): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return walkFilesSync(fullPath, predicate);
    if (!entry.isFile() || !predicate(fullPath)) return [];
    return [fullPath];
  });
}

const sourceFiles = walkFilesSync(SRC_ROOT, (file) =>
  file.endsWith(".ts"),
).sort();
const failures: string[] = [];

for (const file of sourceFiles) {
  const content = readFileSync(file, "utf-8");
  const lineCount = content.split("\n").length;
  if (lineCount > MAX_LINES) {
    failures.push(toPosix(relative(ROOT, file)));
  }
}

if (failures.length > 0) {
  console.error(
    `The following file(s) exceed the maximum line limit of ${MAX_LINES}:\n` +
      `${failures.map((f) => `  ${f}`).join("\n")}` +
      `\nPlease consider refactoring these files to reduce their line count.`,
  );
  process.exit(1);
}
